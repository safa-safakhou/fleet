import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
export async function runFrameworkChild(
  runtime: any,
  input: Record<string, unknown>,
  worker = "research-promptfoo-worker.ts",
) {
  const directory = await mkdtemp(join(tmpdir(), "fleet-framework-")),
    root = process.cwd();
  try {
    return await new Promise<any>((done, fail) => {
      const child = spawn(
        worker === "python" ? resolve(root, "workers/research/.venv/bin/python") : process.execPath,
        worker === "python"
          ? ["-m", "fleet_research.optimization.cli"]
          : ["--import", import.meta.resolve("tsx"), resolve(root, "scripts/lib", worker)],
        {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            PYTHONPATH: resolve(root, "workers/research/src"),
            PYTHONDONTWRITEBYTECODE: "1",
            DSPY_CACHEDIR: directory,
            MLFLOW_ENABLE_ASYNC_LOGGING: "false",
            HOME: directory,
            TMPDIR: directory,
            LANG: "C.UTF-8",
            PROMPTFOO_DISABLE_TELEMETRY: "1",
            PROMPTFOO_DISABLE_SHARING: "true",
            PROMPTFOO_DISABLE_UPDATE: "1",
            PROMPTFOO_CACHE_ENABLED: "false",
            PROMPTFOO_CONFIG_DIR: directory,
            PROMPTFOO_LOG_DIR: directory,
            PROMPTFOO_LOG_LEVEL: "error",
            DO_NOT_TRACK: "1",
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const chunks: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        fail(Error("FRAMEWORK_TIMEOUT"));
      }, 60000);
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          child.kill("SIGKILL");
          fail(Error("FRAMEWORK_OUTPUT_LIMIT"));
        } else chunks.push(chunk);
      });
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.once("error", () => {
        clearTimeout(timer);
        fail(Error("FRAMEWORK_PROCESS_FAILED"));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0) return fail(Error("FRAMEWORK_PROCESS_FAILED"));
        try {
          const frames = Buffer.concat(chunks)
            .toString()
            .split("\n")
            .filter((line) => line.startsWith("FLEET_FRAMEWORK_RESULT "));
          if (frames.length !== 1) throw Error("FRAMEWORK_RESULT_INVALID");
          done(JSON.parse(frames[0].slice("FLEET_FRAMEWORK_RESULT ".length)));
        } catch {
          fail(Error("FRAMEWORK_RESULT_INVALID"));
        }
      });
      child.stdin.end(JSON.stringify({ socket: runtime.socket, token: runtime.token, scope: runtime.scope, ...input }));
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
