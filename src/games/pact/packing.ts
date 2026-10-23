import { type Data, FleetError, object } from "../../domain.js";
import { factTable } from "../../fact-table.js";
import type { Observation } from "../../platform/contracts.js";
import { compactFacts } from "./adapter.js";
import { compactEnvironment } from "./environment.js";
import { fitNegotiationState, type NegotiationState } from "./negotiation-state.js";

function ordinaryNegotiationStock(balances: Data): Data {
  const split = (v: unknown) =>
    typeof v === "string" && /^\d+$/.test(v)
      ? { floor: (BigInt(v) / 600n).toString(), remainder: (BigInt(v) % 600n).toString() }
      : { floor: null, remainder: null };
  return Object.fromEntries(
    Object.entries(balances).map(([resource, raw]) => {
      const b = object(raw),
        ordinary = split(b.ordinaryUnits),
        locked = split(b.lockedUnits),
        capacity = split(b.capacityUnits);
      return [
        resource,
        {
          ordinaryWholeFloor: ordinary.floor,
          ordinaryRemainderMarked: ordinary.remainder,
          lockedWholeFloor: locked.floor,
          lockedRemainderMarked: locked.remainder,
          capacityWholeFloor: capacity.floor,
          capacityRemainderMarked: capacity.remainder,
          ratesWholePerHour: Object.fromEntries(
            Object.entries(object(object(b.facts).rates)).map(([kind, v]) => [kind, object(v).perHourWhole]),
          ),
        },
      ];
    }),
  );
}

/** PACT owns which facts are essential; generic engines must never delete world keys. */
export function packPactObservation(observation: Observation, byteLimit: number): Observation {
  if (
    ["pact.observation.specialists.v1", "pact.observation.specialists.v2", "pact.observation.specialists.v3"].includes(
      observation.schemaId,
    )
  )
    return packSpecialistObservation(observation, byteLimit);
  if (["pact.observation.negotiation.v1", "pact.observation.negotiation.v2"].includes(observation.schemaId)) {
    const v2 = observation.schemaId === "pact.observation.negotiation.v2";
    const { negotiation, requestedRead } = observation.payload;
    const compact: Data = compactFacts(observation.payload),
      world = object(observation.payload.world),
      guide = object(observation.payload.guide);
    const keys = [
      "profile",
      "ambition",
      "ownerIntentStatus",
      "asOfGameTimeMs",
      "balances",
      "authority",
      "mandate",
      "socialDelegation",
      "coldContactStock",
      "communicationCapacity",
    ];
    const environment = Object.fromEntries(keys.filter((k) => compact[k] !== undefined).map((k) => [k, compact[k]]));
    // The trusted candidate policy is a negotiation view. Other game detail is
    // available by ordinary scoped reads; omitted construction is never absence.
    environment.balances = factTable(
      v2 ? ordinaryNegotiationStock(object(environment.balances)) : environment.balances,
    );
    if (v2)
      environment.stockMeaning =
        "Ordinary stock only. WholeFloor plus RemainderMarked/600 is the exact balance; null is unknown. Rates are whole/hour. Founding allowance is not ordinary trade stock. Authority ceilings are permission, not stock. Unsigned offers create no income, delivery or immediate stock transfer.";
    environment.authority = {
      ...object(environment.authority),
      resources: factTable(object(environment.authority).resources),
    };
    environment.contacts = guide.contacts;
    environment.contactRequests = guide.contactRequests;
    environment.publicDiscovery = observation.payload.discovery;
    environment.socialAttention = {
      ...object(observation.payload.socialAttention),
      records: (Array.isArray(object(observation.payload.socialAttention).records)
        ? (object(observation.payload.socialAttention).records as unknown[])
        : []
      ).filter((r) => !["SupplyOffer", "SupplyContract"].includes(String(object(r).type))),
    };
    const base: Observation = {
      ...observation,
      payload: {
        environment,
        ...(requestedRead === undefined
          ? {}
          : {
              requestedRead: {
                ...object(requestedRead),
                ...(Array.isArray(object(requestedRead).records)
                  ? { records: factTable(object(requestedRead).records) }
                  : {}),
              },
            }),
        negotiation: null,
      },
      coverage: {
        ...observation.coverage,
        packed: true,
        policy: v2 ? "pact.negotiation-view.v2" : "pact.negotiation-view.v1",
        omitted: [
          "construction, military and full guide/rule detail; use normal scoped reads",
          ...(v2
            ? ["founding allowance omitted from negotiation stock; use scoped world read for founding supplies"]
            : []),
        ],
        time: world.asOfGameTimeMs,
      },
    };
    const bytes = () => Buffer.byteLength(JSON.stringify(base));
    if (bytes() > byteLimit - 1000) {
      delete environment.publicDiscovery;
      (base.coverage.omitted as string[]).push("discovery page unavailable; use scoped discovery read");
    }
    const state = structuredClone(negotiation) as NegotiationState;
    if (v2)
      state.units = {
        stock: "whole floor plus remainderMarked/600",
        flow: "whole/hour",
        bond: "whole",
        internalPerWhole: 600,
      };
    state.constraints = null;
    state.constraintRefs = {
      stock: "environment.balances",
      authority: "environment.authority",
      mandate: "environment.mandate",
      socialDelegation: "environment.socialDelegation",
    };
    state.coverage.complete = false;
    state.coverage.omitted.push(
      "constraint totals supplied at constraintRefs; exposure schedule/detail requires scoped read",
    );
    const fitted = fitNegotiationState(state, byteLimit - bytes() - 32);
    base.payload.negotiation = fitted.state;
    if (Buffer.byteLength(JSON.stringify(base)) > byteLimit) throw new FleetError("CONTEXT_LIMIT", true);
    return base;
  }
  const { requestedRead, ...facts } = observation.payload;
  // A requested scoped read is its own answer, not an initial world snapshot.
  if (!facts.world) {
    if (Buffer.byteLength(JSON.stringify(observation)) > byteLimit) throw new FleetError("CONTEXT_LIMIT", true);
    return observation;
  }
  const base = {
    ...observation,
    payload: { ...(requestedRead === undefined ? {} : { requestedRead }) } as Data,
    coverage: { ...observation.coverage, packed: true },
  };
  const overhead = Buffer.byteLength(JSON.stringify(base));
  const environment = compactEnvironment(compactFacts(facts), byteLimit - overhead - 64);
  return { ...base, payload: { ...base.payload, environment } };
}

/** New-profile input selection. Original profiles keep their original protected core.
 * Whole current own stock/authority/building/training facts remain mandatory; verbose
 * derived briefing/rule text is explicitly unavailable and can be read normally. */
function packSpecialistObservation(observation: Observation, byteLimit: number): Observation {
  const compact: Data = compactFacts(observation.payload),
    keys = [
      "profile",
      "ambition",
      "ownerIntentStatus",
      "asOfGameTimeMs",
      "balances",
      "authority",
      "mandate",
      "socialDelegation",
      "coldContactStock",
      "communicationCapacity",
      "buildings",
      "builders",
      "training",
      "nextUpgradeChecks",
      "constructionStockChecks",
      "upkeep",
      "charges",
    ],
    environment: Data = {};
  for (const key of keys)
    if (compact[key] !== undefined)
      environment[key] = [
        "balances",
        "buildings",
        "builders",
        "training",
        "nextUpgradeChecks",
        "constructionStockChecks",
      ].includes(key)
        ? factTable(
            compact[key],
            key === "balances" &&
              ["pact.observation.specialists.v2", "pact.observation.specialists.v3"].includes(observation.schemaId)
              ? { atomicPaths: ["facts"] }
              : {},
          )
        : compact[key];
  const originalAuthority = object(observation.payload.world).authority;
  environment.authority =
    originalAuthority === undefined
      ? { coverage: "Authority unavailable; read fresh authorized facts." }
      : {
          ...object(originalAuthority),
          resources: factTable(
            Object.fromEntries(
              Object.entries(object(object(originalAuthority).resources)).map(([asset, value]) => {
                const { releaseSchedule, reservations, ...totals } = object(value);
                return [
                  asset,
                  {
                    ...totals,
                    ...(Array.isArray(releaseSchedule)
                      ? { releaseCount: releaseSchedule.length, nextSpendRelease: releaseSchedule[0] ?? null }
                      : {}),
                    ...(Array.isArray(reservations) ? { reservationCount: reservations.length } : {}),
                    ...(releaseSchedule !== undefined || reservations !== undefined
                      ? {
                          coverage:
                            "Current permission totals retained. Release/commitment rows are unavailable in this view; observed array counts are not additional authority. Read current server quotes for details.",
                        }
                      : {}),
                  },
                ];
              }),
            ),
          ),
        };
  const omitted = Object.keys(compact).filter((k) => !keys.includes(k)),
    pages: Data = {};
  const result: Observation = {
    ...observation,
    payload: {
      environment,
      ...(observation.payload.requestedRead === undefined ? {} : { requestedRead: observation.payload.requestedRead }),
    },
    coverage: {
      ...observation.coverage,
      packed: true,
      policy:
        observation.schemaId === "pact.observation.specialists.v3"
          ? "pact.specialist-view.v3"
          : observation.schemaId === "pact.observation.specialists.v2"
            ? "pact.specialist-view.v2"
            : "pact.specialist-view.v1",
      complete: false,
      omittedFields: omitted,
      pages,
    },
  };
  const bytes = () => Buffer.byteLength(JSON.stringify(result));
  environment.factEncoding = ["pact.observation.specialists.v2", "pact.observation.specialists.v3"].includes(
    observation.schemaId,
  )
    ? "Tables: dotted columns; common=all rows; $key=map key; absent[row]=missing, not0/null. balances.facts amounts/rates are whole; other Units fields are marked. Omitted data unknown; read."
    : "Whole tables: columns=dotted paths, common=EVERY row, $key=map key, absent[row]=missing (not null/0). Omitted fields/records are unknown, not absence; use normal scoped reads.";
  for (const key of ["contacts", "contactRequests", "openSupplyOffers", "contracts"]) {
    const records = Array.isArray(compact[key]) ? (compact[key] as unknown[]) : undefined;
    if (!records) continue;
    const protectedSocial =
      observation.schemaId === "pact.observation.specialists.v3" && ["contacts", "contactRequests"].includes(key);
    environment[key] = protectedSocial ? records : [];
    const omittedIndex = omitted.indexOf(key);
    if (omittedIndex >= 0) omitted.splice(omittedIndex, 1);
    pages[key] = {
      observed: records.length,
      delivered: protectedSocial ? records.length : 0,
      omitted: protectedSocial ? 0 : records.length,
    };
  }
  const attention = object(compact.socialAttention),
    records = Array.isArray(attention.records) ? attention.records : [];
  const setSocialRecords = (selected: unknown[]) => {
    const sourceCoverage = object(attention.coverage);
    environment.socialAttention = {
      ...attention,
      records: selected,
      coverage: {
        ...sourceCoverage,
        sourceComplete: sourceCoverage.complete,
        complete: sourceCoverage.complete === true && selected.length === records.length,
        delivered: selected.length,
        omittedFromThisInput: records.length - selected.length,
      },
    };
  };
  const protectedAttention =
    observation.schemaId === "pact.observation.specialists.v3"
      ? records.filter((r) => object(r).type === "ContactRequest")
      : [];
  if (compact.socialAttention !== undefined) {
    setSocialRecords(protectedAttention);
    const omittedIndex = omitted.indexOf("socialAttention");
    if (omittedIndex >= 0) omitted.splice(omittedIndex, 1);
    pages.socialAttention = {
      observed: records.length,
      delivered: protectedAttention.length,
      omitted: records.length - protectedAttention.length,
    };
  }
  if (bytes() > byteLimit) throw new FleetError("SPECIALIST_CONTEXT_INCOMPLETE", true);
  for (const key of ["socialAttention", "openSupplyOffers", "contactRequests", "contracts", "contacts"]) {
    if (observation.schemaId === "pact.observation.specialists.v3" && ["contacts", "contactRequests"].includes(key))
      continue;
    const records =
        key === "socialAttention"
          ? Array.isArray(attention.records)
            ? attention.records
            : []
          : Array.isArray(compact[key])
            ? (compact[key] as unknown[])
            : [],
      selected: unknown[] = key === "socialAttention" ? [...protectedAttention] : [];
    for (const record of records) {
      if (selected.includes(record)) continue;
      selected.push(record);
      if (key === "socialAttention") setSocialRecords(selected);
      else environment[key] = selected;
      pages[key] = { observed: records.length, delivered: selected.length, omitted: records.length - selected.length };
      if (bytes() > byteLimit) {
        selected.pop();
        if (key === "socialAttention") setSocialRecords(selected);
        pages[key] = {
          observed: records.length,
          delivered: selected.length,
          omitted: records.length - selected.length,
        };
        break;
      }
    }
  }
  if (bytes() > byteLimit) throw new FleetError("SPECIALIST_CONTEXT_INCOMPLETE", true);
  return result;
}
