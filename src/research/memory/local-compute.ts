import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { FleetError } from "../../domain.js";
import type { EmbeddingCompute, EmbeddingResult } from "./embedding-client.js";
import type { EmbeddingIdentity } from "./retrieval.js";
/** Explicitly provisioned local image/model only. Never runs in the agent's credential-bearing process. */
export class LocalEmbeddingCompute implements EmbeddingCompute {
  readonly identity: EmbeddingIdentity;
  constructor(
    private readonly configuration: {
      image: string;
      modelDirectory: string;
      artifactManifest: { identity: EmbeddingIdentity } & Record<string, unknown>;
    },
  ) {
    if (!/^sha256:[a-f0-9]{64}$/.test(configuration.image) || !isAbsolute(configuration.modelDirectory))
      throw new FleetError("LOCAL_ARTIFACT_REQUIRED", true);
    this.identity = configuration.artifactManifest.identity;
  }
  async embed(texts: string[], mode: "query" | "document"): Promise<EmbeddingResult> {
    if (!texts.length || texts.length > 16 || texts.some((t) => !t || Buffer.byteLength(t) > 65536))
      throw new FleetError("EMBEDDING_INPUT_LIMIT", true);
    const model = await realpath(this.configuration.modelDirectory).catch(() => {
      throw new FleetError("LOCAL_ARTIFACT_REQUIRED", true);
    });
    if (model.includes(",")) throw new FleetError("LOCAL_ARTIFACT_REQUIRED", true);
    const directory = await mkdtemp(join(tmpdir(), "fleet-embedding-")),
      name = `fleet-embedding-${randomUUID()}`;
    const manifestPath = join(directory, "manifest.json");
    try {
      await writeFile(manifestPath, JSON.stringify(this.configuration.artifactManifest), { mode: 0o644 });
      const result = await new Promise<Buffer>((resolve, reject) => {
        const child = spawn(
          "docker",
          [
            "run",
            "--rm",
            "--pull=never",
            "--name",
            name,
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--user=10001:10001",
            "--cpus=1",
            "--memory=2g",
            "--memory-swap=2g",
            "--pids-limit=64",
            "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
            "--env=HF_HUB_OFFLINE=1",
            "--env=TRANSFORMERS_OFFLINE=1",
            "--env=OMP_NUM_THREADS=1",
            "--env=MKL_NUM_THREADS=1",
            "--mount",
            `type=bind,src=${model},dst=/model,readonly`,
            "--mount",
            `type=bind,src=${manifestPath},dst=/artifact-manifest.json,readonly`,
            "--entrypoint=python",
            "-i",
            this.configuration.image,
            "-m",
            "fleet_research.embeddings",
          ],
          { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: ["pipe", "pipe", "ignore"] },
        );
        const chunks: Buffer[] = [];
        let size = 0,
          failed = false;
        const fail = () => {
          failed = true;
          child.kill("SIGKILL");
          reject(new FleetError("LOCAL_EMBEDDING_FAILED", true));
        };
        const timer = setTimeout(fail, 60000);
        child.on("error", () => {
          clearTimeout(timer);
          fail();
        });
        child.stdout.on("data", (data: Buffer) => {
          size += data.length;
          if (size > 2 * 1024 * 1024) fail();
          else chunks.push(data);
        });
        child.stdin.on("error", fail);
        child.on("exit", (code) => {
          clearTimeout(timer);
          if (!failed && code === 0) resolve(Buffer.concat(chunks));
          else fail();
        });
        child.stdin.end(JSON.stringify({ texts, mode }));
      });
      return JSON.parse(result.toString()) as EmbeddingResult;
    } finally {
      // Killing the client alone need not kill a container; remove this exact unique owned name.
      await new Promise<void>((done) => {
        const cleanup = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
        cleanup.once("error", () => done());
        cleanup.once("exit", () => done());
      });
      await rm(directory, { recursive: true, force: true });
    }
  }
}
