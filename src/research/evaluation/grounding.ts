export function pointer(value: unknown, path: string): { found: boolean; value: unknown } {
  if (!path.startsWith("/") || path.length > 2000) throw Error("EVALUATOR_POINTER_INVALID");
  let current = value;
  for (const part of path
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (
      ["__proto__", "constructor", "prototype"].includes(part) ||
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, part)
    )
      return { found: false, value: null };
    current = (current as Record<string, unknown>)[part];
  }
  return { found: true, value: current };
}
export function groundedCitations(claimed: string[], authorized: string[], expired: string[] = []) {
  const allowed = new Set(authorized),
    old = new Set(expired);
  return {
    correct: claimed.filter((s) => allowed.has(s) && !old.has(s)).length,
    graded: claimed.length,
    unsupported: claimed.filter((s) => !allowed.has(s)).length,
    expired: claimed.filter((s) => old.has(s)).length,
  };
}
