import { beforeAll } from "vitest";
import { assertOwnedFixture } from "../architecture-fixture.js";

beforeAll(() =>
  assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? ""),
);

import { afterEach, expect, test } from "vitest";
import { StepJournal } from "../../src/research/broker/steps.js";
import { digest } from "../../src/research/contracts.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { platformFixture } from "../platform-helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});
async function setup() {
  const f = await platformFixture();
  close = () => f.pool.end();
  await f.enqueue();
  const claim = await f.claim();
  const input = manifestInput();
  input.environment.bindingId = claim.bindingId;
  input.profile = claim.profile;
  const manifest = compileManifest(input, capability);
  await new ManifestRepository(f.pool).save(manifest.manifest);
  const journal = new StepJournal(f.store, f.tasks);
  const scope = await journal.open(claim, "run", "op", manifest.digest);
  return {
    f,
    claim,
    journal,
    scope,
    key: { operationId: scope.operationId, operationEpoch: scope.operationEpoch, logicalStepId: "call:1" },
  };
}
test("duplicate_conflicting_and_stale_step preserves one retained identity", async () => {
  const { f, journal, scope, key } = await setup();
  const payload = digest({ question: "fixture" });
  const results = await Promise.all([journal.begin(scope, key, payload), journal.begin(scope, key, payload)]);
  expect(results.map((r) => r.disposition).sort()).toEqual(["existing", "new"]);
  await expect(journal.begin(scope, key, digest({ question: "changed" }))).rejects.toThrow("STEP_INPUT_CONFLICT");
  await journal.complete(scope, key, { status: "unknown", allocationId: "original", usage: null });
  expect(await journal.lookup(scope, key)).toEqual({ status: "unknown", allocationId: "original", usage: null });
  await expect(journal.begin(scope, { ...key, logicalStepId: "call:2" }, payload)).rejects.toThrow(
    "OPERATION_UNRESOLVED",
  );
  await expect(
    journal.complete(scope, key, {
      status: "completed",
      allocationId: "original",
      usage: { inputTokens: "1", outputTokens: "2" },
    }),
  ).rejects.toThrow("STEP_RESULT_CONFLICT");
  expect((await journal.begin(scope, key, payload)).result.status).toBe("unknown");
  await expect(
    journal.complete(scope, key, { status: "completed", allocationId: "replacement", usage: null }),
  ).rejects.toThrow("STEP_RESULT_CONFLICT");
  await f.pool.query("UPDATE platform_tasks SET fence=fence+1 WHERE id=$1", [scope.taskId]);
  await expect(journal.begin(scope, { ...key, logicalStepId: "call:3" }, payload)).rejects.toThrow("TASK_FENCED");
});
test("rejects forged binding, actor, manifest and expired claims", async () => {
  const { f, journal, scope, key } = await setup();
  for (const changed of [
    { ...scope, agentId: "foreign" },
    { ...scope, bindingId: "foreign" },
    { ...scope, manifestDigest: "0".repeat(64) },
  ])
    await expect(journal.begin(changed, key, digest({}))).rejects.toThrow("OPERATION_SCOPE_MISMATCH");
  f.advance(3600000);
  await expect(journal.begin(scope, key, digest({}))).rejects.toThrow("CLAIM_FENCED");
});
test("lost acknowledgement returns recorded reply without a new effect", async () => {
  const { journal, scope, key } = await setup();
  let effects = 0;
  for (let n = 0; n < 3; n++) {
    const row = await journal.begin(scope, key, digest({}));
    if (row.disposition === "new") {
      effects++;
      await journal.complete(scope, key, { status: "completed", commandId: "original-command", usage: null });
    }
  }
  expect(effects).toBe(1);
  expect((await journal.lookup(scope, key)).commandId).toBe("original-command");
});

test("late known usage does not refund or clear an unknown native allocation", async () => {
  const { f, claim, journal, scope, key } = await setup();
  await journal.begin(scope, key, digest({}));
  const allocation = await f.store.reserveCall(claim.turn);
  await f.store.recordUsage(allocation, null, null);
  await journal.complete(scope, key, { status: "unknown", allocationId: allocation, usage: null });
  await f.store.recordUsage(allocation, 1, 2);
  expect((await f.pool.query("SELECT status,tokens::text FROM compute_ledger WHERE id=$1", [allocation])).rows).toEqual(
    [{ status: "unknown", tokens: "40000" }],
  );
  expect((await journal.lookup(scope, key)).status).toBe("unknown");
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM usage_observations WHERE allocation_id=$1", [allocation])).rows[0]
      .n,
  ).toBe(1);
});
test("current resumed owner can read old result but neither owner can redispatch its key", async () => {
  const { f, claim, journal, scope, key } = await setup();
  await journal.begin(scope, key, digest({}));
  await journal.complete(scope, key, { status: "completed", commandId: "original", usage: null });
  f.advance(121000);
  await f.store.recoverExpired();
  await f.tasks.recover();
  const replacement = await f.claim();
  expect(replacement.taskId).toBe(claim.taskId);
  const resumed = await journal.open(replacement, scope.runId, scope.operationId, scope.manifestDigest);
  expect(resumed.operationEpoch).not.toBe(scope.operationEpoch);
  expect((await journal.lookup(resumed, key)).commandId).toBe("original");
  expect((await journal.begin(resumed, key, digest({}))).disposition).toBe("existing");
  await expect(journal.begin(scope, key, digest({}))).rejects.toThrow("OPERATION_SCOPE_MISMATCH");
  await expect(journal.begin(resumed, { ...key, logicalStepId: "new" }, digest({}))).rejects.toThrow("TASK_FENCED");
});
test("original confirmed command receipt resolves uncertainty without resubmission", async () => {
  const { journal, scope, key } = await setup();
  await journal.begin(scope, key, digest({}));
  await journal.complete(scope, key, { status: "unknown", commandId: "original", usage: null });
  await journal.complete(scope, key, { status: "completed", commandId: "original", usage: null });
  expect(await journal.lookup(scope, key)).toEqual({ status: "completed", commandId: "original", usage: null });
});
