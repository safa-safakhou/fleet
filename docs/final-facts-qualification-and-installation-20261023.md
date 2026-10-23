# Final-fact qualification and disabled installation — 23 October 2026

The four requested tasks are complete through the approval handoff: provenance repair, fresh game-free qualification, actual isolated disabled installation acceptance and a concrete activation package. Activation itself has not occurred and awaits explicit approval. This is service-only approval; game execution stays disabled.

## Source and offline acceptance

Fleet `966f2d2069d027cb382b67beba70aef30a228ff8` closes the final-summary provenance hole by rendering known typed facts from trusted observation IDs and values. The generation grammar pins that result and runtime rejects bypass before persistence. Unknown/blocked facts retain the honest unresolved result. Legacy contracts and untyped requests are unchanged. See [repair and regression coverage](final-fact-provenance-fix-20261023.md).

Verified 896 unit tests / 170 files, 63 fresh isolated integration tests (57 specialist HTTP, five bindings, one preservation), type/style/build/boundaries. The explicit invented-path HTTP regression also passed separately after its grammar assertion was added. Existing 82 warnings / 56 informational diagnostics remain. A fresh final full dependency audit found zero vulnerabilities. PACT application code and dependencies were unchanged.

## Real behavioral qualification

Frozen source `966f2d2`; only native Ollama 0.35.1 at `127.0.0.1:11434`, `nemotron-3-nano:4b`, thinking false, model digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`.

| Case | Calls | Observed result |
| --- | ---: | --- |
| Schema progress | 3 | Metadata lookup, self-scoped read, canonical known-fact final; no invented locator or repeated metadata detour |
| Pending request | 1 | Correct request ID and acceptance proposal; prospective action summary |
| Read unavailable | 1 | Honest unresolved result without fabricated read or value |
| Known literal | 1 | Literal `not yet observed` treated as a known value; no unnecessary read |

All four passed. Start/end: 21:39:42.238–21:40:58.334 UTC. Six calls / 76.096 seconds / 9,097 input + 347 output = 9,444 measured tokens. Zero retries, unknown calls and game commands. Maximum request 12,991 bytes within unchanged 13,000-byte ceiling. The six-call/ten-minute allowance is closed; there were no further model trials.

Private proof: `/home/mnim/.local/share/fleet-probes/final-facts-qualification-20261023-2135/result.json`, SHA-256 `038f9a0e8726f0fd3071875a788781674d756d66872a30794631c8ec0fd3790d`.

This qualifies the four synthetic contract cases, not general negotiation or production gameplay. The pending-request action was captured in memory, never sent to PACT. Earlier failed studies and their allowances remain closed; original E4/KQ1 remain frozen and unrun.

## Actual installation acceptance

An immutable private candidate and baseline `b6da0fd46314ecd63cfa0d5d153ca59f939c3469` use copied native Node 24.12.0 and independent builds. Six real loopback console processes passed 70 installation checks: native executable/PID ownership, sole loopback listener, health live-disabled, authentication failures/login/session, graceful stop/restart, repeated migrations preserving state, authenticated AES-GCM backup with tamper rejection, independent logical table/sequence restore and vault binding, and source rollback preserving a write made after backup. Exact pending-command ID and unknown 40,000-token reservation survived. Owned preservation and restore fixtures were removed afterward; no retained world was used.

The new empty installed database is retained in owned container `42b8b5eb3d9c`. Its candidate console at `http://127.0.0.1:38765` is stopped, no worker or autostart installed. A seventh real native console process separately passed the **exact final saved configuration** health/authentication/session checks and stopped; this resolves a harmless instance-label difference found during review. Post-check counts are zero for cohorts, agents, turns, compute ledger, platform commands, tasks and task claims.

Installation and final-settings checks made zero model calls, zero game commands and started zero workers. Existing ordinary services, provider and paused worlds remain unchanged.

Private installation root: `/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/`.

- `result.json` SHA-256: `a0fba88690579363fd1295e701030470bbc2384850e8d642d69b9ee5477b56fc`.
- `final-settings-check.json` SHA-256: `0a68c41129af90c257bc43ec816c2f18e60289d9976a589b5033aba6914e932a`.
- Candidate inventory: 6,438 entries, `ab9fb4f4357f92862c59bee30b97d2ca382845fcd50c4d583cf50b4fe1f4d195`.
- Native Node: `16143bdaa79716e871d3d9b2f50ce680bca293eba7f0c3fc1d004ed2258fc839`.
- Final settings: `a19adc86ab7d9fbfc422d78d98402ccdc2eab85a0c7e89ae4e1b3bb3b4ec2f3f`.
- Final database state: `1a6819dd629bf44966a09c8ccf17c485234bdb76b906accee5fb22590527a371`.

## Approval package and remaining action

Private [activation package](/home/mnim/.local/share/fleet-candidate-final-facts-20261023-2141/ACTIVATION.md) and matching `activation-request.json`, SHA-256 `0cdb595ebb95e677f57c8599338505003250c1e62bcb6ad756e33691f82bddd8`, expire 24 October 2026 at 21:48:40 UTC. Private credentials/dumps/traces remain outside Git. Approval is absent, not inferred from installation permission.

The checked service-control preflight verifies package/node/settings hashes, container/database ownership, unchanged final state, empty enrollment/tasks and free loopback port. Start additionally requires explicit matching unexpired approval. Stop verifies exact PID/start ticks/executable/directory ownership before signaling. The package pins rollback to old source against the **current** database, never a stale backup; baseline startup requires its own reviewed request.

Only user approval remains for starting this isolated console with `FLEET_LIVE_ENABLED=0`. It authorizes no inference, worker, autostart, enrollment, existing-instance cutover or game execution. Local model use remains Nemotron 4B only. Broader gameplay qualification and production activation are outside this package and are not claimed complete.
