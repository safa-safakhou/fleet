import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelPort, ModelSettings } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { LegacyEngineBridge } from "../../src/engines/legacy/bridge.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { Observability } from "../../src/observability.js";
import { legacyManifestFor, legacyProfileFor } from "../../src/platform/profiles.js";
import type { Claim } from "../../src/store.js";
import golden from "../fixtures/legacy-read-progress-20261026.json" with { type: "json" };
import priorGolden from "../fixtures/legacy-reasoning-effects-20261020.json" with { type: "json" };
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { modelInputDigest, normalizedModelInputs } from "../legacy-parity.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  vi.useRealTimers();
});

async function setup(model?: Partial<ModelSettings>, consent = true) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T12:00:00.000Z"));
  const f = await fixture();
  cleanup = () => f.pool.end();
  const cohortId = await ready(f.store, 1);
  await f.pool.query("UPDATE cohorts SET model=model||$2::jsonb,observation_consent=$3 WHERE id=$1", [
    cohortId,
    JSON.stringify(model ?? {}),
    consent,
  ]);
  const claim = await f.store.claim("legacy-fixture");
  if (!claim) throw Error("MISSING_FIXTURE_CLAIM");
  return { ...f, cohortId, claim, game: new FakeGame(claim) };
}

async function outcomes(f: Awaited<ReturnType<typeof setup>>) {
  const turn = (await f.store.publicState()).turns[0];
  const ledger = (
    await f.pool.query(
      "SELECT status,tokens::text,input_tokens::text,output_tokens::text FROM compute_ledger WHERE turn_id=$1 ORDER BY created_at,id",
      [f.claim.id],
    )
  ).rows;
  return {
    state: turn.state,
    code: turn.code,
    calls: turn.calls,
    actions: turn.actions,
    unknown: turn.unknown_usage,
    ledger,
  };
}

describe("versioned compatibility execution", () => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    "verifies reviewed proposal inputs and preserves accounting with cognition %s and action %s",
    async (cognition, action) => {
      const f = await setup(cognition ? { cognition: "llm-centered-v1" } : undefined);
      const before = (
        await f.pool.query("SELECT model,budget,anchor_at,interval_minutes FROM cohorts WHERE id=$1", [f.cohortId])
      ).rows[0];
      const decisions = () =>
        action
          ? [
              {
                kind: "action",
                action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
                summary: "Queue a farm",
              },
              { kind: "wait", summary: "Wait for actual changes" },
            ]
          : undefined;
      const directModel = new FakeModel(decisions());
      await new Engine(f.store, directModel, async () => f.game, true, pactAdapter).run(f.claim);
      const direct = await outcomes(f);
      const directInput = normalizedModelInputs(directModel, f.claim);
      if (!action) {
        expect(golden.cases[cognition ? 1 : 0].priorModelInputDigest).toBe(
          priorGolden.cases[cognition ? 1 : 0].modelInputDigest,
        );
        expect(modelInputDigest(directModel, f.claim)).toBe(golden.cases[cognition ? 1 : 0].modelInputDigest);
      }
      const directReport = await new Observability(f.store).run(f.claim.id);
      expect(directReport.engine.provenance).toBe("inferred_legacy");

      // Restore only this synthetic fixture to the same pre-turn state. Never use this on an installed fleet.
      await f.pool.query("DELETE FROM cognitive_updates");
      await f.pool.query("DELETE FROM cognitive_states");
      await f.pool.query("DELETE FROM cognitive_episodes");
      await f.pool.query("DELETE FROM decision_states");
      await f.pool.query("DELETE FROM compute_ledger");
      await f.pool.query("DELETE FROM turn_events");
      await f.pool.query(
        "UPDATE turns SET state='running',calls=0,actions=0,input_tokens=0,output_tokens=0,unknown_usage=false WHERE id=$1",
        [f.claim.id],
      );
      await f.pool.query(
        "UPDATE agents SET state=$2,notes='',read_memory_cipher=NULL,decision_feedback_cipher=NULL WHERE id=$1",
        [f.claim.agentId, f.claim.agent.state],
      );
      const bridgedModel = new FakeModel(decisions());
      const bridgedGame = new FakeGame(f.claim);
      await new LegacyEngineBridge(f.store, bridgedModel, async () => bridgedGame, true, pactAdapter).run(f.claim);
      expect(normalizedModelInputs(bridgedModel, f.claim)).toEqual(directInput);
      if (!action)
        expect(modelInputDigest(bridgedModel, f.claim)).toBe(golden.cases[cognition ? 1 : 0].modelInputDigest);
      expect(await outcomes(f)).toEqual(direct);
      expect(bridgedGame.reads).toEqual(f.game.reads);
      expect(bridgedGame.opened).toBe(action ? 1 : 0);
      expect(bridgedGame.submits.map((item) => item.action)).toEqual(f.game.submits.map((item) => item.action));
      expect(bridgedGame.submits).toHaveLength(action ? 1 : 0);
      const report = await new Observability(f.store).run(f.claim.id);
      expect(report.engine).toMatchObject({
        provenance: "recorded",
        profile: { id: cognition ? "legacy-cognition" : "legacy-loop", version: "1" },
        baseline: { sourceRevision: "c212373ccca98d3e064d24ebd2a9398dd94e2a77", artifactKind: "source-snapshot" },
      });
      expect(JSON.stringify(normalizedModelInputs(bridgedModel, f.claim))).not.toContain("configurationDigest");
      expect(
        (await f.pool.query("SELECT model,budget,anchor_at,interval_minutes FROM cohorts WHERE id=$1", [f.cohortId]))
          .rows[0],
      ).toEqual(before);
    },
  );

  it("keeps legacy cognition and recall distinct", async () => {
    expect(legacyProfileFor({ route: "ollama", model: "fixture" })).toEqual({ id: "legacy-loop", version: "1" });
    expect(legacyProfileFor({ route: "ollama", model: "fixture", cognition: "llm-centered-v1" })).toEqual({
      id: "legacy-cognition",
      version: "1",
    });
    const f = await setup({ cognition: "llm-centered-v1", recallAssist: "laya-recall-v1" });
    await new LegacyEngineBridge(f.store, new FakeModel(), async () => f.game, true, pactAdapter).run(f.claim);
    const report = await new Observability(f.store).run(f.claim.id);
    expect(report.engine).toMatchObject({
      continuity: { cognition: "llm-centered-v1", recallAssist: "laya-recall-v1" },
    });
    expect(report.engine.configurationDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("distinguishes execution configuration without exporting private intent or credentials", async () => {
    const f = await setup();
    const first = legacyManifestFor(f.claim, pactAdapter.id);
    const reordered = {
      ...f.claim,
      cohort: { ...f.claim.cohort, model: { model: "fake-model", route: "ollama" as const } },
    };
    expect(legacyManifestFor(reordered, pactAdapter.id).configurationDigest).toBe(first.configurationDigest);
    if (!f.claim.cohort.model) throw Error("MISSING_FIXTURE_MODEL");
    const changed = {
      ...f.claim,
      cohort: {
        ...f.claim.cohort,
        model: {
          ...f.claim.cohort.model,
          cognition: "llm-centered-v1" as const,
          recallAssist: "laya-recall-v1" as const,
        },
      },
    };
    expect(legacyManifestFor(changed, pactAdapter.id).configurationDigest).not.toBe(first.configurationDigest);
    changed.agent = {
      ...changed.agent,
      secret_cipher: "fixture-credential-material",
      notes: "private operational notes",
    };
    changed.cohort.synthetic_owner_policy = { label: "private owner policy" };
    const serialized = JSON.stringify(legacyManifestFor(changed, pactAdapter.id));
    expect(serialized).not.toContain("fixture-credential-material");
    expect(serialized).not.toContain("private operational notes");
    expect(serialized).not.toContain("private owner policy");
  });

  it("produces a portable configuration digest for non-ASCII policy keys", async () => {
    const f = await setup();
    if (!f.claim.cohort.budget) throw Error("MISSING_FIXTURE_BUDGET");
    const claim: Claim = {
      ...f.claim,
      agent: {
        ...f.claim.agent,
        ordinal: 1,
        strategy: {
          profile: "guardian",
          objective: "fixture",
          riskTolerance: 0.1,
          patience: 1,
          horizon: "balanced",
          version: 1,
        },
      },
      cohort: {
        ...f.claim.cohort,
        model: { route: "ollama" as const, model: "fixture" },
        budget: { ...f.claim.cohort.budget, perCallTokenLimit: 40000 },
        interval_minutes: 15,
        anchor_at: null,
        owner_guidance: "strategy",
        synthetic_owner_policy: { ä: 1, z: 2, A: 3 },
      },
    };
    // Fixed oracle generated independently; string ordering is locale-independent.
    expect(legacyManifestFor(claim, "fixture").configurationDigest).toBe(
      "b8d7fd21265271c95ef7f2ab985c6f485d7a2ebd433fd2c29970bd6eae016b5f",
    );
  });

  it("labels historical provenance without rewriting history or consulting current cognition", async () => {
    const f = await setup();
    await new Engine(f.store, new FakeModel(), async () => f.game, true, pactAdapter).run(f.claim);
    await f.pool.query('UPDATE cohorts SET model=model||\'{"cognition":"llm-centered-v1"}\'::jsonb WHERE id=$1', [
      f.cohortId,
    ]);
    const before = (await f.pool.query("SELECT * FROM turns WHERE id=$1", [f.claim.id])).rows;
    const events = (await f.pool.query("SELECT * FROM turn_events WHERE turn_id=$1 ORDER BY sequence", [f.claim.id]))
      .rows;
    const report = await new Observability(f.store).run(f.claim.id);
    expect(report.engine).toMatchObject({
      provenance: "inferred_legacy",
      profile: null,
      baseline: null,
      configurationDigest: null,
    });
    expect((await f.pool.query("SELECT * FROM turns WHERE id=$1", [f.claim.id])).rows).toEqual(before);
    expect(
      (await f.pool.query("SELECT * FROM turn_events WHERE turn_id=$1 ORDER BY sequence", [f.claim.id])).rows,
    ).toEqual(events);
  });

  it("does not treat malformed retained details as a recorded engine manifest", async () => {
    const f = await setup();
    await new Engine(f.store, new FakeModel(), async () => f.game, true, pactAdapter).run(f.claim);
    const observation = new Observability(f.store);
    await observation.record(f.claim, "observing", "Reading current game state", {
      engine: { provenance: "recorded", configurationDigest: "not-a-digest" },
    });
    expect((await observation.run(f.claim.id)).engine).toMatchObject({
      provenance: "inferred_legacy",
      profile: null,
      baseline: null,
    });
  });

  it("records the inherited scheduled tick without leaking context to another turn", async () => {
    const f = await setup();
    const model = new FakeModel();
    const bridge = new LegacyEngineBridge(f.store, model, async () => f.game, true, pactAdapter);
    await bridge.run(f.claim);
    f.advance(900000);
    const next = await bridge.tick("next-scheduled-turn");
    expect(next).not.toBeNull();
    if (!next) throw Error("MISSING_SCHEDULED_CLAIM");
    const report = await new Observability(f.store).run(next.id);
    expect(report.engine).toMatchObject({ provenance: "recorded", profile: { id: "legacy-loop", version: "1" } });
    await new Observability(f.store).record(next, "observing", "Reading current game state", {
      marker: "outside-engine",
    });
    const outside = (await new Observability(f.store).run(next.id)).turn.events.at(-1);
    expect(outside?.detail).toEqual({ marker: "outside-engine" });
    expect(model.inputs).toHaveLength(2);
  });

  it("retains the original pending command through bridge reconciliation", async () => {
    const f = await setup();
    f.game.failSubmit = true;
    f.game.receiptValue = { code: "RECEIPT_NOT_FOUND" };
    const model = new FakeModel([
      {
        kind: "action",
        action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
        summary: "Queue a farm",
      },
    ]);
    const bridge = new LegacyEngineBridge(f.store, model, async () => f.game, true, pactAdapter);
    await bridge.run(f.claim);
    const pending = (await f.store.publicState()).turns[0].pending_command;
    expect(pending).toBeTruthy();
    expect(f.game.submits[0].commandId).toBe(pending);
    f.game.receiptValue = { commandId: pending, code: "COMMITTED" };
    const restarted = new LegacyEngineBridge(f.store, new FakeModel(), async () => f.game, true, pactAdapter);
    expect((await restarted.reconcile(f.claim.id)).code).toBe("COMMITTED");
    expect(f.game.submits).toHaveLength(1);
    expect((await f.store.publicState()).turns[0].pending_command).toBeNull();
    const resolution = (await f.pool.query("SELECT command_id FROM command_resolutions WHERE turn_id=$1", [f.claim.id]))
      .rows[0];
    expect(resolution.command_id).toBe(pending);
  });

  it("retains full unknown allocations and never emits a second model call", async () => {
    const f = await setup();
    const model: ModelPort = {
      decide: async () => {
        throw Error("TRANSPORT_UNCERTAIN");
      },
    };
    await new LegacyEngineBridge(f.store, model, async () => f.game, true, pactAdapter).run(f.claim);
    const result = await outcomes(f);
    expect(result.calls).toBe(1);
    expect(result.ledger).toEqual([{ status: "unknown", tokens: "40000", input_tokens: null, output_tokens: null }]);
    expect(result.unknown).toBe(true);
    expect(f.game.submits).toHaveLength(0);
  });

  it("honors stop, disabled execution and observation consent", async () => {
    const f = await setup(undefined, false);
    const bridge = new LegacyEngineBridge(f.store, new FakeModel(), async () => f.game, true, pactAdapter);
    await bridge.run(f.claim);
    const report = await new Observability(f.store).run(f.claim.id);
    expect(report.engine.provenance).toBe("inferred_legacy");
    expect(report.engine.configurationDigest).toBeNull();
    expect((await f.pool.query("SELECT count(*) FROM turn_events WHERE detail_cipher IS NOT NULL")).rows[0].count).toBe(
      "0",
    );
    bridge.stop();
    expect(await bridge.tick("stopped")).toBeNull();
    const disabled = new LegacyEngineBridge(f.store, new FakeModel(), async () => f.game, false, pactAdapter);
    expect(await disabled.tick("disabled")).toBeNull();
  });
});
