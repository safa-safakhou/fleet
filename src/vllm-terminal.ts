import { createHash } from "node:crypto";
import { z } from "zod";
import { FleetError } from "./domain.js";
import { readJSONResponse } from "./http.js";

const terminal = z
  .object({
    schemaVersion: z.literal("fleet.vllm-terminal.v1"),
    instanceId: z.string().min(1).max(200),
    clientRequestId: z.uuid(),
    nativeRequestId: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/),
    finishReason: z.enum(["stop", "length", "abort", "tool_calls", "content_filter"]),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().safe(),
        completion_tokens: z.number().int().nonnegative().safe(),
        total_tokens: z.number().int().nonnegative().safe(),
      })
      .strict(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function terminalControl(
  url: string,
  key: string,
  clientRequestId: string,
  operation: "abort" | "terminal",
  instanceId: string,
  signal: AbortSignal,
  onEvidence?: (event: { kind: "packet"; body: unknown }) => Promise<void>,
) {
  const endpoint = new URL(url);
  endpoint.pathname = `/fleet/requests/${clientRequestId}/${operation}`;
  await onEvidence?.({
    kind: "packet",
    body: { fleetTerminalControl: { operation, clientRequestId, instanceId, phase: "prepared" } },
  });
  const response = await fetch(endpoint, {
    method: operation === "abort" ? "POST" : "GET",
    redirect: "error",
    signal,
    headers: { authorization: `Bearer ${key}` },
  });
  const { data } = await readJSONResponse(response);
  if (!response.ok) throw new FleetError("PROVIDER_TERMINAL_UNAVAILABLE");
  if (data.instanceId !== instanceId || data.clientRequestId !== clientRequestId)
    throw new FleetError("PROVIDER_TERMINAL_IDENTITY_MISMATCH");
  if (operation === "terminal") {
    const parsed = terminal.safeParse(data);
    if (!parsed.success) throw new FleetError("PROVIDER_TERMINAL_INVALID");
    const { sha256, ...payload } = parsed.data;
    const ordered = {
      clientRequestId: payload.clientRequestId,
      finishReason: payload.finishReason,
      instanceId: payload.instanceId,
      nativeRequestId: payload.nativeRequestId,
      schemaVersion: payload.schemaVersion,
      usage: {
        completion_tokens: payload.usage.completion_tokens,
        prompt_tokens: payload.usage.prompt_tokens,
        total_tokens: payload.usage.total_tokens,
      },
    };
    if (
      payload.usage.total_tokens !== payload.usage.prompt_tokens + payload.usage.completion_tokens ||
      createHash("sha256").update(JSON.stringify(ordered)).digest("hex") !== sha256
    )
      throw new FleetError("PROVIDER_TERMINAL_INTEGRITY");
  }
  await onEvidence?.({ kind: "packet", body: { fleetTerminalControl: { operation, receipt: data } } });
  return data;
}
