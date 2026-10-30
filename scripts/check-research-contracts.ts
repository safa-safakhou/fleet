import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const generate = process.argv.includes("--write"),
  root = process.cwd();
const temp = await mkdtemp(resolve(tmpdir(), "fleet-contracts-"));
try {
  const ts = generate ? resolve("src/research/generated") : resolve(temp, "ts");
  const py = generate ? resolve("workers/research/src/fleet_research/generated") : resolve(temp, "py");
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(ts, { recursive: true });
  await mkdir(py, { recursive: true });
  const sources = ["common", "worker", "evidence"].map((n) => `contracts/fleet/v1/${n}.proto`);
  execFileSync(
    "uv",
    [
      "run",
      "--project",
      "workers/research",
      "--group",
      "dev",
      "python",
      "-m",
      "grpc_tools.protoc",
      "-Icontracts",
      `--plugin=protoc-gen-es=${resolve("node_modules/.bin/protoc-gen-es")}`,
      `--es_out=${ts}`,
      "--es_opt=target=ts,import_extension=js",
      `--python_out=${py}`,
      `--grpc_python_out=${py}`,
      ...sources,
    ],
    { stdio: "inherit" },
  );
  // Normalize generator EOF whitespace deterministically; never hand-edit generated files.
  for (const name of await readdir(resolve(ts, "fleet/v1")))
    if (name.endsWith(".ts")) {
      const file = resolve(ts, "fleet/v1", name);
      await writeFile(file, `${(await readFile(file, "utf8")).trimEnd()}\n`);
    }
  for (const name of await readdir(resolve(py, "fleet/v1")))
    if (name.endsWith(".py")) {
      const p = resolve(py, "fleet/v1", name);
      await writeFile(
        p,
        (await readFile(p, "utf8")).replaceAll("from fleet.v1 import", "from fleet_research.generated.fleet.v1 import"),
      );
    }
  if (!generate)
    for (const [actual, expected] of [
      [ts, resolve("src/research/generated")],
      [py, resolve("workers/research/src/fleet_research/generated")],
    ]) {
      async function compare(dir: string, prefix = ""): Promise<void> {
        for (const entry of await readdir(resolve(dir, prefix), { withFileTypes: true })) {
          const path = prefix + entry.name;
          if (entry.isDirectory()) {
            await compare(dir, `${path}/`);
            continue;
          }
          if (!/\.(ts|py)$/.test(path)) continue;
          if (!(await readFile(resolve(actual, path))).equals(await readFile(resolve(expected, path))))
            throw Error(`GENERATED_CONTRACT_DRIFT:${path}`);
        }
      }
      await compare(actual);
    }
  const schemaSource = JSON.parse(await readFile(resolve(root, "schemas/run-manifest.v1.schema.json"), "utf8"));
  const schemaText = `// Generated from schemas/run-manifest.v1.schema.json; do not edit.\nexport default ${JSON.stringify(schemaSource, null, 2)} as const;\n`;
  if (generate) await writeFile(resolve(ts, "run-manifest-schema.ts"), schemaText);
  else if ((await readFile(resolve("src/research/generated/run-manifest-schema.ts"), "utf8")) !== schemaText)
    throw Error("GENERATED_MANIFEST_SCHEMA_DRIFT");
  console.log(generate ? "Research bindings generated" : "Research generated bindings match pinned sources");
} finally {
  await rm(temp, { recursive: true, force: true });
}
