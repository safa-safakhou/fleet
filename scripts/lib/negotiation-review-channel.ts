import { randomUUID } from "node:crypto";
import { link, lstat, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { FleetError } from "../../src/domain.js";
import { designDigest } from "../../src/negotiation-plan.js";
import { Vault } from "../../src/vault.js";

export type ResponseVerdict = { verdict: "continue" | "critical" | "unresolved"; reasonCodes: string[] };
/** Manual inline review channel, outside model/game reach. No judge endpoint,
 * inference, timeout extension or synthetic pass is supplied by this channel. */
export class PrivateNegotiationReview {
  private vault: Vault;
  constructor(
    private directory: string,
    key: string,
    private batchNonce: string,
  ) {
    this.vault = new Vault(key);
  }
  private file(kind: string, id: string, suffix: string) {
    if (!["response", "outcome", "evidence"].includes(kind) || !/^[a-f0-9-]{16,64}$/i.test(id))
      throw new FleetError("REVIEW_SCOPE", true);
    return join(this.directory, `${kind}-${id}.${suffix}.json`);
  }
  private aad(kind: string, id: string, suffix: string) {
    return `negotiation:${this.batchNonce}:${kind}:${id}:${suffix}`;
  }
  private async write(kind: string, id: string, suffix: string, value: unknown) {
    const d = await lstat(this.directory);
    if (!d.isDirectory() || d.isSymbolicLink()) throw new FleetError("PRIVATE_REVIEW_DIRECTORY_REQUIRED", true);
    if (process.platform !== "win32" && d.mode & 0o077) throw new FleetError("PRIVATE_REVIEW_DIRECTORY_REQUIRED", true);
    const temp = this.file(kind, id, `${suffix}-${randomUUID()}`);
    await writeFile(temp, JSON.stringify({ cipher: this.vault.encrypt(value, this.aad(kind, id, suffix)) }), {
      flag: "wx",
      mode: 0o600,
    });
    // A hard-link publish is atomic and refuses an existing target even when
    // two operator submissions race; readers never see a partial ciphertext.
    try {
      await link(temp, this.file(kind, id, suffix));
    } finally {
      await unlink(temp);
    }
  }
  private async read<T>(kind: string, id: string, suffix: string): Promise<T> {
    const file = this.file(kind, id, suffix),
      s = await lstat(file);
    if (!s.isFile() || s.isSymbolicLink() || s.size > 4000000 || (process.platform !== "win32" && s.mode & 0o077))
      throw new FleetError("REVIEW_SCOPE", true);
    const record = JSON.parse(await readFile(file, "utf8"));
    return this.vault.decrypt<T>(record.cipher, this.aad(kind, id, suffix));
  }
  async inspectWhenPresent(
    kind: string,
    id: string,
    deadline: number,
  ): Promise<{ digest: string; detail: unknown; deadline: number }> {
    while (Date.now() < deadline) {
      try {
        return await this.read(kind, id, "request");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      await delay(25);
    }
    throw new FleetError("REVIEW_DEADLINE", true);
  }
  async respond(kind: string, id: string, requestDigest: string, verdict: unknown) {
    const request = await this.read<{ digest: string; deadline: number }>(kind, id, "request");
    if (request.digest !== requestDigest) throw new FleetError("REVIEW_SCOPE", true);
    if (Date.now() >= request.deadline) throw new FleetError("REVIEW_DEADLINE", true);
    await this.write(kind, id, "verdict", { requestDigest, verdict });
  }
  async request<T>(kind: string, id: string, detail: unknown, deadline: number): Promise<T> {
    if (!Number.isSafeInteger(deadline) || Date.now() >= deadline) throw new FleetError("REVIEW_DEADLINE", true);
    const digest = designDigest({ batchNonce: this.batchNonce, kind, id, detail, deadline });
    await this.write(kind, id, "request", { digest, detail, deadline });
    while (Date.now() < deadline) {
      try {
        const result = await this.read<{ requestDigest: string; verdict: T }>(kind, id, "verdict");
        if (result.requestDigest !== digest) throw new FleetError("REVIEW_SCOPE", true);
        if (Date.now() >= deadline) throw new FleetError("REVIEW_DEADLINE", true);
        return result.verdict;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    throw new FleetError("REVIEW_DEADLINE", true);
  }
}
