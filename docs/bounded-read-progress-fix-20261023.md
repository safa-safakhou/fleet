# Bounded read progress repair — 23 October 2026

Assignment: fix the unnecessary refresh and premature observation claim exposed by the [stopped game-free Nemotron probe](nemotron-game-free-probe-20261023.md), inline, within 30 minutes, and report after offline checks before any more trials. Work started at 16:43:36 UTC. No inference, game execution, service restart, deployment or installed-profile change is part of this repair. E4/KQ1 remain blocked; local inference remains Nemotron 4B only.

## Cause and implemented contract

The specialist host already delivered a current observation, but its read grammar still advertised the selector-free `{}` refresh. That extra read consumed the three-call probe's final-answer allowance. Separately, a read decision's unrestricted summary could claim that its requested observation had already occurred. A prospective instruction alone did not enforce either boundary.

The source now offers the explicit `decisionContract: "read-final.v3"` alongside existing v1/v2. It requires a known-argument read contract (`environment.v2`, v3 or v4). No existing profile was changed or activated.

- A v3 query must select an advertised scoped read, metadata lookup or other supported selector. Empty `{}` is excluded. Native default reads such as `{tool: name, args: {}}` remain available when their argument schema actually permits them. Native arguments and authorization are unchanged.
- The read summary is fixed to `Read requested; result not yet observed.` in the generated schema and checked again before the engine handles the query. Read decisions still cannot persist final updates. This enforces prospective **read summaries**, not arbitrary truthfulness of all possible final prose.
- The engine exposes the remaining turn calls and removes read choices from the last call, reserving it for final wait/action. Missing facts remain unknown; reserving a final decision does not certify goal completion or authorize an action.
- Runtime guards independently reject `EMPTY_REFRESH_FORBIDDEN`, `READ_RESULT_CLAIM_FORBIDDEN` or `FINAL_DECISION_REQUIRED` before the requested observation/final persistence if a provider bypasses the generated schema.
- Composed query documentation is updated together with the grammar so inherited instructions do not still advertise `{}` refreshes. Final-only packets omit the read interface.

Files: `src/engines/autonomous-specialists/read-progress.ts` owns nonempty query shaping and raw-decision guards; `decision-interface.ts` binds the summary and final-only alternatives; `engine.ts` applies v3 per turn; `manifest.ts` advertises the new opt-in. Tests cover the shape changes, provider bypass and actual fake HTTP specialist flow.

Ruling: Keep v1/v2 and default refresh behavior intact for callers that need it, and put the stricter current-snapshot behavior behind v3. Cost: a future explicitly selected local probe/profile must choose v3; old frozen candidates do not silently gain it.

Ruling: Enforce a prospective read summary structurally instead of guessing whether arbitrary natural-language text claims an observation. Cost: read summaries no longer carry free-form rationale in v3; the selected query identifies the requested information.

Ruling: Reserve the final call rather than raising call/token ceilings. Cost: if the earlier choices do not obtain enough facts, a final wait must remain honest about what is unknown. A model's ability to do that still needs behavioral acceptance.

## Offline evidence

Initial regressions demonstrated that the old summary accepted an already-observed claim and the old final-call format still accepted reads. The new tests passed after the repair. A composed-query regression also caught stale inherited refresh guidance; it passed after removing the contradictory query annotations.

The synthetic HTTP integration adds a v3 sequence with scoped participant state: schema lookup → authorized scoped read → final answer containing the delivered status. Its generated formats reject empty refreshes and the stopped probe's premature summary; the final format has no read branch. Existing v1/v2 paths remain covered. Separate direct-engine tests bypass generation-schema enforcement and verify rejection before observation, acceptance or action submission.

An inference-free adaptation of the closed probe's two fixtures uses scripted replies and a fetch function that always throws. Both fixture paths pass with the v3 contract and the unchanged 13,000-byte prompt/schema cap. Initial extra guidance exceeded the contact packet cap; redundant wording was reduced rather than raising the cap or omitting its request/answer choice. The final largest request is **12,946 bytes**. These are scripted checks, not Nemotron behavior or native-game acceptance.

Private offline fixture and result: `/home/mnim/.local/share/fleet-probes/read-progress-offline-20261023-1650/`. No closed real-probe evidence was rewritten. Integrity pins:

- Offline script SHA-256: `717d2165f00ccf07fefb1e8f2b5c8983a9ceefb117d4d19f02c2528d54117022`.
- Offline result SHA-256: `e984373f1409fc80fb97a634027daa2c870b458c1a99830db24f83c7a53bf6de`.

Final checks:

- `npm test`: **854 tests in 168 files passed**. The three raw-provider engine regressions were also rerun after completing their typed synthetic operation fixture; all passed.
- Owned disposable database fixture, `tests/integration/autonomous-specialist-engine.test.ts`: **55 passed**, including v3 scoped participant state and existing v1/v2 paths.
- `npm run check`: exit 0; TypeScript passed. Biome retains 82 existing warnings and 56 informational diagnostics outside the changed files; focused changed-file checks are clean.
- `npm run build`, `npm run check:boundaries`, `git diff --check`: passed.
- Network-forbidden scripted packet check: both cases passed, zero inference, largest request 12,946 / 13,000 bytes.
- Read-only ordinary Fleet health: `liveEnabled: false`. PACT working tree remains unchanged.

The work completed within the 30-minute limit. At the offline handoff, changes were source-only, uncommitted and unactivated. The subsequent user request authorizes committing this verified repair and a fresh, separately bounded v3 probe; it does not activate game execution. No new model trial was run. Source acceptance is separate from runtime activation and real-model acceptance. The prior real probe remains failed, its spare allowance closed, and its pending-request case unrun. No further trial is authorized by this document.


The user subsequently requested committing the repair and a fresh bounded v3 probe. The repair is committed as `e1f5af6`; the [real v3 probe result](nemotron-read-final-v3-probe-20261023.md) is now closed after two calls, with the pending-request case unrun. No further inference follows from this source record.
