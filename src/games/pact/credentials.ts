import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../db.js";
import { type Data, FleetError, object } from "../../domain.js";
import { jsonRequest } from "../../http.js";
import type { Store } from "../../store.js";
import { McpGame } from "./mcp.js";
import { refreshFailureEvidence } from "./refresh-evidence.js";

export interface Credentials {
  synthetic?: boolean;
  entryKey?: string;
  cookie?: string;
  csrfToken?: string;
  clientId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  mandateReady?: boolean;
  accountId?: string;
  kingdomId?: string;
  socialPending?: { commandId: string; action: Data };
}
const SocialSetup = z
  .object({
    mode: z.enum(["manual", "allowlist", "agent_decides"]),
    allowedKingdomIds: z.array(z.uuid()).max(100).default([]),
  })
  .strict();
export class CredentialBroker {
  constructor(
    private store: Store,
    private base: string,
    private origin: string,
    private liveAllowed: boolean,
  ) {}
  private enabled() {
    if (!this.liveAllowed) throw new FleetError("LIVE_EXECUTION_DISABLED");
  }
  async load(id: string): Promise<Credentials> {
    const a = await this.store.agent(id);
    return a.secret_cipher ? this.store.vault.decrypt<Credentials>(a.secret_cipher, `agent:${id}`) : {};
  }
  async save(id: string, secret: Credentials, state: string) {
    await this.store.pool.query("UPDATE agents SET secret_cipher=$2,credential_state=$3 WHERE id=$1", [
      id,
      this.store.vault.encrypt(secret, `agent:${id}`),
      state,
    ]);
  }
  private async ownerHttp(secret: Credentials, path: string, body?: Data) {
    const result = await jsonRequest(this.base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        origin: new URL(this.base).origin,
        ...(secret.cookie ? { cookie: secret.cookie, "x-csrf-token": secret.csrfToken ?? "" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cookie = result.headers.get("set-cookie")?.split(";")[0];
    if (cookie) secret.cookie = cookie;
    return result.data;
  }
  private async token(secret: Credentials, body: Data) {
    const r = await this.ownerHttp(secret, "/oauth/token", body);
    if (
      typeof r.access_token !== "string" ||
      typeof r.refresh_token !== "string" ||
      typeof r.expires_in !== "number" ||
      !Number.isFinite(r.expires_in) ||
      r.expires_in <= 0
    )
      throw new FleetError("AUTH_REQUIRED");
    secret.accessToken = r.access_token;
    secret.refreshToken = r.refresh_token;
    secret.expiresAt = this.store.now().getTime() + r.expires_in * 1000;
  }
  private async lock<T>(id: string, operation: () => Promise<T>) {
    const c = await this.store.pool.connect();
    let locked = false;
    try {
      locked = (await c.query("SELECT pg_try_advisory_lock(hashtextextended($1,19281463)) locked", [id])).rows[0]
        .locked;
      if (!locked) throw new FleetError("AUTH_BUSY");
      return await operation();
    } finally {
      if (locked) await c.query("SELECT pg_advisory_unlock(hashtextextended($1,19281463))", [id]);
      c.release();
    }
  }
  private async refresh(id: string, s: Credentials) {
    if ((s.expiresAt ?? 0) > this.store.now().getTime() + 60000) return;
    if (!s.refreshToken || !s.clientId) throw new FleetError("AUTH_REQUIRED");
    const before = await this.store.agent(id);
    const actual = before.secret_cipher
      ? this.store.vault.decrypt<Credentials>(before.secret_cipher, `agent:${id}`)
      : {};
    if (
      actual.refreshToken !== s.refreshToken ||
      actual.accessToken !== s.accessToken ||
      actual.clientId !== s.clientId
    )
      throw new FleetError("CLAIM_FENCED");
    const encrypted = this.store.vault.encrypt(s, `agent:${id}`);
    const started = await this.store.pool.query(
      "UPDATE agents SET secret_cipher=$2,credential_state='refreshing' WHERE id=$1 AND secret_cipher IS NOT DISTINCT FROM $3 AND fence=$4 AND account_id IS NOT DISTINCT FROM $5",
      [id, encrypted, before.secret_cipher, before.fence, before.account_id],
    );
    if (started.rowCount !== 1) throw new FleetError("CLAIM_FENCED");
    const audit = async (phase: string, attempt: number) =>
      this.store.audit(this.store.pool, before.cohort_id, "credential.refresh", {
        agentId: id,
        phase,
        attempt,
        meaning: "Metadata only; no credential or usage review.",
      });
    const current = async () => {
      const row = await this.store.agent(id);
      if (row.fence !== before.fence || row.secret_cipher !== encrypted || row.account_id !== before.account_id)
        throw new FleetError("CLAIM_FENCED");
    };
    let lastEvidence = "not_processed";
    try {
      await audit("started", 0);
      for (let attempt = 1; attempt <= 2; attempt++) {
        await current();
        try {
          lastEvidence = "rotation_unknown";
          await this.token(s, {
            grant_type: "refresh_token",
            client_id: s.clientId,
            refresh_token: s.refreshToken,
            resource: `${this.base}/mcp`,
          });
          lastEvidence = "rotated";
          const saved = await this.store.pool.query(
            "UPDATE agents SET secret_cipher=$2,credential_state='ready' WHERE id=$1 AND secret_cipher=$3 AND fence=$4 AND account_id IS NOT DISTINCT FROM $5",
            [id, this.store.vault.encrypt(s, `agent:${id}`), encrypted, before.fence, before.account_id],
          );
          if (saved.rowCount !== 1) throw new FleetError("CLAIM_FENCED");
          await audit("rotation_response_saved", attempt);
          return;
        } catch (error) {
          if (lastEvidence === "rotated" || (error instanceof FleetError && error.code === "CLAIM_FENCED")) throw error;
          lastEvidence = refreshFailureEvidence(error);
          await audit(lastEvidence, attempt);
          if (lastEvidence !== "not_processed") throw error;
          if (attempt === 2) {
            await current();
            const reset = await this.store.pool.query(
              "UPDATE agents SET credential_state='ready' WHERE id=$1 AND secret_cipher=$2 AND fence=$3",
              [id, encrypted, before.fence],
            );
            if (reset.rowCount !== 1) throw new FleetError("CLAIM_FENCED");
            throw new FleetError("AUTH_TEMPORARY");
          }
        }
      }
    } catch (error) {
      if (error instanceof FleetError && error.code === "AUTH_TEMPORARY") throw error;
      if (error instanceof FleetError && error.code === "CLAIM_FENCED" && lastEvidence === "not_processed") {
        await this.store.pool.query(
          "UPDATE agents SET credential_state='ready' WHERE id=$1 AND secret_cipher=$2 AND credential_state='refreshing'",
          [id, encrypted],
        );
        throw error;
      }

      // CAS never overwrites a newer grant. A paused/stale worker may only quarantine
      // its own still-refreshing ciphertext, preserving tokens and all pending/usage state.
      await this.store.pool.query(
        "UPDATE agents SET credential_state='needs_reconnect',state=CASE WHEN state IN('stopped','finished','paused') THEN state ELSE 'needs_owner' END,reason=$3,fence=fence+1 WHERE id=$1 AND secret_cipher=$2 AND credential_state='refreshing'",
        [
          id,
          encrypted,
          lastEvidence === "rotated"
            ? "REFRESH_FENCED_ROTATION"
            : lastEvidence === "rejected"
              ? "REFRESH_REJECTED"
              : "REFRESH_UNCERTAIN",
        ],
      );
      throw new FleetError("AUTH_REQUIRED");
    }
  }
  async game(id: string) {
    this.enabled();
    return this.lock(id, async () => {
      const a = await this.store.agent(id),
        s = await this.load(id);
      if (a.credential_state !== "ready" || !s.accessToken || !a.account_id) throw new FleetError("AUTH_REQUIRED");
      await this.refresh(id, s);
      const game = new McpGame(this.base, s.accessToken);
      await game.init();
      const p = await game.profile();
      if (p.accountId !== a.account_id) {
        await game.close();
        throw new FleetError("IDENTITY_MISMATCH");
      }
      return game;
    });
  }
  async provision(id: string, mandate: unknown) {
    this.enabled();
    const input = z
      .object({
        allowedActions: z.array(z.string().max(80)).min(1).max(80),
        resourceLimits: z.record(z.enum(["iron", "silver", "grain"]), z.string().regex(/^\d{1,12}$/)),
        reserveFloors: z.partialRecord(z.enum(["iron", "silver", "grain"]), z.string().regex(/^\d{1,12}$/)),
        troopLimit: z.number().int().min(0),
        sessionLimit: z.literal(1),
        socialDelegation: SocialSetup.optional(),
      })
      .strict()
      .parse(mandate);
    const { socialDelegation, ...m } = input;
    return this.lock(id, async () => {
      const a = await this.store.agent(id),
        cohort = await this.store.cohort(a.cohort_id);
      if (cohort.state === "running" || ["stopped", "finished"].includes(cohort.state))
        throw new FleetError("COHORT_NOT_EDITABLE");
      await transaction(this.store.pool, async (c) => {
        const current = (await c.query("SELECT state FROM cohorts WHERE id=$1 FOR UPDATE", [a.cohort_id])).rows[0];
        if (!["draft", "paused"].includes(current.state)) throw new FleetError("COHORT_NOT_EDITABLE");
        await c.query("UPDATE agents SET state='unconnected',fence=fence+1 WHERE id=$1", [id]);
      });
      const s = await this.load(id);
      if (a.account_id && !s.synthetic) throw new FleetError("ACCOUNT_ALREADY_ATTACHED");
      s.synthetic = true;
      s.entryKey ??= randomUUID();
      await this.save(id, s, "provisioning");
      try {
        const joined = await this.ownerHttp(s, "/v1/play/join", {
          entryKey: s.entryKey,
          nickname: a.name,
          existingOnly: Boolean(a.account_id),
        });
        if (
          typeof joined.accountId !== "string" ||
          typeof joined.kingdomId !== "string" ||
          typeof joined.csrfToken !== "string"
        )
          throw new FleetError("PROVISIONING_UNCERTAIN");
        if (a.account_id && a.account_id !== joined.accountId) throw new FleetError("IDENTITY_MISMATCH");
        if (a.kingdom_id && a.kingdom_id !== joined.kingdomId) throw new FleetError("IDENTITY_MISMATCH");
        s.accountId = joined.accountId;
        s.kingdomId = joined.kingdomId;
        s.csrfToken = joined.csrfToken;
        await this.save(id, s, "provisioning");
        await this.store.pool.query("UPDATE agents SET account_id=$2,kingdom_id=$3 WHERE id=$1", [
          id,
          s.accountId,
          s.kingdomId,
        ]);
        if (a.credential_state === "needs_reconnect") {
          delete s.accessToken;
          delete s.refreshToken;
          delete s.expiresAt;
        }
        if (!s.mandateReady) {
          const current = await this.ownerHttp(s, "/v1/mandate");
          await this.ownerHttp(s, "/v1/mandate", { ...m, expectedVersion: current.version });
          s.mandateReady = true;
          await this.save(id, s, "provisioning");
        }
        if (!s.accessToken) {
          const redirect = "http://127.0.0.1:38491/callback";
          if (!s.clientId) {
            const r = await this.ownerHttp(s, "/oauth/register", {
              client_name: `PACT Fleet ${a.name}`,
              redirect_uris: [redirect],
              audience: "mcp",
            });
            s.clientId = String(r.client_id);
            await this.save(id, s, "provisioning");
          }
          const verifier = randomBytes(32).toString("base64url"),
            auth = await this.ownerHttp(s, "/oauth/authorize", {
              client_id: s.clientId,
              redirect_uri: redirect,
              scope: "world:read messages:write game:act",
              code_challenge: createHash("sha256").update(verifier).digest("base64url"),
              code_challenge_method: "S256",
              resource: `${this.base}/mcp`,
              subject_label: a.name,
              audience: "mcp",
            });
          await this.token(s, {
            grant_type: "authorization_code",
            client_id: s.clientId,
            code: auth.code,
            redirect_uri: redirect,
            code_verifier: verifier,
            resource: `${this.base}/mcp`,
          });
        }
        await this.save(id, s, "ready");
        await this.store.pool.query("UPDATE agents SET state='ready',reason=NULL WHERE id=$1", [id]);
        const game = await this.gameAfterProvision(s);
        try {
          if (socialDelegation) await this.applySocial(id, s, socialDelegation, game);
        } finally {
          await game.close();
        }
        return { accountId: s.accountId, kingdomId: s.kingdomId };
      } catch {
        await this.save(id, s, "needs_reconnect");
        await this.store.pool.query(
          "UPDATE agents SET state='needs_owner',reason='PROVISIONING_UNCERTAIN' WHERE id=$1",
          [id],
        );
        throw new FleetError("PROVISIONING_UNCERTAIN");
      }
    });
  }
  private async applySocial(id: string, s: Credentials, input: z.infer<typeof SocialSetup>, game: McpGame) {
    const cohort = await this.store.cohort((await this.store.agent(id)).cohort_id);
    if (
      !["draft", "paused"].includes(cohort.state) ||
      (cohort.budget?.deadlineAt && Date.parse(cohort.budget.deadlineAt) <= this.store.now().getTime())
    )
      throw new FleetError("COHORT_NOT_EDITABLE");
    if (!s.synthetic || !s.entryKey) throw new FleetError("SYNTHETIC_OWNER_REQUIRED");
    const policy = object((await game.read("pact_agent_guide_v1", {})).socialDelegation);
    const matches = (value: Data) =>
      value.mode === input.mode &&
      JSON.stringify([...((value.allowedKingdomIds as string[]) ?? [])].sort()) ===
        JSON.stringify([...new Set(input.allowedKingdomIds)].sort());
    if (
      s.socialPending &&
      (s.socialPending.action.mode !== input.mode ||
        JSON.stringify(s.socialPending.action.allowedKingdomIds) !==
          JSON.stringify([...new Set(input.allowedKingdomIds)]))
    )
      throw new FleetError("SOCIAL_DECISION_PENDING");
    if (matches(policy)) {
      delete s.socialPending;
      await this.save(id, s, "ready");
      return { verified: true, mode: input.mode };
    }
    if (s.socialPending) throw new FleetError("SOCIAL_DECISION_PENDING");
    if (!Number.isInteger(policy.version)) throw new FleetError("INVALID_REMOTE_RESPONSE");
    s.socialPending ??= {
      commandId: randomUUID(),
      action: {
        kind: "contact.delegation",
        mode: input.mode,
        allowedKingdomIds: [...new Set(input.allowedKingdomIds)],
        expectedVersion: policy.version,
      },
    };
    await this.save(id, s, "ready");
    const response = await this.ownerHttp(s, "/v1/social/commands", {
      schemaVersion: "pact.social-command.v2",
      ...s.socialPending,
    });
    const receipt = object(response.receipt);
    if (
      receipt.commandId !== s.socialPending.commandId ||
      !["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code))
    )
      throw new FleetError("SOCIAL_SETUP_UNVERIFIED");
    if (!matches(object((await game.read("pact_agent_guide_v1", {})).socialDelegation)))
      throw new FleetError("SOCIAL_SETUP_UNVERIFIED");
    delete s.socialPending;
    await this.save(id, s, "ready");
    return { verified: true, mode: input.mode };
  }
  async configureSocial(id: string, input: unknown) {
    this.enabled();
    const setup = SocialSetup.parse(input);
    return this.lock(id, async () => {
      const a = await this.store.agent(id),
        s = await this.load(id);
      const cohort = await this.store.cohort(a.cohort_id);
      if (
        !["draft", "paused"].includes(cohort.state) ||
        (cohort.budget?.deadlineAt && Date.parse(cohort.budget.deadlineAt) <= this.store.now().getTime())
      )
        throw new FleetError("COHORT_NOT_EDITABLE");
      if (!s.synthetic || a.account_id !== s.accountId || a.kingdom_id !== s.kingdomId)
        throw new FleetError("SYNTHETIC_OWNER_REQUIRED");
      if (a.credential_state !== "ready" || !s.accessToken) throw new FleetError("AUTH_REQUIRED");
      await this.refresh(id, s);
      const joined = await this.ownerHttp(s, "/v1/play/join", { entryKey: s.entryKey, existingOnly: true });
      if (joined.accountId !== a.account_id || joined.kingdomId !== a.kingdom_id)
        throw new FleetError("IDENTITY_MISMATCH");
      if (typeof joined.csrfToken !== "string") throw new FleetError("AUTH_REQUIRED");
      s.csrfToken = joined.csrfToken;
      const game = await this.gameAfterProvision(s);
      try {
        return await this.applySocial(id, s, setup, game);
      } finally {
        await game.close();
      }
    });
  }
  private async gameAfterProvision(s: Credentials) {
    const game = new McpGame(this.base, s.accessToken ?? "");
    await game.init();
    if ((await game.profile()).accountId !== s.accountId) {
      await game.close();
      throw new FleetError("IDENTITY_MISMATCH");
    }
    if (object((await game.read("pact_world_read_v1", { forecastMinutes: 60 })).profile).kingdomId !== s.kingdomId) {
      await game.close();
      throw new FleetError("IDENTITY_MISMATCH");
    }
    return game;
  }
  async oauthStart(id: string, operatorSession: string) {
    this.enabled();
    const a = await this.store.agent(id),
      cohort = await this.store.cohort(a.cohort_id);
    if (["running", "stopped", "finished"].includes(cohort.state)) throw new FleetError("COHORT_NOT_EDITABLE");
    const agentFence = await transaction(this.store.pool, async (c) => {
      const current = (await c.query("SELECT state FROM cohorts WHERE id=$1 FOR UPDATE", [a.cohort_id])).rows[0];
      if (!["draft", "paused"].includes(current.state)) throw new FleetError("COHORT_NOT_EDITABLE");
      return (await c.query("UPDATE agents SET state='unconnected',fence=fence+1 WHERE id=$1 RETURNING fence", [id]))
        .rows[0].fence;
    });
    const redirect = `${this.origin}/api/oauth/callback`,
      verifier = randomBytes(32).toString("base64url"),
      state = randomBytes(32).toString("base64url");
    const { data: r } = await jsonRequest(`${this.base}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(this.base).origin },
      body: JSON.stringify({ client_name: "PACT Agent Fleet", redirect_uris: [redirect], audience: "mcp" }),
    });
    if (typeof r.client_id !== "string") throw new FleetError("AUTH_REQUIRED");
    await this.store.pool.query(
      "INSERT INTO oauth_attempts(state,agent_id,operator_session,secret_cipher,expires_at) VALUES($1,$2,$3,$4,$5)",
      [
        state,
        id,
        operatorSession,
        this.store.vault.encrypt({ clientId: r.client_id, verifier, redirect, agentFence }, `oauth:${state}`),
        new Date(this.store.now().getTime() + 600000),
      ],
    );
    const url = new URL(`${this.base}/oauth/authorize`);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: r.client_id,
      redirect_uri: redirect,
      scope: "world:read messages:write game:act",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource: `${this.base}/mcp`,
      state,
    }))
      url.searchParams.set(k, v);
    return { url: url.href };
  }
  async oauthFinish(state: string, code: string, session: string) {
    this.enabled();
    const pending = (
      await this.store.pool.query(
        "SELECT agent_id FROM oauth_attempts WHERE state=$1 AND operator_session=$2 AND phase='pending' AND expires_at>$3",
        [state, session, this.store.now()],
      )
    ).rows[0];
    if (!pending) throw new FleetError("OAUTH_STATE_INVALID");
    return this.lock(pending.agent_id, () => this.oauthFinishLocked(state, code, session));
  }
  private async oauthFinishLocked(state: string, code: string, session: string) {
    this.enabled();
    const attempt = await transaction(this.store.pool, async (c) => {
      const r = (
        await c.query(
          "SELECT * FROM oauth_attempts WHERE state=$1 AND operator_session=$2 AND phase='pending' AND expires_at>$3 FOR UPDATE",
          [state, session, this.store.now()],
        )
      ).rows[0];
      if (!r) throw new FleetError("OAUTH_STATE_INVALID");
      await c.query("UPDATE oauth_attempts SET phase='exchanging' WHERE state=$1", [state]);
      return r;
    });
    const s = this.store.vault.decrypt<{ clientId: string; verifier: string; redirect: string; agentFence?: string }>(
        attempt.secret_cipher,
        `oauth:${state}`,
      ),
      tokens: Credentials = { ...(await this.load(attempt.agent_id)), clientId: s.clientId };
    const original = await this.store.agent(attempt.agent_id);
    try {
      if (
        typeof s.agentFence !== "string" ||
        !/^(0|[1-9][0-9]*)$/.test(s.agentFence) ||
        original.fence !== s.agentFence
      )
        throw new FleetError("CLAIM_FENCED");
      if (!["draft", "paused"].includes((await this.store.cohort(original.cohort_id)).state))
        throw new FleetError("COHORT_NOT_EDITABLE");
      await this.token(tokens, {
        grant_type: "authorization_code",
        client_id: s.clientId,
        code,
        redirect_uri: s.redirect,
        code_verifier: s.verifier,
        resource: `${this.base}/mcp`,
      });
      const game = new McpGame(this.base, tokens.accessToken ?? "");
      await game.init();
      try {
        const profile = await game.profile();
        const world = await game.read("pact_world_read_v1", { forecastMinutes: 60 });
        const kingdom = object(world.profile).kingdomId;
        if (typeof kingdom !== "string") throw new FleetError("KINGDOM_REQUIRED");
        await transaction(this.store.pool, async (c) => {
          const a = await this.store.agent(attempt.agent_id, c);
          const cohort = (await c.query("SELECT state FROM cohorts WHERE id=$1 FOR UPDATE", [a.cohort_id])).rows[0];
          if (!["draft", "paused"].includes(cohort.state)) throw new FleetError("COHORT_NOT_EDITABLE");
          if (a.fence !== s.agentFence || a.secret_cipher !== original.secret_cipher)
            throw new FleetError("CLAIM_FENCED");
          if (a.account_id && a.account_id !== profile.accountId) throw new FleetError("IDENTITY_MISMATCH");
          if (a.kingdom_id && a.kingdom_id !== kingdom) throw new FleetError("IDENTITY_MISMATCH");
          const saved = await c.query(
            "UPDATE agents SET account_id=$2,kingdom_id=$3,secret_cipher=$4,credential_state='ready',state='ready',reason=NULL,fence=fence+1 WHERE id=$1 AND fence=$5 AND secret_cipher IS NOT DISTINCT FROM $6",
            [
              a.id,
              profile.accountId,
              kingdom,
              this.store.vault.encrypt(tokens, `agent:${a.id}`),
              s.agentFence,
              original.secret_cipher,
            ],
          );
          if (saved.rowCount !== 1) throw new FleetError("CLAIM_FENCED");
          await c.query("DELETE FROM oauth_attempts WHERE state=$1", [state]);
        });
      } finally {
        await game.close();
      }
    } catch {
      await this.store.pool.query("UPDATE oauth_attempts SET phase='uncertain' WHERE state=$1", [state]);
      throw new FleetError("OAUTH_RECONNECT_REQUIRED");
    }
  }
  async ownerRequest(id: string, route: "command" | "seal-preview" | "chronicle-preview", body: Data) {
    this.enabled();
    return this.lock(id, async () => {
      const a = await this.store.agent(id),
        s = await this.load(id);
      if (!s.synthetic || !s.entryKey || !a.account_id || a.account_id !== s.accountId)
        throw new FleetError("SYNTHETIC_OWNER_REQUIRED");
      const joined = await this.ownerHttp(s, "/v1/play/join", { entryKey: s.entryKey, existingOnly: true });
      if (joined.accountId !== a.account_id) throw new FleetError("IDENTITY_MISMATCH");
      if (typeof joined.csrfToken !== "string") throw new FleetError("AUTH_REQUIRED");
      s.csrfToken = joined.csrfToken;
      await this.save(id, s, "ready");
      const path =
        route === "command" ? "/v1/commands" : route === "seal-preview" ? "/v1/seals/preview" : "/v1/chronicle/preview";
      const result = await this.ownerHttp(s, path, body);
      await this.save(id, s, "ready");
      return result;
    });
  }
}
