import type { SkillSummary } from "./schema.js";
export function retrieveSkills(
  values: SkillSummary[],
  query: { goal: string; event: string; limit: number; environment: { id: string; version: string }; role: string },
): SkillSummary[] {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 8) throw Error("SKILL_RETRIEVAL_LIMIT");
  const words = new Set((query.goal + " " + query.event).toLowerCase().match(/[a-z0-9_-]+/g) ?? []),
    rank = (v: SkillSummary) =>
      [...words].filter((w) => (v.purpose + " " + v.goalKinds.join(" ")).toLowerCase().includes(w)).length;
  return values
    .filter(
      (v) =>
        ["advisory", "guarded"].includes(v.status) &&
        v.environment.id === query.environment.id &&
        v.environment.version === query.environment.version &&
        v.roles.includes(query.role),
    )
    .sort((a, b) => rank(b) - rank(a) || a.ref.id.localeCompare(b.ref.id) || b.ref.version - a.ref.version)
    .slice(0, query.limit);
}
