import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  bootstrapOwnedNegotiationDatabase,
  type OwnedBootstrapDriver,
} from "../../scripts/prepare-negotiation-database.js";

it("refuses wrong images and retained ports without initializing a foreign database or destroying partial owned state", async () => {
  const root = await mkdtemp(join(tmpdir(), "negotiation-bootstrap-"));
  let starts = 0,
    initializes = 0;
  const driver: OwnedBootstrapDriver = {
    image: async () => "wrong",
    start: async () => {
      starts++;
      return { containerId: "a".repeat(64), port: 5451 };
    },
    owner: async () => "f".repeat(64),
    initialize: async () => {
      initializes++;
    },
  };
  try {
    await expect(bootstrapOwnedNegotiationDatabase(join(root, "wrong-image"), driver)).rejects.toThrow(
      "OWNED_DATABASE_IMAGE",
    );
    expect(starts).toBe(0);
    driver.image = async () => "sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537";
    driver.owner = async (_id, nonce) => nonce;
    await expect(bootstrapOwnedNegotiationDatabase(join(root, "wrong-port"), driver)).rejects.toThrow(
      "OWNED_DATABASE_TARGET_REQUIRED",
    );
    expect(starts).toBe(1);
    expect(initializes).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
