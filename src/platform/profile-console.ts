import { z } from "zod";
import { transaction } from "../db.js";
import { Draft, FleetError, safeCode } from "../domain.js";
import type { Store } from "../store.js";
import type { EngineRegistry } from "./engine-registry.js";
import { type EnvironmentRegistry, requireCapabilities, sameEnvironment } from "./environment-registry.js";
import { WakePolicySchema } from "./event-intake.js";
import type { TaskStore } from "./tasks.js";
export const ProfileRef = z.object({ id: z.string().min(1).max(100), version: z.string().min(1).max(40) }).strict();
export class ProfileConsole {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private environments: EnvironmentRegistry,
    private engines: EngineRegistry,
  ) {}
  preview(raw: unknown) {
    const profile = ProfileRef.parse(raw),
      adapter = this.environments.resolve(this.environments.selected);
    try {
      const engine = this.engines.resolve(profile);
      requireCapabilities(adapter, engine.requiredCapabilities, engine.requiredSchemas);
      return {
        profile,
        environment: adapter.ref,
        compatible: true,
        code: "COMPATIBLE",
        coverage:
          "Capability compatibility only; real-provider/release qualification is separate. Drafts never create game accounts or call models.",
      };
    } catch (error) {
      if (!(error instanceof FleetError)) throw error;
      return {
        profile,
        environment: adapter.ref,
        compatible: false,
        code: safeCode(error),
        coverage: "No environment connection or inference attempted.",
      };
    }
  }
  catalog() {
    return {
      capabilities: this.environments.resolve(this.environments.selected).capabilities,
      environment: this.environments.selected,
      profiles: this.engines.list().map((e) => this.preview(e.ref)),
    };
  }
  async createProfileDraft(input: unknown) {
    const value = Draft.extend({ profile: ProfileRef, wakePolicy: WakePolicySchema.optional() }).parse(input),
      { profile, wakePolicy, ...draft } = value;
    const preview = this.preview(profile);
    if (!preview.compatible) throw new FleetError(preview.code);
    if (
      wakePolicy &&
      (!["reactive-basic", "reactive-cognition", "specialist-coordinator"].includes(profile.id) ||
        this.environments.resolve(this.environments.selected).capabilities.events === "none")
    )
      throw new FleetError("UNSUPPORTED_CAPABILITY");
    return transaction(this.store.pool, async (db) => {
      const { id } = await this.store.create(draft, db);
      await this.tasks.enroll(id, profile, !wakePolicy?.enabled, db);
      await db.query("UPDATE cohort_engine_profiles SET environment_ref=$2 WHERE cohort_id=$1", [
        id,
        this.environments.selected,
      ]);
      if (wakePolicy)
        await db.query("INSERT INTO cohort_wake_policies(cohort_id,policy,created_at) VALUES($1,$2,$3)", [
          id,
          wakePolicy,
          this.store.now(),
        ]);
      await this.store.audit(db, id, "profile.draft.created", { profile, environment: this.environments.selected });
      return { cohortId: id, profile };
    });
  }
  async prepareStart(cohortId: string) {
    const row = (
      await this.store.pool.query(
        "SELECT profile_id,profile_version,environment_ref FROM cohort_engine_profiles WHERE cohort_id=$1",
        [cohortId],
      )
    ).rows[0];
    if (!row) return;
    if (row.environment_ref && !sameEnvironment(row.environment_ref, this.environments.selected))
      throw new FleetError("ENVIRONMENT_NOT_SELECTED");
    const preview = this.preview({ id: row.profile_id, version: row.profile_version });
    if (!preview.compatible) throw new FleetError(preview.code);
    const cohort = await this.store.cohort(cohortId);
    if (["stopped", "finished"].includes(cohort.state)) throw new FleetError("TERMINAL_COHORT");
    if (!cohort.model || !cohort.budget) throw new FleetError("MODEL_AND_BUDGET_REQUIRED");
    if (cohort.budget.deadlineAt && new Date(cohort.budget.deadlineAt) <= this.store.now())
      throw new FleetError("DEADLINE_PASSED");
    const adapter = this.environments.resolve(this.environments.selected);
    const agents = (
      await this.store.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [cohortId])
    ).rows;
    for (const a of agents) {
      if (await this.tasks.bindings.forAgent(a.id)) continue;
      if (!adapter.enrollment) throw new FleetError("ENVIRONMENT_ENROLLMENT_UNSUPPORTED");
      await adapter.enrollment.attachExisting(a.id);
    }
  }
}
