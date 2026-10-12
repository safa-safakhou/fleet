import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import Fastify from "fastify";
import { z } from "zod";
import { transaction } from "./db.js";
import { FleetError, object, profiles, safeCode } from "./domain.js";
import type { Engine } from "./engine.js";
import { Communications } from "./games/pact/communications.js";
import { actionKinds } from "./games/pact/contracts.js";
import type { CredentialBroker } from "./games/pact/credentials.js";
import { OwnerPolicy } from "./games/pact/owner.js";
import { Observability } from "./observability.js";
import type { Store } from "./store.js";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function buildServer(options: {
  store: Store;
  broker: CredentialBroker;
  engine: Engine;
  origin: string;
  operatorSecret: string;
  liveAllowed: boolean;
  demo?: boolean;
}) {
  if (options.operatorSecret.length < 32) throw new FleetError("OPERATOR_SECRET_REQUIRED");
  const app = Fastify({ logger: false, bodyLimit: 65536 }),
    store = options.store,
    comms = new Communications(store),
    failures = new Map<string, { count: number; until: number }>();
  app.setErrorHandler((error, _req, reply) => {
    const invalid = error instanceof z.ZodError;
    reply
      .code(invalid ? 400 : error instanceof FleetError ? 409 : 500)
      .send({ error: { code: invalid ? "INVALID_INPUT" : safeCode(error) } });
  });
  app.addHook("onSend", async (_r, reply, payload) => {
    reply
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer");
    return payload;
  });
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/") || request.url.split("?")[0] === "/api/login") return;
    const token = request.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("fleet_session="))
      ?.slice(14);
    const session = token
      ? (
          await store.pool.query("SELECT hash,csrf FROM operator_sessions WHERE hash=$1 AND expires_at>$2", [
            hash(token),
            store.now(),
          ])
        ).rows[0]
      : null;
    if (!session) return reply.code(401).send({ error: { code: "LOGIN_REQUIRED" } });
    Object.assign(request, { fleetSession: session });
    if (
      request.method !== "GET" &&
      (request.headers.origin !== options.origin || request.headers["x-csrf-token"] !== session.csrf)
    )
      return reply.code(403).send({ error: { code: "CSRF_REQUIRED" } });
  });
  app.post("/api/login", async (request, reply) => {
    if (request.headers.origin !== options.origin) return reply.code(403).send({ error: { code: "ORIGIN_REQUIRED" } });
    const now = store.now().getTime(),
      old = failures.get(request.ip);
    if (old && old.until > now && old.count >= 5) return reply.code(429).send({ error: { code: "LOGIN_RATE_LIMIT" } });
    const { password } = z
      .object({ password: z.string().max(256) })
      .strict()
      .parse(request.body);
    const actual = Buffer.from(hash(password), "hex"),
      expected = Buffer.from(hash(options.operatorSecret), "hex");
    if (!timingSafeEqual(actual, expected)) {
      if (failures.size > 1000) failures.clear();
      failures.set(request.ip, { count: (old && old.until > now ? old.count : 0) + 1, until: now + 60000 });
      return reply.code(401).send({ error: { code: "LOGIN_REQUIRED" } });
    }
    failures.delete(request.ip);
    const token = randomBytes(32).toString("base64url"),
      csrf = randomBytes(32).toString("base64url");
    await store.pool.query("INSERT INTO operator_sessions(hash,expires_at,csrf) VALUES($1,$2,$3)", [
      hash(token),
      new Date(now + 8 * 3600000),
      csrf,
    ]);
    reply.header(
      "set-cookie",
      `fleet_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${options.origin.startsWith("https:") ? "; Secure" : ""}`,
    );
    return { csrf };
  });
  const session = (r: unknown) => object(object(r).fleetSession);
  app.get("/api/session", async (r) => ({ csrf: session(r).csrf }));
  app.post("/api/logout", async (r, reply) => {
    await store.pool.query("DELETE FROM operator_sessions WHERE hash=$1", [session(r).hash]);
    reply.header("set-cookie", "fleet_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return { ok: true };
  });
  app.get("/api/state", async () => ({
    ...(await store.publicState()),
    liveEnabled: options.liveAllowed,
    demo: Boolean(options.demo),
    profiles,
    gameKinds: actionKinds,
  }));
  app.post("/api/cohorts", async (r) => store.create(r.body));
  app.post<{ Params: { id: string } }>("/api/cohorts/:id/configure", async (r) => {
    await store.configure(z.uuid().parse(r.params.id), r.body);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/cohorts/:id/state", async (r) => {
    const b = z
      .object({ state: z.enum(["running", "paused", "stopped"]) })
      .strict()
      .parse(r.body);
    await store.setState(z.uuid().parse(r.params.id), b.state, options.liveAllowed);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/cohorts/:id/observation", async (r) => {
    const b = z.object({ enabled: z.boolean() }).strict().parse(r.body);
    await store.consent(z.uuid().parse(r.params.id), b.enabled);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/cohorts/:id/owner-policy", async (r) => {
    return transaction(store.pool, async (client) => {
      const id = z.uuid().parse(r.params.id),
        p = OwnerPolicy.parse(r.body),
        c = (await client.query("SELECT * FROM cohorts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!c) throw new FleetError("NOT_FOUND");
      if (!["draft", "paused"].includes(c.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      if (
        (
          await client.query(
            "SELECT 1 FROM owner_decisions d JOIN agents a ON a.id=d.agent_id WHERE a.cohort_id=$1 LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new FleetError("CONSUMED_CONFIG_IMMUTABLE");
      await client.query("UPDATE cohorts SET synthetic_owner_policy=$2 WHERE id=$1", [id, p]);
      await store.audit(client, id, "owner.policy.configured", {
        allowedKinds: p.allowedKinds,
        maxCommands: p.maxCommands,
      });
      return { configured: true };
    });
  });
  app.post<{ Params: { id: string } }>("/api/agents/:id/state", async (r) => {
    const b = z
      .object({ state: z.enum(["ready", "paused"]) })
      .strict()
      .parse(r.body);
    await store.agentState(z.uuid().parse(r.params.id), b.state, options.liveAllowed);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/agents/:id/provision", async (r) =>
    options.broker.provision(z.uuid().parse(r.params.id), r.body),
  );
  app.post<{ Params: { id: string } }>("/api/agents/:id/social-delegation", async (r) =>
    options.broker.configureSocial(z.uuid().parse(r.params.id), r.body),
  );
  app.post<{ Params: { id: string } }>("/api/agents/:id/connect", async (r) =>
    options.broker.oauthStart(z.uuid().parse(r.params.id), String(session(r).hash)),
  );
  app.get("/api/oauth/callback", async (r, reply) => {
    const q = z
      .object({ state: z.string().max(100), code: z.string().max(1000) })
      .strict()
      .parse(r.query);
    await options.broker.oauthFinish(q.state, q.code, String(session(r).hash));
    return reply.redirect("/");
  });
  app.get<{ Params: { id: string }; Querystring: { peer: string; beforeAt?: string; beforeId?: string } }>(
    "/api/agents/:id/thread",
    async (r) => {
      const q = z
        .object({
          peer: z.uuid(),
          beforeAt: z.iso.datetime().optional(),
          beforeId: z.uuid().optional(),
          beforeTime: z
            .string()
            .regex(/^\d{1,20}$/)
            .optional(),
        })
        .strict()
        .parse(r.query);
      if (Boolean(q.beforeAt) !== Boolean(q.beforeId)) throw new FleetError("INVALID_CURSOR");
      return comms.thread(
        z.uuid().parse(r.params.id),
        q.peer,
        q.beforeAt && q.beforeId ? { at: q.beforeAt, id: q.beforeId, time: q.beforeTime } : undefined,
      );
    },
  );
  const historyQuery = z.object({ beforeAt: z.iso.datetime().optional(), beforeId: z.uuid().optional() }).strict();
  app.get<{ Params: { id: string } }>("/api/agents/:id/inspection", async (r) => {
    const q = historyQuery.parse(r.query);
    return new Observability(store).inspect(z.uuid().parse(r.params.id), q);
  });
  app.get<{ Params: { id: string } }>("/api/cohorts/:id/turns", async (r) => {
    const q = historyQuery.extend({ agentId: z.uuid().optional() }).parse(r.query);
    return new Observability(store).history(z.uuid().parse(r.params.id), q.agentId, q);
  });
  app.post<{ Params: { id: string } }>("/api/turns/:id/reconcile", async (r) =>
    options.engine.reconcile(z.uuid().parse(r.params.id)),
  );
  app.post<{ Params: { id: string } }>("/api/turns/:id/review", async (r) => {
    await store.reviewTurn(z.uuid().parse(r.params.id));
    return { reviewed: true };
  });
  app.get("/health", async () => ({ ok: true, service: "fleet", game: "pact", liveEnabled: options.liveAllowed }));
  app.get("/*", async (request, reply) => {
    const path = request.url.split("?")[0],
      root = resolve("dist/web"),
      file = path.startsWith("/assets/") ? resolve(root, `.${decodeURIComponent(path)}`) : resolve(root, "index.html");
    if (!file.startsWith(root + sep)) return reply.code(404).send();
    try {
      const body = await readFile(file);
      reply.header(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      return reply
        .type(file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html")
        .send(body);
    } catch {
      return reply.code(404).send({ error: { code: "WEB_BUILD_REQUIRED" } });
    }
  });
  return app;
}
