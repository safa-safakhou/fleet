# Local four-profile operability repair — 19 October 2026

The founder authorized repairing session collisions/context packing and exercising one turn/event per fleet type. This report records the isolated local installation on3400/3401/8830, not a server deployment or a new scheduled observation hour. All12 original identities and the closed14:26:13.625–15:26:13.625UTC hour remain intact. No other Fleet/world was changed. No delegation was used.

## Repairs

PACT's default MCP initialization deliberately reuses a grant's logical session for stateless hosts. Fleet event readers and turn writers consequently shared a session, and reader cleanup could close the writer. PACT migration0072 adds an explicit connection-scoped mode: initialize with `_meta:{"pact/session-scope":"connection"}` and require the matching response. Default reconnect behavior is preserved. Each physical Fleet connection now owns its session. Exclusive account/kingdom write leases, ownership, OAuth scopes and exact receipts still apply. Unsupported isolation stops explicitly before gameplay.

Normal concurrent credential preparation now waits up to10 seconds for the existing advisory lock, reloading credentials under that lock; OAuth changes retain their immediate contention response. Rotation proofs, original-account reconnect and uncertainty fencing remain enforced.

The reactive fitter formerly deleted whole observation keys until its envelope fit, hiding world/discovery/social state. The environment now owns an optional pure `packObservation` port forwarded through the registry/host. PACT uses its existing whole-fact/table compactor: identity, owner intent, balances, buildings, builders, upgrade checks and authority remain whole; peers and urgent attention retain coverage, optional pages disclose omissions. An indispensable oversized core fails explicitly before inference. A requested scoped answer is retained separately. Generic small-packet parity is verified.

Modern cognition receives ordinary current PACT facts/discovery alongside its outlook. Its raw observation remains intact for validation/evidence, but its duplicate continuity copy is removed from model delivery; the separate evidence-bound continuation remains. Citation enums are derived from the final retained evidence. Numeric game timestamps now become exact decimal strings instead of `unavailable`. The observer helper counter now uses the actual `Debug: Laya recall request` label.

Actual combined cognition facts, retained evidence and output schema do not fit the former24KB ceiling without losing useful state. Input configuration now supports up to64KB, with existing settings unchanged by default. For these four local groups only, an explicit paused-cohort operator repair raised input allowance from24000 to48000 bytes, appending old/new values and reason to audit history. It changes no model, lifetime call/token quota, deadline, identity, anchor, usage allocation or past turn; ordinary consumed configuration remains immutable. Active, terminal and unresolved executions cannot receive this amendment. The local provider keeps its existing32768-token context; observed input was5070–12072 tokens/call.

The first live check exposed a second legacy bug: fitting used the expanded input allowance, then a tighter conservative reservation check rejected the fitted request. The packer now fits to `min(inputByteLimit, perCallTokenLimit-maxOutputTokens-1024)`. Its final guard remains. Only this three-line controller change is permitted by the legacy baseline test: reversing the reviewed delta reproduces the original pinned source hash. The historical baseline inventory/digest and default-input behavioral fixtures were not refreshed or erased.

## Actual bounded execution

`scripts/verify-local-world-turns.ts <private-root> <unique-pass-id> [comma-separated-profiles]` appends an exclusive registration, selects ordinal0 of each requested existing profile, creates one exact task per actor, and claims each once through normal eligibility/fencing. It starts no worker/scheduler and never reopens the original hour. A separate private dispatch gate is closed and this world/groups are paused in `finally`. The existing one-hour gate shape is an emergency outer fence only; the runner has no scheduling/retry loop and admits only its selected task IDs. A consumed pass ID cannot be replayed. The runner checks persisted terminal codes and reported usage as well as thrown errors, so a legacy failure swallowed by its controller is still a failed pass. A crash requires inspecting original tasks/receipts before any separately authorized recovery.

Before inference, all six reactive actors' authenticated observations/catalogs/contracts were replayed with a fake provider and real retained evidence. All whole-core comparisons passed, each packet retained8 discovered peers, and packets fit at41880–45530 bytes. Real concurrent MCP reader/writer acceptance confirmed that closing the reader leaves the writer and lease usable. No real model or game command was dispatched by that preflight; opening/closing the checked lease changes no resources.

First pass17:01:22.739–17:03:21.652UTC selected all four profiles. Both legacy attempts stopped with `CONTEXT_LIMIT`, zero model calls, zero commands. These remain in history. After the tighter-envelope repair, only the two failed profiles were retried,17:05:03.916–17:05:51.550UTC. Reactive profiles were not repeated.

| Profile | Successful turns | Reported model calls | Actual result |
| --- | ---: | ---: | --- |
| legacy-loop | 1 | 2 | Read an action schema, then valid WAIT; no command |
| legacy-cognition | 1 | 1 | Valid cognitive review/WAIT; no command |
| reactive-basic | 1 | 3 | Busy Hall proposal rejected locally; invented raid action rejected locally; replanned to valid WAIT |
| reactive-cognition | 1 | 1 | Valid continuity envelope/WAIT; optional empty update accepted; no command |

All7 model executions reported65673 input+2017 output=67690 tokens, with no unknown/reserved allocation or pending command. Actual packets retained8 peers and current core state: legacy27282–35304 bytes; reactive41955–45957 bytes. Modern cognition delivered4 evidence IDs with no duplicated observation continuity. Two Laya recall requests occurred across the initial failed/repaired legacy-cognition attempts; both abstained and deterministic recall was retained. An empty continuity update/review is not evidence of useful memory or improved strategy.

No new action, construction commitment, message, relationship, contract, transfer or military operation committed. Existing queues remained: one completed historical farm, one pending legacy Hall and three pending reactive Halls. The agents' claims that they need further owner instruction despite supplied autonomous owner objectives show weak decision quality; transport/context operability is established, strategic effectiveness is not. The local validators protected the game from both invalid reactive proposals before preparation.

## Verification and final state

Final verification passed on Node24.21:

- Fleet `npm run check` (TypeScript/Biome), `npm run build`, `npm run check:boundaries`, and `git diff --check` passed. Check emitted24 warnings/15 informational diagnostics and no errors.
- Complete Linux fixture runs: `npm test`248/248 across57 files; `npm run test:integration`397/397 across47 files; `npm run test:acceptance`12/12 across2 files. No tests skipped. The Linux fixture isolates process/kernel-lock tests that are skipped on native macOS; the database contained synthetic data only. The cross-repository suite used built PACT packages/real handlers in its dedicated test database.
- PACT full build/typecheck passed,405 unit tests and13 targeted MCP integration tests passed, changed-source formatting and boundary/forbidden-import checks passed. Backlog render/check reports181 unique tickets,37 release criteria and matching source snapshots.
- Native actual runtime acceptance: four valid decision turns, all7 model executions reported; concurrent reader-close/writer-survival; six real reactive whole-core fake-provider replays; encrypted backup restore10/39 tables.

 Earlier red tests reproduced shared-session closure, immediate credential contention, discarded/missing world state, duplicated continuity, insufficient input configuration, exact-task selection and the legacy envelope mismatch. Initial broad failures also exposed outdated fake-server negotiation/board-packing assumptions; fixtures now explicitly implement the new contracts. One intermediate fixture run was invalidated by overlapping synthetic database truncation; the final suites run serially without that overlap. A wall-clock-dependent synthetic diagnostic fixture also exposed a future-evidence flake; it now shares a fixed test clock without weakening production evidence-time validation. No failed/interrupted run is counted as acceptance.

The final local snapshot has55 retained turns (49 historical+2 failed repairs+4 successful checks),48 reported model executions (41 historical+7 new),12 accounts/bindings, zero active turns/unknown usage, all four cohorts paused and every dispatch gate closed. The game's clock is paused at tick68. The background Fleet scheduler remains stopped. API/game/console are available locally; a further run needs a new explicit user assignment.

Encrypted before/after database archives were taken. Authenticated network-disabled restore of the final archive matched all10 core PACT tables and39 Fleet tables and removed its temporary clone. Private credentials, encrypted journals, packets and result manifests remain in the protected local-world state directory and are not committed.
