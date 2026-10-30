import { readExportKey, verifyArchive } from "../src/research/evidence/export.js";

const flags: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i],
    value = process.argv[i + 1];
  if (!["--file", "--key-file"].includes(name) || flags[name] || !value) throw Error("INVALID_ARGUMENTS");
  flags[name] = value;
}
if (!flags["--file"]) throw Error("FILE_REQUIRED");
try {
  const key = flags["--key-file"] ? await readExportKey(flags["--key-file"]) : undefined;
  const result = await verifyArchive(flags["--file"], key);
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "verified" ? 0 : result.status === "key_required" ? 3 : 2;
} catch {
  console.error("ARCHIVE_VERIFICATION_FAILED");
  process.exitCode = 2;
}
