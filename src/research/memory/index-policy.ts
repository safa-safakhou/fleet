import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import type { StepJournal } from "../broker/steps.js";
import type { RunScope } from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";
import { namespaceFor } from "./schema.js";
export class IndexPolicy {
  constructor(
    readonly store: Store,
    readonly journal: StepJournal,
  ) {}
  async context(scope: RunScope, db: PoolClient) {
    await this.journal.assertCurrent(scope, db);
    const manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest),
      namespace = namespaceFor(scope, manifest);
    const row = (
      await db.query(
        "SELECT c.id,c.observation_consent,c.observation_consent_version::text version FROM cohorts c JOIN turns t ON t.cohort_id=c.id WHERE t.id=$1 FOR SHARE OF c",
        [scope.turnId],
      )
    ).rows[0];
    return {
      manifest,
      namespace,
      cohortId: row.id as string,
      consent: row.observation_consent as boolean,
      consentVersion: row.version as string,
    };
  }
  /** Trusted installation port only; never exposed to an agent RPC. */
  async grant(scope: RunScope, policyId: string) {
    return transaction(this.store.pool, async (db) => {
      const c = await this.context(scope, db);
      if (!c.consent || c.manifest.memory.indexPolicy !== "consented" || c.manifest.memory.indexConsentRef !== policyId)
        throw new FleetError("INDEX_PERMISSION_REQUIRED", true);
      await db.query(
        "INSERT INTO research_index_grants(id,namespace,cohort_id,consent_version,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [policyId, c.namespace, c.cohortId, c.consentVersion, this.store.now()],
      );
    });
  }
  async assertAllowed(scope: RunScope, policyId: string, client?: PoolClient): Promise<void> {
    if (!client) return transaction(this.store.pool, (db) => this.assertAllowed(scope, policyId, db));
    const c = await this.context(scope, client);
    const grant = (
      await client.query("SELECT 1 FROM research_index_grants WHERE id=$1 AND namespace=$2 AND consent_version=$3", [
        policyId,
        c.namespace,
        c.consentVersion,
      ])
    ).rowCount;
    if (
      !c.consent ||
      c.manifest.memory.indexPolicy !== "consented" ||
      c.manifest.memory.indexConsentRef !== policyId ||
      !grant
    )
      throw new FleetError("INDEX_PERMISSION_REQUIRED", true);
  }
  async revoke(scope: RunScope, policyId: string) {
    await transaction(this.store.pool, async (db) => {
      const c = await this.context(scope, db);
      await db.query("DELETE FROM research_index_grants WHERE id=$1 AND namespace=$2", [policyId, c.namespace]);
    });
  }
  async restricted<T>(scope: RunScope, policyId: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
    return transaction(this.store.pool, async (db) => {
      await this.assertAllowed(scope, policyId, db);
      const c = await this.context(scope, db),
        ticket = randomUUID();
      await db.query("INSERT INTO research_index_tickets VALUES($1,pg_current_xact_id()::text,$2,$3,$4)", [
        ticket,
        c.namespace,
        policyId,
        this.store.now(),
      ]);
      await db.query("SELECT set_config('fleet.research.ticket',$1,true)", [ticket]);
      await db.query("SET LOCAL ROLE fleet_research_index");
      const result = await work(db);
      await db.query("RESET ROLE");
      await db.query("DELETE FROM research_index_tickets WHERE token=$1", [ticket]);
      return result;
    });
  }
}
