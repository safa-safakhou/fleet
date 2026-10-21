import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { prepareOwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import {
  createOwnedNegotiationExecution,
  type PreparedNegotiationCell,
  prepareOwnedNegotiationCohort,
} from "../../scripts/lib/negotiation-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { connect, migrate } from "../../src/db.js";
import { FleetError, object } from "../../src/domain.js";
import { createNegotiationCellGuard } from "../../src/negotiation-guard.js";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { type NegotiationGrant, prepareNegotiationProtocol } from "../../src/negotiation-run.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";

it.each(["normal", "critical-review"])(
  "%s native owned hosts keep ordinary clocks and one shared turn lane",
  async (kind) => {
    const nonce = process.env.FLEET_ARCHITECTURE_NONCE,
      fleetUrl = process.env.FLEET_TEST_DATABASE_URL,
      pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL;
    if (process.env.FLEET_ARCHITECTURE_TEST !== "1" || !nonce || !fleetUrl || !pactUrl)
      throw Error("OWNED_FIXTURE_REQUIRED");
    const sources = { fleet: "a".repeat(40), pact: "b".repeat(40) },
      selection = {
        stage: "E4",
        sources,
        selectedProfile: { id: "reactive-cognition", version: "2" },
        modelDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
        settingsDigest: "e".repeat(64),
      },
      protocol = prepareNegotiationProtocol(selection),
      cells = negotiationPlan("E4", {
        sources,
        selectedProfile: selection.selectedProfile,
        modelDigest: selection.modelDigest,
        policyDigest: selection.policyDigest,
      }),
      key = () => randomBytes(32).toString("base64"),
      secrets = () => ({ rulesKey: key(), tokenKey: key(), encryptionKey: key() }),
      pool = connect(fleetUrl);
    await migrate(pool);
    const store = new Store(pool, new Vault(key()), () => new Date(), builtinArchitectures()),
      prepared: PreparedNegotiationCell[] = [],
      controllers = [new AbortController(), new AbortController()];
    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    const operations: Promise<unknown>[] = [];
    const ownCommands = async () =>
      (
        await pool.query(
          "SELECT count(*)::int n FROM platform_commands c JOIN turns t ON t.id=c.turn_id WHERE t.cohort_id=ANY($1::uuid[])",
          [prepared.map((p) => p.binding.cohortId)],
        )
      ).rows[0].n;
    try {
      for (const cell of cells) {
        const fixture = { pactUrl, nonce },
          world = await prepareOwnedNegotiationWorld(fixture, cell, { retention: "preserve", secrets: secrets() }),
          control = await prepareOwnedNegotiationWorld(fixture, cell, {
            retention: "preserve",
            secrets: secrets(),
            control: true,
          });
        prepared.push(
          await prepareOwnedNegotiationCohort(
            store,
            world,
            control,
            cell,
            { route: "ollama", model: "authored-fake" },
            nonce,
            "synthetic-evidence",
            "synthetic-key",
          ),
        );
      }
      const startsAt = new Date().toISOString(),
        cutoffAt = new Date(Date.now() + 80000).toISOString();
      const grant: NegotiationGrant = {
        schemaVersion: "fleet.negotiation-grant.v1",
        approved: true,
        authorizationRef: "offline native mechanism acceptance only",
        protocolDigest: protocol.digest,
        batchNonce: protocol.batchNonce,
        sources,
        modelDigest: selection.modelDigest,
        policyDigest: selection.policyDigest,
        settingsDigest: selection.settingsDigest,
        startsAt,
        cutoffAt,
        scope: "new_owned_synthetic_worlds",
        bindings: prepared.map((p) => p.binding),
      };
      let calls = 0,
        active = 0,
        peak = 0,
        firstCompleted = false;
      const completedDecisions: unknown[] = [];
      const ports = createOwnedNegotiationExecution(protocol, grant, {
        store,
        prepared,
        model: { route: "ollama", model: "authored-fake" },
        evidenceLevel: "fake-provider",
        verifyArtifacts: async () => {},
        persist: async (kind, detail) => {
          if (kind === "turn-finish") completedDecisions.push(object(detail).decision);
        },
        reviewResponse: async () => {
          if (kind === "critical-review") throw new FleetError("CRITICAL_CLAIM", true);
        },
        reviewOutcome: async () => ({ claims: [], reviews: [] }),
        provider: {
          tracksDispatch: true,
          decide: async (request) => {
            await request.onDispatch?.();
            calls++;
            active++;
            peak = Math.max(peak, active);
            if (calls === 1) {
              await blocked;
              firstCompleted = true;
            }
            active--;
            return {
              decision: { decision: { kind: "wait", summary: "No accepted agreement." } },
              inputTokens: 10,
              outputTokens: 4,
            };
          },
        },
      });
      expect(ports.timingMode).toBe("native");
      for (const p of prepared) await ports.openCell?.(p.binding, { startsAt, cutoffAt });
      for (const [i, p] of prepared.entries()) {
        operations.push(
          ports
            .runCell(p.cell, p.binding, {
              startsAt,
              cutoffAt,
              signal: controllers[i].signal,
              guard: createNegotiationCellGuard({
                ports,
                protocol,
                grant,
                cell: p.cell,
                binding: p.binding,
                cutoff: Date.parse(cutoffAt),
                controller: controllers[i],
                onOperationalFailure: () => {
                  for (const c of controllers) c.abort();
                },
              }),
            })
            .catch((error) => error),
        );
      }
      const until = Date.now() + 72000;
      let times: string[] = [];
      while (Date.now() < until) {
        times = await Promise.all(
          prepared
            .flatMap((p) => [p.world, p.control])
            .map(
              async (w) => (await w.pool.query("SELECT committed_game_time_ms::text t FROM world_clocks")).rows[0].t,
            ),
        );
        if (times.every((t) => BigInt(t) >= 60000n)) break;
        await delay(250);
      }
      expect(times).toEqual(["60000", "60000", "60000", "60000"]);
      expect(firstCompleted).toBe(false);
      expect(calls).toBe(1);
      expect((await pool.query("SELECT count(*)::int n FROM turns WHERE state='running'")).rows[0].n).toBe(1);
      release();
      if (kind === "critical-review") {
        await Promise.all(operations);
        expect(calls).toBe(1);
        expect(
          (
            await pool.query("SELECT status FROM compute_ledger WHERE cohort_id=ANY($1::uuid[])", [
              prepared.map((p) => p.binding.cohortId),
            ])
          ).rows,
        ).toEqual([{ status: "reported" }]);
        expect(await ownCommands()).toBe(0);
        for (const p of prepared)
          for (const w of [p.world, p.control])
            expect((await w.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
        return;
      }
      const settle = Date.now() + 5000;
      while (
        Date.now() < settle &&
        (
          await pool.query(
            "SELECT count(*)::int n FROM compute_ledger WHERE status='reported' AND cohort_id=ANY($1::uuid[])",
            [prepared.map((p) => p.binding.cohortId)],
          )
        ).rows[0].n < 2
      )
        await delay(100);
      expect(calls).toBe(2);
      expect(peak).toBe(1);
      for (const c of controllers) c.abort();
      await Promise.all(operations);
      expect(object(completedDecisions[0]).gameTimeMs).toBe("0");
      expect(
        (
          await pool.query("SELECT status FROM compute_ledger WHERE cohort_id=ANY($1::uuid[]) ORDER BY created_at", [
            prepared.map((p) => p.binding.cohortId),
          ])
        ).rows,
      ).toEqual([{ status: "reported" }, { status: "reported" }]);
      expect(await ownCommands()).toBe(0);
      for (const p of prepared)
        for (const w of [p.world, p.control])
          expect((await w.pool.query("SELECT status FROM world_clocks")).rows[0].status).toBe("paused");
    } finally {
      release();
      for (const c of controllers) c.abort();
      await Promise.allSettled(operations);
      for (const p of prepared) {
        await p.world.disconnect();
        await p.control.disconnect();
      }
      await pool.end();
    }
  },
  100000,
);
