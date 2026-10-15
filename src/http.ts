import { type Data, FleetError, object } from "./domain.js";
export class RemoteRejection extends FleetError {
  constructor(
    code: string,
    readonly status: number,
    readonly detail?: Data,
  ) {
    super(code);
  }
}
export function remoteValidationDetail(value: unknown): Data | undefined {
  const detail = object(value);
  if (typeof detail.schemaId !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(detail.schemaId)) return;
  return {
    schemaId: detail.schemaId,
    errors: (Array.isArray(detail.errors) ? detail.errors : []).slice(0, 8).map((raw) => {
      const e = object(raw);
      return {
        path: (Array.isArray(e.path) ? e.path : []).slice(0, 8).map((p) => String(p).slice(0, 80)),
        code: typeof e.code === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(e.code) ? e.code : "validation_error",
      };
    }),
    complete: detail.complete === true,
  };
}
export function endpoint(value: string, allowHttp = false) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:"))
  )
    throw new FleetError("INVALID_ENDPOINT");
  return value.replace(/\/$/, "");
}
export async function jsonRequest(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<{ data: Data; headers: Headers }> {
  const r = await fetch(url, { ...init, redirect: "error", signal: signal ?? AbortSignal.timeout(20000) });
  const size = Number(r.headers.get("content-length") ?? 0);
  if (size > 1000000) throw new FleetError("RESPONSE_TOO_LARGE");
  if (!r.body) throw new FleetError("EMPTY_RESPONSE");
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 1000000) {
      await reader.cancel();
      throw new FleetError("RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }
  let data: Data;
  try {
    data = object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new FleetError("INVALID_REMOTE_RESPONSE");
  }
  if (!r.ok) {
    const code = object(data.error).code ?? (typeof data.error === "string" ? data.error : data.code);
    throw new RemoteRejection(
      typeof code === "string" && /^[A-Z][A-Z0-9_]{1,60}$/.test(code)
        ? code
        : r.status === 401
          ? "AUTH_REQUIRED"
          : r.status === 429
            ? "RATE_LIMITED"
            : r.status < 500
              ? "REMOTE_REJECTED"
              : "TRANSPORT_UNCERTAIN",
      r.status,
      remoteValidationDetail(object(data.error).detail),
    );
  }
  return { data, headers: r.headers };
}
