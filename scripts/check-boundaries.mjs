import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  for (const name of core) assertCoreBoundary(`src/${name}.ts`, await readFile(`src/${name}.ts`, "utf8"));
  await scanExtensionDirectories(process.cwd());
  console.log("Game-independent core import and tool boundary passed.");
}
