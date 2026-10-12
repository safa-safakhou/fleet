// Opt-in cross-repository acceptance against PACT public packages and real handlers.
// No game source/database is imported by Fleet runtime.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { capabilityMatrix, humanGameKinds } from "../../src/games/pact/capabilities.js";
import { constructionRecovery } from "../../src/games/pact/construction.js";
import { actionKinds } from "../../src/games/pact/contracts.js";

const root = process.env.PACT_ACCEPTANCE_ROOT;
const databaseUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL;
if (!root || !databaseUrl) throw Error("EXPLICIT_ISOLATED_PACT_ACCEPTANCE_REQUIRED");
const target = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/pact_test" || target.port !== "5438")
  throw Error("ISOLATED_PACT_ACCEPTANCE_DATABASE_REQUIRED");
const moduleAt = (path: string) => import(pathToFileURL(resolve(root, path)).href);
const db = await moduleAt("packages/db/dist/index.js");
const kingdom = await moduleAt("packages/kingdom/dist/index.js");
const application = await moduleAt("packages/application/dist/index.js");
const authority = await moduleAt("packages/authority/dist/index.js");
const { OnboardingService } = await moduleAt("packages/onboarding/dist/index.js");
const { RunService } = await moduleAt("packages/runs/dist/index.js");
const { createRulesRuntime } = await moduleAt("workers/rules/dist/runtime.js");
const contracts = await moduleAt("packages/contracts/dist/index.js");
let admin: Pool;
let pool: Pool;
let schema: string;
let runtime: ReturnType<typeof createRulesRuntime>;
let dispatcher: InstanceType<typeof application.CommandDispatcher>;
let views: InstanceType<typeof kingdom.WorldViewService>;
let runs: InstanceType<typeof RunService>;
type Owner = { accountId: string; kingdomId: string; sessionId: string; holderId: string };
beforeAll(async () => {
  admin = db.createPool(databaseUrl);
  schema = await db.createTestSchema(admin, "fleet_p1");
  pool = db.createSchemaPool(databaseUrl, schema);
  runtime = createRulesRuntime(pool, "pact", Buffer.alloc(32, 7), (size: number) => Buffer.alloc(size, 3));
  await runtime.world.bootstrap();
  await pool.query("UPDATE world_clocks SET next_tick_due_at=clock_timestamp()+interval '1 hour'");
  const clock = { now: () => new Date() };
  const permits = new authority.ExactHumanPermitService("pact");
  const exposure = new authority.ExposureService("pact", permits);
  const social = new kingdom.SocialService(
    "pact",
    runtime.ledger,
    new kingdom.ActionLimitService("pact"),
    clock,
    new kingdom.ImmediateExposureAdapter(exposure),
  );
  const kingdoms = new kingdom.KingdomService(pool, {
    productScope: "pact",
    world: runtime.world,
    ledger: runtime.ledger,
    onboarding: new OnboardingService(pool, { productScope: "pact", currentTermsVersion: "terms-v1", now: clock.now }),
  });
  runs = new RunService(pool, { productScope: "pact", clock });
  const handler = new application.GameCommandHandler(
    social,
    (client: unknown, accountId: string, holderId: string) => runs.assertAgentWriteLease(client, accountId, holderId),
    kingdoms,
    runtime.troops,
    runtime.buildings,
    permits,
    undefined,
    undefined,
    exposure,
    runtime.scouting,
    new kingdom.GarrisonService("pact", runtime.ledger, runtime.troops, exposure, permits),
    runtime.raids,
  );
  dispatcher = new application.CommandDispatcher({
    pool,
    clock,
    productScope: "pact",
    game: {
      admit: (operation: (client: unknown, gameTimeMs: number) => unknown) =>
        runtime.world.admitCommand((client: unknown, snapshot: Data) => operation(client, Number(snapshot.gameTimeMs))),
      execute: (client: unknown, principal: Data, command: Data, gameTimeMs: number) =>
        handler.execute(client, principal, command, gameTimeMs),
    },
  });
  views = new kingdom.WorldViewService(pool, "pact");
});
afterAll(async () => {
  if (pool) await pool.end();
  if (admin && schema) await db.dropTestSchema(admin, schema);
  if (admin) await admin.end();
});
async function owner(): Promise<Owner> {
  const o = { accountId: randomUUID(), kingdomId: randomUUID(), sessionId: randomUUID(), holderId: randomUUID() };
  await pool.query(
    "INSERT INTO accounts(id,product_scope,email,password_hash,email_verified_at,terms_version) VALUES($1,'pact',$2,'fixture',clock_timestamp(),'terms-v1')",
    [o.accountId, `${o.accountId}@example.test`],
  );
  await pool.query(
    "INSERT INTO sessions(id,product_scope,account_id,audience,token_hash,expires_at,idle_expires_at) VALUES($1,'pact',$2,'human',$3,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour')",
    [o.sessionId, o.accountId, randomUUID()],
  );
  await pool.query(
    "INSERT INTO kingdoms(id,product_scope,account_id,handle,display_name,portrait,activated_at,activated_game_time_ms,activated_tick_sequence,first_tick_game_time_ms,activation_event_id) VALUES($1,'pact',$2,$3,'Synthetic Fleet Owner','portrait.wolf',clock_timestamp(),0,0,60000,$4)",
    [o.kingdomId, o.accountId, `fleet_${randomUUID().slice(0, 8)}`, randomUUID()],
  );
  const client = await pool.connect();
  try {
    await runtime.ledger.initializeKingdom(client, o.kingdomId, 0);
  } finally {
    client.release();
  }
  for (const kind of ["hall", "farm", "mine", "market", "storehouse", "barracks", "wall"])
    await pool.query("INSERT INTO kingdom_buildings VALUES('pact',$1,$2,$3)", [
      o.kingdomId,
      kind,
      ["farm", "mine", "market", "barracks", "wall"].includes(kind) && kind !== "barracks" ? 2 : 1,
    ]);
  await pool.query("INSERT INTO kingdom_builder_slots VALUES('pact',$1,1),('pact',$1,2)", [o.kingdomId]);
  await pool.query(
    'INSERT INTO kingdom_mandates(product_scope,account_id,allowed_actions,resource_limits,troop_limit) VALUES(\'pact\',$1,ARRAY[\'building.queue\'],\'{"iron":"9999999","silver":"9999999"}\',100)',
    [o.accountId],
  );
  await runs.openMcpLease({ accountId: o.accountId, holderId: o.holderId });
  return o;
}
async function dispatch(o: Owner, action: Data, audience = "agent", scopes = ["game:act"], holder = o.holderId) {
  const principal = {
    accountId: o.accountId,
    productScope: "pact",
    audience,
    sessionId: audience === "human" ? o.sessionId : holder,
    agentScopes: scopes,
  };
  return dispatcher.dispatch(principal, {
    schemaVersion: "pact.command.v2",
    commandId: randomUUID(),
    action,
    actor: { principalId: o.accountId, productScope: "pact", audience, subject: { type: "account", id: o.accountId } },
    submittedAt: new Date().toISOString(),
  });
}
it("checks Fleet's complete game-kind list against actual PACT contracts and rejects all six human-only commands with a real lease", async () => {
  const o = await owner();
  const actual = contracts.GameActionV2Schema.options.map(
    (option: { shape: { kind: { value: string } } }) => option.shape.kind.value,
  );
  expect(actionKinds.filter((k) => k.startsWith("game."))).toEqual(actual);
  for (const kind of humanGameKinds) {
    const action =
      kind === "game.building.cancel"
        ? { kind, instructionId: randomUUID() }
        : kind === "game.training.cancel"
          ? { kind, batchId: randomUUID() }
          : kind === "game.troop.disband"
            ? { kind, troopId: randomUUID() }
            : kind === "game.garrison.seize"
              ? { kind, contractId: randomUUID() }
              : kind === "game.raid.nominate"
                ? { kind, raidId: randomUUID(), slot: 1, kingdomId: randomUUID() }
                : { kind, raidId: randomUUID() };
    expect(capabilityMatrix({}, null).find((m) => m.kind === kind)?.blocked).toBe("HUMAN_DECISION_REQUIRED");
    await expect(dispatch(o, action)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect((await pool.query("SELECT count(*)::int n FROM command_receipts")).rows[0].n).toBe(0);
});
it("real handlers enforce command scopes, write lease and current mandate even for an advertised queue", async () => {
  const o = await owner();
  const action = { kind: "game.building.queue", building: "hall", targetLevel: 2, slot: 1 };
  await expect(dispatch(o, action, "agent", ["world:read"])).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(dispatch(o, action, "agent", ["game:act"], randomUUID())).rejects.toMatchObject({ code: "FORBIDDEN" });
  await pool.query("UPDATE kingdom_mandates SET allowed_actions=ARRAY['world.read'] WHERE account_id=$1", [
    o.accountId,
  ]);
  expect(
    capabilityMatrix({ guide: { mandate: { allowedActions: ["world.read"] } } }, null).find(
      (m) => m.kind === action.kind,
    )?.blocked,
  ).toBe("OBSERVED_MANDATE_DENIED");
  await expect(dispatch(o, action)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(
    (await pool.query("SELECT count(*)::int n FROM building_instructions WHERE kingdom_id=$1", [o.kingdomId])).rows[0]
      .n,
  ).toBe(0);
});
it("real contact-answer handler respects manual delegation and allows the actual owner to answer", async () => {
  const sender = await owner(),
    recipient = await owner();
  const request = await dispatch(
    sender,
    { kind: "game.contact.request", recipientKingdomId: recipient.kingdomId, note: "Synthetic introduction" },
    "human",
  );
  const requestId = Object.keys(request.recordVersions)[0]?.slice("contact-request:".length);
  if (!requestId) throw Error("Missing contact request");
  const action = { kind: "game.contact.answer", requestId, accept: true };
  expect(
    capabilityMatrix({ guide: { socialDelegation: { mode: "manual" } } }, null).find((m) => m.kind === action.kind)
      ?.blocked,
  ).toBe("SOCIAL_DELEGATION_REQUIRED");
  await expect(dispatch(recipient, action)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await dispatch(recipient, action, "human")).code).toBe("COMMITTED");
});
it.each(["mine", "market", "wall"])(
  "real owned projection diagnoses Hall/ %s deadlock, rejects a new blocker and accepts exact owner cancellation",
  async (building) => {
    const o = await owner();
    const hall = await dispatch(o, { kind: "game.building.queue", building: "hall", targetLevel: 2, slot: 1 });
    expect(hall.code).toBe("COMMITTED");
    const world = await views.readSelf(o.accountId);
    expect(
      pactAdapter.preflight?.({ kind: "game.building.queue", building, targetLevel: 3, slot: 2 }, { world })?.code,
    ).toBe("CONSTRUCTION_DEADLOCK_PREVENTED");
    // The existing game permits waiting queues; reconstruct that old-controller failure in isolation.
    expect((await dispatch(o, { kind: "game.building.queue", building, targetLevel: 3, slot: 2 })).code).toBe(
      "COMMITTED",
    );
    const blocked = await views.readSelf(o.accountId);
    const recovery = constructionRecovery(blocked);
    expect(recovery.status).toBe("owner_required");
    const option = object(
      (recovery.ownerOptions as Data[]).find(
        (v) => object(v.action).instructionId !== Object.keys(hall.recordVersions)[0]?.slice("building:".length),
      ),
    );
    const cancellation = object(option.action);
    await expect(dispatch(o, cancellation)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await dispatch(o, cancellation, "human")).code).toBe("COMMITTED");
    expect(constructionRecovery(await views.readSelf(o.accountId)).status).toBe("waiting_or_unknown");
    const outsider = await owner();
    expect(await views.read(outsider.accountId, o.kingdomId)).not.toHaveProperty("nextUpgradeChecks");
    expect(await views.read(outsider.accountId, o.kingdomId)).not.toHaveProperty("builders");
  },
);
