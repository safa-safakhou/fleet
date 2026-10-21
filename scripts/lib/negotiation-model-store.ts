import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type ArtifactPin, fileSha256 } from "./negotiation-artifacts.js";
/** Exact parse-cache bytes produced by the first accounted E1 inference on the
 * pinned Ollama0.35.1/Nemotron GGUF. No canary/warmup generated this artifact. */
export const pinnedProviderMetadata: readonly ArtifactPin[] = Object.freeze([
  {
    relativePath: "metadata/sha256-527db2cf6c705d8fabb95693d038d9c06b4a2b0b8b0a4bbdbd01212d37242970.json",
    bytes: 1375,
    sha256: "ebd2ac6ea72d94475eea4d8f3c21506d5dfed54b9edd27823982e981b410678a",
  },
]);
/** Provider-owned state is outside the sealed release. Immutable model files
 * are mandatory; only exact known metadata may appear later during inference. */
export async function createProviderModelStoreVerifier(
  root: string,
  required: readonly ArtifactPin[],
  optional: readonly ArtifactPin[] = pinnedProviderMetadata,
) {
  const base = resolve(root),
    pins = new Map<string, ArtifactPin>(),
    directories = new Set([""]),
    stamps = new Map<string, string>();
  for (const pin of [...required, ...optional]) {
    if (
      !pin.relativePath ||
      pin.relativePath.includes("\\") ||
      pin.relativePath.split("/").some((p) => !p || p === "." || p === "..") ||
      pins.has(pin.relativePath) ||
      !Number.isSafeInteger(pin.bytes) ||
      pin.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(pin.sha256)
    )
      throw Error("MODEL_STORE_SCOPE");
    pins.set(pin.relativePath, pin);
    const parts = pin.relativePath.split("/");
    parts.pop();
    while (parts.length) {
      directories.add(parts.join("/"));
      parts.pop();
    }
  }
  const verify = async () => {
    const found = new Set<string>();
    const scan = async (dir: string, rel: string) => {
      const d = await lstat(dir);
      if (!d.isDirectory() || d.isSymbolicLink()) throw Error("MODEL_STORE_SCOPE");
      for (const name of await readdir(dir)) {
        const r = rel ? `${rel}/${name}` : name,
          path = join(dir, name),
          s = await lstat(path, { bigint: true });
        if (s.isSymbolicLink()) throw Error("MODEL_STORE_SCOPE");
        if (s.isDirectory()) {
          if (!directories.has(r)) throw Error("MODEL_STORE_SCOPE");
          await scan(path, r);
          continue;
        }
        const pin = pins.get(r);
        if (!s.isFile() || !pin) throw Error("MODEL_STORE_SCOPE");
        const stamp = `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
        if (
          s.size !== BigInt(pin.bytes) ||
          ((optional.includes(pin) || stamps.get(r) !== stamp) && (await fileSha256(path)) !== pin.sha256)
        )
          throw Error("MODEL_STORE_DIGEST");
        const after = await lstat(path, { bigint: true });
        if (
          !after.isFile() ||
          after.isSymbolicLink() ||
          `${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}:${after.ctimeNs}` !== stamp
        )
          throw Error("MODEL_STORE_DIGEST");
        stamps.set(r, stamp);
        found.add(r);
      }
    };
    await scan(base, "");
    if (required.some((p) => !found.has(p.relativePath))) throw Error("MODEL_STORE_SCOPE");
  };
  await verify();
  return verify;
}
