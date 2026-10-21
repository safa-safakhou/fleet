import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import type { SkillLibrary, SkillTransition } from "../modules/skills/v1/library.js";
import {
  type SkillCandidate,
  SkillCandidateSchema,
  type SkillRef,
  SkillRefSchema,
  type SkillSummary,
  type SkillVersion,
  skillContentDigest,
} from "../modules/skills/v1/schema.js";
import { launchDigest } from "../platform/launch.js";
import type { SpecialistCharter, SpecialistScope } from "../platform/participant-state.js";
import type { Store } from "../store.js";

export class ScopedSkillRepository implements SkillLibrary {
  constructor(
    private store: Store,
    private bound: Pick<SpecialistScope, "instanceId" | "bindingId">,
    private guard: (db: PoolClient) => Promise<void> = async () => {},
  ) {}
  private scope(s: SpecialistScope) {
    if (s.instanceId !== this.bound.instanceId || s.bindingId !== this.bound.bindingId)
      throw new FleetError("SKILL_SCOPE_MISMATCH");
    return [s.instanceId, s.bindingId, s.specialistId];
  }
  private aad(ref: SkillRef, kind: string) {
    return `skill:${JSON.stringify([this.bound.instanceId, this.bound.bindingId, ref.id, ref.version, ref.digest])}:${kind}`;
  }
  private cutoff() {
    return new Date(this.store.now().getTime() - 30 * 86400000);
  }
  private async authorize(db: PoolClient, s: SpecialistScope) {
    this.scope(s);
    const r = (
      await db.query(
        "SELECT c.observation_consent,b.environment_id,b.environment_version FROM environment_bindings b JOIN agents a ON a.id=b.agent_id JOIN cohorts c ON c.id=a.cohort_id WHERE b.id=$1 AND b.state='active' FOR UPDATE OF c",
        [s.bindingId],
      )
    ).rows[0];
    if (!r) throw new FleetError("SKILL_SCOPE_MISMATCH");
    if (!r.observation_consent) throw new FleetError("CONSENT_REQUIRED");
    await this.guard(db);
    await db.query("SELECT id FROM environment_bindings WHERE id=$1 FOR UPDATE", [s.bindingId]);
    const state = (
      await db.query(
        "SELECT charter_cipher FROM specialist_states WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3",
        this.scope(s),
      )
    ).rows[0];
    if (!state) throw new FleetError("UNKNOWN_SPECIALIST");
    return {
      environment: { id: r.environment_id, version: r.environment_version },
      charter: this.store.vault.decrypt<SpecialistCharter>(
        state.charter_cipher,
        `specialist:${JSON.stringify(this.scope(s))}:charter:1`,
      ),
    };
  }
  private async support(db: PoolClient, s: SpecialistScope, ids: string[]) {
    const rows = (
      await db.query(
        "SELECT id,detail_cipher FROM architecture_scoped_evidence WHERE instance_id=$1 AND binding_id=$2 AND id=ANY($3::uuid[]) AND created_at>$4",
        [s.instanceId, s.bindingId, ids, this.cutoff()],
      )
    ).rows;
    if (rows.length !== new Set(ids).size) return null;
    const details = rows.map((r) =>
      this.store.vault.decrypt<{
        kind: string;
        detail?: { kind?: string; expiresAt?: string; detail?: { fulfilled?: boolean }; fulfilled?: boolean };
      }>(r.detail_cipher, `architecture-evidence:${s.instanceId}:${s.bindingId}:${r.id}`),
    );
    if (details.some((d) => d.detail?.expiresAt && new Date(d.detail.expiresAt) <= this.store.now())) return null;
    return details;
  }
  private args(s: SpecialistScope, ref: SkillRef) {
    this.scope(s);
    SkillRefSchema.parse(ref);
    return [s.instanceId, s.bindingId, ref.id, ref.version];
  }
  private async row(db: PoolClient, s: SpecialistScope, ref: SkillRef, visible = true) {
    const row = (
      await db.query(
        "SELECT v.* FROM skill_versions v WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3 AND version=$4 FOR UPDATE",
        this.args(s, ref),
      )
    ).rows[0];
    if (!row || row.digest !== ref.digest) throw new FleetError("SKILL_NOT_FOUND");
    if (
      visible &&
      row.author !== s.specialistId &&
      !(
        await db.query(
          "SELECT 1 FROM skill_adoptions WHERE instance_id=$1 AND binding_id=$2 AND specialist_id=$3 AND skill_id=$4 AND version=$5 AND digest=$6",
          [...this.scope(s), ref.id, ref.version, ref.digest],
        )
      ).rowCount
    )
      throw new FleetError("SKILL_NOT_ADOPTED");
    return row;
  }
  async propose(s: SpecialistScope, raw: SkillCandidate): Promise<SkillRef> {
    const body = SkillCandidateSchema.parse(raw),
      digest = skillContentDigest(body);
    return transaction(this.store.pool, async (db) => {
      const auth = await this.authorize(db, s);
      if (
        launchDigest(auth.environment) !== launchDigest(body.compatibility.environment) ||
        !body.compatibility.roles.includes(s.specialistId)
      )
        throw new FleetError("SKILL_INCOMPATIBLE");
      const support = await this.support(db, s, body.evidence.sourceIds);
      if (!support) throw new FleetError("SKILL_SUPPORT_UNAVAILABLE");
      const episode = launchDigest([...body.evidence.episodeIds].sort()),
        signature = launchDigest({
          parent: body.parent ?? null,
          purpose: body.purpose,
          procedure: body.procedure,
          inputs: body.inputs,
        });
      const duplicate = (
        await db.query(
          "SELECT skill_id,version,digest FROM skill_versions WHERE instance_id=$1 AND binding_id=$2 AND author=$3 AND episode_signature=$4 AND procedure_signature=$5",
          [...this.scope(s), episode, signature],
        )
      ).rows[0];
      if (duplicate) return { id: duplicate.skill_id, version: duplicate.version, digest: duplicate.digest };
      let id: string = randomUUID(),
        version = 1;
      if (body.parent) {
        const previous = await this.row(db, s, body.parent);
        if (previous.author !== s.specialistId) throw new FleetError("SKILL_AUTHOR_REQUIRED");
        id = body.parent.id;
        version =
          Number(
            (
              await db.query(
                "SELECT max(version)::int n FROM skill_versions WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3",
                [s.instanceId, s.bindingId, id],
              )
            ).rows[0].n,
          ) + 1;
      }
      const ref = { id, version, digest },
        outcomeSupport: SkillVersion["outcomeSupport"] = support.some(
          (e) =>
            (e.kind === "outcome" || e.kind === "specialist-outcome.v1") &&
            (e.detail?.fulfilled === true || e.detail?.detail?.fulfilled === true),
        )
          ? "observed_success"
          : support.some(
                (e) =>
                  (e.kind === "outcome" || e.kind === "specialist-outcome.v1") &&
                  (e.detail?.fulfilled === false || e.detail?.detail?.fulfilled === false),
              )
            ? "observed_failure"
            : "unproven";
      const summary: SkillSummary = {
        ref,
        author: s.specialistId,
        status: "candidate",
        purpose: body.purpose.summary,
        goalKinds: body.purpose.goalKinds,
        environment: body.compatibility.environment,
        roles: body.compatibility.roles,
        actionKeys: body.compatibility.actionKeys,
        representation: body.representation,
        published: false,
        outcomeSupport,
      };
      await db.query(
        "INSERT INTO skill_versions(instance_id,binding_id,skill_id,version,digest,author,status,body_cipher,summary_cipher,source_ids,episode_signature,procedure_signature,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'candidate',$7,$8,$9,$10,$11,$12,$12)",
        [
          s.instanceId,
          s.bindingId,
          id,
          version,
          digest,
          s.specialistId,
          this.store.vault.encrypt(body, this.aad(ref, "body")),
          this.store.vault.encrypt(summary, this.aad(ref, "summary")),
          body.evidence.sourceIds,
          episode,
          signature,
          this.store.now(),
        ],
      );
      return ref;
    });
  }
  async publish(s: SpecialistScope, ref: SkillRef) {
    await transaction(this.store.pool, async (db) => {
      await this.authorize(db, s);
      const r = await this.row(db, s, ref);
      if (r.author !== s.specialistId) throw new FleetError("SKILL_AUTHOR_REQUIRED");
      if (!r.body_cipher || !(await this.support(db, s, r.source_ids)))
        throw new FleetError("SKILL_SUPPORT_UNAVAILABLE");
      await db.query(
        "UPDATE skill_versions SET published=true,updated_at=$5 WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3 AND version=$4",
        [...this.args(s, ref), this.store.now()],
      );
    });
  }
  async adopt(s: SpecialistScope, ref: SkillRef) {
    await transaction(this.store.pool, async (db) => {
      const auth = await this.authorize(db, s),
        r = await this.row(db, s, ref, false);
      if (!r.published && r.author !== s.specialistId) throw new FleetError("SKILL_NOT_PUBLISHED");
      if (!["advisory", "guarded"].includes(r.status)) throw new FleetError("SKILL_NOT_ADOPTABLE");
      const b = SkillCandidateSchema.parse(this.store.vault.decrypt(r.body_cipher, this.aad(ref, "body")));
      if (
        !b.compatibility.roles.includes(s.specialistId) ||
        b.compatibility.actionKeys.some((k) => !auth.charter.allowedActions.includes(k))
      )
        throw new FleetError("SKILL_INCOMPATIBLE");
      if (!(await this.support(db, s, r.source_ids))) throw new FleetError("SKILL_SUPPORT_UNAVAILABLE");
      await db.query("INSERT INTO skill_adoptions VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", [
        ...this.scope(s),
        ref.id,
        ref.version,
        ref.digest,
        this.store.now(),
      ]);
    });
  }
  async loadSelected(s: SpecialistScope, refs: SkillRef[]): Promise<SkillVersion[]> {
    if (refs.length > 2) throw new FleetError("SKILL_BODY_LIMIT");
    const result = await transaction(this.store.pool, async (db) => {
      await this.authorize(db, s);
      const result: SkillVersion[] = [];
      for (const ref of refs) {
        const r = await this.row(db, s, ref);
        if (!r.body_cipher || new Date(r.created_at) <= this.cutoff() || !(await this.support(db, s, r.source_ids))) {
          await db.query(
            "UPDATE skill_versions SET status='suspended',body_cipher=NULL,summary_cipher=NULL WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3 AND version=$4",
            this.args(s, ref),
          );
          return null;
        }
        const summary = this.store.vault.decrypt<SkillSummary>(r.summary_cipher, this.aad(ref, "summary"));
        result.push({
          ref,
          author: r.author,
          body: SkillCandidateSchema.parse(this.store.vault.decrypt(r.body_cipher, this.aad(ref, "body"))),
          status: r.status,
          evaluationId: r.evaluation_id ?? undefined,
          published: r.published,
          createdAt: new Date(r.created_at).toISOString(),
          outcomeSupport: summary.outcomeSupport,
        });
      }
      return result;
    });
    if (!result) throw new FleetError("SKILL_SUPPORT_UNAVAILABLE");
    return result;
  }
  async retrieve(s: SpecialistScope, query: { goal: string; event: string; limit: number }): Promise<SkillSummary[]> {
    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 8 ||
      query.goal.length > 8000 ||
      query.event.length > 8000
    )
      throw new FleetError("SKILL_RETRIEVAL_LIMIT");
    return transaction(this.store.pool, async (db) => {
      await this.authorize(db, s);
      const rows = (
        await db.query(
          "SELECT v.* FROM skill_versions v WHERE v.instance_id=$1 AND v.binding_id=$2 AND v.status IN('advisory','guarded') AND v.summary_cipher IS NOT NULL AND v.created_at>$4 AND (v.author=$3 OR EXISTS(SELECT 1 FROM skill_adoptions a WHERE a.instance_id=v.instance_id AND a.binding_id=v.binding_id AND a.specialist_id=$3 AND a.skill_id=v.skill_id AND a.version=v.version AND a.digest=v.digest)) ORDER BY v.created_at DESC,v.skill_id LIMIT 256",
          [...this.scope(s), this.cutoff()],
        )
      ).rows;
      const summaries: SkillSummary[] = [];
      for (const r of rows) {
        if (!(await this.support(db, s, r.source_ids))) continue;
        const ref = { id: r.skill_id, version: r.version, digest: r.digest };
        summaries.push({
          ...this.store.vault.decrypt<SkillSummary>(r.summary_cipher, this.aad(ref, "summary")),
          status: r.status,
          published: r.published,
        });
      }
      const words = new Set((query.goal + " " + query.event).toLowerCase().match(/[a-z0-9_-]+/g) ?? []),
        rank = (v: SkillSummary) =>
          [...words].filter((w) => (v.purpose + " " + v.goalKinds.join(" ")).toLowerCase().includes(w)).length;
      return summaries.sort((a, b) => rank(b) - rank(a) || a.ref.id.localeCompare(b.ref.id)).slice(0, query.limit);
    });
  }
  /** Trusted composition/evaluator only; deliberately absent from the engine-facing library port. */
  async transition(s: SpecialistScope, ref: SkillRef, t: SkillTransition) {
    await transaction(this.store.pool, async (db) => {
      await this.authorize(db, s);
      const r = await this.row(db, s, ref);
      if (r.author !== s.specialistId || r.status !== t.expectedStatus) throw new FleetError("SKILL_STATUS_CONFLICT");
      if (!r.body_cipher || !(await this.support(db, s, r.source_ids)))
        throw new FleetError("SKILL_SUPPORT_UNAVAILABLE");
      if (t.nextStatus === "guarded") {
        const e =
          t.evaluationId &&
          (
            await db.query(
              "SELECT * FROM skill_evaluations WHERE id=$1 AND instance_id=$2 AND binding_id=$3 AND skill_id=$4 AND version=$5 AND digest=$6 AND eligible_mode='guarded'",
              [t.evaluationId, s.instanceId, s.bindingId, ref.id, ref.version, ref.digest],
            )
          ).rows[0];
        if (!e) throw new FleetError("TRUSTED_SKILL_EVALUATION_REQUIRED");
      }
      await db.query(
        "UPDATE skill_versions SET status=$5,evaluation_id=$6,updated_at=$7 WHERE instance_id=$1 AND binding_id=$2 AND skill_id=$3 AND version=$4",
        [...this.args(s, ref), t.nextStatus, t.evaluationId ?? null, this.store.now()],
      );
    });
  }
}
