const profiles = ["legacy-loop", "legacy-cognition", "reactive-basic", "reactive-cognition"];
export function parseTurnSelection(selection?: string, actors?: string) {
  const selected = selection?.split(",") ?? profiles;
  if (new Set(selected).size !== selected.length || selected.some((p) => !profiles.includes(p)))
    throw Error("Invalid explicit profile selection");
  if (actors === undefined) return selected.map((profile) => ({ profile, ordinal: 0 }));
  const entries = actors.split(",").map((entry) => {
    const match = /^(legacy-loop|legacy-cognition|reactive-basic|reactive-cognition):(0|[1-9][0-9]*)$/.exec(entry);
    if (!match || !Number.isSafeInteger(Number(match[2]))) throw Error("Invalid explicit actor selection");
    return { profile: match[1], ordinal: Number(match[2]) };
  });
  if (
    entries.length !== selected.length ||
    new Set(entries.map((e) => e.profile)).size !== entries.length ||
    entries.some((e) => !selected.includes(e.profile))
  )
    throw Error("Actor selection must match each selected profile exactly once");
  return selected.map((profile) => {
    const entry = entries.find((candidate) => candidate.profile === profile);
    if (!entry) throw Error("Missing selected actor");
    return entry;
  });
}
