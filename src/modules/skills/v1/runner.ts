import { Ajv } from "ajv";
import { type Data, FleetError, safeCode } from "../../../domain.js";
import { launchDigest } from "../../../platform/launch.js";
import type { SpecialistScope } from "../../../platform/participant-state.js";
import {
  type Checkpoint,
  type ExistingSkillGoal,
  type Invocation,
  type InvocationRepository,
  skillCommandId,
} from "./checkpoints.js";
import type { WorkLedger, WorkLimits } from "./costs.js";
import { expandRecipe, type PrimitiveContext, type PrimitiveRegistry, resolveRecipeArgs } from "./primitives.js";
import type { SkillRef, SkillVersion } from "./schema.js";
export type RecipePorts = {
  scope: SpecialistScope;
  registry: PrimitiveRegistry;
  repository: InvocationRepository;
  work: WorkLedger;
  load(ref: SkillRef): Promise<SkillVersion>;
  children?(skill: SkillVersion): Promise<ReadonlyMap<string, SkillVersion>>;
  eligible(skill: SkillVersion, children: ReadonlyMap<string, SkillVersion>): Promise<boolean>;
  goal(id: string): Promise<ExistingSkillGoal | null>;
  observe(query: Data): Promise<Data>;
  submit(payload: Data, commandId: string, validate: () => Promise<void>): Promise<Data>;
  recover(
    commandId: string,
  ): Promise<{ status: "not_prepared" | "pending" | "unknown" | "confirmed" | "rejected"; outcome?: Data }>;
  request(message: Data): Promise<Data>;
  now(): Date;
  signal: AbortSignal;
  fault?(point: string, invocation: Invocation, checkpoint?: Checkpoint): Promise<void>;
};
export class SkillSelector {
  choose(goal: ExistingSkillGoal, candidates: SkillVersion[]) {
    const compatible = candidates.filter(
        (s) =>
          goal.active &&
          s.body.applicability.goalKind === goal.kind &&
          s.body.purpose.goalKinds.includes(goal.kind) &&
          s.body.effects.actionKeys.every((k) => goal.allowedActions.includes(k)),
      ),
      recipes = compatible.filter((s) => s.status === "guarded" && s.body.representation === "recipe");
    return recipes.length === 1
      ? { kind: "recipe" as const, skillRef: recipes[0].ref }
      : recipes.length > 1
        ? { kind: "reason" as const, reason: "AMBIGUOUS_SKILL_CHOICE" }
        : compatible.some((s) => ["advisory", "guarded"].includes(s.status))
          ? { kind: "advisory" as const, reason: "NO_QUALIFIED_EXACT_RECIPE" }
          : { kind: "reason" as const, reason: "NO_COMPATIBLE_SKILL" };
  }
}
/** Finite interpreter; every effect is supplied by bound trusted ports, never generated code. */
export class RecipeRunner {
  constructor(private p: RecipePorts) {}
  private async current(inv: Invocation) {
    const goal = await this.p.goal(inv.goalId);
    if (
      !goal?.active ||
      goal.revision !== inv.goalRevision ||
      goal.ownerRevision !== inv.ownerRevision ||
      launchDigest(goal.parameters) !== launchDigest(inv.inputs)
    )
      throw new FleetError("SKILL_GOAL_CHANGED", true);
    return goal;
  }
  private async ready(skill: SkillVersion, goal: ExistingSkillGoal, children: ReadonlyMap<string, SkillVersion>) {
    if (skill.status !== "guarded" || !(await this.p.eligible(skill, children)))
      throw new FleetError("SKILL_NOT_QUALIFIED", true);
    if (
      !goal.active ||
      goal.kind !== skill.body.applicability.goalKind ||
      skill.body.effects.actionKeys.some((k) => !goal.allowedActions.includes(k))
    )
      throw new FleetError("SKILL_GOAL_INCOMPATIBLE", true);
    const issues = expandRecipe(skill, this.p.registry, children).issues;
    if (issues.length) throw new FleetError(issues[0].code, true);
  }
  async start(
    scope: SpecialistScope,
    input: { goalId: string; skillRef: SkillRef; inputs: Data; triggerId: string; limits?: Partial<WorkLimits> },
  ): Promise<Invocation> {
    if (launchDigest(scope) !== launchDigest(this.p.scope)) throw new FleetError("SKILL_SCOPE_MISMATCH", true);
    const goal = await this.p.goal(input.goalId);
    if (!goal) throw new FleetError("SKILL_GOAL_REQUIRED", true);
    if (launchDigest(goal.parameters) !== launchDigest(input.inputs))
      throw new FleetError("PARAMETERS_OUTSIDE_EXISTING_GOAL", true);
    const prior = await this.p.repository.forGoal(input.goalId, input.skillRef);
    if (prior) {
      if (prior.goalRevision !== goal.revision || prior.ownerRevision !== goal.ownerRevision)
        throw new FleetError("GOAL_INSTANCE_ALREADY_USED", true);
      return ["completed", "reason"].includes(prior.state) ? prior : this.resume(prior.id, input.triggerId);
    }
    const skill = await this.p.load(input.skillRef),
      children = (await this.p.children?.(skill)) ?? new Map();
    await this.ready(skill, goal, children);
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(skill.body.inputs);
    if (!validate(input.inputs)) throw new FleetError("INVALID_SKILL_INPUT", true);
    const limits = await this.p.work.limits(skill.body.limits, input.limits),
      inv = await this.p.repository.start(scope, {
        skillRef: skill.ref,
        goal,
        inputs: input.inputs,
        triggerId: input.triggerId,
        limits,
      });
    await this.p.repository.acceptEvent(inv.id, input.triggerId);
    return this.run(inv, input.triggerId);
  }
  async resume(id: string, eventId: string): Promise<Invocation> {
    let inv = await this.p.repository.load(id);
    if (["completed", "reason"].includes(inv.state)) return inv;
    if (!(await this.p.repository.acceptEvent(id, eventId))) return inv;
    const cp = await this.p.repository.outstanding(id);
    if (cp?.state === "started" || cp?.state === "unknown") {
      if (cp.state === "started" && (await this.p.repository.resetUnstarted(cp))) return this.run(inv, eventId);
      if (cp.commandId) {
        await this.p.work.recordRecovery(inv, cp.nodeId, eventId);
        const recovered = await this.p.recover(cp.commandId);
        if (recovered.status === "confirmed") {
          const values = {
            ...inv.values,
            __lastReceipt: recovered.outcome ?? { status: "confirmed", receiptOnly: true },
          };
          try {
            const skill = await this.p.load(inv.skillRef),
              children = (await this.p.children?.(skill)) ?? new Map(),
              item = expandRecipe(skill, this.p.registry, children).nodes[inv.nodeIndex];
            if (item && "saveAs" in item.node && item.node.saveAs) {
              let dest = values as Data;
              for (const part of item.prefix.split(".").filter(Boolean)) {
                dest[part] = dest[part] && typeof dest[part] === "object" ? dest[part] : {};
                dest = dest[part] as Data;
              }
              dest[item.node.saveAs] = values.__lastReceipt;
            }
          } catch {
            /* original receipt is preserved even when private skill content disappeared */
          }
          inv = await this.p.repository.finish(inv, cp, {
            state: "active",
            nodeIndex: inv.nodeIndex + 1,
            values,
            result: recovered.outcome ?? { status: "confirmed", receiptOnly: true },
          });
        } else if (recovered.status === "pending" || recovered.status === "unknown") {
          return this.p.repository.finish(inv, cp, {
            state: "unknown",
            nodeIndex: inv.nodeIndex,
            values: inv.values,
            reason: "ORIGINAL_COMMAND_UNRESOLVED",
            result: recovered.outcome,
          });
        } else {
          return this.reason(
            inv,
            recovered.status === "not_prepared" ? "INTERRUPTED_BEFORE_NATIVE_PREPARATION" : "ORIGINAL_COMMAND_REJECTED",
            cp,
          );
        }
      } else return this.reason(inv, "INTERRUPTED_NON_ACTION_STEP", cp);
    }
    return this.run(inv, eventId);
  }
  private reason(inv: Invocation, reason: string, cp: Checkpoint | null = null) {
    return this.p.repository.finish(inv, cp, { state: "reason", nodeIndex: inv.nodeIndex, values: inv.values, reason });
  }
  private async run(start: Invocation, eventId: string): Promise<Invocation> {
    let inv = start;
    try {
      if (inv.privateUnavailable) return this.reason(inv, "SKILL_PRIVATE_SOURCE_UNAVAILABLE");
      const skill = await this.p.load(inv.skillRef),
        children = (await this.p.children?.(skill)) ?? new Map(),
        goal = await this.current(inv);
      await this.ready(skill, goal, children);
      const expanded = expandRecipe(skill, this.p.registry, children).nodes;
      for (; inv.nodeIndex < expanded.length; ) {
        if (this.p.signal.aborted) throw new FleetError("TASK_FENCED", true);
        await this.p.work.meterWall(inv, true);
        await this.current(inv);
        const item = expanded[inv.nodeIndex],
          node = item.node,
          nodeId = `${item.prefix}${node.id}${inv.state === "waiting" ? ":" + launchDigest(eventId).slice(0, 20) : ""}`,
          commandId = node.kind === "submit" ? skillCommandId(inv.id, nodeId) : undefined;
        const cp = await this.p.repository.checkpoint(inv, nodeId, commandId);
        await this.p.fault?.("after_checkpoint", inv, cp);
        const work =
          "primitive" in node
            ? this.p.registry.get(node.primitive)?.work
            : { reads: 0, actions: 0, messages: 0, steps: 1 };
        if (!work) throw new FleetError("UNKNOWN_PRIMITIVE", true);
        await this.p.work.reserve(inv, nodeId, work);
        await this.p.fault?.("after_reservation", inv, cp);
        if (!(await this.p.repository.begin(cp))) return this.p.repository.load(inv.id);
        await this.p.fault?.("before_io", inv, cp);
        await this.p.work.consume(inv, nodeId, "steps", work.steps);
        if (node.kind === "return_to_reasoning") return this.reason(inv, node.reason, cp);
        if (node.kind === "invoke") {
          inv = await this.p.repository.finish(inv, cp, {
            state: "active",
            nodeIndex: inv.nodeIndex + 1,
            values: inv.values,
          });
          continue;
        }
        const values = structuredClone(inv.values);
        let inputs = inv.inputs;
        const scoped = (prefix: string, create = false) => {
          let value = values;
          for (const part of prefix.split(".").filter(Boolean)) {
            if (!value[part] || typeof value[part] !== "object" || Array.isArray(value[part])) {
              if (!create) return {};
              value[part] = {};
            }
            value = value[part] as Data;
          }
          return value;
        };
        for (let index = 0; index < item.inputBindings.length; index++)
          inputs = resolveRecipeArgs(
            item.inputBindings[index],
            inputs,
            scoped(item.prefix.split(".").slice(0, index).join(".")),
          );
        if (!new Ajv({ strict: false, validateFormats: false }).compile(item.inputSchema)(inputs))
          throw new FleetError("INVALID_SKILL_INPUT", true);
        const localValues = scoped(item.prefix, true),
          args = resolveRecipeArgs(node.args, inputs, localValues);
        const before = async () => {
          if (this.p.signal.aborted) throw new FleetError("TASK_FENCED", true);
          await this.p.work.meterWall(inv, true);
          await this.current(inv);
          const fresh = await this.p.load(inv.skillRef);
          if (
            fresh.status !== "guarded" ||
            !(await this.p.eligible(fresh, (await this.p.children?.(fresh)) ?? children))
          )
            throw new FleetError("SKILL_NOT_QUALIFIED", true);
        };
        const context: PrimitiveContext = {
          signal: this.p.signal,
          inputs,
          goal: goal as unknown as Data,
          values: localValues,
          observe: async (query) => {
            await before();
            await this.p.work.consume(inv, nodeId, "reads", 1);
            const value = await this.p.observe(query);
            values.__factsAt = this.p.now().toISOString();
            return value;
          },
          submit: async (payload, id) => {
            if (id !== commandId || node.kind !== "submit") throw new FleetError("SKILL_COMMAND_ID_MISMATCH", true);
            await before();
            const age = this.p.now().getTime() - Date.parse(String(values.__factsAt ?? ""));
            if (!Number.isFinite(age) || age < 0 || age > skill.body.applicability.maxAgeMs)
              throw new FleetError("STALE_RECIPE_FACTS", true);
            await this.p.repository.submission(cp, payload);
            await this.p.work.consume(inv, nodeId, "reads", 1);
            await this.p.work.consume(inv, nodeId, "actions", 1);
            return this.p.submit(payload, id, before);
          },
          resolve: async () => {
            throw new FleetError("RECIPE_RECEIPT_READ_REQUIRES_RECOVERY", true);
          },
          request: async (message) => {
            await before();
            await this.p.work.consume(inv, nodeId, "messages", 1);
            return this.p.request(message);
          },
        };
        const result = await this.p.registry.invoke(
          node.primitive,
          node.kind,
          { ...args, ...(node.kind === "submit" ? { commandId } : {}) },
          context,
        );
        await this.p.fault?.("after_io", inv, cp);
        if (node.kind === "submit" && result.outcome) {
          result.value = result.outcome;
          values.__lastReceipt = result.outcome;
        }
        if (node.saveAs && result.value) localValues[node.saveAs] = result.value;
        if (Buffer.byteLength(JSON.stringify(values)) > 48000) return this.reason(inv, "SKILL_STATE_LIMIT", cp);
        if (result.returnToReasoning) return this.reason(inv, result.returnToReasoning, cp);
        if (["check", "verify"].includes(node.kind) && result.value?.satisfied !== true)
          return this.reason(inv, "SKILL_CHECK_UNMET", cp);
        if (result.outcome && !["confirmed", "rejected"].includes(String(result.outcome.status)))
          return this.p.repository.finish(inv, cp, {
            state: "unknown",
            nodeIndex: inv.nodeIndex,
            values,
            reason: "ORIGINAL_COMMAND_UNRESOLVED",
            result: result.outcome,
          });
        if (result.outcome?.status === "rejected") return this.reason(inv, "ORIGINAL_COMMAND_REJECTED", cp);
        await this.p.fault?.("before_finish", inv, cp);
        inv = await this.p.repository.finish(inv, cp, {
          state: result.wait ? "waiting" : "active",
          nodeIndex: inv.nodeIndex + (result.wait ? 0 : 1),
          values,
          result: (result.outcome ?? result.value) as Data | undefined,
        });
        await this.p.work.meterWall(inv, false);
        await this.p.fault?.("after_finish", inv, cp);
        if (result.wait) return inv;
      }
      return this.p.repository.finish(inv, null, { state: "completed", nodeIndex: inv.nodeIndex, values: inv.values });
    } catch (error) {
      if (error instanceof FleetError && error.notDispatched)
        return this.reason(await this.p.repository.load(inv.id), safeCode(error));
      throw error;
    }
  }
}
