import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { prepareOwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import {
  createOwnedNegotiationExecution,
  prepareOwnedNegotiationCohort,
} from "../../scripts/lib/negotiation-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { connect, migrate } from "../../src/db.js";
import { designDigest, negotiationBaselineAmendment, negotiationPlan } from "../../src/negotiation-plan.js";
import { type NegotiationGrant, prepareNegotiationProtocol } from "../../src/negotiation-run.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";

it.each(["normal", "dispatch-refused"] as const)(
  "%s owned execution uses native accounting without invented spend",
  async (kind) => {
    const nonce = process.env.FLEET_ARCHITECTURE_NONCE!,
      fleetUrl = process.env.FLEET_TEST_DATABASE_URL!,
      pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL!;
    if (process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("OWNED_FIXTURE_REQUIRED");
    const sources = { fleet: "a".repeat(40), pact: "b".repeat(40) };
    const selection = {
      sources,
      modelDigest: "c".repeat(64),
      policyDigest: "d".repeat(64),
      selectedProfile: { id: "reactive-cognition", version: "1.1" },
      baselineAmendment: designDigest(negotiationBaselineAmendment),
      settingsDigest: "e".repeat(64),
    };
    const protocol = prepareNegotiationProtocol(selection);
    const planned = negotiationPlan("E1", {
      sources,
      modelDigest: selection.modelDigest,
      policyDigest: selection.policyDigest,
      selectedProfile: selection.selectedProfile,
      baselineAmendment: selection.baselineAmendment,
    })[0];
    const key = () => randomBytes(32).toString("base64"),
      secrets = () => ({ rulesKey: key(), tokenKey: key(), encryptionKey: key() });
    const world = await prepareOwnedNegotiationWorld({ pactUrl, nonce }, planned, {
      retention: "preserve",
      secrets: secrets(),
    });
    const control = await prepareOwnedNegotiationWorld({ pactUrl, nonce }, planned, {
      retention: "preserve",
      secrets: secrets(),
      control: true,
    });
    const pool = connect(fleetUrl);
    await migrate(pool);
    try {
      const store = new Store(pool, new Vault(key()), () => new Date(), builtinArchitectures());
      const p = await prepareOwnedNegotiationCohort(
        store,
        world,
        control,
        planned,
        { route: "ollama", model: "authored-fake" },
        nonce,
        "synthetic-evidence",
        "synthetic-key",
      );
      await world.activateLeases();
      const started = Date.now(),
        cutoff = started + planned.limits.wallDeadlineMs;
      const grant: NegotiationGrant = {
        schemaVersion: "fleet.negotiation-grant.v1",
        approved: true,
        authorizationRef: "offline fake acceptance only",
        protocolDigest: protocol.digest,
        batchNonce: protocol.batchNonce,
        sources,
        modelDigest: selection.modelDigest,
        policyDigest: selection.policyDigest,
        settingsDigest: selection.settingsDigest,
        startsAt: new Date(started).toISOString(),
        cutoffAt: new Date(cutoff).toISOString(),
        scope: "new_owned_synthetic_worlds",
        bindings: [p.binding],
      };
      let calls = 0,
        reviews = 0;
      const ports = createOwnedNegotiationExecution(protocol, grant, {
        store,
        prepared: [p],
        model: { route: "ollama", model: "authored-fake" },
        verifyArtifacts: async () => {},
        persist: async () => {},
        evidenceLevel: "fake-provider",
        provider: {
          tracksDispatch: true,
          decide: async (r) => {
            await r.onDispatch?.();
            calls++;
            return {
              decision: { decision: { kind: "wait", summary: "No agreement accepted; wait." } },
              inputTokens: 10,
              outputTokens: 4,
            };
          },
        },
        reviewResponse: async (_c, result) => {
          reviews++;
          expect(
            (await pool.query("SELECT status FROM compute_ledger WHERE id=$1", [result.allocationId])).rows[0].status,
          ).toBe("reported");
        },
        reviewOutcome: async () => ({ claims: [], reviews: [] }),
      });
      const operation = ports.runCell(planned, p.binding, {
        startsAt: grant.startsAt,
        cutoffAt: new Date(started + planned.limits.wallDeadlineMs).toISOString(),
        signal: new AbortController().signal,
        guard: async (input) => {
          if (kind === "dispatch-refused" && input.phase === "dispatch") throw Error("PROVEN_BEFORE_NETWORK");
        },
      });
      if (kind === "dispatch-refused") {
        await expect(operation).rejects.toThrow("PROVEN_BEFORE_NETWORK");
        expect(calls).toBe(0);
        expect(reviews).toBe(0);
        const rows = (await ports.accounting(p.binding)).allocations;
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("not_dispatched");
        return;
      }
      const assessment = await operation;
      expect(calls).toBe(24);
      expect(reviews).toBe(calls);
      expect(assessment.evidenceLevel).toBe("fake-provider");
      expect((await store.cohort(p.binding.cohortId)).state).toBe("paused");
      expect(
        (await ports.accounting(p.binding)).allocations.every(
          (a) => a.status === "reported" && a.reservedTokens === 40000,
        ),
      ).toBe(true);
      expect(
        (await world.pool.query("SELECT committed_game_time_ms::text t FROM world_clocks WHERE product_scope='pact'"))
          .rows[0].t,
      ).toBe(String(world.decisionStartGameTimeMs + 180 * 60000));
      await world.ownerSetSupplyPermission(0, false);
      expect((await ports.accounting(p.binding)).authorityValid).toBe(false);
    } finally {
      await pool.end();
      await world.disconnect();
      await control.disconnect();
    }
  },
  60000,
);
