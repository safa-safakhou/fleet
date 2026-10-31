import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { platform } from "node:os";
import { dirname } from "node:path";
import { promisify } from "node:util";
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
  if (executor.mode === "container" && process.getuid?.() !== 10001)
    throw new FleetError("WORKER_SOCKET_OWNER_MISMATCH", true);
  if (executor.mode === "container" && !/^sha256:[a-f0-9]{64}$/.test(executor.image))
    throw new FleetError("WORKER_IMAGE_DIGEST_REQUIRED", true);
  const deadline = Date.parse(wireInput.deadlineUtc);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new FleetError("WORKER_DEADLINE", true);
  const timeout = AbortSignal.timeout(Math.min(deadline - Date.now(), 15 * 60000));
  const combined = AbortSignal.any([signal, timeout]);
  const containerName = `fleet-research-worker-${randomUUID()}`;
  const args =
    executor.mode === "native-development"
      ? ["-m", "fleet_research.cli_entry"]
      : [
          "run",
          "--rm",
          "--name",
          containerName,
          "--label",
          "fleet.fixture-owner=scoped-worker",
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
    signal: combined,
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
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    escalation = setTimeout(() => child.kill("SIGKILL"), 2000);
    escalation.unref();
  };
  combined.addEventListener("abort", abort, { once: true });
  let code: number | null;
  try {
    code = await new Promise<number | null>((resolve) => {
      child.once("error", () => {});
      child.once("close", resolve);
    });
  } finally {
    combined.removeEventListener("abort", abort);
    if (escalation) clearTimeout(escalation);
    // Killing the Docker CLI alone is not proof that its container stopped.
    if (executor.mode === "container")
      await promisify(execFile)("docker", ["rm", "-f", containerName], { timeout: 5000 }).catch(() => {});
  }
  if (code !== 0 || size > 65536) throw new FleetError("WORKER_EXECUTION_FAILED", true);
  const result = fromBinary(WorkerResultSchema, Buffer.concat(chunks));
  if (result.protocolVersion !== 1 || result.workerVersion !== wireInput.workerVersion || result.status !== "proposed")
    throw new FleetError("WORKER_RESULT_INVALID", true);
  return toJson(WorkerResultSchema, result);
}
