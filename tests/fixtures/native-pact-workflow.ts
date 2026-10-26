import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { DecisionSupportReader, outlookFeasibility } from "../../../pact/packages/application/src/index.js";
import { ProductScopeSchema } from "../../../pact/packages/contracts/src/index.js";
import { AgentEventService } from "../../../pact/packages/inbox/src/agent-events.js";
import { AgentOutlookService, KingdomDiscoveryReader } from "../../../pact/packages/kingdom/dist/index.js";
import { AgentEventProjector } from "../../../pact/packages/kingdom/src/agent-events.js";
import { McpTransport } from "../../../pact/packages/mcp/src/transport.js";
import { OAuthService } from "../../../pact/packages/oauth/src/service.js";
import { RunService } from "../../../pact/packages/runs/src/service.js";
import { actionEffectsFixture } from "../../../pact/tests/fixtures/action-effects.js";
import type { Data } from "../../src/domain.js";
import { McpGame } from "../../src/games/pact/mcp.js";

/** Real MCP sessions/leases, native reads, quotes and command handlers; synthetic owned DB only. */
export async function nativePactWorkflow(options: { completeCatalog?: boolean } = {}) {
  const f = await actionEffectsFixture(),
    app = Fastify();
  const principals = new Map<string, Awaited<ReturnType<typeof f.owner>>["principal"]>();
  let oauth: OAuthService;
  let agentFeed: AgentEventService;
  const clock = { now: () => new Date() },
    runs = new RunService(f.pool, { productScope: "pact", clock });
  const unused = async (): Promise<never> => {
    throw Error("UNEXPECTED_OPTIONAL_FIXTURE_OPERATION");
  };
  const transport = new McpTransport({
    // Advertise the production catalog when exercising runtime composition.
    // Unused capabilities fail loudly; actual guide/world/outlook/quotes use native handlers below.
    ...(options.completeCatalog
      ? {
          persistentPlay: { read: unused },
          privateMemory: { read: unused, source: unused, write: unused },
          playView: { read: unused },
          councilThreads: { read: unused },
          conversationHistory: { agreements: unused, versions: unused },
          notes: { read: unused, write: unused },
          seasons: { read: unused },
          publicProfiles: { read: unused },
          courts: { read: unused },
          politics: { read: unused },
          seals: { read: unused },
          chronicle: { read: unused },
          runReports: { read: unused },
          reports: { read: unused },
          inbox: { readBounded: unused },
          agentEvents: { read: (...args: Parameters<AgentEventService["read"]>) => agentFeed.read(...args) },
          conversations: { read: unused },
          approvals: { read: unused },
          approvalProposals: { proposeAgent: unused },
        }
      : {}),
    pool: f.pool,
    productScope: "pact",
    dispatcher: f.dispatcher,
    origin: "http://127.0.0.1",
    clock,
    runLeases: runs,
    actionEffects: f.effects,
    worldViews: f.views,
    agentGuide: f.guide,
    profile: { read: async () => ({ nickname: "Synthetic fixture" }) },
    kingdomDiscovery: new KingdomDiscoveryReader(f.pool, "pact"),
    decisionSupport: new DecisionSupportReader(f.views),
    agentOutlook: new AgentOutlookService(f.pool, "pact", f.views, outlookFeasibility),
  });
  let connections = 0;
  app.route({
    method: ["POST", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      const token = String(request.headers.authorization).replace(/^Bearer /, "");
      const grant = await oauth.introspectAccessToken(token);
      const principal = grant
        ? {
            accountId: grant.accountId,
            productScope: ProductScopeSchema.parse("pact"),
            audience: "agent" as const,
            agentGrantId: grant.grantId,
            agentScopes: grant.scopes.filter((s): s is "world:read" | "game:act" | "messages:write" =>
              ["world:read", "game:act", "messages:write"].includes(s),
            ),
          }
        : principals.get(token);
      if (!principal) return reply.code(401).send({ error: "FIXTURE_AUTH_REQUIRED" });
      const session = request.headers["mcp-session-id"] as string | undefined;
      try {
        if (request.method === "DELETE") {
          await transport.closeSession(principal, session!);
          return reply.code(204).send();
        }
        const body = request.body as Data;
        const result = await transport.handlePost(principal, body as never, session);
        if (body.method === "initialize") connections++;
        if (result.sessionId) reply.header("Mcp-Session-Id", result.sessionId);
        return reply.code(body.method === "notifications/initialized" ? 202 : 200).send(result.response);
      } catch (error) {
        return reply
          .code(Number((error as { httpStatus?: number }).httpStatus ?? 400))
          .send({ code: String((error as { code?: string }).code ?? "FIXTURE_ERROR") });
      }
    },
  });
  app.get("/.well-known/oauth-authorization-server", async () => ({}));
  app.post("/oauth/token", async (request) => {
    const body = request.body as Data;
    const tokens = await oauth.refresh({
      clientId: String(body.client_id),
      refreshToken: String(body.refresh_token),
      resource: String(body.resource),
    });
    return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_in: tokens.expiresIn };
  });
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  const projector = new AgentEventProjector(f.pool, {
    productScope: "pact",
    clock,
    publish: (c, event) => agentFeed.publishForAccount(c, event),
  });
  agentFeed = new AgentEventService(f.pool, {
    productScope: "pact",
    worldScope: base,
    clock,
    cursorKey: Buffer.alloc(32, 7),
    authorizeOwner: (c, account) => projector.authorizeOwner(c, account),
    authorize: (c, account, event) => projector.authorized(c, account, event),
  });
  oauth = new OAuthService(f.pool, {
    productScope: "pact",
    issuer: base,
    mcpResource: `${base}/mcp`,
    humanResource: `${base}/native`,
    clock,
  });
  let lastWall = Date.now();
  return {
    ...f,
    runs,
    base,
    oauth,
    async authorize(accountId: string) {
      const client = await oauth.registerDynamic({
        displayName: "Native fixture",
        audience: "mcp",
        redirectUris: ["https://fixture.example/callback"],
      });
      const verifier = randomBytes(32).toString("base64url");
      const auth = await oauth.beginAuthorization({
        clientId: client.clientId,
        redirectUri: "https://fixture.example/callback",
        scopes: "world:read game:act",
        codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
        codeChallengeMethod: "S256",
        resource: `${base}/mcp`,
        accountId,
        subjectLabel: "Synthetic",
        expectedAudience: "mcp",
      });
      const tokens = await oauth.exchangeAuthorizationCode({
        clientId: client.clientId,
        code: auth.code,
        redirectUri: "https://fixture.example/callback",
        codeVerifier: verifier,
        resource: `${base}/mcp`,
      });
      return { clientId: client.clientId, ...tokens };
    },
    get connections() {
      return connections;
    },
    async addOwner() {
      const owner = await f.owner(),
        token = randomUUID();
      await runs.releaseMcpLease({ accountId: owner.accountId, holderId: owner.principal.sessionId! });
      await f.pool.query("UPDATE kingdoms SET ambition=$2 WHERE id=$1", [
        owner.kingdomId,
        "Develop Hall II through its actual prerequisites, preserve existing orders, and establish useful contacts. No raids.",
      ]);
      await f.pool.query(
        "UPDATE kingdom_mandates SET allowed_actions=array_append(allowed_actions,'message.send.contact') WHERE account_id=$1",
        [owner.accountId],
      );
      await f.pool.query(
        "INSERT INTO kingdom_builder_slots(product_scope,kingdom_id,slot) VALUES('pact',$1,1),('pact',$1,2) ON CONFLICT DO NOTHING",
        [owner.kingdomId],
      );
      principals.set(token, owner.principal);
      return { ...owner, token };
    },
    async game(token: string) {
      // The native fixture owns a controllable wall clock. Keep quotes current
      // during this multi-case matrix without advancing its game clock.
      const wall = Date.now();
      f.advance(wall - lastWall);
      lastWall = wall;
      const game = new McpGame(base, token, true);
      await game.init();
      return game;
    },
    close: async () => {
      await app.close();
      await f.close();
    },
  };
}
