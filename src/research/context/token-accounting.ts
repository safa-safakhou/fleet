export type Message = { role: "system" | "user" | "assistant" | "tool"; content: string };
export type TokenCounter = { revision: string; count(messages: Message[], schema: Record<string, unknown>): number };
export function account(messages: Message[], schema: Record<string, unknown>, counter?: TokenCounter) {
  const messagesBytes = Buffer.byteLength(JSON.stringify(messages)),
    schemaBytes = Buffer.byteLength(JSON.stringify(schema)),
    totalBytes = Buffer.byteLength(JSON.stringify({ messages, schema }));
  const inputTokens = counter ? counter.count(messages, schema) : Math.ceil(totalBytes / 4) + messages.length * 4;
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) throw new Error("TOKEN_ACCOUNTING_INVALID");
  return {
    messagesBytes,
    schemaBytes,
    totalBytes,
    inputTokens,
    tokenizer: counter?.revision ?? "utf8-estimate@1",
    tokenAccuracy: counter ? ("exact" as const) : ("estimate" as const),
  };
}
