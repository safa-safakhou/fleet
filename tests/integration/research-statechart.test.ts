import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ResearchBroker } from "../../src/research/broker/server.js";
import { StepJournal } from "../../src/research/broker/steps.js";
import { CaptureSession } from "../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../src/research/manifests/repository.js";
import { checkpointScriptedPolicy } from "../../src/research/policies/pact-scripted.js";
import { POLICY_VERSION } from "../../src/research/workers/statechart.js";
import { assertOwnedFixture } from "../architecture-fixture.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";
import { policyInput } from "../fixtures/research/pact-policy.js";
import { platformFixture } from "../platform-helpers.js";

test("persists and restores proposal-only policy with private transition evidence", async () => {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-policy-"));
  try {
    await f.store.consent(f.group.id, true);
    await f.enqueue();
    const claim = await f.claim(),
      input = manifestInput();
    input.profile = claim.profile;
    input.environment.bindingId = claim.bindingId;
    input.components.policy = POLICY_VERSION;
    input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 100 } };
    const m = compileManifest(input, {
      ...capability,
      components: { ...capability.components, policy: [POLICY_VERSION] },
      model: { ...capability.model, route: "ollama", model: "fake-model" },
    });
    await new ManifestRepository(f.pool).save(m.manifest);
    const capture = new CaptureSession(f.store, new ArtifactFilesystem(root)),
      journal = new StepJournal(f.store, f.tasks),
      scope = await journal.open(claim, "policy-run", "policy-op", m.digest),
      broker = new ResearchBroker(f.store, f.tasks, capture);
    // Policy/checkpoint code needs no effect ports; a call to any port would fail this test.
    const auth = await broker.sessions.open(scope, {} as never, "actor", new AbortController().signal),
      session = await broker.authenticate(auth.token);
    await capture.recorder.append(scope, { kind: "task.received", streamId: "policy", producerKey: "scope" });
    const first = await checkpointScriptedPolicy(broker, session, scope, policyInput, "fixture@1", "0");
    const loaded = await broker.loadCheckpoint(session, scope);
    if (!loaded) throw new Error("CHECKPOINT_MISSING");
    const second = await checkpointScriptedPolicy(
      broker,
      session,
      scope,
      policyInput,
      "fixture@1",
      "1",
      loaded.state.policy,
    );
    expect(second.checkpoint.proposalId).toBe(first.checkpoint.proposalId);
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM research_events WHERE event->>'kind'='policy.transition'"))
        .rows[0].n,
    ).toBe(1);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
    expect(f.board.executions).toBe(0);
  } finally {
    await f.pool.end();
    await rm(root, { recursive: true, force: true });
  }
});
