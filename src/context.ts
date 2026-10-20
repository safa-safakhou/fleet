import { beliefCue, deliveredCognition, type Episode, utf8Prefix } from "./cognition.js";
import { analysisOpportunities } from "./cognitive-analysis.js";
import { type Data, FleetError, object } from "./domain.js";
import { factTable } from "./fact-table.js";
import { ownerDecisionContext } from "./owner-guidance.js";
import { referenceOpportunityText, referenceSchemaFeedback } from "./schema-feedback.js";

// Count the serialized transport envelope plus the separately supplied output schema.
// Keep executable shapes, command outcomes and authoritative core facts whole.
// The game adapter can explicitly page optional fresh observations after cache eviction.
export function fitMessages(
  context: Data,
  instructions: string,
  schema: Data,
  limit: number,
  compactReads: (reads: Data[], limit: number) => Data[],
  narrowRead?: (read: Data, limit: number) => Data,
  compactEnvironment?: (environment: Data, limit: number) => Data,
  schemaForContext?: (context: Data) => Data,
) {
  try {
    return fitAcceptedMessages(
      context,
      instructions,
      schema,
      limit,
      compactReads,
      narrowRead,
      compactEnvironment,
      schemaForContext,
    );
  } catch (error) {
    const cognition = object(context.cognition),
      recall = object(cognition.recall);
    if (
      !(error instanceof FleetError) ||
      error.code !== "CONTEXT_LIMIT" ||
      recall.route !== "laya-recall-v1" ||
      recall.admission !== "provisional"
    )
      throw error;
    // Selection remains advisory until the whole envelope can deliver its pair.
    // An already accepted pair never takes this fallback.
    return fitAcceptedMessages(
      {
        ...context,
        cognition: {
          ...cognition,
          recall: {
            route: "relevance-recency-importance",
            assist: "deferred",
            code: "LAYA_PAIR_NOT_DELIVERABLE",
            deferredCandidateIds: recall.candidateIds,
            coverage:
              "Advisory selection was not accepted/pinned because its complete pair could not fit. Only delivered evidence is usable.",
          },
        },
      },
      instructions,
      schema,
      limit,
      compactReads,
      narrowRead,
      compactEnvironment,
      schemaForContext,
    );
  }
}

function fitAcceptedMessages(
  context: Data,
  instructions: string,
  schema: Data,
  limit: number,
  compactReads: (reads: Data[], limit: number) => Data[],
  narrowRead?: (read: Data, limit: number) => Data,
  compactEnvironment?: (environment: Data, limit: number) => Data,
  schemaForContext?: (context: Data) => Data,
) {
  let compactTransport = false;
  const messages = (c: Data) => {
    const encode = (value: Data) => {
      if (!compactTransport) return ownerDecisionContext(value);
      const actualSchema = schemaForContext ? schemaForContext(value) : schema;
      let encoded = referenceSchemaFeedback(value, actualSchema);
      if (String(value.schemaCoverage).includes("sameTextAs"))
        encoded = referenceOpportunityText(encoded, actualSchema);
      const environment = object(encoded.environment),
        continuation = object(encoded.continuation);
      const permissions = object(encoded.actionPermissions);
      if (Array.isArray(permissions.blocked)) {
        const blocked = factTable(permissions.blocked);
        encoded = { ...encoded, actionPermissions: { ...permissions, blocked } };
        if (blocked !== permissions.blocked && typeof environment.factEncoding !== "string")
          encoded.factEncoding =
            "Tables: dotted columns pair with row cells; common applies to every row. All facts retained.";
      }
      if (typeof environment.factEncoding === "string") {
        const { factEncoding, ...facts } = environment;
        const { outcomeEncoding: _duplicate, ...state } = continuation;
        encoded = { ...encoded, factEncoding, environment: facts, continuation: state };
      }
      const read = object(encoded.requestedRead),
        result = object(read.result),
        state = object(result.state);
      if (Array.isArray(state.outcomes)) {
        const table = factTable(state.outcomes);
        if (table !== state.outcomes)
          encoded = {
            ...encoded,
            requestedRead: { ...read, result: { ...result, state: { ...state, outcomes: table } } },
          };
      }
      return ownerDecisionContext(encoded);
    };
    return [
      { role: "system", content: instructions },
      {
        role: "user",
        content: JSON.stringify(
          encode(
            object(c.cognition).nativeAnalysis === true
              ? {
                  ...Object.fromEntries(Object.entries(c).filter(([key]) => key !== "cognition")),
                  cognition: {
                    ...object(c.cognition),
                    ...(object(object(c.cognition).recall).admission === "provisional"
                      ? { recall: { ...object(object(c.cognition).recall), admission: "accepted" } }
                      : {}),
                    analysisOpportunities: analysisOpportunities(deliveredCognition(c)),
                  },
                }
              : c,
          ),
        ),
      },
    ];
  };
  const fits = (m: ReturnType<typeof messages>) =>
    Buffer.byteLength(JSON.stringify(m)) +
      Buffer.byteLength(
        JSON.stringify(schemaForContext ? schemaForContext(object(JSON.parse(m[1].content))) : schema),
      ) <=
    limit;
  let cognition = object(context.cognition);
  let evidence = Array.isArray(cognition.evidence) ? cognition.evidence.map(object) : [];
  const recall = object(cognition.recall);
  const pair = recall.route === "laya-recall-v1" && Array.isArray(recall.candidateIds) ? recall.candidateIds : [];
  if (recall.route === "laya-recall-v1" && (new Set(pair).size !== 2 || !pair.includes(recall.selectedId)))
    throw new FleetError("COGNITION_RECALL_EVIDENCE_MISSING");
  if (pair.some((id) => !evidence.some((episode) => episode.id === id)))
    throw new FleetError("COGNITION_RECALL_EVIDENCE_MISSING");
  const pack = (context: Data, allowNarrowRequested = false): ReturnType<typeof messages> | undefined => {
    const full = messages(context);
    if (fits(full)) return full;
    compactTransport = true;
    const shared = messages(context);
    if (fits(shared)) return shared;
    const reads = Array.isArray(context.readResults) ? context.readResults.map(object) : [];
    const names = Array.isArray(context.availableReads)
      ? context.availableReads.map((r) => ({ name: object(r).name }))
      : [];
    const currentSchema = schemaForContext ? schemaForContext(context) : schema;
    const lookupValues = (tool: string, field: string): unknown[] => {
      const found: unknown[][] = [];
      const visit = (v: unknown) => {
        if (Array.isArray(v)) {
          for (const child of v) visit(child);
          return;
        }
        if (!v || typeof v !== "object") return;
        const node = object(v),
          props = object(node.properties);
        if (object(props.tool).const === tool) {
          const values = object(object(object(props.args).properties)[field]).enum;
          if (Array.isArray(values)) found.push(values);
        }
        for (const child of Object.values(node)) visit(child);
      };
      visit(currentSchema);
      return found[0] ?? [];
    };
    const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v) => b.includes(v));
    const namedReads = names.map((entry) => entry.name);
    const advertisedKinds = Array.isArray(context.gameActionKinds) ? context.gameActionKinds : [];
    const sharedAdvertisements = {
      ...(namedReads.length && same(namedReads, lookupValues("fleet_read_schema", "name"))
        ? {
            availableReads: undefined,
            availableReadsAt: "output fleet_read_schema.args.name enum",
          }
        : {}),
      ...(advertisedKinds.length && same(advertisedKinds, lookupValues("fleet_action_schema", "kind"))
        ? {
            gameActionKinds: undefined,
            gameActionKindsAt: "output fleet_action_schema.args.kind enum; conditional",
          }
        : {}),
    };
    const continuation = object(context.continuation);
    const history = Array.isArray(continuation.outcomes) ? continuation.outcomes.map(object) : [];
    const recent = history.at(-1);
    const retainedOutcomes = history.filter(
      (outcome) => outcome === recent || !["read", "wait"].includes(String(outcome.category)),
    );
    const pagedContinuation =
      retainedOutcomes.length < history.length
        ? {
            continuation: {
              ...continuation,
              coverage:
                "Bounded authored bookkeeping; missing history unknown. WAIT/queue is not completion. Lookup the complete plan.",
              outcomes: retainedOutcomes,
              outcomeCoverage: {
                omittedSuccessfulReadsOrWaits: history.length - retainedOutcomes.length,
                notice: "Earlier successful reads/waits paged; all failures/commands/latest outcome retained.",
              },
            },
          }
        : {};
    for (const allowance of [8000, 6000, 4000, 2000, 0]) {
      const smaller = messages({
        ...context,
        availableReads: names,
        ...sharedAdvertisements,
        ...pagedContinuation,
        readResults: compactReads(reads, allowance),
        omissions: [
          "Read descriptions/dated cache reduced; core facts, receipts and supplied schemas retained. Missing history is unknown; request it if needed.",
        ],
      });
      if (fits(smaller)) return smaller;
    }
    if (compactEnvironment) {
      const requested = context.requestedRead ? object(context.requestedRead) : undefined;
      const feedback = [requested];
      if (allowNarrowRequested && requested && narrowRead)
        for (const size of [4000, 2000, 1000]) feedback.push(narrowRead(requested, size));
      // Exhaust optional fresh-environment reductions before narrowing requested feedback.
      for (const requestedRead of feedback) {
        // Dense authority/core state can require more than 4 KB while optional
        // pages make 6 KB too large for the complete provider envelope. Search
        // that interval as well; never infer that a failed coarse bucket cannot fit.
        const larger = Math.max(
          0,
          Math.ceil((Math.min(Buffer.byteLength(JSON.stringify(context.environment)), limit) - 12000) / 500),
        );
        // Preserve existing small-envelope choices first. A post-command core
        // can exceed 12KB while still fitting the complete request; never treat
        // that historical search bucket as the environment's hard ceiling.
        const allowances = [
          ...Array.from({ length: 201 }, (_, index) => 12000 - index * 50),
          ...Array.from({ length: larger }, (_, index) => 12500 + index * 500),
        ];
        for (const allowance of allowances) {
          let environment: Data;
          try {
            environment = compactEnvironment(object(context.environment), allowance);
          } catch (error) {
            if (error instanceof FleetError && error.code === "CONTEXT_LIMIT") continue;
            throw error;
          }
          const reduced = {
            ...context,
            environment,
            availableReads: names,
            ...sharedAdvertisements,
            ...pagedContinuation,
            readResults: [],
            requestedRead,
            omissions: ["Cache/optional pages omitted, unknown. Core/authority/receipts/supplied schemas whole."],
          };
          const wholeNotes = messages(reduced);
          if (fits(wholeNotes)) return wholeNotes;
          // Never destroy persisted notes. Oversized optional continuation prose can
          // be omitted from this one input, with an explicit notice instead of truncation.
          const withoutNotes = messages({
            ...reduced,
            privateNotes: undefined,
            privateNotesCoverage: {
              omitted: true,
              originalBytes: Buffer.byteLength(JSON.stringify(context.privateNotes ?? null)),
              notice: "Stored notes omitted from this input; fresh facts and requested feedback take priority.",
            },
          });
          if (fits(withoutNotes)) return withoutNotes;
        }
      }
    }
    // A requested result is indispensable feedback, separate from optional history.
    // Only narrow it after evicting all optional reads, and never silently drop it.
    if (allowNarrowRequested && context.requestedRead && narrowRead) {
      for (const allowance of [6000, 4000, 2000, 1000]) {
        const smaller = messages({
          ...context,
          availableReads: names,
          readResults: [],
          requestedRead: narrowRead(object(context.requestedRead), allowance),
          omissions: ["Dated cache omitted. The requested read is explicitly incomplete; use its narrowing guidance."],
        });
        if (fits(smaller)) return smaller;
      }
    }
    return undefined;
  };
  let fitted = pack(context);
  if (fitted) return fitted;
  if (!context.cognition) {
    fitted = pack(context, true);
    if (fitted) return fitted;
    throw new FleetError("CONTEXT_LIMIT");
  }

  if (cognition.nativeAnalysis === true) {
    // Remove repeated transport metadata/prose, not the observed cue or result.
    // The source ID and direction remain explicit; raw owned evidence is still
    // rechecked at commit. This also keeps the peer's words separate from self.
    evidence = evidence.map((episode) => {
      const d = object(episode.detail);
      if (episode.kind === "message") {
        const cue = beliefCue(episode as Episode, "statement");
        if (!cue) return episode;
        const { body: _body, excerpt: _excerpt, ...fields } = d;
        return {
          ...episode,
          detail: {
            ...fields,
            body: cue,
            authorKind: object(d.body).authorKind,
            coverage: "Statement only; transport metadata omitted.",
          },
        };
      }
      if (episode.kind === "receipt") {
        const { excerpt: _excerpt, receipt: _receipt, ...fields } = d;
        return {
          ...episode,
          detail: {
            ...fields,
            code: object(d.receipt).code ?? d.code,
            coverage: "Recorded result; repeated prose omitted.",
          },
        };
      }
      return episode;
    });
    cognition = {
      ...cognition,
      evidence,
      coverage: { ...object(cognition.coverage), interpretation: "Subjective. Omitted facts unknown." },
      evidenceAvailability: Object.fromEntries(
        Object.entries(object(cognition.evidenceAvailability)).filter(([, value]) => value !== "retained"),
      ),
      availabilityCoverage: "Only unavailable prior sources listed; cite delivered evidence only.",
    };
    const allowedKinds = Array.isArray(context.gameActionKinds) ? context.gameActionKinds : [];
    context = {
      ...context,
      cognition,
      humanOnlyActionKinds: (Array.isArray(context.humanOnlyActionKinds) ? context.humanOnlyActionKinds : []).filter(
        (kind) => allowedKinds.includes(kind),
      ),
      humanOnlyCoverage: "Unadvertised human-only names omitted. No authority granted.",
      readHistoryCoverage: "Dated/incomplete. Current facts prevail.",
      permissionCoverage:
        "Advertisement conditional; server enforces all identity, permission and prerequisite checks.",
      // Field listings duplicate the exact delivered schema; retain the analysis
      // instructions/opportunities and let that schema express the current choices.
      analysisGuide: context.analysisGuide ? "Follow cognition schema/opportunities; omit unchanged state." : undefined,
      continuationGuide: context.continuationGuide
        ? "Bookkeeping, not authority. Fresh facts/outcomes/owner intent prevail; schema lookup."
        : undefined,
      memoryRead: context.memoryRead
        ? { name: object(context.memoryRead).name, args: object(context.memoryRead).args }
        : undefined,
      commandResults: (Array.isArray(context.commandResults) ? context.commandResults.map(object) : []).map(
        (result) => {
          const receipt = object(result.receipt);
          if (typeof receipt.code !== "string") return result;
          return {
            commandId: result.commandId,
            actionKind: result.actionKind,
            outcomeSource: result.outcomeSource,
            receipt: { code: receipt.code },
            receiptCoverage:
              "Exact recorded code; other receipt details omitted, not unchanged. Initial environment may predate this command; re-read current state before dependent moves.",
          };
        },
      ),
      decisionFeedback: (Array.isArray(context.decisionFeedback) ? context.decisionFeedback.map(object) : []).map(
        (item) => {
          const { schemaDigest: _digest, ...fields } = item;
          return {
            ...fields,
            guidance:
              typeof item.guidance === "string" ? `${utf8Prefix(item.guidance, 160)} (guidance excerpt)` : undefined,
            errors: Array.isArray(item.errors)
              ? item.errors.map((issue) => {
                  const { message: _message, ...exact } = object(issue);
                  return exact;
                })
              : item.errors,
          };
        },
      ),
    };
    fitted = pack(context);
    if (fitted) return fitted;
  }

  // Reference current facts/outcomes already delivered elsewhere in this exact
  // decision instead of serializing them twice. Historical requested recalls
  // are not rebound to the new environment. Source IDs/dates remain intact.
  const outcomes = Array.isArray(context.commandResults) ? context.commandResults.map(object) : [];
  evidence = evidence.map((episode) => {
    const detail = object(episode.detail);
    if (
      episode.id === cognition.currentEvidenceId &&
      episode.kind === "observation" &&
      context.environment &&
      !pair.includes(episode.id)
    )
      return {
        ...episode,
        detail: {
          factsAt: "environment",
          asOfGameTimeMs: detail.asOfGameTimeMs,
          peerFacts: detail.peerFacts,
          coverage:
            "This observation's peerFacts/game time are retained; other current facts are in environment. Paged facts are unknown.",
        },
      };
    if (
      episode.kind === "receipt" &&
      typeof detail.commandId === "string" &&
      outcomes.some((outcome) => outcome.commandId === detail.commandId)
    )
      return {
        ...episode,
        detail: {
          commandId: detail.commandId,
          intent: detail.intent,
          code: object(detail.receipt).code ?? detail.code,
          actionKind: object(detail.action).kind ?? detail.actionKind,
          source: detail.source,
          committed: detail.committed,
          submitted: detail.submitted,
          receiptAt: "commandResults",
          coverage: "The matching command's whole receipt is delivered in commandResults.",
        },
      };
    return episode;
  });
  const { certificate: _certificate, probability: _probability, ...recallPrompt } = recall;
  // Acceptance metadata belongs in turn history; the model needs the ordered
  // candidates and advisory role, not a certificate hash or uncalibrated score.
  cognition = { ...cognition, evidence, recall: recallPrompt };
  const feedback = Array.isArray(context.decisionFeedback) ? context.decisionFeedback.map(object) : [];
  context = {
    ...context,
    cognition,
    decisionFeedback: feedback.map((item) => {
      if (
        !Array.isArray(item.availableKinds) ||
        JSON.stringify(item.availableKinds) !== JSON.stringify(context.gameActionKinds)
      )
        return item;
      const { availableKinds: _duplicate, ...rest } = item;
      return { ...rest, availableKindsAt: "gameActionKinds" };
    }),
  };
  fitted = pack(context);
  if (fitted) return fitted;

  // Protect continuity before optional prefetched tool schemas. Requested schema
  // results remain indispensable feedback, never part of these optional pages.
  let candidate = { ...context };
  for (const [key, coverageKey, lookup] of [
    ["suppliedActionSchemas", "actionSchemaCoverage", "fleet_action_schema"],
    ["suppliedReadSchemas", "readSchemaCoverage", "fleet_read_schema"],
  ]) {
    const shapes = Array.isArray(candidate[key]) ? (candidate[key] as unknown[]) : [];
    for (let kept = shapes.length - 1; kept >= 0; kept--) {
      candidate = {
        ...candidate,
        [key]: shapes.slice(0, kept),
        [coverageKey]: {
          paged: true,
          retained: kept,
          omitted: shapes.length - kept,
          notice: `Use ${lookup} for omitted prefetched shapes; names/permissions retained.`,
        },
      };
      fitted = pack(candidate);
      if (fitted) return fitted;
    }
  }

  const receipt =
    evidence.find((episode) => episode.id === cognition.latestReceiptId) ??
    evidence.find((episode) => episode.kind === "receipt");
  const protectedIds = new Set([
    cognition.currentEvidenceId ?? evidence[0]?.id,
    receipt?.id,
    ...pair,
    ...(Array.isArray(cognition.analysisEvidenceIds) ? cognition.analysisEvidenceIds : []),
  ]);
  let retained = [...evidence];
  // Remove only unprotected history; keep the accepted candidate order, current
  // observation and latest receipt together. Never relabel dropped Laya advice.
  for (let index = retained.length - 1; index >= 0; index--) {
    if (protectedIds.has(retained[index].id)) continue;
    retained = retained.filter((_, i) => i !== index);
    candidate = {
      ...candidate,
      cognition: {
        ...cognition,
        reduced: true,
        evidence: retained,
        recall: { ...object(cognition.recall), budgetReduced: true },
        packingCoverage: {
          omittedEpisodes: evidence.length - retained.length,
          notice: "Optional history paged; cite delivered IDs only.",
        },
      },
    };
    fitted = pack(candidate);
    if (fitted) return fitted;
  }
  const beliefs = Array.isArray(cognition.beliefs) ? cognition.beliefs : [];
  const reflections = Array.isArray(cognition.reflections) ? cognition.reflections : [];
  if (beliefs.length > 1 || reflections.length > 1) {
    candidate = {
      ...candidate,
      cognition: {
        ...object(candidate.cognition),
        reduced: true,
        beliefs: beliefs.slice(0, 1),
        reflections: reflections.slice(-1),
        stateCoverage: {
          omittedBeliefs: Math.max(0, beliefs.length - 1),
          omittedReflections: Math.max(0, reflections.length - 1),
          notice: "Additional subjective history paged; use fleet_memory_recall for a specific question.",
        },
      },
    };
    fitted = pack(candidate);
    if (fitted) return fitted;
  }
  // Persisted subjective intentions are not current authority. As a final
  // packing fallback, omit their whole optional records from this input only;
  // never erase history or remove protected evidence/the accepted recall pair.
  const continuation = object(candidate.cognition);
  candidate = {
    ...candidate,
    cognition: {
      ...continuation,
      reduced: true,
      plan: undefined,
      beliefs: [],
      reflections: [],
      subjectiveStateCoverage: {
        planOmitted: continuation.plan !== undefined && continuation.plan !== null,
        omittedBeliefs: Array.isArray(continuation.beliefs) ? continuation.beliefs.length : 0,
        omittedReflections: Array.isArray(continuation.reflections) ? continuation.reflections.length : 0,
        notice:
          "Stored subjective state omitted from this input only, not cleared or completed. Current facts and protected evidence remain; missing intentions are unknown.",
      },
    },
  };
  fitted = pack(candidate);
  if (fitted) return fitted;

  // Optional history has been exhausted before narrowing requested feedback.
  fitted = pack(candidate, true);
  if (fitted) return fitted;

  // Last resort: normalize repeated bookkeeping, never source evidence.
  // Whole outcome rows retain every original error, ID, time and meaning.
  const state = object(candidate.continuation);
  const priorOutcomes = Array.isArray(state.outcomes) ? state.outcomes.map(object) : [];
  const packedCognition = object(candidate.cognition);
  const {
    packingCoverage,
    stateCoverage,
    subjectiveStateCoverage,
    availabilityCoverage: _availabilityNotice,
    ...cognitiveFacts
  } = packedCognition;
  const coverage: Data = {
    ...object(packedCognition.coverage),
    ...Object.fromEntries(
      [packingCoverage, stateCoverage, subjectiveStateCoverage].flatMap((v) =>
        Object.entries(object(v)).filter(([key]) => key !== "notice"),
      ),
    ),
    interpretation: undefined, // The final schemaCoverage notice states this boundary once.
  };
  const zeroCounts = Object.entries(coverage)
    .filter(([, value]) => value === 0)
    .map(([key]) => key);
  for (const key of zeroCounts) delete (coverage as Data)[key];
  if (zeroCounts.length) (coverage as Data).zeroCounts = zeroCounts; // Exact negatives, once, rather than repeated key/value scaffolding.
  const peerIds = Array.isArray(packedCognition.knownPeerIds) ? packedCognition.knownPeerIds : [];
  const deliveredPeers = new Set(
    (Array.isArray(packedCognition.evidence) ? packedCognition.evidence.map(object) : []).flatMap((e) => {
      const detail = object(e.detail);
      return [
        detail.peerId,
        ...(Array.isArray(detail.peerFacts) ? detail.peerFacts.map((fact) => object(fact).peerId) : []),
      ];
    }),
  );
  const neededPeers = peerIds.filter((id) => deliveredPeers.has(id));
  const guidance = object(candidate.ownerValues);
  const localTools = new Set<string>();
  const findTools = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) findTools(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = object(value),
      tool = object(object(node.properties).tool).const;
    if (typeof tool === "string") localTools.add(tool);
    for (const child of Object.values(node)) findTools(child);
  };
  findTools(schemaForContext ? schemaForContext(candidate) : schema);
  candidate = {
    ...candidate,
    privateNotes: undefined,
    lastIntent: undefined,
    omissions: ["Prior notes/intent/dated cache paged; unknown."],
    decisionFeedback: (Array.isArray(candidate.decisionFeedback) ? candidate.decisionFeedback.map(object) : []).map(
      (feedback) => ({
        ...feedback,
        guidance: undefined, // Whole stored feedback remains; exact diagnostics and schema are delivered.
      }),
    ),
    schemaCoverage:
      "Schemas paged; lookup enums; requested/correction kept. sameTextAs=delivered text. Plans/beliefs/recall advisory; cite delivered IDs. Current facts/authority prevail; WAIT/queue!=completion.",
    permissionCoverage: undefined, // The system instructions and whole authority already state the admission boundary.
    ...(Array.isArray(candidate.humanOnlyActionKinds) && candidate.humanOnlyActionKinds.length === 0
      ? { humanOnlyCoverage: undefined }
      : {}),
    ...(Array.isArray(candidate.readResults) && candidate.readResults.length === 0
      ? { readHistoryCoverage: undefined }
      : {}),
    // These are optional repetitions of exact lookup shapes already supplied
    // to the model; the actual operations, arguments and enums remain whole.
    ...(localTools.has("fleet_action_schema") ? { convenienceRead: undefined } : {}),
    ...(localTools.has("fleet_read_schema") ? { readSchemaLookup: undefined } : {}),
    ...(localTools.has("fleet_memory_recall") ? { memoryRead: undefined } : {}),
    ...(localTools.has("fleet_continuation_schema") ? { continuationGuide: undefined } : {}),
    ...(instructions.includes("analysisOpportunities") ? { analysisGuide: undefined } : {}),
    ...(guidance.mode === "account_autonomy"
      ? {
          ownerValues: {
            ...guidance,
            instruction: "No invented persona/goals.",
          },
        }
      : {}),
    continuation: {
      ...state,
      coverage: undefined, // Shared schemaCoverage notice; all outcome fields remain whole.
      outcomes: factTable(priorOutcomes),
      outcomeEncoding:
        typeof object(candidate.environment).factEncoding === "string"
          ? "See environment.factEncoding; all original outcomes retained."
          : "Whole rows: columns are dotted paths; common applies to EVERY row. All original outcomes, IDs and meanings retained.",
    },
    cognition: {
      ...cognitiveFacts,
      recall: { ...object(cognitiveFacts.recall), role: undefined },
      coverage,
      knownPeerIds: neededPeers,
      peerCoverage: {
        omittedHistoricalPeerIds: peerIds.length - neededPeers.length,
        meaning: undefined, // Omission count is exact; shared omissions notice says unknown.
      },
    },
  };
  fitted = pack(candidate, true);
  if (fitted) return fitted;

  // Fail before reserving inference if indispensable facts and continuity cannot
  // fit. Raising budgets or silently discarding the accepted pair is not a fix.
  throw new FleetError("CONTEXT_LIMIT");
}
