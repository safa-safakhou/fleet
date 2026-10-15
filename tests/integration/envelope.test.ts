import { readFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { Cognition } from "../../src/cognition.js";
import { type Data, type ModelPort, object } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
it("delivers requested forecasts over six growing-memory scheduled rounds and a cognition restart", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.pool.query(
    `UPDATE cohorts SET model=model||'{"cognition":"llm-centered-v1","recallAssist":"laya-recall-v1"}'::jsonb,observation_consent=true WHERE id=$1`,
    [id],
  );
  const read = JSON.parse(await readFile("vendor/pact-observations.json", "utf8")).reads[0];
  let calls = 0,
    assistCalls = 0;
  const bodies: string[] = [];
  for (let round = 0; round < 6; round++) {
    const claim = await f.store.claim(`round-${round}`);
    if (!claim) throw Error("claim");
    let support = new Cognition(f.store, {
      choose: async (_q, pair) => {
        assistCalls++;
        return { id: pair[0].id, probability: 0.9, certificate: "a".repeat(64) };
      },
    });
    for (let n = 0; n < 12; n++)
      await support.capture(claim, "observation", `authored:${round}:${n}`, {
        summary: `Recorded snapshot ${round}-${n}: ${"history ".repeat(180)}`,
        importance: 3,
        evidenceRefs: [],
      });
    if (round === 3)
      support = new Cognition(f.store, {
        choose: async (_q, pair) => {
          assistCalls++;
          return { id: pair[0].id, probability: 0.9, certificate: "a".repeat(64) };
        },
      });
    const game = new FakeGame(claim),
      originalRead = game.read.bind(game),
      originalTools = game.tools.bind(game);
    const forecast = {
      throughGameTimeMs: f.now().getTime() + 3600000,
      assumption: "Conditional fixture stock",
      expected: { iron: { ordinaryUnits: String(10000 + round) } },
      harvestPercentByMinute: Array(60).fill(100),
      assumedDeliveries: [],
    };
    game.tools = async () => [...(await originalTools()), read];
    game.read = async (tool, args) =>
      tool === read.name
        ? {
            schemaVersion: "pact.observation-section.v1",
            section: "forecast",
            ownerKingdomId: claim.agent.kingdom_id,
            forecast,
            coverage: { complete: true },
            next: null,
          }
        : tool === "pact_world_read_v1"
          ? {
              ...(await originalRead(tool, args)),
              authority: {
                schemaVersion: "pact.authority-observation.v1",
                asOfGameTimeMs: 60000,
                mandateVersion: 1,
                allowedActions: ["building.queue"],
                troopLimit: 10,
                troopReserved: 0,
                resources: Object.fromEntries(
                  ["iron", "silver", "grain"].map((asset) => [
                    asset,
                    {
                      ceilingUnits: "600000",
                      legacySpentUnits: "0",
                      rollingSpentUnits: "90000",
                      reservedUnits: "30000",
                      headroomUnits: "480000",
                      reserveFloorUnits: "0",
                      releaseSchedule: [{ gameTimeMs: 86460000, units: "90000" }],
                      reservations: [
                        { commitmentId: "00000000-0000-4000-8000-000000000003", units: "30000", status: "reserved" },
                      ],
                    },
                  ]),
                ),
              },
            }
          : originalRead(tool, args);
    let step = 0;
    const model: ModelPort = {
      decide: async (input) => {
        calls++;
        const c = JSON.parse(input.messages[1].content);
        bodies.push(input.messages[1].content);
        expect(c.environment.authority.resources.iron.headroomUnits).toBe("480000");
        expect(
          Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
        ).toBeLessThanOrEqual(24000);
        if (step++ === 1) expect(c.requestedRead.result.forecast).toEqual(forecast);
        if (object(c.cognition.recall).route === "laya-recall-v1") {
          expect(c.cognition.recall.admission).toBe("accepted");
          for (const ref of c.cognition.recall.candidateIds)
            expect(c.cognition.evidence.some((e: Data) => e.id === ref)).toBe(true);
        }
        return {
          decision: {
            cognition: {
              expectedVersion: c.cognition.version,
              analysis: { type: "none", reason: "No new verified outcome requires a revision" },
            },
            decision:
              step === 1
                ? { kind: "read", tool: read.name, args: { section: "forecast" }, summary: "Read actual forecast" }
                : { kind: "wait", summary: "Wait on verified current supply" },
          },
          inputTokens: 500,
          outputTokens: 100,
        };
      },
    };
    await new Engine(f.store, model, async () => game, true, pactAdapter, undefined, undefined, support).run(claim);
    expect((await f.pool.query("SELECT code FROM turns WHERE id=$1", [claim.id])).rows[0].code).toBe("WAIT");
    expect(game.opened).toBe(0);
    expect(game.submits).toEqual([]);
    expect((await new Cognition(f.store).inspect(claim.agentId)).episodes).not.toEqual([]);
    f.advance(900000);
  }
  expect(calls).toBe(12);
  expect(assistCalls).toBe(12);
  expect(bodies).toHaveLength(12);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(12);
});
