import { randomUUID } from "node:crypto";
import { type Data, FleetError, object, safeCode } from "./domain.js";
import { readJSONResponse } from "./http.js";
import { modelAbortCode } from "./model-deadline.js";
import { type GenerationProgress, ModelTransportError } from "./model-progress.js";
import { terminalControl } from "./vllm-terminal.js";
export async function vllmCompletion(
  url: string,
  body: Data,
  key: string,
  signal: AbortSignal,
  onEvidence?: (event: { kind: "prepared" | "packet" | "unavailable"; body: unknown }) => Promise<void>,
  onDispatch?: () => Promise<void>,
  terminalAccounting?: { instanceId: string },
) {
  const started = performance.now();
  // SSE repeats protocol metadata for each token. Bound transport overhead separately
  // from decoded content so a valid larger output allowance can actually be used.
  const tokens = Number(body.max_completion_tokens);
  const wireLimit =
    Number.isSafeInteger(tokens) && tokens > 0 ? Math.max(1000000, Math.min(32000000, tokens * 2048)) : 1000000;
  const progress: GenerationProgress = {
    requestId: randomUUID(),
    firstContentMs: null,
    elapsedMs: 0,
    contentChars: 0,
    chunks: 0,
    maxWhitespaceRun: 0,
    finishReason: null,
    reasoningChars: 0,
    wireBytes: 0,
  };
  const clientRequestId = progress.requestId;
  const transport = new AbortController();
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let abortOperation: Promise<unknown> | undefined;
  let terminalRead = false;
  let accountingUntil: number | undefined;
  let abortControlFailed = false;
  const accountingSignal = () => {
    accountingUntil ??= performance.now() + 1000;
    const remaining = Math.floor(accountingUntil - performance.now());
    if (remaining <= 0) throw new FleetError(modelAbortCode(signal.reason));
    return AbortSignal.timeout(remaining);
  };
  const transportAbort = () => {
    if (!terminalAccounting) {
      transport.abort(signal.reason);
      return;
    }
    if (terminalRead || abortOperation) return;
    // Stop native generation immediately; retain the response solely for final accounting.
    const drain = accountingSignal();
    abortOperation = terminalControl(
      url,
      key,
      clientRequestId,
      "abort",
      terminalAccounting.instanceId,
      drain,
      onEvidence,
    ).catch(() => {
      abortControlFailed = true;
    });
    drainTimer = setTimeout(() => transport.abort(signal.reason), 1000);
  };
  let dispatched = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let abortRead: (() => void) | undefined;
  try {
    const prepared = { ...body, request_id: progress.requestId, stream: true, stream_options: { include_usage: true } };
    await onEvidence?.({ kind: "prepared", body: prepared });
    if (signal.aborted) throw new FleetError(modelAbortCode(signal.reason), true);
    await onDispatch?.();
    signal.addEventListener("abort", transportAbort, { once: true });
    if (signal.aborted) transportAbort();
    dispatched = true;
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: transport.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-request-id": progress.requestId,
      },
      body: JSON.stringify(prepared),
    });
    // Some compatible test/deployment endpoints return a complete JSON response.
    // It still needs final provider usage; never retry via another protocol.
    if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
      const { data } = await readJSONResponse(response);
      await onEvidence?.({
        kind: response.ok ? "packet" : "unavailable",
        body: response.ok ? data : { code: "PROVIDER_ERROR_PAYLOAD_WITHHELD" },
      });
      if (terminalAccounting) throw new FleetError("PROVIDER_TERMINAL_PROTOCOL_REQUIRED");
      progress.elapsedMs = performance.now() - started;
      return { data, execution: progress };
    }
    if (!response.body) throw new FleetError("EMPTY_RESPONSE");
    reader = response.body.getReader();
    const aborted = new Promise<never>((_, reject) => {
      abortRead = () => reject(new FleetError(modelAbortCode(signal.reason)));
      transport.signal.addEventListener("abort", abortRead, { once: true });
      if (transport.signal.aborted) abortRead();
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "",
      text = "",
      bytes = 0,
      decodedBytes = 0,
      done = false,
      serverId: string | undefined,
      usage: Data | undefined;
    let insideString = false,
      escaped = false,
      whitespaceRun = 0;
    const frame = async (raw: string) => {
      if (Buffer.byteLength(raw) > 1000000) throw new FleetError("RESPONSE_TOO_LARGE");
      const lines = raw
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());
      if (!lines.length) return;
      const value = lines.join("\n");
      if (done) throw new FleetError("MODEL_STREAM_INVALID");
      if (value === "[DONE]") {
        done = true;
        return;
      }
      const chunk = object(JSON.parse(value));
      await onEvidence?.(
        chunk.error
          ? { kind: "unavailable", body: { code: "PROVIDER_ERROR_PAYLOAD_WITHHELD" } }
          : { kind: "packet", body: chunk },
      );
      if (typeof chunk.id === "string") {
        if (chunk.id.length > 200 || (serverId && serverId !== chunk.id)) throw new FleetError("MODEL_STREAM_INVALID");
        serverId = chunk.id;
        progress.requestId = chunk.id;
      }
      progress.chunks++;
      if (chunk.error) {
        const message = object(chunk.error).message;
        const match = typeof message === "string" ? /Unimplemented keys:\s*\[([^\]]{0,500})\]/.exec(message) : null;
        const keys = match
          ? [...match[1].matchAll(/"([A-Za-z$][A-Za-z0-9_$]{0,63})"/g)].map((m) => m[1]).slice(0, 8)
          : [];
        progress.providerError = keys.length
          ? { category: "unsupported_schema_keyword", unsupportedKeys: keys }
          : { category: "provider_rejection" };
        throw new FleetError("MODEL_PROVIDER_ERROR");
      }
      if (chunk.usage) usage = object(chunk.usage);
      if (!Array.isArray(chunk.choices)) throw new FleetError("MODEL_STREAM_INVALID");
      if (chunk.choices.length > 1) throw new FleetError("MODEL_STREAM_INVALID");
      for (const choice of chunk.choices) {
        const c = object(choice),
          delta = object(c.delta);
        const reasoning = delta.reasoning ?? delta.reasoning_content;
        if (typeof reasoning === "string") {
          progress.reasoningChars! += reasoning.length;
          decodedBytes += Buffer.byteLength(reasoning);
        }
        if (typeof delta.content === "string") decodedBytes += Buffer.byteLength(delta.content);
        if (decodedBytes > 1000000) throw new FleetError("RESPONSE_TOO_LARGE");
        if (
          c.index !== 0 ||
          (delta.content !== undefined && delta.content !== null && typeof delta.content !== "string")
        )
          throw new FleetError("MODEL_STREAM_INVALID");
        if (typeof c.finish_reason === "string") {
          if (progress.finishReason) throw new FleetError("MODEL_STREAM_INVALID");
          progress.finishReason = c.finish_reason;
        }
        if (typeof delta.content === "string" && delta.content) {
          if (progress.firstContentMs === null) progress.firstContentMs = performance.now() - started;
          text += delta.content;
          progress.contentChars = text.length;
          for (const char of delta.content) {
            if (insideString) {
              whitespaceRun = 0;
              if (escaped) escaped = false;
              else if (char === "\\") escaped = true;
              else if (char === '"') insideString = false;
            } else if (char === '"') {
              insideString = true;
              whitespaceRun = 0;
            } else if (/\s/.test(char)) {
              whitespaceRun++;
              progress.maxWhitespaceRun = Math.max(progress.maxWhitespaceRun, whitespaceRun);
            } else whitespaceRun = 0;
          }
        }
      }
    };
    read: for (;;) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) {
        pending += decoder.decode();
        break;
      }
      bytes += next.value.byteLength;
      progress.wireBytes = bytes;
      if (bytes > wireLimit) throw new FleetError("RESPONSE_TOO_LARGE");
      pending += decoder.decode(next.value, { stream: true });
      for (;;) {
        const match = /\r?\n\r?\n/.exec(pending);
        if (!match) break;
        await frame(pending.slice(0, match.index));
        pending = pending.slice(match.index + match[0].length);
        if (done) break read;
      }
      if (Buffer.byteLength(pending) > 1000000) throw new FleetError("RESPONSE_TOO_LARGE");
    }
    if (pending.trim() || !done || !progress.finishReason) throw new FleetError("MODEL_STREAM_INCOMPLETE");
    if (terminalAccounting) {
      terminalRead = true;
      await abortOperation;
      if (abortControlFailed) throw new FleetError("PROVIDER_ABORT_CONTROL_UNAVAILABLE");
      // The provider journals before emitting DONE. Read and verify that exact terminal record.
      const receipt = await terminalControl(
        url,
        key,
        clientRequestId,
        "terminal",
        terminalAccounting.instanceId,
        accountingSignal(),
        onEvidence,
      );
      const finalUsage = object(receipt.usage);
      if (
        receipt.nativeRequestId !== serverId ||
        receipt.finishReason !== progress.finishReason ||
        finalUsage.prompt_tokens !== usage?.prompt_tokens ||
        finalUsage.completion_tokens !== usage?.completion_tokens
      )
        throw new FleetError("PROVIDER_TERMINAL_IDENTITY_MISMATCH");
    }
    progress.elapsedMs = performance.now() - started;
    return {
      cancelledCode: signal.aborted ? modelAbortCode(signal.reason) : undefined,
      data: { choices: [{ message: { content: text }, finish_reason: progress.finishReason }], usage: usage ?? {} },
      execution: progress,
    };
  } catch (error) {
    if (!dispatched && error instanceof FleetError && error.notDispatched) throw error;
    // A severed stream may have a durable final native record, but no usable decision.
    if (terminalAccounting && dispatched && !terminalRead && !abortControlFailed) {
      try {
        terminalRead = true;
        await abortOperation;
        if (abortControlFailed) throw error;
        const receipt = await terminalControl(
          url,
          key,
          clientRequestId,
          "terminal",
          terminalAccounting.instanceId,
          accountingSignal(),
          onEvidence,
        );
        if (progress.requestId !== clientRequestId && receipt.nativeRequestId !== progress.requestId) throw error;
        progress.finishReason = String(receipt.finishReason);
        progress.elapsedMs = performance.now() - started;
        return {
          accountingOnly: true,
          cancelledCode: signal.aborted ? modelAbortCode(signal.reason) : undefined,
          data: {
            choices: [{ message: { content: "" }, finish_reason: receipt.finishReason }],
            usage: object(receipt.usage),
          },
          execution: progress,
        };
      } catch {
        /* No authoritative terminal receipt: retain unknown usage. */
      }
    }
    progress.elapsedMs = performance.now() - started;
    throw new ModelTransportError(signal.aborted ? modelAbortCode(signal.reason) : safeCode(error), progress);
  } finally {
    signal.removeEventListener("abort", transportAbort);
    if (drainTimer) clearTimeout(drainTimer);
    if (abortRead) transport.signal.removeEventListener("abort", abortRead);
    // A protocol-complete answer already carries authoritative usage. Socket cleanup
    // must not delay its accounting past the turn lease. Partial streams remain unknown.
    void reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
