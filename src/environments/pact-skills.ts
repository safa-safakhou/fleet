import { Ajv } from "ajv";
import { type Data, FleetError } from "../domain.js";
import { actionContract } from "../games/pact/contracts.js";
import { type PrimitiveContext, PrimitiveRegistry } from "../modules/skills/v1/primitives.js";
import { QualificationPolicy, TrustedCaseSet } from "../modules/skills/v1/qualification.js";
import type { RecipeNode, SkillCandidate, SkillVersion } from "../modules/skills/v1/schema.js";
import type { SkillSupport } from "../modules/skills/v1/support.js";
import type { ActionEffects } from "../platform/action-effects.js";
import { launchDigest } from "../platform/launch.js";

const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const digits = (v: unknown) => typeof v === "string" && /^\d{1,40}$/.test(v);
export const supplyRoutineKind = "evaluate_offer_for_existing_supply_goal@1";
const str = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
export const supplyRoutineInputs: Data = {
  type: "object",
  properties: {
    offerId: str(36),
    version: { type: "integer", minimum: 1, maximum: 2147483647 },
    counterpartyKingdomId: str(36),
    termsJson: str(2000),
    minimumIron: str(40),
    minimumSilver: str(40),
    minimumGrain: str(40),
    assessmentDeadlineGameTimeMs: str(20),
  },
  required: [
    "offerId",
    "version",
    "counterpartyKingdomId",
    "termsJson",
    "minimumIron",
    "minimumSilver",
    "minimumGrain",
    "assessmentDeadlineGameTimeMs",
  ],
  additionalProperties: false,
};
const validInputs = new Ajv({ strict: false }).compile(supplyRoutineInputs);
const refs = ["read", "check", "sign", "delivery", "verify"].map((id) => ({
  id: `pact.existing-supply.${id}`,
  version: "1",
}));
export const supplyRoutineNodes: RecipeNode[] = refs.map((primitive, i) => ({
  id: ["read", "check", "sign", "delivery", "verify"][i],
  kind: (["observe", "check", "submit", "await", "verify"] as const)[i],
  primitive,
  args: {},
  ...([0, 2, 3, 4].includes(i) ? { saveAs: ["offer", "", "receipt", "delivery", "verification"][i] } : {}),
}));
export function supplyRoutineCandidate(sourceId: string, episodeId: string): SkillCandidate {
  return {
    representation: "recipe",
    purpose: {
      summary:
        "Evaluate an exact existing supply goal, sign with preserved reserves, then verify actual full delivery.",
      goalKinds: [supplyRoutineKind],
      nonGoals: ["Choose a peer, price or new goal", "Infer peer consent or delivery from a receipt"],
    },
    compatibility: {
      environment: { id: "pact", version: "1" },
      roles: ["diplomacy"],
      primitives: refs,
      actionKeys: ["game.supply.sign"],
    },
    inputs: supplyRoutineInputs,
    applicability: {
      goalKind: supplyRoutineKind,
      maxAgeMs: 15000,
      requiredSourceKinds: ["observation"],
      conditions: [],
      exclusions: ["Missing exact peer signature", "Changed owner goal, terms, authority or reserves"],
    },
    procedure: {
      guide:
        "Use only the parameters of the prior active goal. All amounts in reserve constraints are ordinary internal units. Terms JSON uses the published native command schema.",
      nodes: supplyRoutineNodes,
      children: [],
      template: supplyRoutineKind,
    },
    completion: {
      description:
        "Complete agreed installments observed without default or overflow loss; receipt alone is insufficient.",
      assessmentMs: 7 * 86400000,
    },
    interruption: {
      abortWhen: ["Changed goal or owner intent", "Unavailable evidence or authority"],
      onUnknown: "return_to_reasoning",
    },
    effects: { actionKeys: ["game.supply.sign"], resourceNeeds: {} },
    limits: { reads: 20, actions: 1, messages: 0, steps: 32, wallTimeMs: 7 * 86400000, modelCalls: 0 },
    evidence: { sourceIds: [sourceId], episodeIds: [episodeId], claimedOutcome: "unproven" },
  };
}
function parameters(inputs: Data) {
  if (
    !validInputs(inputs) ||
    ![inputs.minimumIron, inputs.minimumSilver, inputs.minimumGrain, inputs.assessmentDeadlineGameTimeMs].every(
      digits,
    ) ||
    ![inputs.offerId, inputs.counterpartyKingdomId].every((x) => typeof x === "string" && /^[a-f0-9-]{36}$/i.test(x))
  )
    throw new FleetError("INVALID_EXISTING_SUPPLY_GOAL", true);
  let terms: Data;
  try {
    terms = JSON.parse(String(inputs.termsJson));
    actionContract({ kind: "game.supply.offer", counterpartyKingdomId: inputs.counterpartyKingdomId, terms });
  } catch {
    throw new FleetError("INVALID_EXISTING_SUPPLY_TERMS", true);
  }
  return terms;
}
function section(payload: Data) {
  const s = obj(payload.requestedRead);
  return s.schemaVersion === "pact.observation-section.v1" && s.section === "agreements" ? s : {};
}
function exact(record: Data, inputs: Data, terms: Data) {
  return (
    record.counterpartyKingdomId === inputs.counterpartyKingdomId &&
    record.version === inputs.version &&
    launchDigest(record.terms) === launchDigest(terms) &&
    record.ownerKingdomId !== inputs.counterpartyKingdomId
  );
}
function checkOffer(payload: Data, inputs: Data): Data {
  const terms = parameters(inputs),
    s = section(payload),
    records = Array.isArray(s.records) ? s.records.map(obj) : [],
    offer = records.find((r) => r.type === "SupplyOffer" && r.id === inputs.offerId);
  if (!offer) return { satisfied: false, reason: "OFFER_EVIDENCE_UNAVAILABLE" };
  if (
    !exact(offer, inputs, terms) ||
    offer.ownerKingdomId !== s.ownerKingdomId ||
    ![offer.kingdomA, offer.kingdomB].includes(s.ownerKingdomId) ||
    ![offer.kingdomA, offer.kingdomB].includes(inputs.counterpartyKingdomId)
  )
    return { satisfied: false, reason: "OFFER_OR_PEER_CHANGED" };
  if (
    !digits(String(s.asOfGameTimeMs)) ||
    !digits(offer.expiresGameTimeMs) ||
    offer.expired !== false ||
    BigInt(String(s.asOfGameTimeMs)) >= BigInt(String(offer.expiresGameTimeMs)) ||
    BigInt(String(s.asOfGameTimeMs)) >= BigInt(String(inputs.assessmentDeadlineGameTimeMs))
  )
    return { satisfied: false, reason: "OFFER_OR_GOAL_EXPIRED" };
  const signed = Array.isArray(offer.signedBy) ? offer.signedBy : [];
  if (offer.status !== "open" || !signed.includes(inputs.counterpartyKingdomId) || signed.includes(s.ownerKingdomId))
    return { satisfied: false, reason: "EXACT_PEER_CONSENT_REQUIRED" };
  const incoming = offer.kingdomA === s.ownerKingdomId ? terms.bToA : terms.aToB;
  return {
    satisfied: !!incoming,
    reason: incoming ? "EXACT_PRIOR_GOAL_AND_PEER_SIGNATURE" : "INCOMING_SUPPLY_GOAL_REQUIRED",
    ownerKingdomId: s.ownerKingdomId,
  };
}
function delivery(payload: Data, inputs: Data): Data {
  const terms = parameters(inputs),
    s = section(payload),
    records = Array.isArray(s.records) ? s.records.map(obj) : [],
    matches = records.filter(
      (r) =>
        r.type === "SupplyContract" &&
        r.offerId === inputs.offerId &&
        r.offerVersion === inputs.version &&
        r.counterpartyKingdomId === inputs.counterpartyKingdomId &&
        r.ownerKingdomId === s.ownerKingdomId &&
        launchDigest(r.terms) === launchDigest(terms),
    );
  if (matches.length !== 1)
    return { satisfied: false, fulfilled: false, waiting: true, reason: "CONTRACT_OUTCOME_UNAVAILABLE" };
  const contract = matches[0];
  if (!["active", "expired"].includes(String(contract.status)))
    return {
      satisfied: false,
      fulfilled: false,
      waiting: false,
      reason: "CONTRACT_NOT_FULFILLED",
      contractId: contract.id,
    };
  if (!digits(contract.startGameTimeMs) || !digits(contract.endGameTimeMs))
    return { satisfied: false, fulfilled: false, waiting: false, reason: "CONTRACT_TIME_UNAVAILABLE" };
  const count = (BigInt(String(contract.endGameTimeMs)) - BigInt(String(contract.startGameTimeMs))) / 60000n,
    rows = Array.isArray(contract.deliveries) ? contract.deliveries.map(obj) : [];
  if (count <= 0n) return { satisfied: false, fulfilled: false, waiting: false, reason: "INVALID_CONTRACT_INTERVAL" };
  const ownA = contract.kingdomA === s.ownerKingdomId,
    flows = [
      { flow: obj(ownA ? terms.aToB : terms.bToA), direction: "sent" },
      { flow: obj(ownA ? terms.bToA : terms.aToB), direction: "received" },
    ].filter((x) => Object.keys(x.flow).length);
  let complete = true;
  for (const { flow, direction } of flows) {
    const r = rows.find((r) => r.resource === flow.resource && r.direction === direction);
    if (!r) {
      complete = false;
      continue;
    }
    if (
      !Number.isInteger(r.installments) ||
      Number(r.failedInstallments) !== 0 ||
      ![r.dueMarked, r.deliveredMarked, r.overflowMarked].every(digits)
    )
      return {
        satisfied: false,
        fulfilled: false,
        waiting: false,
        reason: "DELIVERY_DEFAULT_OR_UNKNOWN",
        contractId: contract.id,
      };
    if (
      BigInt(String(r.installments)) !== count ||
      BigInt(String(r.deliveredMarked)) - BigInt(String(r.overflowMarked)) < BigInt(String(r.dueMarked))
    )
      complete = false;
  }
  return {
    satisfied: complete,
    fulfilled: complete,
    waiting: !complete,
    reason: complete ? "ACTUAL_FULL_DELIVERY" : "DELIVERY_NOT_COMPLETE",
    contractId: contract.id,
    deliveries: rows,
  };
}
async function read(c: PrimitiveContext, recordId?: string) {
  return c.observe({
    tool: "pact_observation_read_v2",
    args: { section: "agreements", limit: 32, ...(recordId ? { recordId } : {}) },
  });
}
export function supplyReserveConstraints(inputs: Data, effects: ActionEffects) {
  parameters(inputs);
  if (effects.actionKey !== "game.supply.sign" || !effects.coverage.complete || !effects.supported)
    throw new FleetError("INCOMPLETE_ACTION_EFFECTS", true);
  const result: Record<string, string> = {};
  for (const [resource, key] of [
    ["iron", "minimumIron"],
    ["silver", "minimumSilver"],
    ["grain", "minimumGrain"],
  ]) {
    const authority = effects.claims
        .filter((c) => c.kind === "authority" && c.schemaId === "pact.authority.v1" && c.key === resource)
        .reduce((n, c) => n + BigInt("units" in c ? c.units : "0"), 0n),
      debit = effects.claims
        .filter((c) => c.kind === "resource" && c.schemaId === "pact.stock.v1" && c.key === `${resource}:ordinary`)
        .reduce((n, c) => n + BigInt("units" in c ? c.units : "0"), 0n);
    if (debit > authority) throw new FleetError("INCONSISTENT_SUPPLY_EFFECTS", true);
    result[resource] = (BigInt(String(inputs[key])) + authority - debit).toString();
  }
  return result;
}
export function createPactSkillSupport(): SkillSupport {
  const empty = { type: "object", properties: {}, additionalProperties: false },
    work = (reads = 0, actions = 0) => ({ reads, actions, messages: 0, steps: 1 });
  const registry = new PrimitiveRegistry([
    {
      ref: refs[0],
      kind: "observe",
      argsSchema: empty,
      work: work(1),
      actionKeys: [],
      run: async (_a, c) => ({ value: await read(c, String(c.inputs.offerId)) }),
    },
    {
      ref: refs[1],
      kind: "check",
      argsSchema: empty,
      work: work(),
      actionKeys: [],
      run: async (_a, c) => ({ value: checkOffer(obj(c.values.offer), c.inputs) }),
    },
    {
      ref: refs[2],
      kind: "submit",
      argsSchema: { ...empty, properties: { commandId: { type: "string" } }, required: ["commandId"] },
      work: work(2, 1),
      actionKeys: ["game.supply.sign"],
      run: async (a, c) => {
        const checked = checkOffer(obj(c.values.offer), c.inputs);
        if (checked.satisfied !== true) return { returnToReasoning: String(checked.reason), value: checked };
        const outcome = await c.submit(
          { kind: "game.supply.sign", offerId: c.inputs.offerId, version: c.inputs.version },
          String(a.commandId),
        );
        return { outcome };
      },
    },
    {
      ref: refs[3],
      kind: "await",
      argsSchema: empty,
      work: work(1),
      actionKeys: [],
      run: async (_a, c) => {
        const payload = await read(c),
          v = delivery(payload, c.inputs),
          s = section(payload);
        if (v.fulfilled) return { value: v };
        const deadline =
          digits(String(s.asOfGameTimeMs)) &&
          BigInt(String(s.asOfGameTimeMs)) >= BigInt(String(c.inputs.assessmentDeadlineGameTimeMs));
        return v.waiting && !deadline
          ? { value: v, wait: true }
          : { value: v, returnToReasoning: deadline ? "OUTCOME_ASSESSMENT_EXPIRED" : String(v.reason) };
      },
    },
    {
      ref: refs[4],
      kind: "verify",
      argsSchema: empty,
      work: work(1),
      actionKeys: [],
      run: async (_a, c) => ({ value: delivery(await read(c), c.inputs) }),
    },
  ]);
  const procedureClass = {
    id: supplyRoutineKind,
    matches: (s: SkillVersion) =>
      s.body.procedure.template === supplyRoutineKind &&
      launchDigest(s.body.procedure.nodes) === launchDigest(supplyRoutineNodes) &&
      launchDigest(s.body.inputs) === launchDigest(supplyRoutineInputs) &&
      s.body.procedure.children.length === 0 &&
      s.body.applicability.conditions.length === 0 &&
      s.body.applicability.maxAgeMs <= 15000 &&
      s.body.applicability.goalKind === supplyRoutineKind &&
      launchDigest(s.body.effects.actionKeys) === launchDigest(["game.supply.sign"]) &&
      launchDigest(s.body.compatibility.environment) === launchDigest({ id: "pact", version: "1" }),
  };
  const policy = new QualificationPolicy([procedureClass], "pact-existing-supply.v1");
  const inputs: Data = {
    offerId: "00000000-0000-4000-a000-000000000001",
    version: 1,
    counterpartyKingdomId: "00000000-0000-4000-a000-000000000002",
    termsJson: JSON.stringify({
      aToB: { resource: "iron", wholePerHour: 1 },
      bToA: { resource: "silver", wholePerHour: 2 },
      aBond: null,
      bBond: null,
      durationHours: 1,
      noticeHours: 0,
    }),
    minimumIron: "0",
    minimumSilver: "0",
    minimumGrain: "0",
    assessmentDeadlineGameTimeMs: "7200000",
  };
  const base = {
    schemaVersion: "pact.observation-section.v1",
    section: "agreements",
    ownerKingdomId: "00000000-0000-4000-a000-000000000003",
    asOfGameTimeMs: 0,
    records: [
      {
        type: "SupplyOffer",
        id: inputs.offerId,
        version: 1,
        counterpartyKingdomId: inputs.counterpartyKingdomId,
        ownerKingdomId: "00000000-0000-4000-a000-000000000003",
        kingdomA: "00000000-0000-4000-a000-000000000003",
        kingdomB: inputs.counterpartyKingdomId,
        terms: JSON.parse(String(inputs.termsJson)),
        expiresGameTimeMs: "60000",
        expired: false,
        status: "open",
        signedBy: [inputs.counterpartyKingdomId],
      },
    ],
  };
  const cases = new TrustedCaseSet(
    supplyRoutineKind,
    policy.requiredCases.map((id) => ({
      id,
      run: async () => {
        const s = structuredClone(base);
        if (id === "unmet_guards") s.records[0].signedBy = [];
        if (id === "missing_evidence") s.records = [];
        if (id === "expiry") s.asOfGameTimeMs = 60000;
        const checked = checkOffer({ requestedRead: s }, inputs);
        let actions = 0;
        const receipts = new Map<string, Data>();
        const c: PrimitiveContext = {
          inputs,
          goal: {},
          values: { offer: { requestedRead: s } },
          signal: new AbortController().signal,
          observe: async () => ({ requestedRead: s }),
          request: async () => ({}),
          resolve: async () => ({}),
          submit: async (_p, commandId) => {
            if (id === "stock_conflict") throw new FleetError("INSUFFICIENT_RESERVE", true);
            if (id === "authority_change") throw new FleetError("AUTHORITY_CHANGED", true);
            if (!receipts.has(commandId)) {
              actions++;
              receipts.set(commandId, { status: "confirmed", receiptOnly: true });
            }
            return receipts.get(commandId)!;
          },
        };
        let rejected = false;
        if (checked.satisfied)
          try {
            await registry.invoke(refs[2], "submit", { commandId: "original" }, c);
            if (id === "restart") await registry.invoke(refs[2], "submit", { commandId: "original" }, c);
          } catch {
            rejected = true;
          }
        return {
          actions,
          rejected,
          fulfilled: delivery({ requestedRead: s }, inputs).fulfilled,
          guard: checked.satisfied,
        };
      },
      accept: (actual: unknown) => {
        const v = obj(actual);
        return (
          v.fulfilled === false &&
          (id === "positive" || id === "restart"
            ? v.actions === 1 && v.guard === true
            : id === "stock_conflict" || id === "authority_change"
              ? v.actions === 0 && v.rejected === true
              : v.actions === 0 && v.guard === false)
        );
      },
    })),
    "pact-existing-supply-cases.v1",
  );
  policy.registerCases(cases);
  return {
    registry,
    policy,
    schemaId: "pact.action.v1",
    templates: [
      {
        kind: supplyRoutineKind,
        inputs: supplyRoutineInputs,
        nodes: supplyRoutineNodes,
        actionKeys: ["game.supply.sign"],
        instructions:
          "Use exact immutable structure and actual delivered support. Parameters belong to a previously active goal, never to invented defaults. This is synthetic template qualification, not proof of economic benefit.",
      },
    ],
    cases: (s) => (procedureClass.matches(s) ? cases : undefined),
    reserveConstraints: supplyReserveConstraints,
  };
}
