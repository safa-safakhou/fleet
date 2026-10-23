import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";
import type { Data, GamePort, Tool } from "../../src/domain.js";
import { AutonomousSpecialistsEngine } from "../../src/engines/autonomous-specialists/engine.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { pactSpecialistPresets } from "../../src/environments/pact-presets.js";
import { parsePactFactRequests } from "../../src/games/pact/requested-facts.js";
import { Bindings } from "../../src/platform/bindings.js";
import type { ReadQueryOptions } from "../../src/platform/contracts.js";
import type { ScopedOperation, ScopedServices } from "../../src/platform/engine-context.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import type { fixture } from "../helpers.js";

export type ClockMode = "success" | "forged-action" | "unavailable" | "foreign-request" | "wrong-account" | "periodic";
export type ClockResult = {
  code: string;
  summary?: string;
  fakeDecisions: number;
  nativeReads: number;
  catalogCalls: number;
  targetedReads: number;
  observations: number;
  maximumInputBytes: number;
  routedRoles: string[];
  nativeRoles: string[];
  nativeResourceActions: string[];
  accepted: number;
  offeredActions: string[];
  gameCommands: number;
  scheduledTasks: number;
  persistentStateUnchanged: boolean;
  inputBytes: number[];
};
const gameTime = 1792419240000;
const finalSummary = 'Observed requested facts: [{"id":"world.time","value":1792419240000}]';
const unresolved = "Requested facts remain unresolved; no result is asserted.";
export async function composeOwnerClock(
  f: Awaited<ReturnType<typeof fixture>>,
  mode: ClockMode = "success",
): Promise<ClockResult> {
  const result: ClockResult = {
    code: "STARTED",
    fakeDecisions: 0,
    nativeReads: 0,
    catalogCalls: 0,
    targetedReads: 0,
    observations: 0,
    maximumInputBytes: 0,
    routedRoles: [],
    nativeRoles: [],
    nativeResourceActions: [],
    accepted: 0,
    offeredActions: [],
    gameCommands: 0,
    scheduledTasks: 0,
    persistentStateUnchanged: true,
    inputBytes: [],
  };
  const trigger = { type: mode === "periodic" ? "periodic_review" : "changed", metadata: { category: "resource" } };
  if (trigger.type !== "changed" || trigger.metadata.category !== "resource")
    return { ...result, code: "ONE_SHOT_SCOPE_REQUIRED" };
  const proposal = JSON.parse(
    await readFile(new URL("../../docs/proposals/owner-clock-read-profile-20261024.json", import.meta.url), "utf8"),
  );
  const ref = { id: "pact", version: "1", instanceId: `owner-clock-fixture:${randomUUID()}` };
  const { id: cohort } = await f.store.create({
    name: "Synthetic owner clock",
    count: 1,
    intervalMinutes: 15,
    seed: "owner-clock",
    strategies: ["guardian"],
  });
  await f.store.configure(cohort, {
    model: proposal.profile.model,
    budget: { ...proposal.budgetTemplate, deadlineAt: new Date(f.now().getTime() + 300000).toISOString() },
  });
  const agent = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [cohort])).rows[0].id;
  const account = randomUUID(),
    entity = randomUUID();
  await f.pool.query("UPDATE agents SET account_id=$2,kingdom_id=$3,credential_state='ready' WHERE id=$1", [
    agent,
    account,
    entity,
  ]);
  const legacy = new PactBindings(f.store, new Bindings(f.store, ref)),
    binding = await legacy.attach(agent);
  const tables = [
    "cohorts",
    "agents",
    "environment_bindings",
    "cohort_engine_profiles",
    "platform_tasks",
    "platform_task_claims",
    "compute_ledger",
    "platform_commands",
    "specialist_states",
  ];
  async function snapshot() {
    const state: Data = {};
    for (const table of tables)
      state[table] = (
        await f.pool.query(`SELECT to_jsonb(t)::text row FROM ${table} t ORDER BY to_jsonb(t)::text`)
      ).rows;
    return JSON.stringify(state);
  }
  const before = await snapshot();
  const requests = parsePactFactRequests(
    JSON.stringify([
      { ...proposal.readRequestExample.requests[0], entityRef: mode === "foreign-request" ? randomUUID() : entity },
    ]),
  );
  const tools: Tool[] = [
    {
      name: "pact_agent_guide_v1",
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: "object",
        properties: { topic: { enum: ["development", "diplomacy"] } },
        additionalProperties: false,
      },
    },
    ...(mode === "unavailable"
      ? []
      : [
          {
            name: "pact_world_read_v1",
            annotations: { readOnlyHint: true },
            inputSchema: {
              type: "object",
              properties: { forecastMinutes: { type: "integer", minimum: 1, maximum: 60 } },
              required: ["forecastMinutes"],
              additionalProperties: false,
            },
          },
        ]),
  ];
  const forbidden = async () => {
    result.gameCommands++;
    throw Error("GAME_COMMAND_PORT_FORBIDDEN");
  };
  const game: GamePort = {
    profile: async () => ({ accountId: mode === "wrong-account" ? randomUUID() : account }),
    tools: async () => {
      if (++result.catalogCalls > 16) throw Error("CATALOG_LIMIT");
      return structuredClone(tools);
    },
    read: async (tool, args) => {
      if (++result.nativeReads > 13) throw Error("NATIVE_READ_LIMIT");
      if (tool === "pact_world_read_v1") {
        if (args.forecastMinutes !== 60) throw Error("WRONG_NATIVE_SCOPE");
        return {
          profile: { kingdomId: entity },
          asOfGameTimeMs: gameTime,
          balances: { iron: { ordinaryUnits: "1200" } },
        };
      }
      if (
        tool !== "pact_agent_guide_v1" ||
        ![undefined, "development", "diplomacy"].includes(args.topic as string | undefined)
      )
        throw Error("UNAUTHORIZED_FIXTURE_READ");
      return { contacts: [], contactRequests: [], openSupplyOffers: [] };
    },
    open: async () => {
      throw Error("NO_ENROLLMENT");
    },
    submit: forbidden,
    receipt: forbidden,
    close: async () => {},
  };
  const adapter = createPactEnvironment({
    store: f.store,
    bindings: legacy,
    game: async () => game,
    now: f.now,
    factRequests: requests,
  });
  let session: Awaited<ReturnType<EnvironmentRegistry["connect"]>> | undefined;
  try {
    session = await new EnvironmentRegistry([adapter], ref).connect(binding);
    const connected = session;
    const readQuerySchema = connected.readQuerySchema;
    if (!readQuerySchema) throw Error("NATIVE_READ_CONTRACT_REQUIRED");
    const observed = await session.observe({});
    result.observations++;
    if (!observed.requestedFacts?.length) throw Error("OWNER_REQUEST_NOT_BOUND");
    const nativePreset = pactSpecialistPresets.find((p) => p.id === "resources-diplomacy");
    if (!nativePreset) throw Error("NATIVE_PRESET_REQUIRED");
    const role = nativePreset.roles.find((r) => r.charter.id === "resources");
    if (!role) throw Error("NATIVE_ROLE_REQUIRED");
    result.nativeRoles = nativePreset.roles.map((r) => r.charter.id);
    result.nativeResourceActions = [...role.charter.allowedActions];
    const originals: Data[] = [];
    const state = {
      version: 1,
      charterVersion: 1,
      charter: { ...role.charter, maxActiveGoals: 1 },
      goals: [],
      memories: [],
      predictions: [],
      plan: null,
      coverage: { complete: true, omittedGoals: 0, omittedMemories: 0 },
    };
    const engine = new AutonomousSpecialistsEngine();
    const services = {
      configuration: {
        model: proposal.profile.model,
        budget: { ...proposal.budgetTemplate, deadlineAt: new Date(f.now().getTime() + 300000).toISOString() },
        architectureConfig: proposal.profile.architectureConfig,
        goal: proposal.ownerTask.objective,
      },
      participants: {
        load: async () => structuredClone(state),
        inbox: async () => ({ records: [], omitted: 0 }),
        captureOriginal: async (input: Data) => {
          const original = {
            ...input,
            id: randomUUID(),
            bindingId: binding.id,
            createdAt: f.now().toISOString(),
            expiresAt: new Date(f.now().getTime() + 86400000).toISOString(),
          };
          originals.push(original);
          return original;
        },
        originals: async () => originals,
        coordination: async () => ({ proposals: [], conflicts: [] }),
        accept: async (input: Data) => {
          if (input.intent) throw Error("READ_ONLY_INTENT_FORBIDDEN");
          const envelope = input.envelope as Data;
          if (
            ["goals", "memories", "predictions", "messages", "wakeConditions", "deliveryIds"].some(
              (key) => (envelope[key] as unknown[]).length,
            ) ||
            envelope.plan !== null
          )
            throw Error("READ_ONLY_UPDATE_FORBIDDEN");
          result.accepted++;
          return { version: 2, accepted: true };
        },
      },
      environment: {
        ...adapter,
        schemas: { observations: ["pact.observation.v1"], actions: [] },
        catalog: () => connected.catalog(),
        readQuerySchema: (options?: ReadQueryOptions) => readQuerySchema.call(connected, options),
        actionContracts: async () => [],
        projectObservation: session.projectObservation,
        packObservation: session.packObservation,
      },
      observe: async (query: Data) => {
        if (++result.observations > 3) throw Error("OBSERVATION_LIMIT");
        if (query.tool) {
          if (++result.targetedReads > 1) throw Error("TARGETED_READ_LIMIT");
        }
        return connected.observe(query);
      },
      model: {
        remainingCalls: async () => 3 - result.fakeDecisions,
        decide: async (request: { messages: unknown[]; schema: Data }) => {
          result.fakeDecisions++;
          if (result.fakeDecisions > 3) throw Error("FAKE_DECISION_LIMIT");
          const bytes =
            Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema));
          result.inputBytes.push(bytes);
          result.maximumInputBytes = Math.max(result.maximumInputBytes, bytes);
          if (bytes > 13000) throw Error("INPUT_LIMIT");
          let decision: Data;
          if (mode === "unavailable") decision = { kind: "wait", summary: unresolved };
          else if (result.fakeDecisions === 1)
            decision = {
              kind: "read",
              query: { readSchema: "pact_world_read_v1" },
              summary: "Read requested; result not yet observed.",
            };
          else if (result.fakeDecisions === 2)
            decision = {
              kind: "read",
              query: { tool: "pact_world_read_v1", args: { forecastMinutes: 60 } },
              summary: "Read requested; result not yet observed.",
            };
          else if (mode === "forged-action")
            decision = {
              kind: "action",
              schemaId: "pact.action.v1",
              payload: { kind: "game.building.queue" },
              summary: "Action proposed.",
            };
          else decision = { kind: "wait", summary: finalSummary };
          if (decision.kind === "wait") result.summary = String(decision.summary);
          if (mode !== "forged-action" || result.fakeDecisions < 3) {
            const valid = new Ajv({ strict: false })
              .addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
              .compile(request.schema);
            if (
              valid({
                decision: {
                  kind: "action",
                  schemaId: "pact.action.v1",
                  payload: { kind: "game.building.queue" },
                  summary: "Action proposed.",
                },
              })
            )
              throw Error("ACTION_CONTRACT_ADVERTISED");
            if (!valid({ decision })) throw Error(`SCRIPTED_OUTPUT_INVALID:${JSON.stringify(valid.errors)}`);
          }
          return { decision: { decision }, inputTokens: 1, outputTokens: 1, allocationId: randomUUID() };
        },
      },
      actions: {},
      tasks: {
        waitForEvent: async () => {
          throw Error("SCHEDULING_FORBIDDEN");
        },
      },
      trace: async () => {},
    } as unknown as ScopedServices;
    result.offeredActions = [...services.environment.schemas.actions];
    const recipients = engine.create(services).route({
      instanceId: ref.instanceId,
      binding,
      event: {
        id: randomUUID(),
        type: trigger.type,
        sourceRef: "synthetic:owner-task",
        environmentTime: { clockId: "pact.game-time-ms", value: String(gameTime) },
        observedAt: f.now().toISOString(),
        metadata: trigger.metadata,
      },
    });
    result.routedRoles = recipients.map((r) => r.participantId ?? "");
    if (JSON.stringify(result.routedRoles) !== '["resources"]') throw Error("ONE_SHOT_SCOPE_REQUIRED");
    const operation: ScopedOperation = {
      id: randomUUID(),
      instanceId: ref.instanceId,
      binding,
      profile: proposal.profile.architecture,
      participantId: "resources",
      observation: observed,
      eventRefs: [],
      task: { id: randomUUID(), key: "owner-clock-read.v1", revision: 1, sourceCount: 1, sourceRefsOmitted: 0 },
      signal: new AbortController().signal,
    };
    await engine.run(operation, services);
    result.code = mode === "unavailable" ? "INCOMPLETE" : "COMPLETED";
  } catch (error) {
    result.code = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
  } finally {
    await session?.close();
  }
  result.scheduledTasks = Number((await f.pool.query("SELECT count(*)::int n FROM platform_tasks")).rows[0].n);
  result.persistentStateUnchanged = before === (await snapshot());
  return result;
}
