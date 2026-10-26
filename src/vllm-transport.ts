import { randomUUID } from "node:crypto";
import { type Data, FleetError, object, safeCode } from "./domain.js";
import { readJSONResponse } from "./http.js";
import { type GenerationProgress, ModelTransportError } from "./model-progress.js";
export async function vllmCompletion(url: string, body: Data, key: string, signal: AbortSignal) {
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
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-request-id": progress.requestId,
      },
      body: JSON.stringify({
        ...body,
        request_id: progress.requestId,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    // Some compatible test/deployment endpoints return a complete JSON response.
    // It still needs final provider usage; never retry via another protocol.
    if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
      const { data } = await readJSONResponse(response);
      progress.elapsedMs = performance.now() - started;
      return { data, execution: progress };
    }
    if (!response.body) throw new FleetError("EMPTY_RESPONSE");
    reader = response.body.getReader();
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
    const frame = (raw: string) => {
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
      const next = await reader.read();
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
        frame(pending.slice(0, match.index));
        pending = pending.slice(match.index + match[0].length);
        if (done) break read;
      }
      if (Buffer.byteLength(pending) > 1000000) throw new FleetError("RESPONSE_TOO_LARGE");
    }
    if (pending.trim() || !done || !progress.finishReason) throw new FleetError("MODEL_STREAM_INCOMPLETE");
    await reader.cancel().catch(() => {});
    progress.elapsedMs = performance.now() - started;
    return {
      data: { choices: [{ message: { content: text }, finish_reason: progress.finishReason }], usage: usage ?? {} },
      execution: progress,
    };
  } catch (error) {
    progress.elapsedMs = performance.now() - started;
    await reader?.cancel().catch(() => {});
    throw new ModelTransportError(safeCode(error), progress);
  } finally {
    reader?.releaseLock();
  }
}
