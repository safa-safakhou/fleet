import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  type OwnedWorldCheckpoint,
  prepareOwnedNegotiationWorld,
} from "../../../pact/tests/evaluation/negotiation-owned-run.js";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { connect } from "../../src/db.js";
import { FleetError } from "../../src/domain.js";
import { HttpModel } from "../../src/model.js";
import { designDigest, type NegotiationCell } from "../../src/negotiation-plan.js";
import { NegotiationGrantSchema, type ProtocolPreview } from "../../src/negotiation-run.js";
import { Store } from "../../src/store.js";
import { Vault } from "../../src/vault.js";
import { createPinnedArtifactVerifier, fileSha256, validateOwnedDatabaseTarget } from "./negotiation-artifacts.js";
import { loadPreparationRestoreGate } from "./negotiation-backup-proof.js";
import { createOwnedNegotiationExecution, type PreparedNegotiationCell } from "./negotiation-owned-run.js";
import { PrivateNegotiationReview } from "./negotiation-review-channel.js";
import { validateWindowsOwnedRoots, windowsInspectionEnvironment } from "./negotiation-windows-paths.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.string().regex(/^[a-f0-9]{40}$/);
export const OwnedNegotiationManifestSchema = z
  .object({
    schemaVersion: z.literal("fleet.owned-negotiation-manifest.v1"),
    sources: z.object({ fleet: revision, pact: revision }).strict(),
    modelDigest: hash,
    policyDigest: hash,
    settingsDigest: hash,
    bundleDigest: hash,
    bundleRoot: z.string().min(1),
    privateRoot: z.string().min(1),
    vaultKeyRef: z.string().min(1),
    reviewKeyRef: z.string().min(1),
    pins: z
      .array(z.object({ relativePath: z.string(), bytes: z.number().int().nonnegative(), sha256: hash }).strict())
      .min(3)
      .max(50000),
    fixture: z.object({ fleetUrl: z.string(), pactUrl: z.string(), nonce: hash, containerId: hash }).strict(),
    providerPid: z.number().int().positive(),
    providerUrl: z.literal("http://127.0.0.1:11436"),
    model: z
      .object({ route: z.literal("ollama"), model: z.literal("nemotron-3-nano:4b"), thinking: z.literal(true) })
      .strict(),
    prepared: z
      .array(
        z
          .object({
            cell: z.unknown(),
            binding: z.unknown(),
            authorityDigest: hash,
            world: z.unknown(),
            control: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(35),
  })
  .strict();
export type OwnedNegotiationManifest = z.infer<typeof OwnedNegotiationManifestSchema>;
const exec = promisify(execFile);
const expectedNode = "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237";
const expectedProvider = "3cc17c238b081adf2bd3a206e52a063b637af1bf283d95b4ffd73a2bdec8b027";
const expectedModelManifest = "6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197";
export function privateChild(root: string, file: string) {
  const base = resolve(root),
    child = resolve(file);
  if (!child.toLowerCase().startsWith(`${base.toLowerCase()}\\`) || child === base)
    throw new FleetError("OWNED_PRIVATE_PATH_REQUIRED", true);
  return child;
}
export async function verifyOwnedWindowsPackage(m: OwnedNegotiationManifest) {
  if (process.platform !== "win32" || !/^24\./.test(process.versions.node))
    throw new FleetError("OWNED_WINDOWS_CONTROLLER_REQUIRED", true);
  const appData = process.env.LOCALAPPDATA;
  if (!appData) throw new FleetError("OWNED_PRIVATE_PATH_REQUIRED", true);
  const base = resolve(appData, "PACT/Negotiation");
  validateWindowsOwnedRoots(
    base,
    m.bundleRoot,
    m.privateRoot,
    await realpath(base),
    await realpath(m.bundleRoot),
    await realpath(m.privateRoot),
  );
  if (
    resolve(m.vaultKeyRef).toLowerCase() !== join(resolve(m.privateRoot), "keys/vault.key").toLowerCase() ||
    resolve(m.reviewKeyRef).toLowerCase() !== join(resolve(m.privateRoot), "keys/review.key").toLowerCase()
  )
    throw new FleetError("OWNED_PRIVATE_PATH_REQUIRED", true);
  for (const file of [m.vaultKeyRef, m.reviewKeyRef]) {
    const s = await lstat(file);
    if (!s.isFile() || s.isSymbolicLink() || s.size > 100) throw new FleetError("OWNED_PRIVATE_PATH_REQUIRED", true);
  }
  const node = join(m.bundleRoot, "controller/node.exe"),
    provider = join(m.bundleRoot, "runtime/ollama.exe");
  if (
    (await realpath(process.execPath)).toLowerCase() !== (await realpath(node)).toLowerCase() ||
    (await fileSha256(node)) !== expectedNode
  )
    throw new FleetError("OWNED_CONTROLLER_DIGEST", true);
  if (
    (await fileSha256(provider)) !== expectedProvider ||
    (await fileSha256(join(m.bundleRoot, "models/manifests/registry.ollama.ai/library/nemotron-3-nano/4b"))) !==
      expectedModelManifest
  )
    throw new FleetError("OWNED_PROVIDER_DIGEST", true);
  if (designDigest(m.pins) !== m.bundleDigest) throw new FleetError("OWNED_BUNDLE_DIGEST", true);
  const library = m.pins
    .filter((p) => p.relativePath.startsWith("runtime/lib/ollama/"))
    .map((p) => ({ ...p, relativePath: p.relativePath.slice("runtime/".length) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath)));
  if (
    library.length !== 989 ||
    designDigest(library) !== "f06576561d9fa0049ee9c3db227ff3542cff33423e3cdf73bfcd8182a103efeb"
  )
    throw new FleetError("OWNED_PROVIDER_LIBRARY_DIGEST", true);
  const descriptor = JSON.parse(
    await readFile(join(m.bundleRoot, "fleet/docs/negotiation-E1-launch-manifest-20261021.json"), "utf8"),
  );
  if (designDigest(descriptor.model) !== m.modelDigest) throw new FleetError("OWNED_MODEL_DESCRIPTOR_DIGEST", true);
  for (const layer of descriptor.model.artifact.layers as { sha256: string; bytes: number }[]) {
    const pin = m.pins.find((p) => p.relativePath === `models/blobs/sha256-${layer.sha256}`);
    if (pin?.sha256 !== layer.sha256 || pin.bytes !== layer.bytes)
      throw new FleetError("OWNED_MODEL_LAYER_DIGEST", true);
  }
  const settings = JSON.parse(await readFile(join(m.bundleRoot, "execution-settings.json"), "utf8")),
    policy = JSON.parse(await readFile(join(m.bundleRoot, "execution-policy.json"), "utf8"));
  if (
    designDigest({ settings, bundleDigest: m.bundleDigest }) !== m.settingsDigest ||
    designDigest(policy) !== m.policyDigest
  )
    throw new FleetError("OWNED_SETTINGS_OR_POLICY_DIGEST", true);
  const bundleSources = JSON.parse(await readFile(join(m.bundleRoot, "bundle-sources.json"), "utf8"));
  if (designDigest(bundleSources) !== designDigest(m.sources)) throw new FleetError("OWNED_SOURCE_DIGEST", true);
  validateOwnedDatabaseTarget(m.fixture.fleetUrl);
  validateOwnedDatabaseTarget(m.fixture.pactUrl);
  const p = await lstat(m.privateRoot);
  if (!p.isDirectory() || p.isSymbolicLink()) throw new FleetError("OWNED_PRIVATE_PATH_REQUIRED", true);
  privateChild(m.privateRoot, m.vaultKeyRef);
  privateChild(m.privateRoot, m.reviewKeyRef);
  const verify = await createPinnedArtifactVerifier(m.bundleRoot, m.pins);
  const inspect = async () => {
    await verify();
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const paths = [
      m.bundleRoot,
      m.privateRoot,
      m.reviewKeyRef,
      m.vaultKeyRef,
      join(m.privateRoot, "reviews"),
      join(m.privateRoot, "evidence"),
    ]
      .map(quote)
      .join(",");
    const script = `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed=@($sid,'S-1-5-18','S-1-5-32-544'); $unsafe=$false; foreach($path in @(${paths})){foreach($rule in (Get-Acl -LiteralPath $path).Access){if($rule.AccessControlType -eq 'Allow' -and $allowed -notcontains $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value){$unsafe=$true}}}; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${m.providerPid}'; $t=@(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort 11436 -ErrorAction SilentlyContinue); [PSCustomObject]@{unsafe=$unsafe;path=$p.ExecutablePath;command=$p.CommandLine;owners=@($t|Select-Object -ExpandProperty OwningProcess)}|ConvertTo-Json -Compress`;
    const { stdout } = await exec(
      join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        env: windowsInspectionEnvironment(process.env),
        timeout: 10000,
        maxBuffer: 64000,
      },
    );
    const observed = JSON.parse(stdout);
    if (
      observed.unsafe !== false ||
      typeof observed.path !== "string" ||
      (await realpath(observed.path)).toLowerCase() !== (await realpath(provider)).toLowerCase() ||
      !Array.isArray(observed.owners) ||
      observed.owners.length !== 1 ||
      observed.owners[0] !== m.providerPid ||
      !/\bserve\s*$/.test(String(observed.command))
    )
      throw new FleetError("OWNED_PROVIDER_PROCESS_OR_ROUTE", true);
  };
  await inspect();
  return inspect;
}

/** Only the fixed built Windows entrypoint invokes this factory after grant
 * validation. The prepared JSON cannot select code, providers or adapters. */
export async function createWindowsNegotiationExecution(path: string, protocol: ProtocolPreview, rawGrant: unknown) {
  if (protocol.selection.stage === "E4") throw new FleetError("OWNED_NATIVE_SCHEDULER_ACCEPTANCE_REQUIRED", true);
  const grant = NegotiationGrantSchema.parse(rawGrant),
    raw = await readFile(path, "utf8"),
    m = OwnedNegotiationManifestSchema.parse(JSON.parse(raw));
  if (
    designDigest(m.sources) !== designDigest(grant.sources) ||
    m.modelDigest !== grant.modelDigest ||
    m.policyDigest !== grant.policyDigest ||
    m.settingsDigest !== grant.settingsDigest ||
    m.prepared.length !== grant.bindings.length
  )
    throw new FleetError("OWNED_MANIFEST_GRANT_DRIFT", true);
  const verifyPackage = await verifyOwnedWindowsPackage(m),
    manifestDigest = designDigest(JSON.parse(raw));
  const verifyBackup = await loadPreparationRestoreGate(m.privateRoot, {
    sources: grant.sources,
    protocolDigest: protocol.digest,
    fixtureNonce: m.fixture.nonce,
  });
  const storeKey = (await readFile(privateChild(m.privateRoot, m.vaultKeyRef), "utf8")).trim(),
    reviewKey = (await readFile(privateChild(m.privateRoot, m.reviewKeyRef), "utf8")).trim();
  const review = new PrivateNegotiationReview(join(m.privateRoot, "reviews"), reviewKey, grant.batchNonce),
    evidenceVault = new Vault(reviewKey);
  const pool = connect(m.fixture.fleetUrl),
    store = new Store(pool, new Vault(storeKey), () => new Date(), builtinArchitectures());
  const prepared: PreparedNegotiationCell[] = [];
  const disconnect = async () => {
    for (const p of prepared) {
      await p.world.disconnect();
      await p.control.disconnect();
    }
    await pool.end();
  };
  const persist = async (kind: string, detail: unknown) => {
    const id = randomUUID();
    await writeFile(
      join(m.privateRoot, "evidence", `${id}.json`),
      JSON.stringify({
        kind,
        id,
        cipher: evidenceVault.encrypt(
          { at: new Date().toISOString(), kind, detail },
          `negotiation-evidence:${grant.batchNonce}:${id}`,
        ),
      }),
      { flag: "wx", mode: 0o600 },
    );
  };
  try {
    for (const record of m.prepared) {
      const b = grant.bindings.find((b) => designDigest(b) === designDigest(record.binding));
      if (!b || b.fixtureNonce !== m.fixture.nonce) throw new FleetError("OWNED_PREPARED_BINDING_DRIFT", true);
      const cell = record.cell as NegotiationCell;
      const checkpoint = z.object({ cipher: z.string().min(1) }).strict();
      const worldCheckpoint = store.vault.decrypt<OwnedWorldCheckpoint>(
          checkpoint.parse(record.world).cipher,
          `owned-world:${cell.id}:world`,
        ),
        controlCheckpoint = store.vault.decrypt<OwnedWorldCheckpoint>(
          checkpoint.parse(record.control).cipher,
          `owned-world:${cell.id}:control`,
        );
      const world = await prepareOwnedNegotiationWorld({ pactUrl: m.fixture.pactUrl, nonce: m.fixture.nonce }, cell, {
        retention: "preserve",
        checkpoint: worldCheckpoint,
        secrets: worldCheckpoint.secrets,
      });
      const control = await prepareOwnedNegotiationWorld({ pactUrl: m.fixture.pactUrl, nonce: m.fixture.nonce }, cell, {
        retention: "preserve",
        control: true,
        checkpoint: controlCheckpoint,
        secrets: controlCheckpoint.secrets,
      });
      prepared.push({ cell, binding: b, world, control, authorityDigest: record.authorityDigest });
    }
    const verifyArtifacts = async () => {
      if (designDigest(JSON.parse(await readFile(path, "utf8"))) !== manifestDigest)
        throw new FleetError("OWNED_MANIFEST_CHANGED", true);
      await verifyPackage();
      await verifyBackup();
      const marker = (await pool.query("SELECT nonce FROM public.architecture_fixture_owner")).rows;
      if (marker.length !== 1 || marker[0].nonce !== m.fixture.nonce)
        throw new FleetError("OWNED_DATABASE_MARKER", true);
    };
    const ports = createOwnedNegotiationExecution(protocol, grant, {
      store,
      prepared,
      model: m.model,
      provider: new HttpModel({ ollama: m.providerUrl }, undefined),
      evidenceLevel: "real-provider",
      verifyArtifacts,
      persist,
      reviewResponse: async (claim, result) => {
        if (!result.allocationId) throw new FleetError("REVIEW_ALLOCATION_REQUIRED", true);
        const rows = (
          await pool.query(
            "SELECT id,detail_cipher FROM turn_events WHERE turn_id=$1 AND label='Debug: Model request' ORDER BY sequence",
            [claim.turn.id],
          )
        ).rows;
        const request = rows
          .map((r) => store.vault.decrypt<Record<string, unknown>>(r.detail_cipher, `turn-event:${r.id}`))
          .find((r) => r.allocationId === result.allocationId);
        if (!request) throw new FleetError("REVIEW_SOURCE_REQUIRED", true);
        const verdict = z
          .object({
            verdict: z.enum(["continue", "critical", "unresolved"]),
            reasonCodes: z.array(z.string().regex(/^[A-Z0-9_]{1,100}$/)).max(20),
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
      reviewOutcome: async (cell, evidence) => {
        const reviews = await review.request<
          Pick<import("../../src/negotiation-evaluation.js").NegotiationClaimReviews, "claims" | "reviews">
        >(
          "outcome",
          designDigest(cell.id),
          { cell, evidence },
          Math.min(Date.parse(grant.cutoffAt), Date.now() + 300000),
        );
        await persist("outcome-review", { cellId: cell.id, reviews });
        return reviews;
      },
    });
    return { ports, disconnect };
  } catch (error) {
    await disconnect();
    throw error;
  }
}
