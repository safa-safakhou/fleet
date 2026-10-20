# Four-profile operability repair plan

> Execute inline without delegation using systematic debugging, test-driven development and executing-plans. User explicitly authorizes source fixes, local installation and one real turn/task per profile; no routine approval handoff. Existing isolated worktrees are reused.

**Goal:** All four existing profiles can observe useful current state, invoke the configured model, and finish one bounded local operation without session/capacity/context failures.

**Spec:** Latest founder request plus `docs/local-world-observation-20261019.md`; PACT authority/lease/receipt contracts remain unchanged.

**Architecture:** Preserve PACT's default grant-scoped logical sessions for stateless hosts. Add an explicit connection-scoped initialization mode for Fleet, preserving exclusive kingdom write leases. Queue short credential-lock contention instead of dropping normal concurrent work. Provide environment-owned observation packing to the generic reactive engine; reuse PACT whole-fact compaction and eliminate duplicate continuity delivery. Preserve original observations for validation and evidence.

**Constraints:** Same12 identities/closed hour/counters/unknown histories. No server/old-world change, push or delegation. Native Node24; dedicated fixture DBs. Local live checks select one existing actor/profile and append new turns under a new private one-pass registration; no scheduler hour restart or replacement identity. Any observed failure is retained and diagnosed; no hidden retry/reset.

## Task1 — Session lifecycle
- [x] Add failing real-transport/DB tests: repeated default initialize reuses its own grant session; connection-scoped readers have distinct IDs; closing a reader leaves writer session/lease usable; competing writer denied; wrong principal cannot close; concurrent credential preparation waits without AUTH_BUSY.
- [x] Add opt-in MCP connection sessions/migration/advertisement and Fleet negotiation; unsupported isolation fails explicitly. Keep legacy constructor mode available for existing client fixtures.
- [x] Run focused tests/build/type checks and commit source/evidence.

## Task2 — Useful bounded context
- [x] Add failing large-observation tests using real PACT compaction, actual schemas and continuity envelope. Assert current identity/owner intent/stock/buildings/authority and a discovered peer remain; current messages and omission coverage survive; both profiles reach fake inference within24000 bytes on the synthetic fixture; real full packets receive the separately audited local48KB allowance.
- [x] Add environment packing hook; preserve generic small-packet parity. Remove duplicate observation continuity only from model delivery, retain authoritative source for validation. Supply normal PACT facts/discovery alongside outlook; exact clock metadata. Correct helper aggregate label.
- [x] Add failure coverage: whole core cannot fit -> explicit failure, no inference; omitted continuity citations stay rejected. Run full relevant suites/checks and commit.

## Task3 — Local acceptance
- [x] Back up preserved state, build/migrate only owned local services, verify original hour closed and zero outstanding usage.
- [x] Real local MCP concurrent read/poll/lease acceptance and all six reactive actors’ current observations with fake providers; no real inference here.
- [x] New persisted one-pass controller: only one selected task/turn per profile, no background fleet worker/scheduler admission; same accounts/history and audited input-only amendment. Resume/pause only this world; close registration in finally; reconcile original commands and account all model/helper usage.
- [x] Run actual four-profile attempts, diagnose/fix any remaining operational failure within covering request, keep all attempts visible. Distinguish legal wait/known rejection from transport/model/packing failure.
- [x] Verify closed/paused final state, encrypted restore and full relevant tests. Commit paired reports and hand back actual results and limits; do not claim strategy quality from one turn.

## Review focus
Cross-process polling/command session closure; credential token rotation; large source IDs and growing continuity; raw/current state versus compact model state; one-pass crash recovery without replay or original-window extension.

## Execution adjustments

Real full packets required an audited local input-only increase to48KB; minimal synthetic regression packets still pass within24KB. The six real reactive observations were checked with fake providers; all four profiles were then exercised against the actual provider. Two initial legacy attempts made zero model calls and remain recorded; only those profiles were retried after fitting to the tighter reservation bound. No identity replacement or original-hour extension occurred. Full evidence and final checklist outcomes are in `docs/local-world-operability-20261019.md`; the historical12-account baseline and all usage remain preserved.
