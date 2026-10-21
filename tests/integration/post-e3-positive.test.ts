import { afterEach, expect, it } from "vitest";
import { executeOwnedRC2Protocol } from "../../scripts/lib/post-e3-owned-run.js";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { ownedRC2Fixture } from "../fixtures/post-e3.js";
import { positiveSpecialistProvider } from "../fixtures/post-e3-provider.js";

let f: Awaited<ReturnType<typeof ownedRC2Fixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
it("completes both positive families and role reversals through eight native participants, actual delivery and later decisions", async () => {
  f = await ownedRC2Fixture();
  const fake = positiveSpecialistProvider();
  const outcomes: unknown[] = [];
  const currentFixture = f;
  const result = await executeOwnedRC2Protocol(f.protocol, f.grant, {
    store: f.store,
    prepared: f.prepared,
    evidenceLevel: "fake-provider",
    provider: fake.provider,
    verifyArtifacts: async () => {},
    reviewResponse: async () => {},
    reviewOutcome: async (_cell, e) => ({
      claims: [],
      reviews: e.actors.flatMap((a) =>
        (["dialogue", "factuality"] as const).map((category) => ({
          actorId: a.actorId,
          id: `${a.actorId}:${category}`,
          reviewer: "inline-author",
          reasonCode: "AUTHORED_FAKE_NO_COMPLETION_CLAIM",
          category,
          verdict: "pass",
          sourceRefs: e.coverage.sourceRefs,
        })),
      ),
    }),
    persist: async (kind, detail) => {
      // Ordinary evidence-writer latency lets the authored future UTC wake
      // become due without changing game time or task scheduling.
      if (kind === "turn-finish" && fake.wakeAt) {
        await new Promise((r) => setTimeout(r, Math.max(0, fake.wakeAt - Date.now() + 10)));
        fake.wakeAt = 0;
      }
      if (kind === "cell-outcome") outcomes.push(detail);
    },
  });
  if (result.status !== "complete" || result.cells.some((c) => c.assessment?.status !== "pass")) {
    console.log(
      JSON.stringify({
        extractions: fake.extractions,
        trace: fake.trace.filter((t) => t.role === "diplomacy"),
        skills: (await f.pool.query("SELECT state FROM skill_invocations")).rows,
      }),
    );
    console.log(
      JSON.stringify({
        commands: (
          await f.prepared[0].world.pool.query("SELECT kind,receipt->>'code' code FROM negotiation_fixture_commands")
        ).rows,
        tasks: (await f.pool.query("SELECT code,count(*)::int n FROM platform_tasks GROUP BY code")).rows,
      }),
    );
    const rows = (
      await f.pool.query(
        "SELECT id,detail_cipher FROM turn_events WHERE label='Specialist packet packing required' ORDER BY sequence LIMIT 2",
      )
    ).rows;
    console.log(
      JSON.stringify({
        packing: rows.map((r) => currentFixture.store.vault.decrypt(r.detail_cipher, `turn-event:${r.id}`)),
      }),
    );
  }
  expect(
    result.status,
    JSON.stringify({ cells: result.cells, trace: fake.trace.filter((t) => t.role === "diplomacy").slice(0, 18) }),
  ).toBe("complete");
  expect(result.productionQualified).toBe(false);
  expect(result.cells).toHaveLength(4);
  for (const c of result.cells) {
    expect(c.assessment?.material, JSON.stringify(c)).toBe("pass");
    expect(c.assessment?.history).toBe("pass");
    expect(c.assessment?.communication).toBe("pass");
    expect(c.assessment?.criticalFailures).toEqual([]);
  }
  expect(outcomes).toHaveLength(4);
  expect(fake.extractions).toBe(1);
  expect((await f.pool.query("SELECT count(*)::int n FROM skill_invocations WHERE state='completed'")).rows[0].n).toBe(
    1,
  );
  expect(
    (
      await f.pool.query(
        "SELECT count(*)::int n FROM platform_commands c WHERE c.state='confirmed' AND NOT EXISTS(SELECT 1 FROM compute_ledger l WHERE l.turn_id=c.turn_id)",
      )
    ).rows[0].n,
  ).toBeGreaterThanOrEqual(1);
  for (const p of f.prepared.filter((p) => p.cell.family === "C02" && !p.cell.rolesReversed)) {
    const bindingId = p.binding.bindingIds[p.cell.rolesReversed ? 0 : 1],
      scope = { instanceId: `${bindingId}:autonomous-specialists@1`, bindingId, specialistId: "diplomacy" };
    const state = await new SpecialistRepository(f.store, scope).load(scope);
    expect(state.goals.some((g) => g.routine)).toBe(true);
    expect(state.memories).toHaveLength(1);
  }
  expect(fake.maximumBytes).toBeLessThanOrEqual(32000);
  for (const p of f.prepared) {
    expect(
      (await p.world.pool.query("SELECT count(*)::int n FROM supply_contracts WHERE status='expired'")).rows[0].n,
    ).toBe(1);
    expect(
      (
        await p.world.pool.query(
          "SELECT count(*)::int n FROM negotiation_fixture_commands WHERE receipt->>'code'<>'COMMITTED'",
        )
      ).rows[0].n,
    ).toBe(0);
    for (const w of [p.world, p.control])
      expect((await w.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
  }
}, 600000);
