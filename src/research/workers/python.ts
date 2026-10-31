import { spawn } from "node:child_process";
import { platform } from "node:os";
import { dirname } from "node:path";
import { fromBinary, fromJsonString, toJson } from "@bufbuild/protobuf";
import { FleetError } from "../../domain.js";
import { WorkerInputSchema, WorkerResultSchema } from "../generated/fleet/v1/worker_pb.js";

export type PythonExecutor = { mode: "native-development"; executable: string } | { mode: "container"; image: string };
/** Explicit invocation only. Container mode has no fallback to a native process. */
export async function runPythonWorker(
  executor: PythonExecutor,
  control: { socket: string; token: string; input: Record<string, unknown> },
  signal: AbortSignal,
) {
  const wireInput = fromJsonString(WorkerInputSchema, JSON.stringify(control.input));
  const input = toJson(WorkerInputSchema, wireInput);
  if (executor.mode === "container" && platform() !== "linux")
    throw new FleetError("WORKER_ISOLATION_HOST_UNSUPPORTED", true);
  if (executor.mode === "container" && !/^sha256:[a-f0-9]{64}$/.test(executor.image))
    throw new FleetError("WORKER_IMAGE_DIGEST_REQUIRED", true);
  const args =
    executor.mode === "native-development"
      ? ["-m", "fleet_research.cli_entry"]
      : [
          "run",
          "--rm",
          "-i",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--pids-limit",
          "64",
          "--memory",
          "512m",
          "--cpus",
          "1",
          "--user",
          "10001:10001",
          "--tmpfs",
          "/tmp:rw,noexec,nosuid,size=32m,uid=10001,gid=10001",
          "--mount",
          `type=bind,src=${dirname(control.socket)},dst=/ipc,readonly`,
          executor.image,
        ];
  const child = spawn(executor.mode === "native-development" ? executor.executable : "docker", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1" },
    signal,
    killSignal: "SIGTERM",
  });
  const chunks: Buffer[] = [];
  let size = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 65536) child.kill("SIGKILL");
    else chunks.push(chunk);
  });
  child.stderr.resume(); // Raw framework exceptions must never enter Fleet logs.
  child.stdin.on("error", () => {});
  child.stdin.end(
    JSON.stringify({
      ...control,
      input,
      socket: executor.mode === "container" ? `/ipc/${control.socket.split("/").at(-1)}` : control.socket,
    }),
  );
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", () => reject(new FleetError("WORKER_PROCESS_FAILED", true)));
    child.once("exit", resolve);
  });
  if (code !== 0 || size > 65536) throw new FleetError("WORKER_EXECUTION_FAILED", true);
  const result = fromBinary(WorkerResultSchema, Buffer.concat(chunks));
  if (result.protocolVersion !== 1 || result.workerVersion !== wireInput.workerVersion || result.status !== "proposed")
    throw new FleetError("WORKER_RESULT_INVALID", true);
  return toJson(WorkerResultSchema, result);
}
