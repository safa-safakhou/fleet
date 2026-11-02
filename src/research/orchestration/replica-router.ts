import { createHash, randomUUID } from "node:crypto";
import { createServer, request, type ServerResponse } from "node:http";
import { canonical } from "../contracts.js";
export interface ReplicaRoutingEvent {
  sequence: number;
  kind: "started" | "finished" | "failed" | "refused";
  requestId: string;
  replicaIndex: number | null;
  active: number;
  at: number;
  messagesDigest?: string;
}
/** Transparent single-attempt transport. A request is never retried on another replica. */
export function createReplicaRouter(options: {
  backends: readonly string[];
  expectedModel: string;
  maxBodyBytes?: number;
  onEvent?: (event: ReplicaRoutingEvent) => void;
}) {
  const backends = options.backends.map((value) => new URL(value));
  if (
    !backends.length ||
    backends.length > 16 ||
    new Set(backends.map((x) => x.origin)).size !== backends.length ||
    backends.some(
      (x) =>
        x.protocol !== "http:" ||
        x.hostname !== "127.0.0.1" ||
        !x.port ||
        x.username ||
        x.password ||
        x.pathname !== "/" ||
        x.search ||
        x.hash,
    )
  )
    throw new Error("REPLICA_ENDPOINTS_REQUIRED");
  if (!options.expectedModel || options.expectedModel.length > 100) throw new Error("REPLICA_MODEL_REQUIRED");
  const maxBodyBytes = options.maxBodyBytes ?? 1048576;
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1048576)
    throw new Error("REPLICA_BODY_LIMIT");
  const busy = backends.map(() => false),
    failed = backends.map(() => false),
    calls = backends.map(() => 0);
  let sequence = 0;
  const emit = (
    kind: ReplicaRoutingEvent["kind"],
    requestId: string,
    replicaIndex: number | null,
    messagesDigest?: string,
  ) =>
    options.onEvent?.({
      sequence: ++sequence,
      kind,
      requestId,
      replicaIndex,
      active: busy.filter(Boolean).length,
      at: Date.now(),
      ...(messagesDigest ? { messagesDigest } : {}),
    });
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === "GET" && req.url === "/fleet/replicas") {
        json(res, 200, { replicas: state() });
        return;
      }
      if (req.method === "GET" && ["/api/version", "/api/tags", "/api/ps"].includes(req.url ?? "")) {
        const targets = req.url === "/api/ps" ? backends : [backends[0]],
          values = await Promise.all(
            targets.map(async (base, index) => {
              const response = await fetch(new URL(req.url ?? "/", base), { signal: AbortSignal.timeout(2000) });
              if (!response.ok) throw new Error("REPLICA_METADATA_UNAVAILABLE");
              return { index, value: await response.json() };
            }),
          );
        json(
          res,
          200,
          req.url === "/api/ps"
            ? {
                models: values.flatMap((x) =>
                  (x.value.models ?? []).map((m: Record<string, unknown>) => ({ ...m, replicaIndex: x.index })),
                ),
              }
            : values[0].value,
        );
        return;
      }
      if (req.method !== "POST" || req.url !== "/api/chat") {
        req.resume();
        json(res, 405, { error: "REPLICA_ENDPOINT_FORBIDDEN" });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBodyBytes) {
          req.resume();
          json(res, 413, { error: "REPLICA_BODY_LIMIT" });
          return;
        }
        chunks.push(bytes);
      }
      const body = Buffer.concat(chunks);
      let input: unknown;
      try {
        input = JSON.parse(body.toString());
      } catch {
        json(res, 400, { error: "INVALID_REPLICA_REQUEST" });
        return;
      }
      if (!input || typeof input !== "object" || !("model" in input) || input.model !== options.expectedModel) {
        json(res, 400, { error: "REPLICA_MODEL_FORBIDDEN" });
        return;
      }
      const messagesDigest = createHash("sha256")
        .update(canonical("messages" in input ? input.messages : null))
        .digest("hex");
      const id = randomUUID(),
        index = busy.findIndex((value, i) => !value && !failed[i]);
      if (index < 0) {
        emit("refused", id, null, messagesDigest);
        json(res, 503, { error: "REPLICA_CAPACITY_BUSY" });
        return;
      }
      busy[index] = true;
      calls[index]++;
      let released = false;
      const release = (kind: "finished" | "failed") => {
        if (released) return;
        released = true;
        busy[index] = false;
        // A disconnected client cannot prove that backend inference stopped.
        // Preserve uncertainty by refusing reuse until a new router is created.
        if (kind === "failed") failed[index] = true;
        emit(kind, id, index, messagesDigest);
      };
      try {
        emit("started", id, index, messagesDigest);
      } catch (error) {
        busy[index] = false;
        throw error;
      }
      const headers = { ...req.headers, host: backends[index].host, "content-length": String(body.length) };
      delete headers.connection;
      delete headers["transfer-encoding"];
      const upstream = request(new URL("/api/chat", backends[index]), { method: "POST", headers }, (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        res.flushHeaders();
        response.on("end", () => release("finished"));
        response.on("error", () => {
          release("failed");
          res.destroy();
        });
        response.on("close", () => {
          if (!response.complete) {
            release("failed");
            res.destroy();
          }
        });
        response.pipe(res);
      });
      upstream.on("error", () => {
        release("failed");
        res.destroy();
      });
      res.on("close", () => {
        if (!res.writableFinished) {
          upstream.destroy();
          release("failed");
        }
      });
      upstream.end(body);
    })().catch(() => {
      if (!res.headersSent) json(res, 502, { error: "REPLICA_TRANSPORT_UNAVAILABLE" });
      else res.destroy();
    });
  });
  const state = () => backends.map((_, i) => ({ index: i, busy: busy[i], available: !failed[i], requests: calls[i] }));
  return { server, state };
}
