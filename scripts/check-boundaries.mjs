import { readFile } from "node:fs/promises";

const core = [
  "engine",
  "generation",
  "feedback",
  "continuation",
  "owner-guidance",
  "context",
  "decision",
  "cognition",
  "cognitive-analysis",
  "comparisons",
  "laya",
  "game",
  "domain",
  "tools",
  "communications",
  "store",
  "model",
  "codex",
  "vault",
  "db",
  "platform/profiles",
  "engines/legacy/bridge",
];
for (const name of core) {
  const source = await readFile(`src/${name}.ts`, "utf8");
  if (/from\s+["'][^"']*games\//.test(source) || /pact_|PACT|vendor\/pact/.test(source))
    throw new Error(`GAME_DEPENDENCY_IN_CORE:${name}`);
}
console.log("Game-independent core import and tool boundary passed.");
