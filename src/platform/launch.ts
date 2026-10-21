import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../db.js";
import { Draft, FleetError, safeCode } from "../domain.js";
import type { Store } from "../store.js";
import type { ArchitectureRegistry } from "./architecture.js";
import { ArchitectureRefSchema } from "./architecture-schema.js";
import type { EngineRegistry } from "./engine-registry.js";
import { type EnvironmentRegistry, requireCapabilities, sameEnvironment } from "./environment-registry.js";
import { WakePolicySchema } from "./event-intake.js";
import {
  type LaunchCheck,
  LaunchDraftRequest,
  type LaunchSpec,
  LaunchSpecSchema,
  LaunchStartRequest,
  LaunchUpdateRequest,
} from "./launch-contracts.js";
import { SpecialistPresetSchema } from "./participant-state.js";
import type { TaskStore } from "./tasks.js";

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b, "en"))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
export const launchDigest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)) ?? "null")
    .digest("hex");
type DraftResult = { draftId: string; digest: string };
type StartResult = { cohortId: string; digest: string; state: string };
export class LaunchService {
  constructor(
    private store: Store,
    private tasks: TaskStore,
    private environments: EnvironmentRegistry,
    private architectures: ArchitectureRegistry,
    private options: {
      liveAllowed: boolean;
      providerConfigured?: (model: LaunchSpec["model"]) => boolean;
      compatibilityEngines?: EngineRegistry;
    },
  ) {}
  catalog() {
    return this.architectures.list();
  }
  compatibilityPreview(raw: unknown) {
    const profile = ArchitectureRefSchema.parse(raw),
      adapter = this.environments.resolve(this.environments.selected);
    try {
      const engine = this.options.compatibilityEngines?.resolve(profile);
      if (!engine) throw new FleetError("UNSUPPORTED_ENGINE");
      requireCapabilities(adapter, engine.requiredCapabilities, engine.requiredSchemas);
      return {
        profile,
        environment: adapter.ref,
        compatible: true,
        code: "COMPATIBLE",
        triggers: this.architectures.resolve(profile).manifest.triggers,
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
  compatibilityCatalog() {
    return {
      capabilities: this.environments.resolve(this.environments.selected).capabilities,
      environment: this.environments.selected,
      profiles: (this.options.compatibilityEngines?.list() ?? []).map((e) => this.compatibilityPreview(e.ref)),
    };
  }
  async compatibilityDraft(input: unknown) {
    const value = Draft.extend({ profile: ArchitectureRefSchema, wakePolicy: WakePolicySchema.optional() }).parse(
        input,
      ),
      { profile, wakePolicy, ...draft } = value;
    const preview = this.compatibilityPreview(profile);
    if (!preview.compatible) throw new FleetError(preview.code);
    if (
      wakePolicy &&
      (!this.architectures.resolve(profile).manifest.triggers.includes("event") ||
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

  private spec(raw: unknown) {
    const spec = LaunchSpecSchema.parse(raw),
      prepare = this.architectures.resolve(spec.architecture).prepareModel;
    return prepare ? LaunchSpecSchema.parse({ ...spec, model: prepare(spec.model) }) : spec;
  }
  async check(raw: unknown, db: Store["pool"] | PoolClient = this.store.pool): Promise<LaunchCheck> {
    const parsed = LaunchSpecSchema.safeParse(raw),
      checks: LaunchCheck["checks"] = [];
    let digest = launchDigest(raw);
    const add = (
      area: LaunchCheck["checks"][number]["area"],
      status: LaunchCheck["checks"][number]["status"],
      code: string,
      detail: string,
    ) => checks.push({ area, status, code, detail });
    if (!parsed.success)
      return {
        valid: false,
        ready: false,
        digest,
        checks: [
          {
            area: "configuration",
            status: "fail",
            code: "INVALID_LAUNCH_SPEC",
            detail: "Launch specification does not match the supported schema.",
          },
        ],
      };
    let spec = parsed.data;
    try {
      spec = this.spec(spec);
    } catch (e) {
      return {
        valid: false,
        ready: false,
        digest,
        checks: [
          {
            area: "configuration",
            status: "fail",
            code: safeCode(e),
            detail: "Unsupported exact architecture or model configuration.",
          },
        ],
      };
    }
    digest = launchDigest(spec);
    try {
      const definition = this.architectures.resolve(spec.architecture),
        issues = this.architectures.validate(spec.architecture, spec.architectureConfig, {
          model: spec.model,
          budget: spec.budget,
        });
      if (issues.length) throw new FleetError(issues[0].code);
      if (spec.preset && !definition.manifest.presets.some((p) => p.id === spec.preset))
        throw new FleetError("UNSUPPORTED_PRESET");
      if (spec.wakePolicy?.enabled && !definition.manifest.triggers.includes("event"))
        throw new FleetError("UNSUPPORTED_TRIGGER");
      add("configuration", "pass", "CONFIGURATION_VALID", "Registered exact version and configuration validated.");
      if (!sameEnvironment(spec.environment, this.environments.selected))
        throw new FleetError("ENVIRONMENT_NOT_SELECTED");
      const adapter = this.environments.resolve(spec.environment);
      if (
        definition.manifest.modules.some((m) => m.id === "skills") &&
        spec.architectureConfig.skillMode === "guarded"
      ) {
        if (!spec.nonModelLimits) throw new FleetError("PARENT_WORK_LIMITS_REQUIRED");
        if (!adapter.skillSupport) throw new FleetError("GUARDED_SKILLS_UNSUPPORTED");
      }
      requireCapabilities(
        adapter,
        definition.manifest.requirements.capabilities,
        definition.manifest.requirements.schemas,
      );
      if (spec.wakePolicy?.enabled && adapter.capabilities.events === "none")
        throw new FleetError("UNSUPPORTED_CAPABILITY");
      if (definition.manifest.modules.some((m) => m.id === "participant-state" && m.version === "1")) {
        const preset = adapter.specialistPresets?.find((p) => p.id === spec.architectureConfig.preset);
        if (!preset) throw new FleetError("SPECIALIST_PRESET_REQUIRED");
        if (!SpecialistPresetSchema.safeParse(preset).success) throw new FleetError("INVALID_SPECIALIST_PRESET");
      }
      add("environment", "pass", "ENVIRONMENT_COMPATIBLE", "Local advertised capabilities satisfy the manifest.");
    } catch (e) {
      add(
        checks.length ? "environment" : "configuration",
        "fail",
        safeCode(e),
        "Unsupported local configuration or environment.",
      );
    }
    const actors = (
      await db.query<{ id: string; cohort_id: string; credential_state: string; state: string }>(
        "SELECT id,cohort_id,credential_state,state FROM agents WHERE id=ANY($1::uuid[])",
        [spec.accounts.agentIds],
      )
    ).rows;
    const cohortIds = [...new Set(actors.map((a) => a.cohort_id))];
    if (actors.length !== spec.accounts.agentIds.length || cohortIds.length !== 1)
      add("credentials", "fail", "ACCOUNTS_INCOMPLETE", "Select the complete existing roster from one cohort.");
    else {
      const cohort = await this.store.cohort(cohortIds[0], db);
      if (
        this.architectures
          .resolve(spec.architecture)
          .manifest.modules.some((m) => m.id === "participant-state" && m.version === "1") &&
        !cohort.observation_consent
      )
        add(
          "credentials",
          "fail",
          "CONSENT_REQUIRED",
          "Persistent private goals and memory require observation consent.",
        );
      const bound = (
        await db.query(
          "SELECT agent_id,environment_id,environment_version,instance_id FROM environment_bindings WHERE agent_id=ANY($1::uuid[]) AND state='active'",
          [spec.accounts.agentIds],
        )
      ).rows;
      if (
        cohort.count !== actors.length ||
        actors.some((a) => a.credential_state !== "ready" || !["ready", "paused"].includes(a.state)) ||
        bound.length !== actors.length ||
        bound.some(
          (b) =>
            !sameEnvironment(spec.environment, {
              id: b.environment_id,
              version: b.environment_version,
              instanceId: b.instance_id,
            }),
        )
      )
        add(
          "credentials",
          "fail",
          "ACCOUNTS_INCOMPLETE",
          "Saved actor bindings or credentials are not ready for this exact environment.",
        );
      else
        add(
          "credentials",
          "pass",
          "CREDENTIALS_LOCALLY_READY",
          "Saved bindings are ready; external health was not probed.",
        );
      if (["stopped", "finished"].includes(cohort.state))
        add("configuration", "fail", "TERMINAL_COHORT", "Terminal cohorts cannot be restarted.");
      else if (!["draft", "paused"].includes(cohort.state))
        add("configuration", "fail", "COHORT_NOT_EDITABLE", "Launch requires an inactive cohort.");
      const consumed = (
        await db.query(
          "SELECT 1 FROM turns WHERE cohort_id=$1 UNION ALL SELECT 1 FROM platform_tasks WHERE cohort_id=$1 UNION ALL SELECT 1 FROM compute_ledger WHERE cohort_id=$1 LIMIT 1",
          [cohort.id],
        )
      ).rowCount;
      if (consumed) add("configuration", "fail", "CONSUMED_CONFIG_IMMUTABLE", "Consumed configurations are immutable.");
    }
    if (spec.budget.deadlineAt && new Date(spec.budget.deadlineAt) <= this.store.now())
      add("allowance", "fail", "DEADLINE_PASSED", "The declared allowance deadline has passed.");
    else
      add(
        "allowance",
        "pass",
        "ALLOWANCE_LOCALLY_VALID",
        "Declared limits cover one call; runtime admission rechecks actual remaining allowance.",
      );
    if (this.options.providerConfigured?.(spec.model))
      add(
        "provider",
        "unknown",
        "PROVIDER_HEALTH_UNKNOWN",
        "Provider configuration exists; no external health request was made.",
      );
    else add("provider", "fail", "PROVIDER_NOT_CONFIGURED", "The selected provider has no local configuration.");
    add(
      "qualification",
      "unknown",
      "QUALIFICATION_SEPARATE",
      "Local readiness does not establish real-provider or release qualification.",
    );
    add(
      "execution",
      this.options.liveAllowed ? "pass" : "fail",
      this.options.liveAllowed ? "EXECUTION_LOCALLY_ENABLED" : "LIVE_EXECUTION_DISABLED",
      "The launcher never changes the execution flag.",
    );
    return {
      valid: !checks.some((c) => c.status === "fail" && ["configuration", "environment"].includes(c.area)),
      ready: !checks.some((c) => c.status === "fail"),
      digest,
      checks,
    };
  }
  private async idempotent<T>(
    db: PoolClient,
    requestId: string,
    kind: "draft" | "start",
    payload: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,19281500))", [requestId]);
    const digest = launchDigest(payload),
      old = (await db.query("SELECT * FROM architecture_launch_requests WHERE request_id=$1", [requestId])).rows[0];
    if (old) {
      if (old.kind !== kind || old.payload_digest !== digest) throw new FleetError("IDEMPOTENCY_CONFLICT");
      return old.result as T;
    }
    const result = await work();
    await db.query("INSERT INTO architecture_launch_requests VALUES($1,$2,$3,$4,$5)", [
      requestId,
      kind,
      digest,
      result,
      this.store.now(),
    ]);
    return result;
  }
  async draft(raw: unknown): Promise<DraftResult> {
    const input = LaunchDraftRequest.parse(raw);
    input.spec = this.spec(input.spec);
    return transaction(this.store.pool, (db) =>
      this.idempotent(db, input.requestId, "draft", input.spec, async () => {
        const check = await this.check(input.spec, db);
        if (!check.valid)
          throw new FleetError(check.checks.find((c) => c.status === "fail")?.code ?? "INVALID_LAUNCH_SPEC");
        const id = randomUUID();
        await db.query(
          "INSERT INTO architecture_launch_drafts(id,spec,digest,created_at,updated_at) VALUES($1,$2,$3,$4,$4)",
          [id, input.spec, check.digest, this.store.now()],
        );
        return { draftId: id, digest: check.digest };
      }),
    );
  }
  async update(raw: unknown): Promise<{ digest: string }> {
    const input = LaunchUpdateRequest.parse(raw);
    input.spec = this.spec(input.spec);
    return transaction(this.store.pool, async (db) => {
      const d = await this.lockDraft(db, input.draftId, input.expectedDigest);
      const check = await this.check(input.spec, db);
      if (!check.valid)
        throw new FleetError(check.checks.find((c) => c.status === "fail")?.code ?? "INVALID_LAUNCH_SPEC");
      if (d.state !== "draft") throw new FleetError("LAUNCH_ALREADY_STARTED");
      await db.query(
        "UPDATE architecture_launch_drafts SET spec=$2,digest=$3,revision=revision+1,updated_at=$4 WHERE id=$1",
        [input.draftId, input.spec, check.digest, this.store.now()],
      );
      return { digest: check.digest };
    });
  }
  private async lockDraft(db: PoolClient, id: string, digest: string) {
    const d = (await db.query("SELECT * FROM architecture_launch_drafts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!d) throw new FleetError("NOT_FOUND");
    if (d.state !== "draft") throw new FleetError("LAUNCH_ALREADY_STARTED");
    if (d.digest !== digest || launchDigest(d.spec) !== d.digest) throw new FleetError("STALE_LAUNCH_DIGEST");
    return d;
  }
  async read(id: string) {
    const d = (
      await this.store.pool.query(
        "SELECT id,spec,digest,revision,state,cohort_id FROM architecture_launch_drafts WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!d) throw new FleetError("NOT_FOUND");
    return d;
  }
  async start(raw: unknown): Promise<StartResult> {
    const input = LaunchStartRequest.parse(raw);
    return transaction(this.store.pool, (db) =>
      this.idempotent(db, input.requestId, "start", input, async () => {
        const d = await this.lockDraft(db, input.draftId, input.expectedDigest),
          spec = LaunchSpecSchema.parse(d.spec);
        const actors = (
          await db.query("SELECT id,cohort_id FROM agents WHERE id=ANY($1::uuid[]) ORDER BY cohort_id,id", [
            spec.accounts.agentIds,
          ])
        ).rows;
        const ids = [...new Set(actors.map((a) => String(a.cohort_id)))].sort();
        for (const id of ids) await db.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [id]);
        await db.query("SELECT id FROM agents WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [
          spec.accounts.agentIds,
        ]);
        const check = await this.check(spec, db);
        if (!check.ready)
          throw new FleetError(
            (
              check.checks.find((c) => c.status === "fail" && c.area === "configuration") ??
              check.checks.find((c) => c.status === "fail")
            )?.code ?? "LAUNCH_NOT_READY",
          );
        const cohortId = ids[0];
        if (!cohortId) throw new FleetError("ACCOUNTS_INCOMPLETE");
        await this.tasks.enroll(cohortId, spec.architecture, !spec.wakePolicy?.enabled, db);
        await db.query(
          "UPDATE cohort_engine_profiles SET environment_ref=$2,architecture_config=$3,non_model_limits=$4 WHERE cohort_id=$1",
          [cohortId, spec.environment, spec.architectureConfig, spec.nonModelLimits ?? null],
        );
        if (spec.wakePolicy)
          await db.query(
            "INSERT INTO cohort_wake_policies(cohort_id,policy,created_at) VALUES($1,$2,$3) ON CONFLICT(cohort_id) DO UPDATE SET policy=excluded.policy",
            [cohortId, spec.wakePolicy, this.store.now()],
          );
        await this.store.configure(cohortId, { model: spec.model, budget: spec.budget }, db);
        await this.store.setStates([cohortId], "running", this.options.liveAllowed, false, db);
        await db.query("UPDATE architecture_launch_drafts SET state='started',cohort_id=$2,updated_at=$3 WHERE id=$1", [
          input.draftId,
          cohortId,
          this.store.now(),
        ]);
        return { cohortId, digest: d.digest, state: "running" };
      }),
    );
  }
  async compatibilityPrepareStart(cohortId: string) {
    const row = (
      await this.store.pool.query(
        "SELECT profile_id,profile_version,environment_ref FROM cohort_engine_profiles WHERE cohort_id=$1",
        [cohortId],
      )
    ).rows[0];
    if (!row) return;
    if (row.environment_ref && !sameEnvironment(row.environment_ref, this.environments.selected))
      throw new FleetError("ENVIRONMENT_NOT_SELECTED");
    const preview = this.compatibilityPreview({ id: row.profile_id, version: row.profile_version });
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
