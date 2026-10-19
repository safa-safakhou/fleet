import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import { PactQualificationFixtures } from "../../src/games/pact/qualification.js";
import {
  prepareQualification,
  QualificationLedger,
  qualificationModelDigest,
  runQualification,
} from "../../src/qualification-run.js";

const url = "postgres://fleet_qualification:qualification_fixture@127.0.0.1:5436/fleet_qualification";
it.each([false, true])(
  "runs all four shipped engines over twelve frozen trials each with every command withheld (recovery=%s)",
  async (recovery) => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NO_NETWORK_IN_FIXTURES"));
    const ledger = await QualificationLedger.open(url, Buffer.alloc(32, 18).toString("base64"));
    const p = prepareQualification({
      schemaVersion: recovery ? "fleet.local-qualification.v2" : "fleet.local-qualification.v1",
      id: randomUUID(),
      authorizationRef: randomUUID(),
      approved: true,
      fleetCommit: "a".repeat(40),
      modelDigest: qualificationModelDigest,
      model: { route: "ollama", model: "nemotron-3-nano:4b", thinking: true },
      endpoint: "http://127.0.0.1:11434",
      helperEndpoint: "http://127.0.0.1:8832",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      deadlineAt: new Date(Date.now() + 254 * 60000).toISOString(),
      scope: "synthetic_fixtures_only",
      executionLimit: 104,
      tokenLimit: 4160000,
      helperLimit: 48,
    });
    let calls = 0,
      helpers = 0;
    const model: ModelPort = {
      decide: async (input) => {
        calls++;
        const envelope = !!(input.schema.properties as Record<string, unknown> | undefined)?.decision;
        const calibration = input.messages[0].content.includes("calibration");
        if (calibration && recovery && !input.messages[0].content.includes("previous response"))
          return { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
        const legacy = input.messages.some((m) => m.content.includes("PACT:"));
        const decision = calibration
          ? { kind: "wait", summary: "Wait" }
          : legacy
            ? {
                kind: "action",
                action: {
                  kind: "game.contact.request",
                  recipientKingdomId: "22222222-2222-4222-8222-222222222222",
                  note: "Synthetic introduction",
                },
                summary: "Consider contact",
              }
            : {
                kind: "action",
                schemaId: "pact.action.v1",
                payload: {
                  kind: "game.contact.request",
                  recipientKingdomId: "22222222-2222-4222-8222-222222222222",
                  note: "Synthetic introduction",
                },
                summary: "Consider contact",
              };
        return {
          decision: (input.schema.properties as Record<string, unknown> | undefined)?.cognition
            ? {
                decision,
                cognition: {
                  expectedVersion: 0,
                  analysis: { type: "none", reason: "No grounded revision needed for this synthetic response." },
                },
              }
            : envelope
              ? { decision }
              : decision,
          inputTokens: 500,
          outputTokens: 50,
        };
      },
    };
    try {
      const fixtures = await PactQualificationFixtures.create(ledger, p);
      const result = await runQualification(p, {
        ledger,
        model,
        recall: {
          choose: async (_q, c) => {
            helpers++;
            return { id: c[0].id, probability: 0.8, certificate: "a".repeat(64) };
          },
        },
        fixtures,
      });
      expect(result.state).toBe("Q2_done");
      expect(result.passed).toBe(!recovery);
      expect(result.recoveryPassed).toBe(true);
      expect(result.rawOutputsPassed).toBe(!recovery);
      expect(result.invalid).toBe(recovery ? 4 : 0);
      expect(result.calibrationCasesPassed).toBe(recovery ? 4 : 8);
      expect(result.executions).toBeGreaterThanOrEqual(56);
      expect(result.executions).toBeLessThanOrEqual(104);
      expect(result.unknown).toBe(0);
      expect(calls).toBe(result.executions);
      expect(helpers).toBeGreaterThan(0);
      const trials = (
        await ledger.pool.query("SELECT profile,result FROM qualification_trials WHERE run_id=$1", [p.plan.id])
      ).rows;
      expect(trials).toHaveLength(48);
      for (const profile of ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"]) {
        const group = trials.filter((t) => t.profile === profile);
        expect(group).toHaveLength(12);
        expect(group.every((t) => t.result.withheld > 0)).toBe(true);
        expect(group.every((t) => t.result.code !== "NO_CLAIM")).toBe(true);
      }
      expect(
        (
          await ledger.pool.query(
            "SELECT count(*)::int n FROM turns WHERE cohort_id IN(SELECT (result->>'cohortId')::uuid FROM qualification_trials WHERE run_id=$1) AND pending_command IS NOT NULL",
            [p.plan.id],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await ledger.close();
      expect(network).not.toHaveBeenCalled();
      network.mockRestore();
    }
  },
  60000,
);
