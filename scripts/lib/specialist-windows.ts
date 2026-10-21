import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  prepareOwnedSpecialistWorld,
  type SpecialistWorldCheckpoint,
} from "../../../pact/tests/evaluation/specialist-owned-world.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { connect, migrate } from "../../src/db.js";
import { FleetError } from "../../src/domain.js";
import { HttpModel } from "../../src/model.js";
import { designDigest } from "../../src/negotiation-plan.js";
import {
  prepareSpecialistQualification,
  type SpecialistCell,
  type SpecialistGrant,
  SpecialistGrantSchema,
  type SpecialistProtocol,
} from "../../src/specialist-qualification.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";
import { loadPreparationRestoreGate } from "./negotiation-backup-proof.js";
import { PrivateNegotiationReview } from "./negotiation-review-channel.js";
import { OwnedNegotiationManifestSchema, privateChild, verifyOwnedWindowsPackage } from "./negotiation-windows.js";
import {
  executeOwnedSpecialistProtocol,
  type PreparedSpecialistCell,
  prepareOwnedSpecialistCohort,
} from "./specialist-owned-run.js";

export const OwnedSpecialistManifestSchema = OwnedNegotiationManifestSchema.omit({ prepared: true })
  .extend({
    schemaVersion: z.literal("fleet.owned-specialist-manifest.v1"),
    prepared: z
      .array(
        z
          .object({
            cell: z.unknown(),
            binding: SpecialistGrantSchema.shape.bindings.element,
            authorityDigest: z.string().regex(/^[a-f0-9]{64}$/),
            budgetDeadline: z.iso.datetime(),
            world: z.object({ cipher: z.string().min(1) }).strict(),
          })
          .strict(),
      )
      .length(8),
  })
  .strict();
type Manifest = z.infer<typeof OwnedSpecialistManifestSchema>;
function assertProtocol(m: Omit<Manifest, "prepared">, protocol: SpecialistProtocol) {
  if (
    designDigest(prepareSpecialistQualification(protocol.selection)) !== designDigest(protocol) ||
    designDigest(protocol.selection.sources) !== designDigest(m.sources) ||
    protocol.selection.modelDigest !== m.modelDigest ||
    protocol.selection.policyDigest !== m.policyDigest ||
    protocol.selection.settingsDigest !== m.settingsDigest ||
    protocol.selection.bundleDigest !== m.bundleDigest
  )
    throw new FleetError("KQ1_MANIFEST_PROTOCOL_DRIFT", true);
}
function descriptor(cell: SpecialistCell) {
  return {
    id: cell.id,
    configurationDigest: cell.configurationDigest,
    scenario: cell.scenario,
    sources: cell.selection.sources,
    modelDigest: cell.selection.modelDigest,
    policyDigest: cell.selection.policyDigest,
  };
}
const assets = (m: Omit<Manifest, "prepared">) =>
  verifyOwnedWindowsPackage({ ...m, schemaVersion: "fleet.owned-negotiation-manifest.v1", prepared: [] });
/** Fixed retained source composition; JSON cannot supply code or adapters. */
export async function prepareWindowsSpecialistRoster(raw: unknown) {
  const input = OwnedSpecialistManifestSchema.omit({ prepared: true })
      .extend({ protocol: z.unknown() })
      .strict()
      .parse(raw),
    { protocol: rawProtocol, ...base } = input,
    protocol = rawProtocol as SpecialistProtocol;
  assertProtocol(base, protocol);
  await assets(base);
  await writeFile(
    join(base.privateRoot, "preparation-started.json"),
    JSON.stringify({ at: new Date().toISOString(), stage: "KQ1", protocolDigest: protocol.digest }) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const pool = connect(base.fixture.fleetUrl),
    vault = new Vault((await readFile(privateChild(base.privateRoot, base.vaultKeyRef), "utf8")).trim()),
    opened: PreparedSpecialistCell[] = [];
  try {
    const marker = (await pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
    if (marker.length !== 1 || marker[0].nonce !== base.fixture.nonce) throw new FleetError("KQ1_OWNER_DRIFT", true);
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
    if (tables.length !== 1 || tables[0].tablename !== "architecture_fixture_owner")
      throw new FleetError("KQ1_FRESH_DATABASE_REQUIRED", true);
    await migrate(pool);
    const store = new Store(pool, vault, () => new Date(), builtinArchitectures()),
      prepared: Manifest["prepared"] = [];
    for (const cell of protocol.cells) {
      const secrets = {
        rulesKey: randomBytes(32).toString("base64"),
        tokenKey: randomBytes(32).toString("base64"),
        encryptionKey: randomBytes(32).toString("base64"),
      };
      const world = await prepareOwnedSpecialistWorld(
        { pactUrl: base.fixture.pactUrl, nonce: base.fixture.nonce },
        descriptor(cell),
        {
          retention: "preserve",
          secrets,
          onCreated: async (schema, worldId) => {
            await writeFile(
              join(base.privateRoot, "evidence", `setup-${worldId}.json`),
              JSON.stringify({
                cipher: vault.encrypt({ schema, worldId, cell, secrets }, `specialist-owned-setup:${worldId}`),
              }) + "\n",
              { flag: "wx", mode: 0o600 },
            );
          },
        },
      );
      let p: PreparedSpecialistCell;
      try {
        p = await prepareOwnedSpecialistCohort(
          store,
          world,
          cell,
          base.model,
          base.fixture.nonce,
          join(base.privateRoot, "evidence"),
          base.reviewKeyRef,
        );
      } catch (error) {
        await world.disconnect();
        throw error;
      }
      opened.push(p);
      const record = {
        cell,
        binding: p.binding,
        authorityDigest: p.authorityDigest,
        budgetDeadline: p.budgetDeadline,
        world: { cipher: vault.encrypt(world.checkpoint(), `specialist-owned-world:${cell.id}`) },
      };
      prepared.push(record);
      await writeFile(
        join(base.privateRoot, "evidence", `prepared-${designDigest(cell.id)}.json`),
        JSON.stringify(record) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    }
    const manifest = OwnedSpecialistManifestSchema.parse({ ...base, prepared });
    for (const [name, value] of [
      ["prepared-manifest.json", manifest],
      ["protocol.json", protocol],
      [
        "preparation-context.json",
        { sources: base.sources, protocolDigest: protocol.digest, fixtureNonce: base.fixture.nonce },
      ],
    ] as const)
      await writeFile(join(base.privateRoot, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return { stage: "KQ1", cells: 8, accounts: 16, modelActors: 8, modelCalls: 0, protocolDigest: protocol.digest };
  } finally {
    for (const p of opened) await p.world.disconnect();
    await pool.end();
  }
}
export async function createWindowsSpecialistExecution(
  path: string,
  protocol: SpecialistProtocol,
  grant: SpecialistGrant,
) {
  const raw = await readFile(path, "utf8"),
    m = OwnedSpecialistManifestSchema.parse(JSON.parse(raw)),
    manifestDigest = designDigest(JSON.parse(raw));
  assertProtocol(m, protocol);
  const verifyPackage = await assets(m),
    verifyBackup = await loadPreparationRestoreGate(m.privateRoot, {
      sources: m.sources,
      protocolDigest: protocol.digest,
      fixtureNonce: m.fixture.nonce,
    });
  const pool = connect(m.fixture.fleetUrl),
    vault = new Vault((await readFile(privateChild(m.privateRoot, m.vaultKeyRef), "utf8")).trim()),
    reviewKey = (await readFile(privateChild(m.privateRoot, m.reviewKeyRef), "utf8")).trim(),
    evidenceVault = new Vault(reviewKey),
    review = new PrivateNegotiationReview(join(m.privateRoot, "reviews"), reviewKey, protocol.batchNonce),
    prepared: PreparedSpecialistCell[] = [];
  const disconnect = async () => {
    for (const p of prepared) await p.world.disconnect();
    await pool.end();
  };
  try {
    const store = new Store(pool, vault, () => new Date(), builtinArchitectures());
    for (const record of m.prepared) {
      const cell = protocol.cells.find((c) => designDigest(c) === designDigest(record.cell)),
        binding = grant.bindings.find((b) => designDigest(b) === designDigest(record.binding));
      if (!cell || !binding || binding.fixtureNonce !== m.fixture.nonce)
        throw new FleetError("KQ1_PREPARED_SCOPE", true);
      const checkpoint = vault.decrypt<SpecialistWorldCheckpoint>(
          record.world.cipher,
          `specialist-owned-world:${cell.id}`,
        ),
        world = await prepareOwnedSpecialistWorld(
          { pactUrl: m.fixture.pactUrl, nonce: m.fixture.nonce },
          descriptor(cell),
          { retention: "preserve", secrets: checkpoint.world.secrets, checkpoint },
        );
      prepared.push({
        cell,
        binding,
        world,
        authorityDigest: record.authorityDigest,
        budgetDeadline: record.budgetDeadline,
        model: m.model,
      });
    }
    const persist = async (kind: string, detail: unknown) => {
      const id = randomUUID();
      await writeFile(
        join(m.privateRoot, "evidence", `${id}.json`),
        JSON.stringify({
          id,
          kind,
          cipher: evidenceVault.encrypt(
            { at: new Date().toISOString(), kind, detail },
            `specialist-qualification-evidence:${protocol.batchNonce}:${id}`,
          ),
        }) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    };
    return {
      disconnect,
      execute: () =>
        executeOwnedSpecialistProtocol(protocol, grant, {
          store,
          prepared,
          provider: new HttpModel({ ollama: m.providerUrl }, undefined),
          evidenceLevel: "real-provider",
          persist,
          verifyArtifacts: async () => {
            if (designDigest(JSON.parse(await readFile(path, "utf8"))) !== manifestDigest)
              throw new FleetError("KQ1_MANIFEST_CHANGED", true);
            await verifyPackage();
            await verifyBackup();
          },
          reviewResponse: async (claim, result) => {
            if (!result.allocationId) throw new FleetError("KQ1_REVIEW_ALLOCATION_REQUIRED", true);
            const events = (
              await pool.query(
                "SELECT id,detail_cipher FROM turn_events WHERE turn_id=$1 AND label='Debug: Model request' ORDER BY sequence",
                [claim.turn.id],
              )
            ).rows;
            const request = events
              .map((r) => vault.decrypt<Record<string, unknown>>(r.detail_cipher, `turn-event:${r.id}`))
              .find((r) => r.allocationId === result.allocationId);
            if (!request) throw new FleetError("KQ1_REVIEW_SOURCE_REQUIRED", true);
            const verdict = z
              .object({
                verdict: z.enum(["continue", "critical", "unresolved"]),
                reasonCodes: z
                  .array(z.string().regex(/^[A-Z0-9_]{1,100}$/))
                  .min(1)
                  .max(20),
              })
              .strict()
              .parse(
                await review.request(
                  "response",
                  result.allocationId,
                  {
                    turnId: claim.turn.id,
                    actorId: claim.turn.agent.kingdom_id,
                    allocationId: result.allocationId,
                    request,
                    result,
                  },
                  claim.turn.deadline.getTime(),
                ),
              );
            await persist("response-review", { turnId: claim.turn.id, allocationId: result.allocationId, verdict });
            if (verdict.verdict !== "continue")
              throw new FleetError(verdict.verdict === "critical" ? "CRITICAL_CLAIM" : "REVIEW_UNRESOLVED", true);
          },
        }),
    };
  } catch (error) {
    await disconnect();
    throw error;
  }
}
