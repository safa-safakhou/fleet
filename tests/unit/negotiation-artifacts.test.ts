import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createPinnedArtifactVerifier, validateOwnedDatabaseTarget } from "../../scripts/lib/negotiation-artifacts.js";

it("verifies exact private bundle bytes and fails closed on later drift or path escape", async () => {
  const root = await mkdtemp(join(tmpdir(), "negotiation-artifacts-"));
  try {
    await writeFile(join(root, "controller.js"), "aa");
    const pins = [{ relativePath: "controller.js", bytes: 2, sha256: createHash("sha256").update("aa").digest("hex") }];
    const verify = await createPinnedArtifactVerifier(root, pins);
    await verify();
    await expect(createPinnedArtifactVerifier(root, [{ ...pins[0], relativePath: "../outside" }])).rejects.toThrow(
      "ARTIFACT_SCOPE",
    );
    await expect(createPinnedArtifactVerifier(root, [{ ...pins[0], sha256: "0".repeat(64) }])).rejects.toThrow(
      "ARTIFACT_DIGEST",
    );
    await writeFile(join(root, "untracked.js"), "extra");
    await expect(verify()).rejects.toThrow("ARTIFACT_DRIFT");
    await writeFile(join(root, "controller.js"), "bb");
    await expect(verify()).rejects.toThrow("ARTIFACT_DRIFT");
    expect(() => validateOwnedDatabaseTarget("postgres://a:b@127.0.0.1:5451/pact_test")).toThrow();
    expect(() => validateOwnedDatabaseTarget("postgres://a:b@remote:6001/pact_test")).toThrow();
    expect(validateOwnedDatabaseTarget("postgres://a:b@127.0.0.1:6001/pact_test").port).toBe("6001");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
