import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prepareOwnedNegotiationWorld } from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { connect, migrate } from "../../src/db.js";
import { FleetError } from "../../src/domain.js";
import { designDigest, negotiationPlan } from "../../src/negotiation-plan.js";
import { type ProtocolPreview, prepareNegotiationProtocol } from "../../src/negotiation-run.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";
import { type PreparedNegotiationCell, prepareOwnedNegotiationCohort } from "./negotiation-owned-run.js";
import {
  type OwnedNegotiationManifest,
  OwnedNegotiationManifestSchema,
  privateChild,
  verifyOwnedWindowsPackage,
} from "./negotiation-windows.js";
export const OwnedRosterPreparationSchema = OwnedNegotiationManifestSchema.omit({ prepared: true })
  .extend({ protocol: z.unknown() })
  .strict();
export async function prepareWindowsNegotiationRoster(raw: unknown) {
  const input = OwnedRosterPreparationSchema.parse(raw),
    protocol = input.protocol as ProtocolPreview;
  if (
    designDigest(prepareNegotiationProtocol(protocol.selection)) !== designDigest(protocol) ||
    designDigest(protocol.selection.sources) !== designDigest(input.sources) ||
    protocol.selection.modelDigest !== input.modelDigest ||
    protocol.selection.policyDigest !== input.policyDigest ||
    protocol.selection.settingsDigest !== input.settingsDigest
  )
    throw new FleetError("OWNED_PREPARATION_PROTOCOL", true);
  const { protocol: _protocol, ...base } = input;
  await verifyOwnedWindowsPackage({ ...base, prepared: [] });
  await writeFile(
    join(base.privateRoot, "preparation-started.json"),
    JSON.stringify({ at: new Date().toISOString(), protocolDigest: protocol.digest }),
    { flag: "wx", mode: 0o600 },
  );
  const key = (await readFile(privateChild(base.privateRoot, base.vaultKeyRef), "utf8")).trim(),
    vault = new Vault(key),
    pool = connect(base.fixture.fleetUrl),
    opened: PreparedNegotiationCell[] = [];
  try {
    const marker = (await pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
    if (marker.length !== 1 || marker[0].nonce !== base.fixture.nonce)
      throw new FleetError("OWNED_DATABASE_MARKER", true);
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
      .rows;
    if (tables.length !== 1 || tables[0].tablename !== "architecture_fixture_owner")
      throw new FleetError("OWNED_FRESH_DATABASE_REQUIRED", true);
    await migrate(pool);
    const store = new Store(pool, vault, () => new Date(), builtinArchitectures()),
      selection = protocol.selection;
    if (!selection.sources || !selection.modelDigest || !selection.policyDigest)
      throw new FleetError("OWNED_PREPARATION_PROTOCOL", true);
    const cells = negotiationPlan(selection.stage, {
      sources: selection.sources,
      modelDigest: selection.modelDigest,
      policyDigest: selection.policyDigest,
      selectedProfile: selection.selectedProfile,
      ...(selection.baselineAmendment ? { baselineAmendment: selection.baselineAmendment } : {}),
    });
    const prepared: OwnedNegotiationManifest["prepared"] = [];
    for (const cell of cells) {
      const worlds = [];
      for (const control of [false, true]) {
        const secrets = {
          rulesKey: randomBytes(32).toString("base64"),
          tokenKey: randomBytes(32).toString("base64"),
          encryptionKey: randomBytes(32).toString("base64"),
        };
        worlds.push(
          await prepareOwnedNegotiationWorld({ pactUrl: base.fixture.pactUrl, nonce: base.fixture.nonce }, cell, {
            retention: "preserve",
            control,
            secrets,
            onCreated: async (schema, worldId) => {
              await writeFile(
                join(base.privateRoot, "evidence", `setup-${worldId}.json`),
                JSON.stringify({
                  cipher: vault.encrypt({ schema, worldId, cell, control, secrets }, `owned-setup:${worldId}`),
                }),
                { flag: "wx", mode: 0o600 },
              );
            },
          }),
        );
      }
      const [world, control] = worlds;
      if (!world || !control) throw new FleetError("OWNED_PREPARATION_INCOMPLETE", true);
      const p = await prepareOwnedNegotiationCohort(
        store,
        world,
        control,
        cell,
        base.model,
        base.fixture.nonce,
        join(base.privateRoot, "evidence"),
        base.reviewKeyRef,
      );
      opened.push(p);
      prepared.push({
        cell,
        binding: p.binding,
        authorityDigest: p.authorityDigest,
        world: { cipher: vault.encrypt(world.checkpoint(), `owned-world:${cell.id}:world`) },
        control: { cipher: vault.encrypt(control.checkpoint(), `owned-world:${cell.id}:control`) },
      });
      await writeFile(
        join(base.privateRoot, "evidence", `prepared-${designDigest(cell.id)}.json`),
        JSON.stringify(prepared.at(-1)),
        { flag: "wx", mode: 0o600 },
      );
    }
    const manifest = OwnedNegotiationManifestSchema.parse({ ...base, prepared }),
      path = join(base.privateRoot, "prepared-manifest.json");
    await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await writeFile(join(base.privateRoot, "protocol.json"), JSON.stringify(protocol, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return {
      privateManifestRef: path,
      cells: prepared.length,
      accounts: prepared.length * 4,
      modelActors: prepared.length * 2,
      modelAllocations: Number((await pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n),
    };
  } finally {
    for (const p of opened) {
      await p.world.disconnect();
      await p.control.disconnect();
    }
    await pool.end();
  }
}
