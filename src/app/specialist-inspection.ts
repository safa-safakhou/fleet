import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { type Data, FleetError } from "../domain.js";
import type { Store } from "../store.js";
/** Authenticated local operator reads only; no engine, game session, worker or model port. */
export class SpecialistInspection {
  constructor(private store: Store) {}
  async list() {
    return {
      instances: (
        await this.store.pool.query(
          "SELECT i.instance_id AS id,i.profile_id AS profile,i.profile_version AS version,c.name AS cohort,c.observation_consent AS consent FROM specialist_instances i JOIN environment_bindings b ON b.id=i.binding_id JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id ORDER BY i.created_at DESC,i.instance_id LIMIT 100",
        )
      ).rows,
      coverage: { limit: 100, complete: false },
    };
  }
  private async instance(db: PoolClient, id: string) {
    if (!id || id.length > 2000) throw new FleetError("INVALID_INSTANCE", true);
    const r = (
      await db.query(
        "SELECT i.*,c.id AS cohort_id,c.observation_consent,c.name,p.non_model_limits FROM specialist_instances i JOIN environment_bindings b ON b.id=i.binding_id JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id LEFT JOIN cohort_engine_profiles p ON p.cohort_id=c.id WHERE i.instance_id=$1 FOR SHARE OF c",
        [id],
      )
    ).rows[0];
    if (!r) throw new FleetError("INSTANCE_NOT_FOUND", true);
    return r;
  }
  async read(id: string, kind: "specialists" | "skills", shareable = false) {
    return transaction(this.store.pool, async (db) => {
      const instance = await this.instance(db, id),
        binding = instance.binding_id,
        cutoff = new Date(this.store.now().getTime() - 30 * 86400000),
        profile = { id: instance.profile_id as string, version: instance.profile_version as string };
      const base = {
        schemaVersion: "fleet.specialist-inspection.v1",
        asOf: this.store.now().toISOString(),
        profile,
        consent: Boolean(instance.observation_consent),
        coverage: {
          complete: false,
          participantLimit: 4,
          recordLimit: 32,
          detailRetentionDays: 30,
          privateDetails: !shareable && instance.observation_consent ? "retained-only" : "withheld",
        },
      };
      if (shareable || !instance.observation_consent) return { ...base, scope: shareable ? "shareable" : "private" };
      const identity = { instanceId: id, bindingId: binding, cohortId: instance.cohort_id };
      const decrypt = (cipher: string | null, aad: string) =>
        cipher ? this.store.vault.decrypt<Data>(cipher, aad) : null;
      const usable = (e: Data | null) => {
        const expiry = (e?.detail as Data | undefined)?.expiresAt;
        return (
          !expiry ||
          (typeof expiry === "string" &&
            Number.isFinite(Date.parse(expiry)) &&
            Date.parse(expiry) > this.store.now().getTime())
        );
      };
      const retained = async (ids: string[]) => {
        const rows = (
          await db.query(
            "SELECT id,detail_cipher FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND id=ANY($3::uuid[]) AND created_at>$4 AND detail_cipher IS NOT NULL",
            [id, binding, ids, cutoff],
          )
        ).rows;
        return (
          rows.length === new Set(ids).size &&
          rows.every((r) => usable(decrypt(r.detail_cipher, `architecture-evidence:${id}:${binding}:${r.id}`)))
        );
      };
      if (kind === "skills") {
        const rows = (
            await db.query(
              "SELECT * FROM skill_versions WHERE instance_id=$1 AND binding_id=$2 ORDER BY created_at DESC,skill_id,version DESC LIMIT 32",
              [id, binding],
            )
          ).rows,
          skills = [];
        for (const r of rows) {
          const available = r.summary_cipher && new Date(r.created_at) > cutoff && (await retained(r.source_ids));
          const ref = { id: r.skill_id, version: r.version, digest: r.digest },
            summary = available
              ? decrypt(
                  r.summary_cipher,
                  `skill:${JSON.stringify([id, binding, ref.id, ref.version, ref.digest])}:summary`,
                )
              : null;
          const evaluations = (
            await db.query(
              "SELECT id,eligible_mode,policy_version,dependencies_digest,detail_cipher,created_at FROM skill_evaluations WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3 AND version=$4 ORDER BY created_at DESC LIMIT 4",
              [id, binding, ref.id, ref.version],
            )
          ).rows;
          skills.push({
            ref,
            status: r.status,
            author: r.author,
            published: r.published,
            summary,
            sourceIds: available ? r.source_ids : [],
            adoptedBy: (
              await db.query(
                "SELECT specialist_id FROM skill_adoptions WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3 AND version=$4 AND digest=$5 ORDER BY specialist_id LIMIT 4",
                [id, binding, ref.id, ref.version, ref.digest],
              )
            ).rows.map((x) => x.specialist_id),
            evaluations: evaluations.map((e) => ({
              id: e.id,
              mode: e.eligible_mode,
              policyVersion: e.policy_version,
              dependenciesDigest: e.dependencies_digest,
              detail:
                available && new Date(e.created_at) > cutoff
                  ? decrypt(e.detail_cipher, `skill-evaluation:${id}:${binding}:${e.id}`)
                  : null,
            })),
            privateUnavailable: !available,
          });
        }
        const result = {
          ...base,
          ...identity,
          skills,
          meaning:
            "Qualification is synthetic host evidence. Adoption, command admission and fulfilled outcomes are separate facts.",
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 512000) throw new FleetError("INSPECTION_DETAIL_LIMIT", true);
        return result;
      }
      const rows = (
          await db.query(
            "SELECT * FROM specialist_states WHERE instance_id=$1 AND binding_id=$2 ORDER BY specialist_id LIMIT 4",
            [id, binding],
          )
        ).rows,
        participants = [];
      for (const r of rows) {
        const scope = [id, binding, r.specialist_id],
          available = r.state_cipher && new Date(r.updated_at) > cutoff && (await retained(r.support_ids));
        participants.push({
          id: r.specialist_id,
          version: r.version,
          charter: decrypt(r.charter_cipher, `specialist:${JSON.stringify(scope)}:charter:1`),
          state: available ? decrypt(r.state_cipher, `specialist:${JSON.stringify(scope)}:state:1`) : null,
          privateUnavailable: !available && r.version > 0,
        });
      }
      const wakes = (
        await db.query(
          "SELECT id,specialist_id,status,condition_cipher,updated_at FROM specialist_wakes WHERE instance_id=$1 AND binding_id=$2 ORDER BY updated_at DESC,id LIMIT 32",
          [id, binding],
        )
      ).rows.map((r) => ({
        id: r.id,
        specialistId: r.specialist_id,
        status: r.status,
        condition:
          new Date(r.updated_at) > cutoff
            ? decrypt(r.condition_cipher, `specialist-wake:${id}:${binding}:${r.specialist_id}:${r.id}`)
            : null,
      }));
      const conflicts = (
        await db.query(
          "SELECT id,round,status,detail_cipher,updated_at FROM specialist_conflicts WHERE instance_id=$1 AND binding_id=$2 ORDER BY updated_at DESC,id LIMIT 32",
          [id, binding],
        )
      ).rows.map((r) => ({
        id: r.id,
        round: r.round,
        status: r.status,
        detail:
          new Date(r.updated_at) > cutoff
            ? decrypt(r.detail_cipher, `specialist-conflict:${id}:${binding}:${r.id}`)
            : null,
      }));
      const deliveries = (
        await db.query(
          "SELECT id,recipient,status,source_ref,root_id,depth,detail_cipher,received_at FROM specialist_deliveries WHERE instance_id=$1 AND binding_id=$2 ORDER BY sequence DESC LIMIT 32",
          [id, binding],
        )
      ).rows.map((r) => ({
        id: r.id,
        recipient: r.recipient,
        status: r.status,
        sourceRef: r.source_ref,
        rootId: r.root_id,
        depth: r.depth,
        event:
          new Date(r.received_at) > cutoff
            ? decrypt(r.detail_cipher, `specialist-delivery:${id}:${binding}:${r.recipient}:${r.id}`)
            : null,
      }));
      const originals = (
        await db.query(
          "SELECT id,kind,detail_cipher,created_at FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND kind IN('specialist-outcome.v1','specialist-promise.v1','specialist-observation.v1') AND created_at>$3 ORDER BY created_at DESC,id LIMIT 32",
          [id, binding, cutoff],
        )
      ).rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        detail: (() => {
          const e = decrypt(r.detail_cipher, `architecture-evidence:${id}:${binding}:${r.id}`);
          return usable(e) ? e : null;
        })(),
      }));
      const receipts = (
        await db.query(
          "SELECT i.command_id,i.specialist_id,i.status,p.state AS phase,r.outcome,r.command_id IS NOT NULL AS receipt_present FROM specialist_intents i LEFT JOIN platform_commands p ON p.command_id=i.command_id LEFT JOIN specialist_action_results r ON r.command_id=i.command_id WHERE i.instance_id=$1 AND i.binding_id=$2 ORDER BY i.created_at DESC,i.command_id LIMIT 32",
          [id, binding],
        )
      ).rows;
      const invocations = (
        await db.query(
          "SELECT id,specialist_id,skill_id,skill_version,skill_digest,goal_id,state,node_index,reason,effective_limits FROM skill_invocations WHERE instance_id=$1 AND binding_id=$2 ORDER BY started_at DESC,id LIMIT 32",
          [id, binding],
        )
      ).rows;
      const work = (
        await db.query(
          "SELECT kind,sum(units)::text reserved,sum(actual_units)::text actual FROM skill_work_reservations w JOIN skill_invocations i ON i.id=w.invocation_id WHERE i.instance_id=$1 AND i.binding_id=$2 GROUP BY kind ORDER BY kind",
          [id, binding],
        )
      ).rows;
      const hostWork = (
        await db.query(
          "SELECT kind,sum(units)::text reserved,CASE WHEN bool_and(actual_known) THEN sum(actual_units)::text ELSE NULL END actual FROM specialist_turn_work WHERE binding_id=$1 GROUP BY kind ORDER BY kind",
          [binding],
        )
      ).rows;
      const result = {
        ...base,
        ...identity,
        participants,
        wakes,
        conflicts,
        deliveries,
        originals,
        receipts,
        invocations,
        deliveredEvidence: (
          await db.query(
            "SELECT e.id,e.turn_id,e.label,e.detail_cipher FROM turn_events e JOIN architecture_operations o ON o.turn_id=e.turn_id WHERE o.instance_id=$1 AND o.binding_id=$2 AND e.occurred_at>$3 AND e.label IN('Specialist evidence delivered','Guarded routine checkpoint','Guarded routine returned to reasoning','Skill candidates persisted') ORDER BY e.sequence DESC LIMIT 32",
            [id, binding, cutoff],
          )
        ).rows.map((r) => ({
          id: r.id,
          turnId: r.turn_id,
          label: r.label,
          detail: decrypt(r.detail_cipher, `turn-event:${r.id}`),
        })),
        learningOperations: (
          await db.query(
            "SELECT operation_id,specialist_id,refs,allocation_ids FROM skill_learning_operations WHERE instance_id=$1 AND binding_id=$2 AND created_at>$3 ORDER BY created_at DESC LIMIT 32",
            [id, binding, cutoff],
          )
        ).rows,
        allocations: (
          await db.query(
            "SELECT l.id,l.turn_id,l.status,l.tokens AS reserved_tokens,l.input_tokens,l.output_tokens FROM compute_ledger l JOIN architecture_operations o ON o.turn_id=l.turn_id WHERE o.instance_id=$1 AND o.binding_id=$2 ORDER BY l.created_at DESC,l.id LIMIT 32",
            [id, binding],
          )
        ).rows,
        work: { parentLimits: instance.non_model_limits, invocation: work, host: hostWork },
        meaning:
          "A receipt proves admission only. Original observations and actual later outcomes are shown separately. Text from models or peers is untrusted.",
      };
      if (Buffer.byteLength(JSON.stringify(result)) > 512000) throw new FleetError("INSPECTION_DETAIL_LIMIT", true);
      return result;
    });
  }
}
