import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runCli } from "../../src/cli.js";
import { verifyArchive, writeArchive } from "../../src/research/evidence/export.js";
import {
  syntheticArchive,
  syntheticArchiveKey,
  syntheticEvent,
  syntheticScope,
  syntheticSnapshot,
} from "../fixtures/research/archive.js";

test("offline verifier rejects logical duplicate events, foreign refs and missing artifact data", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-verify-"));
  try {
    const base = [
        { type: "snapshot", snapshot: syntheticSnapshot },
        { type: "event", event: syntheticEvent },
      ],
      path = join(root, "test.fleet");
    await writeFile(path, syntheticArchive(base));
    expect((await verifyArchive(path, syntheticArchiveKey)).status).toBe("verified");
    await writeFile(
      path,
      syntheticArchive([...base, { type: "event", event: syntheticEvent }], {
        events: 2,
        artifacts: 0,
        gaps: 0,
        bytes: "0",
      }),
    );
    expect((await verifyArchive(path, syntheticArchiveKey)).status).toBe("invalid");
    const ref = {
      id: "66666666-6666-4666-8666-666666666666",
      bytes: "1",
      chunks: "1",
      contentType: "text/plain",
      ciphertextDigest: "a".repeat(64),
      privacyClass: "private",
      retentionClass: "30d",
    };
    await writeFile(
      path,
      syntheticArchive([...base, { type: "artifact.gap", id: ref.id, ref, status: "expired" }], {
        events: 1,
        artifacts: 0,
        gaps: 1,
        bytes: "0",
      }),
    );
    expect((await verifyArchive(path, syntheticArchiveKey)).status).toBe("invalid");
    const records = [
      base[0],
      { type: "event", event: { ...syntheticEvent, artifacts: [ref] } },
      { type: "artifact.begin", id: ref.id, scope: syntheticScope, ref },
      { type: "artifact.end", id: ref.id, bytes: "1", digest: createHash("sha256").update("x").digest("hex") },
    ];
    await writeFile(path, syntheticArchive(records, { events: 1, artifacts: 1, gaps: 0, bytes: "1" }));
    expect((await verifyArchive(path, syntheticArchiveKey)).status).toBe("invalid");
    const dest = join(root, "no-final.fleet");
    await expect(
      writeArchive(
        dest,
        (async function* () {
          yield Buffer.from("partial");
          throw Error("disk failure");
        })(),
      ),
    ).rejects.toThrow();
    expect((await verifyArchive(dest, syntheticArchiveKey)).status).toBe("invalid");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("offline CLI verifies portable fixture without contacting any runtime", async () => {
  expect((await verifyArchive("tests/fixtures/research/portable-v1.fleet",syntheticArchiveKey)).status).toBe("verified");
  const root = await mkdtemp(join(tmpdir(), "fleet-offline-"));
  try {
    const path = join(root, "test.fleet"),
      key = join(root, "key");
    await writeFile(
      path,
      syntheticArchive([
        { type: "snapshot", snapshot: syntheticSnapshot },
        { type: "event", event: syntheticEvent },
      ]),
    );
    await writeFile(key, syntheticArchiveKey.toString("hex"), { mode: 0o600 });
    const output: string[] = [];
    const code = await runCli(
      ["research", "archive", "verify", "--file", path, "--key-file", key],
      {
        out: (v) => output.push(v),
        error: (v) => output.push(v),
        readFile: async () => {
          throw Error("unused");
        },
        secret: async () => {
          throw Error("unused");
        },
      },
      new Proxy({} as never, {
        get() {
          throw Error("runtime contacted");
        },
      }),
    );
    expect(code).toBe(0);
    expect(output.join("")).toContain('"status":"verified"');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
