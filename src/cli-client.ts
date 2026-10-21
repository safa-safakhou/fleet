import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ArchitectureManifest } from "./platform/architecture.js";
import type { LaunchCheck } from "./platform/launch-contracts.js";

export interface LaunchClient {
  catalog(): Promise<{ architectures: ArchitectureManifest[] }>;
  check(spec: unknown): Promise<LaunchCheck>;
  draft(input: unknown): Promise<{ draftId: string; digest: string }>;
  start(input: unknown): Promise<{ cohortId: string; digest: string; state: string }>;
  login(secret: string): Promise<void>;
  logout(): Promise<void>;
}
const Session = z
  .object({
    origin: z.url(),
    cookie: z.string().regex(/^fleet_session=[A-Za-z0-9_-]+$/),
    csrf: z.string().min(1).max(256),
  })
  .strict();
type SessionValue = z.infer<typeof Session>;
export class CliError extends Error {
  constructor(
    public code: string,
    public exitCode = 1,
  ) {
    super(code);
  }
}
export class SessionFile {
  constructor(private path: string) {}
  private async inspect() {
    const stat = await lstat(this.path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
    )
      throw new CliError("UNSAFE_SESSION_FILE");
    return stat;
  }
  async load(): Promise<SessionValue | null> {
    try {
      const stat = await this.inspect();
      if (stat.size > 4096) throw new CliError("INVALID_SESSION_FILE");
      return Session.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new CliError("INVALID_SESSION_FILE");
    }
  }
  async save(value: SessionValue) {
    try {
      await this.inspect();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(Session.parse(value)), { mode: 0o600, flag: "wx" });
      await rename(temporary, this.path);
    } finally {
      await unlink(temporary).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    }
  }
  async clear() {
    try {
      await this.inspect();
      await unlink(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
export class HttpLaunchClient implements LaunchClient {
  private origin: string;
  private session: SessionValue | null = null;
  constructor(
    origin: string,
    private fetcher: typeof fetch = fetch,
    private file?: SessionFile,
  ) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new CliError("INVALID_FLEET_ORIGIN", 2);
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new CliError("INVALID_FLEET_ORIGIN", 2);
    this.origin = url.origin;
  }
  private async request<T>(path: string, body?: unknown): Promise<{ data: T; cookie: string | null }> {
    if (!this.session && this.file) this.session = await this.file.load();
    if (this.session && this.session.origin !== this.origin) throw new CliError("SESSION_ORIGIN_MISMATCH");
    let response: Response;
    try {
      response = await this.fetcher(`${this.origin}/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          origin: this.origin,
          "content-type": "application/json",
          ...(this.session ? { cookie: this.session.cookie, "x-csrf-token": this.session.csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new CliError("FLEET_UNAVAILABLE");
    }
    if (
      response.redirected ||
      (response.url && new URL(response.url).origin !== this.origin) ||
      (response.status >= 300 && response.status < 400)
    )
      throw new CliError("FLEET_REDIRECT_REFUSED");
    let data: unknown;
    try {
      data = JSON.parse(await response.text());
    } catch {
      throw new CliError("INVALID_FLEET_RESPONSE");
    }
    if (!response.ok) {
      const code = (data as { error?: { code?: unknown } })?.error?.code;
      throw new CliError(
        typeof code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : "FLEET_REQUEST_FAILED",
        response.status === 400 ? 2 : response.status === 409 ? 3 : 1,
      );
    }
    return { data: data as T, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null };
  }
  async catalog() {
    return (await this.request<{ architectures: ArchitectureManifest[] }>("/architectures")).data;
  }
  async check(spec: unknown) {
    return (await this.request<LaunchCheck>("/launch/check", spec)).data;
  }
  async draft(input: unknown) {
    return (await this.request<{ draftId: string; digest: string }>("/launch/drafts", input)).data;
  }
  async start(input: unknown) {
    return (await this.request<{ cohortId: string; digest: string; state: string }>("/launch/start", input)).data;
  }
  async login(secret: string) {
    if (!secret || secret.length > 256) throw new CliError("INVALID_OPERATOR_SECRET", 2);
    const result = await this.request<{ csrf: string }>("/login", { password: secret });
    this.session = Session.parse({ origin: this.origin, cookie: result.cookie, csrf: result.data.csrf });
    await this.file?.save(this.session);
  }
  async logout() {
    try {
      await this.request("/logout", {});
    } finally {
      this.session = null;
      await this.file?.clear();
    }
  }
}
