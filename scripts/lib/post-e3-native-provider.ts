import { execFile } from "node:child_process";
import { readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { designDigest } from "../../src/negotiation-plan.js";

const identitySchema = z
  .object({
    route: z.literal("http://127.0.0.1:11434"),
    version: z.literal("0.35.1"),
    pid: z.number().int().positive(),
    startTicks: z.string().regex(/^[1-9][0-9]*$/),
    serviceStart: z.string().regex(/^[1-9][0-9]*$/),
    executable: z.string().regex(/^\/.*\/bin\/ollama$/),
    command: z.array(z.string()).length(2),
    listenerPids: z.array(z.number().int().positive()).length(1),
    model: z.enum(["nemotron-3-nano:4b", "qwen3.5:9b"]),
    modelDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((v) => v.command[0] === v.executable && v.command[1] === "serve" && v.listenerPids[0] === v.pid);
export type NativeProviderIdentity = z.infer<typeof identitySchema>;
/** This scope check never starts a server, loads a model or authorizes inference.
 * Runtime/library/model bytes need their separate artifact verification gate. */
export function validateNativeProviderIdentity(expected: unknown, observed: unknown): void {
  const a = identitySchema.parse(expected),
    b = identitySchema.parse(observed);
  if (designDigest(a) !== designDigest(b)) throw Error("NATIVE_PROVIDER_IDENTITY_DRIFT");
}
const exec = promisify(execFile);
/** Read-only observation of the explicitly selected WSL user service. */
export async function readNativeProviderIdentity(
  model: NativeProviderIdentity["model"] = "nemotron-3-nano:4b",
): Promise<NativeProviderIdentity> {
  identitySchema.shape.model.parse(model);
  if (process.platform !== "linux") throw Error("NATIVE_WSL_REQUIRED");
  const { stdout: service } = await exec("systemctl", [
    "--user",
    "show",
    "ollama.service",
    "-p",
    "MainPID",
    "-p",
    "ExecMainStartTimestampMonotonic",
    "-p",
    "ActiveState",
  ]);
  const fields = Object.fromEntries(
    service
      .trim()
      .split("\n")
      .map((line) => line.split("=")),
  );
  if (fields.ActiveState !== "active" || !/^[1-9][0-9]*$/.test(fields.MainPID ?? ""))
    throw Error("NATIVE_PROVIDER_INACTIVE");
  const pid = Number(fields.MainPID),
    executable = await readlink(`/proc/${pid}/exe`);
  const command = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0").filter(Boolean);
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  const startTicks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  const { stdout: listeners } = await exec("ss", ["-Hlnpt", "sport = :11434"]);
  const lines = listeners.trim().split("\n");
  if (lines.length !== 1 || !/\s127\.0\.0\.1:11434\s/.test(lines[0])) throw Error("NATIVE_PROVIDER_LISTENER");
  const listenerPids = [...lines[0].matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
  const route = "http://127.0.0.1:11434" as const;
  const metadata = async (path: string) => {
    const r = await fetch(`${route}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw Error("NATIVE_PROVIDER_METADATA");
    return r.json();
  };
  const [version, tags] = await Promise.all([metadata("/api/version"), metadata("/api/tags")]);
  const selected = tags.models.filter((m: { name: string }) => m.name === model);
  if (selected.length !== 1) throw Error("NATIVE_PROVIDER_MODEL");
  return identitySchema.parse({
    route,
    version: version.version,
    pid,
    startTicks,
    serviceStart: fields.ExecMainStartTimestampMonotonic,
    executable,
    command,
    listenerPids,
    model,
    modelDigest: selected[0].digest,
  });
}
