import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { ScopedSkillRepository } from "../../src/app/skill-services.js";
import type { Data } from "../../src/domain.js";
import { supplyRoutineCandidate, supplyRoutineKind } from "../../src/environments/pact-skills.js";
import { pactSkillNativeFixture } from "../fixtures/pact-skill-native.js";

let f: Awaited<ReturnType<typeof pactSkillNativeFixture>>;
afterEach(async () => {
  await f?.close();
});
it("signs only a prior exact goal through native guards with zero reuse model calls, then waits for actual delivery", async () => {
  let calls = 0,
    learning = false,
    parameters: Data = {},
    goalId = randomUUID();
  f = await pactSkillNativeFixture(
    {
      decide: async (r) => {
        calls++;
        const packet = JSON.parse(r.messages[1].content),
          source = packet.evidence.bundles
            .flatMap((b: Data) => b.originals as Data[])
            .find((o: Data) => o.kind === "observation");
        if (learning) {
          if (packet.skills.templates.length) {
            const opportunity = packet.skills.opportunities[0],
              outcome = packet.evidence.bundles
                .flatMap((b: Data) => b.originals as Data[])
                .find((o: Data) => o.kind === "outcome");
            if (!outcome) throw Error("ACTUAL_OUTCOME_REQUIRED");
            const guide = supplyRoutineCandidate(String(outcome.id), opportunity.episodeIds[0]);
            guide.representation = "guide";
            guide.procedure = {
              guide:
                "Observed full delivery after exact prior consent. Future decisions still require fresh owner intent, authority and reserves.",
              nodes: [],
              children: [],
            };
            return {
              decision: { decision: { kind: "wait", summary: "Bounded source-backed guide" }, proposals: [guide] },
              inputTokens: 20,
              outputTokens: 20,
            };
          }
          return {
            decision: {
              decision: {
                kind: "read",
                query: { skillSchema: true },
                summary: "Request bounded extraction from the observed delivery",
              },
            },
            inputTokens: 20,
            outputTokens: 20,
          };
        }
        if (!source) throw Error("ORIGINAL_REQUIRED");
        return {
          decision: {
            decision: { kind: "wait", summary: "Existing exact owner goal" },
            update: {
              goals: [
                {
                  id: goalId,
                  parentId: null,
                  objective: "Receive exact agreed supply",
                  rationale: "Owner specified this existing exchange",
                  status: "active",
                  evidenceIds: [source.id],
                  assessment: "Actual full installments",
                  routine: { kind: supplyRoutineKind, parameters },
                  wake: "delivery/default event",
                },
              ],
              memories: [],
              predictions: [],
              plan: null,
              messages: [],
              wakeConditions: [],
            },
          },
          inputTokens: 20,
          outputTokens: 20,
        };
      },
    },
    { learning: true },
  );
  const terms = {
    aToB: { resource: "iron", wholePerHour: 1 },
    bToA: { resource: "silver", wholePerHour: 2 },
    aBond: null,
    bBond: null,
    durationHours: 1,
    noticeHours: 0,
  };
  // Fixture setup is the actual native service; no scripted behavior runs in a retained world.
  await f.pact.pool.query(
    "INSERT INTO social_contacts(product_scope,kingdom_a,kingdom_b,accepted_game_time_ms) VALUES('pact',$1,$2,0)",
    [
      f.own.kingdomId < f.peer.kingdomId ? f.own.kingdomId : f.peer.kingdomId,
      f.own.kingdomId < f.peer.kingdomId ? f.peer.kingdomId : f.own.kingdomId,
    ],
  );
  const offer = await f.pact.dispatcher.dispatch(
    f.peer.principal,
    f.pact.command(f.peer.principal, { kind: "game.supply.offer", counterpartyKingdomId: f.own.kingdomId, terms }),
  );
  expect(offer.code).toBe("COMMITTED");
  const row = (await f.pact.pool.query("SELECT id,version FROM supply_offers")).rows[0];
  expect(
    (
      await f.pact.dispatcher.dispatch(
        f.peer.principal,
        f.pact.command(f.peer.principal, { kind: "game.supply.sign", offerId: row.id, version: row.version }),
      )
    ).code,
  ).toBe("COMMITTED");
  const section = await f.pact.views.readSection(f.own.accountId, {
    section: "agreements",
    recordId: row.id,
    limit: 32,
  });
  parameters = {
    offerId: row.id,
    version: row.version,
    counterpartyKingdomId: f.peer.kingdomId,
    termsJson: JSON.stringify(terms),
    minimumIron: "1000",
    minimumSilver: "1000",
    minimumGrain: "1000",
    assessmentDeadlineGameTimeMs: String(Number(section.asOfGameTimeMs) + 7200000),
  };
  await f.run();
  expect(calls).toBe(1);
  const source = (
    await f.pool.query(
      "SELECT id FROM architecture_scoped_evidence WHERE instance_id=$1 AND kind='specialist-observation.v1' LIMIT 1",
      [f.scope.instanceId],
    )
  ).rows[0];
  expect(source).toBeDefined();
  const library = new ScopedSkillRepository(f.store, f.scope),
    ref = await library.propose(f.scope, supplyRoutineCandidate(source.id, "prior-synthetic-episode"));
  f.advanceBoth(16 * 60000);
  await f.run();
  expect(
    (await f.pool.query("SELECT state,reason FROM skill_invocations")).rows,
    JSON.stringify(
      await f.pact.views.readSection(f.own.accountId, { section: "agreements", recordId: row.id, limit: 32 }),
    ),
  ).toEqual([{ state: "waiting", reason: null }]);
  expect(calls).toBe(1);
  expect((await f.pact.pool.query("SELECT * FROM supply_contracts")).rowCount).toBe(1);
  expect((await library.loadSelected(f.scope, [ref]))[0].status).toBe("guarded");
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(1);
  expect((await f.pool.query("SELECT * FROM specialist_turn_work")).rowCount).toBeGreaterThan(4);
  expect(
    (await f.pool.query("SELECT * FROM architecture_scoped_evidence WHERE kind='specialist-outcome.v1'")).rowCount,
  ).toBe(0);
  f.advanceBoth(16 * 60000);
  const finish = f.tasks.finish.bind(f.tasks);
  let interruptedTask = "";
  f.tasks.finish = async (...args) => {
    interruptedTask = args[0].taskId;
    throw Error("OWNED_HOST_FINISH_CRASH");
  };
  await expect(f.run()).rejects.toThrow("OWNED_HOST_FINISH_CRASH");
  f.tasks.finish = finish;
  const readsBeforeRecovery = (
    await f.pool.query("SELECT sum(actual_units)::text n FROM skill_work_reservations WHERE kind='reads'")
  ).rows[0].n;
  f.advanceBoth(16 * 60000);
  await f.tasks.recover();
  await f.runExisting(interruptedTask);
  expect(
    (await f.pool.query("SELECT sum(actual_units)::text n FROM skill_work_reservations WHERE kind='reads'")).rows[0].n,
  ).toBe(readsBeforeRecovery);
  expect(calls).toBe(1);
  expect((await f.pact.pool.query("SELECT * FROM supply_contracts")).rowCount).toBe(1);
  const contract = (await f.pact.pool.query("SELECT start_game_time_ms,end_game_time_ms FROM supply_contracts"))
    .rows[0];
  for (let t = Number(contract.start_game_time_ms); t <= Number(contract.end_game_time_ms); t += 60000)
    await f.pact.settleSupply(t);
  f.advanceBoth(16 * 60000);
  await f.run();
  expect(calls).toBe(1);
  expect((await f.pool.query("SELECT state FROM skill_invocations")).rows).toEqual([{ state: "completed" }]);
  expect(
    (await f.pool.query("SELECT * FROM architecture_scoped_evidence WHERE kind='specialist-outcome.v1'")).rowCount,
  ).toBe(1);
  expect((await f.pact.pool.query("SELECT * FROM supply_installments")).rowCount).toBe(120);
  expect((await f.pact.pool.query("SELECT * FROM world_ticks")).rowCount).toBe(61);
  expect((await f.pact.world.read()).gameTimeMs).toBe(Number(contract.end_game_time_ms));
  expect((await new SpecialistRepository(f.store, f.scope).load(f.scope)).goals[0].status).toBe("completed");
  learning = true;
  f.advanceBoth(16 * 60000);
  await f.run();
  expect(calls).toBe(3);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(3);
  expect(
    (await f.pool.query("SELECT allocation_ids FROM skill_learning_operations")).rows[0].allocation_ids,
  ).toHaveLength(2);
  expect((await f.pool.query("SELECT * FROM skill_learning_operations")).rowCount).toBe(1);
  expect(
    (await f.pool.query("SELECT status FROM skill_versions ORDER BY created_at")).rows.map((r) => r.status),
  ).toEqual(["guarded", "advisory"]);
  expect((await f.pact.pool.query("SELECT * FROM supply_contracts")).rowCount).toBe(1);
  expect(Math.max(...f.inputSizes)).toBeLessThanOrEqual(24000);
  process.stdout.write(
    JSON.stringify({
      fixture: "pact-skill-native",
      inputBytes: f.inputSizes,
      modelCalls: calls,
      realProviderCalls: 0,
    }) + "\n",
  );
}, 30000);

it.each([
  "missing-peer-consent",
  "owner-change-after-quote",
  "insufficient-reserves",
  "exhausted-parent",
  "validation-wall-exhausted",
])("returns safely for %s without an unguarded action", async (mode) => {
  let calls = 0,
    parameters: Data = {};
  const goalId = randomUUID();
  f = await pactSkillNativeFixture({
    decide: async (r) => {
      calls++;
      const packet = JSON.parse(r.messages[1].content),
        source = packet.evidence.bundles.flatMap((b: Data) => b.originals as Data[])[0];
      return {
        decision: {
          decision: { kind: "wait", summary: "No new action chosen" },
          ...(calls === 1
            ? {
                update: {
                  goals: [
                    {
                      id: goalId,
                      parentId: null,
                      objective: "Exact supply",
                      rationale: "Prior choice",
                      status: "active",
                      evidenceIds: [source.id],
                      assessment: "Full actual delivery",
                      wake: "contract event",
                      routine: { kind: supplyRoutineKind, parameters },
                    },
                  ],
                  memories: [],
                  predictions: [],
                  plan: null,
                  messages: [],
                  wakeConditions: [],
                },
              }
            : {}),
        },
        inputTokens: 10,
        outputTokens: 10,
      };
    },
  });
  const terms = {
    aToB: { resource: "iron", wholePerHour: 1 },
    bToA: { resource: "silver", wholePerHour: 2 },
    aBond: null,
    bBond: null,
    durationHours: 1,
    noticeHours: 0,
  };
  const parties = [f.own.kingdomId, f.peer.kingdomId].sort();
  await f.pact.pool.query(
    "INSERT INTO social_contacts(product_scope,kingdom_a,kingdom_b,accepted_game_time_ms) VALUES('pact',$1,$2,0)",
    parties,
  );
  const offered = await f.pact.dispatcher.dispatch(
    f.peer.principal,
    f.pact.command(f.peer.principal, { kind: "game.supply.offer", counterpartyKingdomId: f.own.kingdomId, terms }),
  );
  expect(offered.code).toBe("COMMITTED");
  const row = (await f.pact.pool.query("SELECT id,version FROM supply_offers")).rows[0];
  if (mode !== "missing-peer-consent")
    expect(
      (
        await f.pact.dispatcher.dispatch(
          f.peer.principal,
          f.pact.command(f.peer.principal, { kind: "game.supply.sign", offerId: row.id, version: row.version }),
        )
      ).code,
    ).toBe("COMMITTED");
  const section = await f.pact.views.readSection(f.own.accountId, {
    section: "agreements",
    recordId: row.id,
    limit: 32,
  });
  parameters = {
    offerId: row.id,
    version: row.version,
    counterpartyKingdomId: f.peer.kingdomId,
    termsJson: JSON.stringify(terms),
    minimumIron: mode === "insufficient-reserves" ? "999999999999999" : "0",
    minimumSilver: "0",
    minimumGrain: "0",
    assessmentDeadlineGameTimeMs: String(Number(section.asOfGameTimeMs) + 7200000),
  };
  await f.run();
  const source = (
    await f.pool.query("SELECT id FROM architecture_scoped_evidence WHERE instance_id=$1 LIMIT 1", [f.scope.instanceId])
  ).rows[0];
  await new ScopedSkillRepository(f.store, f.scope).propose(
    f.scope,
    supplyRoutineCandidate(source.id, "negative-fixture"),
  );
  if (mode === "owner-change-after-quote")
    f.setAfterQuote(async () => {
      await f.pact.pool.query(
        "UPDATE kingdoms SET ambition='New owner intent',ambition_version=ambition_version+1 WHERE id=$1",
        [f.own.kingdomId],
      );
    });
  if (mode === "exhausted-parent")
    await f.pool.query(
      "UPDATE cohort_engine_profiles SET non_model_limits=jsonb_set(non_model_limits,'{reads}','0') WHERE cohort_id=$1",
      [f.group.id],
    );
  if (mode === "validation-wall-exhausted")
    await f.pool.query(
      "UPDATE cohort_engine_profiles SET non_model_limits=jsonb_set(non_model_limits,'{wallTimeMs}','1') WHERE cohort_id=$1",
      [f.group.id],
    );
  f.advanceBoth(16 * 60000);
  if (mode === "exhausted-parent") {
    const before = f.reads;
    await expect(f.run()).rejects.toThrow("WORK_LIMIT_EXHAUSTED");
    expect(f.reads).toBe(before);
  } else if (mode === "validation-wall-exhausted") {
    await expect(f.run()).rejects.toThrow("WORK_LIMIT_EXHAUSTED");
    expect((await f.pool.query("SELECT * FROM skill_evaluations")).rowCount).toBe(0);
  } else await f.run();
  expect((await f.pact.pool.query("SELECT * FROM supply_contracts")).rowCount).toBe(0);
  expect(
    (await f.pool.query("SELECT * FROM architecture_scoped_evidence WHERE kind='specialist-outcome.v1'")).rowCount,
  ).toBe(0);
  expect(calls).toBe(mode === "missing-peer-consent" || mode === "owner-change-after-quote" ? 2 : 1);
});
