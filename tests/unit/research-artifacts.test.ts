import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ArtifactFilesystem } from "../../src/research/evidence/filesystem.js";

test("filesystem refuses traversal, symlinks and overwriting published chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "fleet-artifact-fs-"));
  try {
    const fs = new ArtifactFilesystem(root);
    await fs.initialize();
    const id = "11111111-1111-4111-8111-111111111111";
    await fs.writeChunk(id, 0, Buffer.from("cipher"));
    expect(await fs.readChunk(id, 0)).toEqual(Buffer.from("cipher"));
    await expect(fs.writeChunk(id, 0, Buffer.from("replacement"))).rejects.toThrow();
    await expect(fs.readChunk("../escape", 0)).rejects.toThrow("ARTIFACT_PATH_INVALID");
    await symlink(join(root, id, "0.chunk"), join(root, id, "1.chunk"));
    await expect(fs.readChunk(id, 1)).rejects.toThrow("ARTIFACT_PATH_INVALID");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reused filesystem setup still repairs permissions and refuses a replaced root symlink", async () => {
  const parent = await mkdtemp(join(tmpdir(), "fleet-artifact-root-"));
  const root = join(parent, "evidence"),
    moved = join(parent, "moved"),
    external = join(parent, "external");
  try {
    const fs = new ArtifactFilesystem(root);
    await Promise.all([fs.initialize(), fs.initialize()]);
    await chmod(root, 0o755);
    await fs.initialize();
    expect((await lstat(root)).mode & 0o777).toBe(0o700);
    await rename(root, moved);
    await mkdir(external);
    await symlink(external, root);
    await expect(fs.writeChunk("11111111-1111-4111-8111-111111111111", 0, Buffer.from("cipher"))).rejects.toThrow(
      "ARTIFACT_PATH_INVALID",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
