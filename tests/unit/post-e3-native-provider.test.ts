import { expect, it } from "vitest";
import * as native from "../../scripts/lib/post-e3-native-provider.js";

const pinned = {
  route: "http://127.0.0.1:11434",
  version: "0.35.1",
  pid: 1234,
  startTicks: "9999",
  serviceStart: "1234567",
  executable: "/synthetic/ollama/bin/ollama",
  command: ["/synthetic/ollama/bin/ollama", "serve"],
  listenerPids: [1234],
  model: "nemotron-3-nano:4b",
  modelDigest: "a".repeat(64),
};
it("binds the existing native service without admitting inference or server management", () => {
  expect(native.validateNativeProviderIdentity).toBeTypeOf("function");
  expect(() => native.validateNativeProviderIdentity(pinned, structuredClone(pinned))).not.toThrow();
});
it.each([
  { pid: 2345 },
  { startTicks: "10000" },
  { serviceStart: "1234568" },
  { executable: "/replacement/ollama" },
  { command: ["/synthetic/ollama/bin/ollama", "serve", "extra"] },
  { listenerPids: [1234, 2345] },
  { modelDigest: "b".repeat(64) },
  { version: "0.35.2" },
  { route: "http://127.0.0.1:11436" },
])("refuses native provider identity drift: %j", (change) => {
  expect(native.validateNativeProviderIdentity).toBeTypeOf("function");
  expect(() => native.validateNativeProviderIdentity(pinned, { ...pinned, ...change })).toThrow();
});
it("refuses a malformed baseline instead of trusting two identical invalid identities", () => {
  expect(native.validateNativeProviderIdentity).toBeTypeOf("function");
  const bad = { ...pinned, listenerPids: [] };
  expect(() => native.validateNativeProviderIdentity(bad, bad)).toThrow();
});
it("permits a separately selected installed9b baseline while rejecting cross-model drift", () => {
  const larger = { ...pinned, model: "qwen3.5:9b", modelDigest: "b".repeat(64) };
  expect(() => native.validateNativeProviderIdentity(larger, structuredClone(larger))).not.toThrow();
  expect(() => native.validateNativeProviderIdentity(pinned, larger)).toThrow();
  expect(() =>
    native.validateNativeProviderIdentity(
      { ...larger, model: "unregistered:latest" },
      { ...larger, model: "unregistered:latest" },
    ),
  ).toThrow();
});

it("pins installed Gemma separately and rejects prior model or digest drift", () => {
  const gemma = { ...pinned, model: "gemma4:12b", modelDigest: "c".repeat(64) };
  expect(() => native.validateNativeProviderIdentity(gemma, structuredClone(gemma))).not.toThrow();
  expect(() => native.validateNativeProviderIdentity(gemma, { ...gemma, model: "qwen3.5:9b" })).toThrow();
  expect(() => native.validateNativeProviderIdentity(gemma, { ...gemma, modelDigest: "d".repeat(64) })).toThrow();
});

it("pins the separately selected installed Qwen14B identity without allowing model/digest drift", () => {
  const qwen = { ...pinned, model: "qwen3:14b", modelDigest: "e".repeat(64) };
  expect(() => native.validateNativeProviderIdentity(qwen, structuredClone(qwen))).not.toThrow();
  expect(() => native.validateNativeProviderIdentity(qwen, { ...qwen, model: "gemma4:12b" })).toThrow();
  expect(() => native.validateNativeProviderIdentity(qwen, { ...qwen, modelDigest: "f".repeat(64) })).toThrow();
});

it("pins installed Granite independently and refuses cross-model/digest drift", () => {
  const granite = { ...pinned, model: "granite4.2:8b", modelDigest: "a".repeat(64) };
  expect(() => native.validateNativeProviderIdentity(granite, structuredClone(granite))).not.toThrow();
  expect(() => native.validateNativeProviderIdentity(granite, { ...granite, model: "qwen3.5:9b" })).toThrow();
  expect(() => native.validateNativeProviderIdentity(granite, { ...granite, modelDigest: "b".repeat(64) })).toThrow();
});

const localDigest = "6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197";
it("selects only the pinned local Nemotron 4B without fallback", () => {
  const selected = { name: "nemotron-3-nano:4b", digest: localDigest };
  expect(native.selectLocalNemotronModel({ models: [{ name: "other:8b", digest: "b".repeat(64) }, selected] })).toEqual(
    selected,
  );
  for (const catalog of [
    { models: [] },
    { models: [{ name: "other:8b", digest: localDigest }] },
    { models: [{ ...selected, digest: "b".repeat(64) }] },
    { models: [selected, selected] },
    {},
  ])
    expect(() => native.selectLocalNemotronModel(catalog)).toThrow("LOCAL_NEMOTRON_MODEL_REQUIRED");
  expect(() => native.selectLocalNemotronModel({ models: [selected] }, "other:8b")).toThrow(
    "LOCAL_NEMOTRON_MODEL_REQUIRED",
  );
});
