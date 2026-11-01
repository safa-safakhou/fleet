import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, open, readdir, realpath, rm, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { FleetError } from "../../domain.js";
export interface ArtifactFiles {
  initialize(): Promise<void>;
  writeChunk(id: string, index: number, body: Uint8Array): Promise<void>;
  readChunk(id: string, index: number): Promise<Buffer>;
  remove(id: string): Promise<void>;
  list(): Promise<string[]>;
}
export class ArtifactFilesystem implements ArtifactFiles {
  private root: string;
  constructor(
    root: string,
    private minFreeBytes = 0,
  ) {
    this.root = resolve(root);
  }
  private setup: Promise<void> | undefined;
  private async prepare() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const s = await lstat(this.root);
    if (s.isSymbolicLink() || !s.isDirectory()) throw new FleetError("ARTIFACT_PATH_INVALID", true);
    await chmod(this.root, 0o700);
    this.root = await realpath(this.root);
  }
  async initialize() {
    // Cache only canonical-path setup. Each operation still checks the current
    // directory type and permissions; neither consent nor filesystem authority
    // is inferred from an earlier successful write.
    this.setup ??= this.prepare().catch((error) => {
      this.setup = undefined;
      throw error;
    });
    await this.setup;
    const s = await lstat(this.root);
    if (s.isSymbolicLink() || !s.isDirectory()) throw new FleetError("ARTIFACT_PATH_INVALID", true);
    if ((s.mode & 0o7777) !== 0o700) await chmod(this.root, 0o700);
  }
  private path(id: string, index?: number) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
      (index !== undefined && (!Number.isSafeInteger(index) || index < 0))
    )
      throw new FleetError("ARTIFACT_PATH_INVALID", true);
    return resolve(this.root, id, ...(index === undefined ? [] : [`${index}.chunk`]));
  }
  private async directory(id: string) {
    const p = this.path(id);
    await mkdir(p, { mode: 0o700 }).catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
    const s = await lstat(p);
    if (s.isSymbolicLink() || !s.isDirectory()) throw new FleetError("ARTIFACT_PATH_INVALID", true);
    return p;
  }
  async writeChunk(id: string, index: number, body: Uint8Array) {
    await this.initialize();
    const dir = await this.directory(id);
    const stats = await statfs(this.root);
    if (stats.bavail * stats.bsize < body.length + this.minFreeBytes) throw new FleetError("ARTIFACT_DISK_FULL", true);
    const final = this.path(id, index),
      temp = resolve(dir, `.write-${randomUUID()}`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(
        temp,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(body);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await link(temp, final);
    } finally {
      await handle?.close();
      await rm(temp, { force: true });
    }
  }
  async readChunk(id: string, index: number) {
    await this.initialize();
    const dir = await lstat(this.path(id));
    if (dir.isSymbolicLink() || !dir.isDirectory()) throw new FleetError("ARTIFACT_PATH_INVALID", true);
    const file = this.path(id, index),
      s = await lstat(file);
    if (s.isSymbolicLink() || !s.isFile() || s.size > 3 * 1024 * 1024)
      throw new FleetError("ARTIFACT_PATH_INVALID", true);
    const h = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      return await h.readFile();
    } finally {
      await h.close();
    }
  }
  async remove(id: string) {
    await this.initialize();
    await rm(this.path(id), { recursive: true, force: true });
  }
  async list() {
    await this.initialize();
    return (await readdir(this.root)).filter((id) => /^[a-f0-9-]{36}$/i.test(id));
  }
}
