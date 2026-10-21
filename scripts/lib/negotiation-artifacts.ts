import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { FleetError } from "../../src/domain.js";
export type ArtifactPin = { relativePath: string; bytes: number; sha256: string };
export async function fileSha256(file: string) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
export function validateOwnedDatabaseTarget(raw: string): URL {
  const u = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    u.hostname !== "127.0.0.1" ||
    !u.port ||
    Number(u.port) < 1024 ||
    [5432, 5436, 5437, 5438, 5439, 5451, 5452].includes(Number(u.port)) ||
    !["/fleet_test", "/pact_test"].includes(u.pathname) ||
    u.search ||
    u.hash ||
    !u.username ||
    !u.password
  )
    throw new FleetError("OWNED_DATABASE_TARGET_REQUIRED", true);
  return u;
}
export async function createPinnedArtifactVerifier(root: string, pins: ArtifactPin[]): Promise<() => Promise<void>> {
  const base = resolve(root),
    directory = await lstat(base);
  if (!directory.isDirectory() || directory.isSymbolicLink() || !pins.length || pins.length > 50000)
    throw new FleetError("ARTIFACT_SCOPE", true);
  const checked = new Set<string>(),
    seen = new Set<string>(),
    records: { file: string; stamp: string }[] = [];
  const directories: { file: string; stamp: string }[] = [];
  const stamp = (s: Awaited<ReturnType<typeof lstat>>) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  for (const pin of pins) {
    const file = resolve(base, pin.relativePath),
      rel = relative(base, file);
    if (
      !pin.relativePath ||
      pin.relativePath.includes("\\") ||
      isAbsolute(pin.relativePath) ||
      pin.relativePath.split("/").some((p) => !p || p === "." || p === "..") ||
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      !Number.isSafeInteger(pin.bytes) ||
      pin.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(pin.sha256) ||
      seen.has(file.toLowerCase())
    )
      throw new FleetError("ARTIFACT_SCOPE", true);
    seen.add(file.toLowerCase());
    let parent = dirname(file);
    while (parent !== base) {
      if (!checked.has(parent)) {
        const d = await lstat(parent);
        if (!d.isDirectory() || d.isSymbolicLink()) throw new FleetError("ARTIFACT_SCOPE", true);
        checked.add(parent);
      }
      const next = dirname(parent);
      if (next === parent) throw new FleetError("ARTIFACT_SCOPE", true);
      parent = next;
    }
    const before = await lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size !== pin.bytes)
      throw new FleetError("ARTIFACT_DIGEST", true);
    if ((await fileSha256(file)) !== pin.sha256) throw new FleetError("ARTIFACT_DIGEST", true);
    const after = await lstat(file);
    if (stamp(before) !== stamp(after)) throw new FleetError("ARTIFACT_DRIFT", true);
    records.push({ file, stamp: stamp(after) });
  }
  const inventory = async (dir: string) => {
    const s = await lstat(dir);
    if (!s.isDirectory() || s.isSymbolicLink()) throw new FleetError("ARTIFACT_SCOPE", true);
    const before = stamp(s);
    directories.push({ file: dir, stamp: before });
    for (const name of await readdir(dir)) {
      const file = join(dir, name),
        item = await lstat(file);
      if (item.isDirectory() && !item.isSymbolicLink()) await inventory(file);
      else if (!item.isFile() || item.isSymbolicLink() || !seen.has(file.toLowerCase()))
        throw new FleetError("ARTIFACT_SCOPE", true);
    }
    if (stamp(await lstat(dir)) !== before) throw new FleetError("ARTIFACT_DRIFT", true);
  };
  await inventory(base);
  return async () => {
    for (const d of directories) {
      const s = await lstat(d.file);
      if (!s.isDirectory() || s.isSymbolicLink() || stamp(s) !== d.stamp) throw new FleetError("ARTIFACT_DRIFT", true);
    }
    for (const r of records) {
      const s = await lstat(r.file);
      if (!s.isFile() || s.isSymbolicLink() || stamp(s) !== r.stamp) throw new FleetError("ARTIFACT_DRIFT", true);
    }
  };
}
