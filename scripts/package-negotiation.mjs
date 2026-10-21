import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fleet = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  pact = resolve(fleet, "../pact");
const args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--output", "--node", "--ollama", "--models", "--stage"].includes(args[i]) ||
    !args[i + 1] ||
    Object.hasOwn(options, args[i])
  )
    throw Error("PACKAGE_ARGUMENTS");
  options[args[i]] = args[i] === "--stage" ? args[i + 1] : resolve(args[i + 1]);
}
if (
  !["--output", "--node", "--ollama", "--models"].every((key) => options[key]) ||
  (options["--stage"] !== undefined && !["KQ1", "R1", "R2"].includes(options["--stage"])) ||
  !isAbsolute(options["--output"])
)
  throw Error("PACKAGE_ARGUMENTS");
const sha = async (file) => {
  const h = createHash("sha256");
  for await (const c of createReadStream(file)) h.update(c);
  return h.digest("hex");
};
for (const [repo, paths] of [
  [fleet, ["src", "scripts", "tsconfig.negotiation.json", "package.json", "package-lock.json"]],
  [pact, ["packages", "workers", "tests/evaluation"]],
])
  if (execFileSync("git", ["status", "--porcelain", "--", ...paths], { cwd: repo, encoding: "utf8" }).trim())
    throw Error("COMMITTED_SOURCE_REQUIRED");
const sourcePins = {
  fleet: execFileSync("git", ["rev-parse", "HEAD"], { cwd: fleet, encoding: "utf8" }).trim(),
  pact: execFileSync("git", ["rev-parse", "HEAD"], { cwd: pact, encoding: "utf8" }).trim(),
};
if (
  (await sha(options["--node"])) !== "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237" ||
  (await sha(join(options["--ollama"], "ollama.exe"))) !==
    "3cc17c238b081adf2bd3a206e52a063b637af1bf283d95b4ffd73a2bdec8b027"
)
  throw Error("PINNED_RUNTIME_REQUIRED");
const descriptor = JSON.parse(await readFile(join(fleet, "docs/negotiation-E1-launch-manifest-20261021.json"), "utf8"));
const manifestRel = "manifests/registry.ollama.ai/library/nemotron-3-nano/4b";
if ((await sha(join(options["--models"], manifestRel))) !== descriptor.model.artifact.manifestSha256)
  throw Error("PINNED_MODEL_REQUIRED");
for (const layer of descriptor.model.artifact.layers)
  if ((await sha(join(options["--models"], `blobs/sha256-${layer.sha256}`))) !== layer.sha256)
    throw Error("PINNED_MODEL_REQUIRED");
execFileSync(process.execPath, [join(fleet, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.negotiation.json"], {
  cwd: fleet,
  stdio: "inherit",
});
const out = options["--output"];
await mkdir(out, { mode: 0o700 });
for (const name of await readdir(join(fleet, "dist/negotiation")))
  await cp(join(fleet, "dist/negotiation", name), join(out, name), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
for (const name of ["migrations", "vendor"]) await cp(join(fleet, name), join(out, "fleet", name), { recursive: true });
await mkdir(join(out, "fleet/docs"), { recursive: true });
await cp(
  join(fleet, "docs/negotiation-E1-launch-manifest-20261021.json"),
  join(out, "fleet/docs/negotiation-E1-launch-manifest-20261021.json"),
);
await writeFile(join(out, "package.json"), '{"type":"module"}\n', { flag: "wx" });
await writeFile(join(out, "fleet/package.json"), '{"type":"module"}\n', { flag: "wx" });
await writeFile(join(out, "pact/package.json"), '{"type":"module"}\n', { flag: "wx" });
await writeFile(join(out, "bundle-sources.json"), JSON.stringify(sourcePins) + "\n", { flag: "wx" });
const pending = [];
async function locate(name, from) {
  let dir = from;
  for (;;) {
    const p = join(dir, "node_modules", name, "package.json");
    try {
      const json = JSON.parse(await readFile(p, "utf8"));
      if (json.name === name) return { directory: await realpath(dirname(p)), json };
    } catch (e) {
      if (!["ENOENT", "ENOTDIR"].includes(e.code)) throw e;
    }
    const parent = dirname(dir);
    if (parent === dir) throw Error(`RUNTIME_DEPENDENCY_MISSING:${name}`);
    dir = parent;
  }
}
for (const name of Object.keys(JSON.parse(await readFile(join(fleet, "package.json"), "utf8")).dependencies))
  pending.push(await locate(name, fleet));
for (const name of (await readdir(join(pact, "packages"))).sort()) pending.push(await locate(`@pact/${name}`, pact));
const { planRuntimePackages } = await import("../dist/negotiation/fleet/scripts/lib/negotiation-package-graph.js");
for (const { pkg, target } of await planRuntimePackages(out, pending, locate)) {
  await mkdir(dirname(target), { recursive: true });
  if (pkg.json.name.startsWith("@pact/")) {
    await mkdir(target);
    await cp(join(pkg.directory, "package.json"), join(target, "package.json"));
    for (const name of ["dist", "migrations"]) {
      try {
        await cp(join(pkg.directory, name), join(target, name), {
          recursive: true,
          dereference: true,
          errorOnExist: true,
          force: false,
        });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  } else
    await cp(pkg.directory, target, {
      recursive: true,
      dereference: true,
      filter: (path) => !path.slice(pkg.directory.length).split("/").includes("node_modules"),
    });
}
// The DB migrator enumerates all product migration directories even when a
// qualification does not import that module's runtime exports.
for (const name of await readdir(join(pact, "packages"))) {
  const source = join(pact, "packages", name, "migrations");
  try {
    const s = await lstat(source);
    if (s.isDirectory()) {
      const target = join(out, "node_modules/@pact", name, "migrations");
      await mkdir(dirname(target), { recursive: true });
      await cp(source, target, { recursive: true, force: false });
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
// Migration URLs retain their normal relative package layout.
await mkdir(join(out, "pact/packages"), { recursive: true });
for (const name of await readdir(join(out, "node_modules/@pact")))
  await cp(join(out, "node_modules/@pact", name), join(out, "pact/packages", name), { recursive: true });
await mkdir(join(out, "controller"));
await cp(options["--node"], join(out, "controller/node.exe"));
await mkdir(join(out, "runtime"));
await cp(join(options["--ollama"], "ollama.exe"), join(out, "runtime/ollama.exe"));
await cp(join(options["--ollama"], "lib"), join(out, "runtime/lib"), { recursive: true, dereference: true });
await mkdir(join(out, "models/manifests/registry.ollama.ai/library/nemotron-3-nano"), { recursive: true });
await cp(join(options["--models"], manifestRel), join(out, "models", manifestRel));
await mkdir(join(out, "models/blobs"));
for (const layer of descriptor.model.artifact.layers)
  await cp(
    join(options["--models"], `blobs/sha256-${layer.sha256}`),
    join(out, "models/blobs", `sha256-${layer.sha256}`),
  );
const { negotiationBaselineAmendment } = await import("../dist/negotiation/fleet/src/negotiation-plan.js");
const { pinnedProviderMetadata } = await import("../dist/negotiation/fleet/scripts/lib/negotiation-model-store.js");
const specialist = options["--stage"] === "KQ1",
  repair = ["R1", "R2"].includes(options["--stage"]);
const settings = repair
  ? (await import("../dist/negotiation/fleet/scripts/lib/post-e3-package.js")).postE3PackageSettings(
      descriptor.proposedSettings,
      options["--stage"] === "R2" ? "RC2" : "RC1",
    )
  : specialist
    ? (await import("../dist/negotiation/fleet/scripts/lib/specialist-package.js")).specialistPackageSettings(
        descriptor.proposedSettings,
      )
    : descriptor.proposedSettings;
await writeFile(join(out, "execution-settings.json"), JSON.stringify(settings) + "\n", {
  flag: "wx",
});
await writeFile(
  join(out, "execution-policy.json"),
  JSON.stringify({
    schemaVersion: repair
      ? options["--stage"] === "R2"
        ? "fleet.rc2-policy.v1"
        : "fleet.rc1-policy.v2"
      : specialist
        ? "fleet.owned-specialist-policy.v1"
        : "fleet.owned-negotiation-policy.v1",
    ...(repair
      ? {
          study: settings.study,
          protocolVersion: options["--stage"] === "R2" ? "fleet.rc2-protocol.v1" : "fleet.rc1-protocol.v2",
          grantVersion: options["--stage"] === "R2" ? "fleet.rc2-grant.v1" : "fleet.rc1-grant.v2",
          profile: settings.architecture,
          candidateSources: settings.candidateSources,
          realProviderAuthorized: false,
          productionQualification: false,
          installation: false,
          activation: false,
        }
      : specialist
        ? {
            stage: "KQ1",
            profile: { id: "autonomous-specialists", version: "1" },
            plannedCounterexample: {
              cycle: 0,
              gameMinute: 0,
              beforeFirstModelDecision: true,
              change:
                "Revoke own supply.sign and withdraw the exact scripted peer offer once; all other authority/goal fields unchanged",
            },
            diagnosticOnly: true,
          }
        : { baselineAmendment: negotiationBaselineAmendment }),
    sources: sourcePins,
    review: "inline-after-native-usage-before-next-dispatch",
    model: descriptor.model,
    scope: "new_owned_synthetic_worlds",
    retainedWorldAccess: false,
    providerModels: { location: "separate-owned-provider-store", optionalAccountedMetadata: pinnedProviderMetadata },
  }) + "\n",
  { flag: "wx" },
);
const pins = [];
async function scan(dir, rel = "") {
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name),
      r = rel ? `${rel}/${name}` : name,
      s = await lstat(path);
    if (s.isSymbolicLink()) throw Error("PACKAGE_SYMLINK_REFUSED");
    if (s.isDirectory()) await scan(path, r);
    else if (s.isFile()) pins.push({ relativePath: r, bytes: s.size, sha256: await sha(path) });
    else throw Error("PACKAGE_SPECIAL_FILE_REFUSED");
  }
}
await scan(out);
pins.sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath)));
const { packageSelectionMetadata } = await import(
  "../dist/negotiation/fleet/scripts/lib/negotiation-package-metadata.js"
);
const metadata = packageSelectionMetadata({
  sources: sourcePins,
  pins,
  model: descriptor.model,
  policy: JSON.parse(await readFile(join(out, "execution-policy.json"), "utf8")),
  settings,
});
// Pin metadata lives beside, not recursively inside, the hashed bundle.
await writeFile(`${out}.manifest.json`, JSON.stringify(metadata, null, 2) + "\n", { flag: "wx", mode: 0o600 });
process.stdout.write(
  JSON.stringify({ bundleRoot: out, files: pins.length, bundleDigest: metadata.bundleDigest, sources: sourcePins }) +
    "\n",
);
