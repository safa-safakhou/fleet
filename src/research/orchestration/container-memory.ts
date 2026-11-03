import { request } from "node:http";
import { FleetError, object } from "../../domain.js";
/** Read-only Docker metadata. No CLI formatting, stream subscription or environment-host fallback. */
export function readContainerMemory(
  socketPath: string,
  containerId: string,
  signal: AbortSignal,
): Promise<{ usageBytes: number; limitBytes: number }> {
  if (!socketPath.startsWith("/") || socketPath.length > 1024 || !/^[a-f0-9]{64}$/.test(containerId))
    throw new FleetError("CONTAINER_MEMORY_CONFIGURATION", true);
  return new Promise((resolve, reject) => {
    const fail = (code: string) => reject(new FleetError(code, true));
    const req = request(
      { socketPath, path: `/containers/${containerId}/stats?stream=false&one-shot=true`, method: "GET", signal },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          fail("CONTAINER_MEMORY_UNAVAILABLE");
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 65536) {
            fail("CONTAINER_MEMORY_TOO_LARGE");
            response.destroy();
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("error", () => fail("CONTAINER_MEMORY_UNAVAILABLE"));
        response.on("end", () => {
          try {
            const data = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
              memory = object(data.memory_stats),
              usageBytes = memory.usage,
              limitBytes = memory.limit;
            if (
              data.id !== containerId ||
              !Number.isSafeInteger(usageBytes) ||
              Number(usageBytes) < 0 ||
              !Number.isSafeInteger(limitBytes) ||
              Number(limitBytes) <= 0
            )
              throw Error();
            resolve({ usageBytes: Number(usageBytes), limitBytes: Number(limitBytes) });
          } catch {
            fail("CONTAINER_MEMORY_INVALID");
          }
        });
      },
    );
    req.on("error", () => fail(signal.aborted ? "CONTAINER_MEMORY_ABORTED" : "CONTAINER_MEMORY_UNAVAILABLE"));
    req.end();
  });
}
