import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { architectureImports } from "./architecture-imports.mjs";

const core = [
  "engine",
  "generation",
  "qualification-run",
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
export function assertCoreBoundary(path, source) {
  if (
    /(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*(?:games|environments)\//.test(source) ||
    /pact_|PACT|vendor\/pact/.test(source)
  )
    throw new Error(`GAME_DEPENDENCY_IN_CORE:${path}`);
}
export async function scanExtensionDirectories(root) {
  const found = [];
  async function scan(directory) {
    let entries;
    try {
      entries = await readdir(resolve(root, directory), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await scan(path);
      else if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)) found.push(path);
    }
  }
  await scan("src/platform");
  await scan("src/engines");
  for (const path of found) assertCoreBoundary(path, await readFile(resolve(root, path), "utf8"));
  return found;
}

const compatibilityEdges = new Set([
  "src/platform/profiles.ts->src/engines/legacy/execution.ts",
  "src/engines/legacy/bridge.ts->src/engine.ts",
  "src/engines/legacy/bridge.ts->src/store.ts",
  "src/engines/legacy/execution.ts->src/store.ts",
  "src/engines/legacy/runner.ts->src/store.ts",
  "src/engines/legacy/runner.ts->src/engine.ts",
  "src/engines/continuity/state.ts->src/app/continuity-v1-repository.ts",
]);
/** Trusted source ownership, not an executable plugin sandbox. Exceptions are exact legacy/inspection bridges. */
export async function scanArchitectureGraph(root) {
  const violations = [];
  for (const { from, specifier, target } of architectureImports(root)) {
    if (!from.startsWith("src/") && !from.startsWith("web/")) continue;
    if (compatibilityEdges.has(`${from}->${target}`)) continue;
    const own = from.match(/^src\/engines\/([^/]+)\//)?.[1],
      other = target?.match(/^src\/engines\/([^/]+)\//)?.[1];
    let code;
    if (specifier === null && (own || from.startsWith("src/platform/") || from.startsWith("web/")))
      code = "DYNAMIC_ARCHITECTURE_DEPENDENCY";
    else if (own) {
      if (other && own !== other) code = "SIBLING_ENGINE";
      else if (specifier === null) code = "DYNAMIC_ENGINE_DEPENDENCY";
      else if (
        (specifier &&
          !specifier.startsWith(".") &&
          !target &&
          !["zod", "ajv", "node:crypto", "node:util", "node:buffer", "node:assert"].includes(specifier)) ||
        ["pg", "node:child_process", "node:fs", "node:fs/promises"].includes(specifier) ||
        (target &&
          (/^(src\/(store|db|vault|model|codex|engine)\.ts|src\/(app|games|environments)\/)/.test(target) ||
            (/^src\/platform\//.test(target) &&
              !/^src\/platform\/(contracts|architecture|architecture-schema|engine-context)\.ts$/.test(target)) ||
            target === "src/modules/evidence/journal.ts"))
      )
        code = "ENGINE_CONCRETE_DEPENDENCY";
    } else if (from.startsWith("src/platform/") && target?.startsWith("src/engines/"))
      code = "PLATFORM_ENGINE_DEPENDENCY";
    else if (from.startsWith("src/platform/") && target?.startsWith("src/app/"))
      code = "PLATFORM_COMPOSITION_DEPENDENCY";
    else if ((from.startsWith("web/") || from === "src/cli.ts" || from === "src/cli-client.ts") && other)
      code = "UI_ENGINE_DEPENDENCY";
    else if (from.startsWith("src/modules/") && other) code = "MODULE_ENGINE_DEPENDENCY";
    if (code) violations.push(`${code}:${from}->${target ?? specifier ?? "unknown"}`);
  }
  return [...new Set(violations)].sort();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  for (const name of core) assertCoreBoundary(`src/${name}.ts`, await readFile(`src/${name}.ts`, "utf8"));
  await scanExtensionDirectories(process.cwd());
  const architectureViolations = await scanArchitectureGraph(process.cwd());
  if (architectureViolations.length) throw Error(architectureViolations.join("\n"));
  console.log("Game-independent core and architecture ownership boundaries passed.");
}
