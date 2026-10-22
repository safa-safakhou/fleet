import { afterEach, expect, it } from "vitest";
import {
  executeOwnedRC2Protocol,
  executeOwnedRC3Protocol,
  executeOwnedRC5Protocol,
  executeOwnedRC6Protocol,
  executeOwnedRC7Protocol,
  executeOwnedRC8Protocol,
  executeOwnedRC9Protocol,
  executeOwnedRC10Protocol,
  executeOwnedRC11Protocol,
  executeOwnedRC12Protocol,
  executeOwnedRC13Protocol,
  executeOwnedRC14Protocol,
  executeOwnedRC15Protocol,
  executeOwnedRC16Protocol,
  executeOwnedRC17Protocol,
  executeOwnedRC18Protocol,
} from "../../scripts/lib/post-e3-owned-run.js";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import {
  ownedRC2Fixture,
  ownedRC3Fixture,
  ownedRC5Fixture,
  ownedRC6Fixture,
  ownedRC7Fixture,
  ownedRC8Fixture,
  ownedRC9Fixture,
  ownedRC10Fixture,
  ownedRC11Fixture,
  ownedRC12Fixture,
  ownedRC13Fixture,
  ownedRC14Fixture,
  ownedRC15Fixture,
  ownedRC16Fixture,
  ownedRC17Fixture,
  ownedRC18Fixture,
} from "../fixtures/post-e3.js";
import { positiveSpecialistProvider } from "../fixtures/post-e3-provider.js";

let f: Awaited<ReturnType<typeof ownedRC2Fixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
it.each([
  ["legacy RC2", ownedRC2Fixture, executeOwnedRC2Protocol],
  ["explicit environment read contract", ownedRC3Fixture, executeOwnedRC3Protocol],
  ["RC5 objective and authority separation", ownedRC5Fixture, executeOwnedRC5Protocol],
  ["RC6 scoped participant contract", ownedRC6Fixture, executeOwnedRC6Protocol],
  ["RC7 temporal evidence contract", ownedRC7Fixture, executeOwnedRC7Protocol],
  ["RC8 bounded output profile", ownedRC8Fixture, executeOwnedRC8Protocol],
  ["RC9 observation semantics", ownedRC9Fixture, executeOwnedRC9Protocol],
  ["RC10 scoped clock contract", ownedRC10Fixture, executeOwnedRC10Protocol],
  ["RC11 read/final contract", ownedRC11Fixture, executeOwnedRC11Protocol],
  ["RC12 named rate facts", ownedRC12Fixture, executeOwnedRC12Protocol],
  ["RC13 installed Gemma4 model", ownedRC13Fixture, executeOwnedRC13Protocol],
  ["RC14 visible portable contracts", ownedRC14Fixture, executeOwnedRC14Protocol],
  ["RC15 source-bound named quantity facts", ownedRC15Fixture, executeOwnedRC15Protocol],
  ["RC16 listed skill references", ownedRC16Fixture, executeOwnedRC16Protocol],
  ["RC17 installed Qwen14B model", ownedRC17Fixture, executeOwnedRC17Protocol],
  ["RC18 direction-scoped objectives", ownedRC18Fixture, executeOwnedRC18Protocol],
] as const)(
  "%s completes both positive families and role reversals through eight native participants, actual delivery and later decisions",
  async (_name, create, execute) => {
    f = await create();
    const namedMeanings =
      "observationContract" in f.protocol.configuration &&
      f.protocol.configuration.observationContract === "semantics.v2";
    const fake = positiveSpecialistProvider();
    if (
      _name.startsWith("RC5") ||
      _name.startsWith("RC6") ||
      _name.startsWith("RC7") ||
      _name.startsWith("RC8") ||
      _name.startsWith("RC9") ||
      _name.startsWith("RC10") ||
      _name.startsWith("RC11") ||
      _name.startsWith("RC12") ||
      _name.startsWith("RC13") ||
      _name.startsWith("RC14") ||
      _name.startsWith("RC15") ||
      _name.startsWith("RC16") ||
      _name.startsWith("RC17") ||
      _name.startsWith("RC18")
    ) {
      const originalDecide = fake.provider.decide;
      fake.provider.decide = async (request) => {
        if (
          _name.startsWith("RC8") ||
          _name.startsWith("RC9") ||
          _name.startsWith("RC10") ||
          _name.startsWith("RC11") ||
          _name.startsWith("RC12") ||
          _name.startsWith("RC13") ||
          _name.startsWith("RC14") ||
          _name.startsWith("RC15") ||
          _name.startsWith("RC16") ||
          _name.startsWith("RC17") ||
          _name.startsWith("RC18")
        )
          expect(request.model).toEqual({
            route: "ollama",
            model:
              _name.startsWith("RC17") || _name.startsWith("RC18")
                ? "qwen3:14b"
                : _name.startsWith("RC13") ||
                    _name.startsWith("RC14") ||
                    _name.startsWith("RC15") ||
                    _name.startsWith("RC16")
                  ? "gemma4:12b"
                  : "qwen3.5:9b",
            thinking: _name.startsWith("RC14"),
          });
        const packet = JSON.parse(request.messages[1].content);
        if (_name.startsWith("RC16") || _name.startsWith("RC17") || _name.startsWith("RC18")) {
          const refs = [
            ...packet.skills.index.map((s: { ref: unknown }) => s.ref),
            ...packet.skills.selected.map((s: { ref: unknown }) => s.ref),
          ];
          if (!refs.length && packet.participantInterface.mode === "scoped_update")
            expect(JSON.stringify(request.schema)).toContain("maxItems");
        }
        if (
          _name.startsWith("RC14") ||
          _name.startsWith("RC15") ||
          _name.startsWith("RC16") ||
          _name.startsWith("RC17") ||
          _name.startsWith("RC18")
        ) {
          expect(packet.responseInterface).toBeDefined();
          if (packet.participantInterface.mode === "scoped_update")
            expect(JSON.stringify(request.schema)).toContain("[0-9]{1,40}");
        }
        if (
          _name.startsWith("RC11") ||
          _name.startsWith("RC12") ||
          _name.startsWith("RC13") ||
          _name.startsWith("RC14") ||
          _name.startsWith("RC15") ||
          _name.startsWith("RC16") ||
          _name.startsWith("RC17") ||
          _name.startsWith("RC18")
        )
          expect(packet.readInterface.meaning).toContain("provenance");
        if (
          _name.startsWith("RC9") ||
          _name.startsWith("RC10") ||
          _name.startsWith("RC11") ||
          _name.startsWith("RC12") ||
          _name.startsWith("RC13") ||
          _name.startsWith("RC14") ||
          _name.startsWith("RC15") ||
          _name.startsWith("RC16") ||
          _name.startsWith("RC17") ||
          _name.startsWith("RC18")
        )
          expect(packet.observationSemantics).toContain(
            namedMeanings ? "actual external delivery" : "stock, founding allowance, own production",
          );
        expect(packet.intentAuthority?.ownerIntent).toBe("Objective/preferences, not an authorization grant.");
        if (
          _name.startsWith("RC6") ||
          _name.startsWith("RC7") ||
          _name.startsWith("RC8") ||
          _name.startsWith("RC9") ||
          _name.startsWith("RC10") ||
          _name.startsWith("RC11") ||
          _name.startsWith("RC12") ||
          _name.startsWith("RC13") ||
          _name.startsWith("RC14") ||
          _name.startsWith("RC15") ||
          _name.startsWith("RC16") ||
          _name.startsWith("RC17") ||
          _name.startsWith("RC18")
        ) {
          expect(packet.participantInterface).toBeDefined();
          if (
            (_name.startsWith("RC7") ||
              _name.startsWith("RC8") ||
              _name.startsWith("RC9") ||
              _name.startsWith("RC10") ||
              _name.startsWith("RC11") ||
              _name.startsWith("RC12") ||
              _name.startsWith("RC13") ||
              _name.startsWith("RC14") ||
              _name.startsWith("RC15") ||
              _name.startsWith("RC16") ||
              _name.startsWith("RC17") ||
              _name.startsWith("RC18")) &&
            packet.participantInterface.mode === "scoped_update"
          )
            expect(packet.participantInterface.temporalEvidence).toContain("never their promises");
          if (packet.participantInterface.mode === "scoped_update")
            expect(packet.participantInterface.recipients).not.toContain(packet.specialist.id);
        }
        const goal = JSON.parse(packet.specialist.ownerIntent);
        if (_name.startsWith("RC18")) {
          expect(goal.incoming).not.toHaveProperty("maximumPerHour");
          expect(goal.outgoing).not.toHaveProperty("minimumPerHour");
          expect(goal.incoming.resource).toMatch(/^(iron|silver)$/);
          expect(goal.incoming.minimumPerHour).toBeGreaterThan(0);
          expect(goal.outgoing.maximumPerHour).toBeGreaterThan(0);
          expect(goal).not.toHaveProperty("maximumSendPerHour");
        }
        expect(goal.quantityUnit).toBe("whole resource units");
        expect(goal.timeUnit).toBe("GAME hour");
        if (
          _name.startsWith("RC15") ||
          _name.startsWith("RC16") ||
          _name.startsWith("RC17") ||
          _name.startsWith("RC18")
        )
          expect(goal.scope).toContain("external peer supply");
        return originalDecide(request);
      };
    }
    const outcomes: unknown[] = [];
    const currentFixture = f;
    const result = await execute(f.protocol, f.grant, {
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
    expect(
      (await f.pool.query("SELECT count(*)::int n FROM skill_invocations WHERE state='completed'")).rows[0].n,
    ).toBe(1);
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
  },
  600000,
);
