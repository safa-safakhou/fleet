import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createProviderModelStoreVerifier } from "../../scripts/lib/negotiation-model-store.js";

it("allows only the exact known provider metadata cache outside the sealed artifact tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "provider-model-store-")),
    sha = (s: string) => createHash("sha256").update(s).digest("hex");
  try {
    await mkdir(join(root, "blobs"));
    await mkdir(join(root, "metadata"));
    await writeFile(join(root, "blobs/sha256-model"), "model");
    const cache = { relativePath: "metadata/sha256-model.json", bytes: 5, sha256: sha("cache") };
    const verify = await createProviderModelStoreVerifier(
      root,
      [{ relativePath: "blobs/sha256-model", bytes: 5, sha256: sha("model") }],
      [cache],
    );
    await expect(verify()).resolves.toBeUndefined();
    await writeFile(join(root, cache.relativePath), "cache");
    await expect(verify()).resolves.toBeUndefined();
    await writeFile(join(root, cache.relativePath), "wrong");
    await expect(verify()).rejects.toThrow("MODEL_STORE_DIGEST");
    await writeFile(join(root, cache.relativePath), "cache");
    await writeFile(join(root, "metadata/foreign.json"), "other");
    await expect(verify()).rejects.toThrow("MODEL_STORE_SCOPE");
    await rm(join(root, "metadata/foreign.json"));
    await writeFile(join(root, "blobs/sha256-model"), "other");
    await expect(verify()).rejects.toThrow("MODEL_STORE_DIGEST");
  } finally {
    await rm(root, { recursive: true });
  }
});
