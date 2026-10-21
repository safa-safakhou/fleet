import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { executeOwnedSpecialistProtocol } from "../../scripts/lib/specialist-owned-run.js";
import type { Data } from "../../src/domain.js";
import { supplyRoutineCandidate } from "../../src/environments/pact-skills.js";
import { ownedSpecialistQualificationFixture } from "../fixtures/specialist-qualification.js";

let f: Awaited<ReturnType<typeof ownedSpecialistQualificationFixture>>;
afterEach(async () => {
  await f?.close();
});
it("learns only from whole scoped answers, reuses its actual prior goal without inference, and observes full delivery", async () => {
  f = await ownedSpecialistQualificationFixture();
  const selected = f.prepared.find(
    (p) =>
      p.cell.preset === "resources-diplomacy" && p.cell.skillMode === "guarded" && p.cell.scenario === "existing-goal",
  );
  if (!selected) throw Error("TEST_CELL");
  const goalId = randomUUID();
  let learned = 0,
    maximumBytes = 0;
  const result = await executeOwnedSpecialistProtocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    persist: async () => {},
    provider: {
      decide: async (request) => {
        const packet = JSON.parse(request.messages[1].content),
          observation = packet.observation,
          environment = observation.payload?.environment ?? observation.payload?.world;
        maximumBytes = Math.max(
          maximumBytes,
          Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
        );
        const reply = (decision: Data) => ({ decision, inputTokens: 20, outputTokens: 20 });
        if (
          packet.specialist.id !== "diplomacy" ||
          !String(packet.specialist.ownerIntent).includes(selected.world.offer.id)
        )
          return reply({ decision: { kind: "wait", summary: "No completed effect claimed" } });
        const intent = JSON.parse(packet.specialist.ownerIntent),
          minute = Number(observation.environmentTime?.value ?? environment.asOfGameTimeMs) / 60000;
        if (packet.skills.templates.length) {
          const opportunity = packet.skills.opportunities[0],
            source = packet.evidence.bundles
              .flatMap((b: Data) => b.originals as Data[])
              .find((o: Data) => opportunity.sourceIds.includes(o.id));
          if (!source) throw Error("DELIVERED_SCOPED_SOURCE_REQUIRED");
          learned++;
          return reply({
            decision: { kind: "wait", summary: "Unproven exact template hypothesis only" },
            proposals: [supplyRoutineCandidate(String(source.id), opportunity.episodeIds[0])],
          });
        }
        if (minute === 0 || minute === 16) {
          if (!observation.payload.requestedRead)
            return reply({
              decision: {
                kind: "read",
                query: {
                  tool: "pact_observation_read_v2",
                  args: { section: "agreements", recordId: selected.world.offer.id, limit: 1 },
                },
                summary: "Read the exact current authorized offer",
              },
            });
          if (minute === 16)
            return reply({
              decision: {
                kind: "read",
                query: { skillSchema: true },
                summary: "Request accounted unproven template extraction",
              },
            });
          const source = packet.evidence.bundles
            .flatMap((b: Data) => b.originals as Data[])
            .find(
              (o: Data) =>
                o.kind === "observation" &&
                (o.detail as Data)?.payload &&
                ((o.detail as Data).payload as Data).requestedRead,
            );
          if (!source) throw Error("WHOLE_SCOPED_ORIGINAL_REQUIRED");
          return reply({
            decision: { kind: "wait", summary: "Retain the exact prior goal before later guarded reuse" },
            update: {
              goals: [
                {
                  id: goalId,
                  parentId: null,
                  objective: "Receive the exact agreed supply",
                  rationale: "Exact authenticated owner intent",
                  status: "active",
                  evidenceIds: [source.id],
                  assessment: "Actual full installments",
                  routine: intent.routine,
                  wake: "delivery/default event",
                },
              ],
              memories: [],
              predictions: [],
              plan: null,
              messages: [],
              wakeConditions: [],
            },
          });
        }
        return reply({ decision: { kind: "wait", summary: "No extra fulfillment or learning is claimed" } });
      },
    },
  });
  if (result.status !== "complete") {
    const rows = (
      await f.pool.query(
        "SELECT e.id,e.detail_cipher FROM turn_events e JOIN turns t ON t.id=e.turn_id WHERE t.cohort_id=$1 AND e.label='Specialist packet packing required' ORDER BY e.sequence",
        [selected.binding.cohortId],
      )
    ).rows;
    for (const r of rows) console.log(JSON.stringify(f.store.vault.decrypt(r.detail_cipher, `turn-event:${r.id}`)));
    const answer = await selected.world.actor.readSection({
      section: "agreements",
      recordId: selected.world.offer.id,
      limit: 1,
    });
    console.log(JSON.stringify({ wholeScopedAnswerBytes: Buffer.byteLength(JSON.stringify(answer)) }));
  }
  expect(result.status, JSON.stringify(result.cells)).toBe("complete");
  expect(learned).toBe(1);
  expect(maximumBytes).toBeLessThanOrEqual(24000);
  const assessment = result.cells.find((c) => c.cellId === selected.cell.id)?.assessment;
  expect(assessment?.reasons).toEqual(["KQ1_REAL_PROVIDER_UNQUALIFIED"]);
  expect(assessment?.criticalFailures).toEqual([]);
  expect((await selected.world.evidence()).actualFullDelivery).toBe(true);
  expect((await selected.world.pool.query("SELECT count(*)::int n FROM supply_contracts")).rows[0].n).toBe(1);
  expect(
    (await f.pool.query("SELECT state FROM skill_invocations WHERE binding_id=$1", [selected.binding.bindingId])).rows,
  ).toEqual([{ state: "completed" }]);
}, 180000);

it("refuses an action returned for evidence-only review before creating any native command", async () => {
  f = await ownedSpecialistQualificationFixture();
  const selected = f.prepared[0];
  let restrictedReplies = 0;
  const result = await executeOwnedSpecialistProtocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    persist: async () => {},
    provider: {
      decide: async (request) => {
        const packet = JSON.parse(request.messages[1].content);
        let decision: Data = { kind: "wait", summary: "No completed effect claimed" };
        if (packet.specialist.id === "diplomacy") {
          if (packet.coverage.decisionMode === "evidence_review_only") {
            restrictedReplies++;
            expect(packet.actionSchemas).toEqual([]);
            expect(packet.observation.coverage.fullCurrentWorldWithheld).toBe(true);
            expect(JSON.stringify(request.schema)).not.toContain('"const":"action"');
            decision = {
              kind: "action",
              schemaId: "pact.game-action.v2",
              payload: {},
              summary: "Adversarial fake action",
            };
          } else {
            decision = {
              kind: "read",
              query: {
                tool: "pact_observation_read_v2",
                args: { section: "agreements", recordId: selected.world.offer.id, limit: 1 },
              },
              summary: "Read the whole exact offer",
            };
          }
        }
        return { decision: { decision }, inputTokens: 20, outputTokens: 20 };
      },
    },
  });
  // Native schema validation rejects the forbidden action before engine dispatch,
  // including its one separately metered correction within the three-call turn.
  expect(restrictedReplies).toBe(2);
  expect(result.status).toBe("stopped");
  expect(result.cells[0]).toMatchObject({ reason: "INVALID_MODEL_OUTPUT" });
  expect(result.cells.slice(1).every((c) => c.status === "not_started")).toBe(true);
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status <> $1", ["reported"])).rows[0].n,
  ).toBe(0);
  for (const p of f.prepared)
    expect((await p.world.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
}, 180000);
