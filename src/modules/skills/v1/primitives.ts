import { Ajv } from "ajv";
import { type Data, FleetError } from "../../../domain.js";
import { launchDigest } from "../../../platform/launch.js";
import { type RecipeNode, type SkillRef, type SkillVersion, skillContentDigest } from "./schema.js";
export type PrimitiveWork = { reads: number; actions: number; messages: number; steps: number };
export type PrimitiveContext = {
  signal: AbortSignal;
  inputs: Data;
  goal: Data;
  values: Data;
  observe(query: Data): Promise<Data>;
  submit(payload: Data, commandId: string): Promise<Data>;
  resolve(commandId: string): Promise<Data>;
  request(message: Data): Promise<Data>;
};
export type PrimitiveResult = {
  value?: Data;
  wait?: boolean;
  returnToReasoning?: string;
  commandId?: string;
  outcome?: Data;
};
export type PrimitiveDefinition = {
  ref: { id: string; version: string };
  kind: "observe" | "check" | "calculate" | "request" | "submit" | "await" | "verify";
  argsSchema: Data;
  work: PrimitiveWork;
  actionKeys: string[];
  run(args: Data, context: PrimitiveContext): Promise<PrimitiveResult>;
};
export type ValidationIssue = { nodeId: string; code: string };
const key = (r: { id: string; version: string }) => `${r.id}@${r.version}`;
export const skillRefKey = (r: SkillRef) => `${r.id}:${r.version}:${r.digest}`;
export class PrimitiveRegistry {
  private definitions = new Map<
    string,
    { definition: PrimitiveDefinition; validate: ReturnType<Ajv["compile"]>; digest: string }
  >();
  constructor(definitions: PrimitiveDefinition[] = []) {
    for (const d of definitions) this.register(d);
  }
  register(d: PrimitiveDefinition) {
    if (
      (d.kind === "submit" && (d.work.actions !== 1 || d.work.reads < 1)) ||
      (d.kind === "request" && d.work.messages !== 1) ||
      (d.kind === "observe" && d.work.reads < 1) ||
      (d.kind !== "submit" && d.work.actions !== 0) ||
      (d.kind !== "request" && d.work.messages !== 0)
    )
      throw new FleetError("INVALID_PRIMITIVE_WORK");
    if (
      this.definitions.has(key(d.ref)) ||
      Object.values(d.work).some((v) => !Number.isSafeInteger(v) || v < 0) ||
      d.work.steps < 1
    )
      throw new FleetError("INVALID_PRIMITIVE_REGISTRATION");
    const ajv = new Ajv({ strict: false, validateFormats: false });
    this.definitions.set(key(d.ref), {
      definition: d,
      validate: ajv.compile(d.argsSchema),
      digest: launchDigest({
        ref: d.ref,
        kind: d.kind,
        argsSchema: d.argsSchema,
        work: d.work,
        actionKeys: d.actionKeys,
        implementation: d.run.toString(),
      }),
    });
  }
  get(ref: { id: string; version: string }) {
    return this.definitions.get(key(ref))?.definition;
  }
  descriptor(ref: { id: string; version: string }) {
    const d = this.definitions.get(key(ref));
    return d ? { ref: d.definition.ref, digest: d.digest } : undefined;
  }
  async invoke(ref: { id: string; version: string }, kind: string, args: Data, context: PrimitiveContext) {
    const d = this.definitions.get(key(ref));
    if (!d || d.definition.kind !== kind) throw new FleetError("UNKNOWN_PRIMITIVE", true);
    if (context.signal.aborted) throw new FleetError("TASK_FENCED", true);
    if (!d.validate(args)) throw new FleetError("INVALID_PRIMITIVE_ARGUMENT", true);
    return d.definition.run(args, context);
  }
}
export type ExpandedNode = { node: RecipeNode; prefix: string; inputBindings: Data[] };
function dynamic(value: unknown): boolean {
  if (typeof value === "string") return /https?:\/\/|\b(?:eval|require|import)\s*\(/i.test(value);
  return Array.isArray(value)
    ? value.some(dynamic)
    : !!value &&
        typeof value === "object" &&
        Object.entries(value).some(
          ([k, v]) => /^(?:url|code|shell|sql|script|__proto__|constructor|prototype)$/i.test(k) || dynamic(v),
        );
}
export function expandRecipe(
  skill: SkillVersion,
  registry: PrimitiveRegistry,
  children: ReadonlyMap<string, SkillVersion> = new Map(),
): { nodes: ExpandedNode[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [],
    nodes: ExpandedNode[] = [],
    path = new Set<string>();
  const walk = (v: SkillVersion, depth: number, prefix: string, bindings: Data[]) => {
    const identity = skillRefKey(v.ref);
    if (path.has(identity)) {
      issues.push({ nodeId: prefix, code: "SKILL_COMPOSITION_CYCLE" });
      return;
    }
    if (depth > 2) {
      issues.push({ nodeId: prefix, code: "SKILL_COMPOSITION_DEPTH" });
      return;
    }
    path.add(identity);
    if (v.body.representation !== "recipe") issues.push({ nodeId: prefix, code: "GUIDE_NOT_EXECUTABLE" });
    if (v.ref.digest !== skillContentDigest(v.body)) issues.push({ nodeId: prefix, code: "SKILL_DIGEST_MISMATCH" });
    if (["suspended", "retired"].includes(v.status))
      issues.push({ nodeId: prefix, code: "SUSPENDED_SKILL_DEPENDENCY" });
    const ids = new Set<string>();
    for (const node of v.body.procedure.nodes) {
      if (nodes.length >= 32) {
        issues.push({ nodeId: prefix + node.id, code: "SKILL_NODE_LIMIT" });
        break;
      }
      if (ids.has(node.id)) issues.push({ nodeId: prefix + node.id, code: "DUPLICATE_SKILL_NODE" });
      ids.add(node.id);
      nodes.push({ node, prefix, inputBindings: bindings });
      if ("args" in node && dynamic(node.args))
        issues.push({ nodeId: prefix + node.id, code: "DYNAMIC_RECIPE_ARGUMENT" });
      if (node.kind === "invoke") {
        const child = children.get(skillRefKey(node.skill)) ?? children.get(node.skill.digest);
        if (
          !v.body.procedure.children.some((r) => skillRefKey(r) === skillRefKey(node.skill)) ||
          !child ||
          skillRefKey(child.ref) !== skillRefKey(node.skill)
        ) {
          issues.push({ nodeId: prefix + node.id, code: "MISSING_PINNED_CHILD" });
          continue;
        }
        if (child.status !== "guarded") issues.push({ nodeId: prefix + node.id, code: "UNQUALIFIED_CHILD" });
        walk(child, depth + 1, `${prefix}${node.id}.`, [...bindings, node.args]);
      } else if (node.kind !== "return_to_reasoning") {
        const p = registry.get(node.primitive);
        if (!p || p.kind !== node.kind) issues.push({ nodeId: prefix + node.id, code: "UNKNOWN_PRIMITIVE" });
        else if (!v.body.compatibility.primitives.some((r) => key(r) === key(node.primitive)))
          issues.push({ nodeId: prefix + node.id, code: "UNDECLARED_PRIMITIVE" });
        if (
          p?.actionKeys.some(
            (a) => !v.body.compatibility.actionKeys.includes(a) || !v.body.effects.actionKeys.includes(a),
          )
        )
          issues.push({ nodeId: prefix + node.id, code: "UNDECLARED_SKILL_EFFECT" });
      }
    }
    path.delete(identity);
  };
  walk(skill, 0, "", []);
  const work = nodes.reduce(
    (n, { node }) => {
      const w = "primitive" in node ? registry.get(node.primitive)?.work : undefined;
      for (const k of ["reads", "actions", "messages", "steps"] as const) n[k] += w?.[k] ?? (k === "steps" ? 1 : 0);
      return n;
    },
    { reads: 0, actions: 0, messages: 0, steps: 0 },
  );
  if (Object.entries(work).some(([k, n]) => n > skill.body.limits[k as keyof PrimitiveWork]))
    issues.push({ nodeId: "", code: "HIDDEN_CHILD_OR_PRIMITIVE_WORK" });
  return { nodes, issues };
}
export function validateRecipe(
  skill: SkillVersion,
  registry: PrimitiveRegistry,
  children?: ReadonlyMap<string, SkillVersion>,
) {
  return expandRecipe(skill, registry, children).issues;
}
export function recipeDependencies(
  skill: SkillVersion,
  registry: PrimitiveRegistry,
  children: ReadonlyMap<string, SkillVersion> = new Map(),
  environmentDigest = "",
) {
  const expanded = expandRecipe(skill, registry, children);
  return launchDigest({
    environment: skill.body.compatibility.environment,
    environmentDigest,
    refs: [skill.ref, ...[...children.values()].map((c) => c.ref)].sort((a, b) =>
      skillRefKey(a).localeCompare(skillRefKey(b)),
    ),
    primitives: expanded.nodes.flatMap(({ node }) =>
      "primitive" in node ? [registry.descriptor(node.primitive) ?? { missing: node.primitive }] : [],
    ),
  });
}
export function resolveRecipeArgs(raw: Data, inputs: Data, values: Data): Data {
  const at = (source: Data, path: unknown): unknown => {
    if (
      typeof path !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,199}$/i.test(path) ||
      path.split(".").some((p) => ["constructor", "prototype", "__proto__"].includes(p))
    )
      throw new FleetError("INVALID_RECIPE_PARAMETER", true);
    let value: unknown = source;
    for (const p of path.split(".")) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, p))
        throw new FleetError("UNKNOWN_RECIPE_PARAMETER", true);
      value = (value as Data)[p];
    }
    return value;
  };
  const resolve = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(resolve)
      : v && typeof v === "object"
        ? Object.keys(v).length === 1 && Object.hasOwn(v, "$input")
          ? at(inputs, (v as Data).$input)
          : Object.keys(v).length === 1 && Object.hasOwn(v, "$value")
            ? at(values, (v as Data).$value)
            : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]))
        : v;
  return resolve(raw) as Data;
}
