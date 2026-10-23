# Initial waits and unknown requested facts — 23 October 2026

Assignment: repair the initial wait and placeholder handling exposed by the [closed follow-through probe](nemotron-followthrough-probe-20261023.md), inline within 30 minutes, then report after offline checks. Started 19:56:40 UTC. No inference, game execution, deployment, service restart or installed-profile change is included. Local inference remains Nemotron 4B only; E4/KQ1 remain blocked.

## Cause and repair

The failed response arrived before any schema lookup, so the existing post-lookup progress guard had no pending read to enforce. The fixture also represented an absent fact as the ordinary string `statusCode: "not yet observed"`. The engine could not distinguish that placeholder from an actual string value or determine a required read from the opaque owner goal.

The optional environment-owned `Observation.requestedFacts` contract now expresses that distinction explicitly. The existing opt-in `read-final.v3` consumes it:

```json
{"id":"service.statusCode","tool":"fixture.status.read","state":"unknown"}
```

- `unknown` has no `value`. `known` requires a value. `blocked` requires a bounded code and has no value. Invalid shapes, duplicate IDs and oversized lists refuse before inference.
- An unresolved unknown fact whose tool is currently authorized and read-only requires its metadata lookup or matching scoped read before a wait. After metadata, only that scoped read satisfies the next read step. The generated schema and runtime guard agree; unrelated reads and initial waits refuse before observation/state acceptance.
- Only a matching completed observation read may promote a fact to known. Metadata lookup does not. Dropped fact metadata stays unresolved, and adapters cannot silently add requests or change tool scope during the turn.
- An unavailable read, a typed blocker or the reserved final call permits an honest wait with the fixed summary `Requested facts remain unresolved; no result is asserted.` No budget extension or fabricated value is used.
- Callers without typed requests retain their existing initial-wait behavior. Legacy v1/v2 are unchanged. A legitimately known literal string `not yet observed` remains valid; the engine does not guess sentinel words.

This is a scoped request lifecycle, not a general semantic completion judge. Authorized action proposals retain their existing validation. A typed known value is trusted adapter output; this change does not verify every natural-language answer or infer domain-specific missing values.

## Adapter and next-probe contract

An adapter opting into this behavior must author requested facts from trusted task state, remove placeholder values from its ordinary fact payload, and return `state: "known", value: ...` only with an actual matching read result. Peer text and model output must not author these requests. A missing catalog tool remains unavailable; a fact request grants no tool or authority. No production PACT mapping or installed profile is changed by this repair.

The new private offline fixture follows this contract: initial service payload omits `statusCode`, the typed request starts unknown, and the synthetic scoped read supplies the known value. Both schema-progress and pending-request paths pass without a provider. Any separately authorized future probe must use this revised fixture and a fresh boundary; the earlier failed probe and its spare allowance remain closed.

## Offline verification

Regression tests first reproduced acceptance of the initial wait and the malformed unknown-with-value shape. Tests now cover initial refusal, metadata → read → known → answer, dropped metadata, unavailable reads, typed blockers, final-call exhaustion, known literal values and schema/runtime agreement. The existing specialist fake-HTTP integration checks unknown before the read and known afterward, including grammar rejection of premature waits and detours.

The network-forbidden scripted fixture passes both paths with zero model calls and zero game commands. Maximum request size is **12,946 / 13,000 bytes**; existing limits are unchanged. Its four scripted decisions are fake responses, not inference. Private evidence remains outside Git at `/home/mnim/.local/share/fleet-probes/requested-facts-offline-20261023-2004/`:

- Script SHA-256: `4c47d41d41dcb41f9f3a87007bc0a02c3a1cee373882a052e01e262b46398c47`.
- Result SHA-256: `7a8584d11ebf824d6f73c3c8c123981d71f8af840413394be7df7124037b62fc`.

Final checks:

- `npm test`: **879 tests in 169 files passed**.
- Fresh owned disposable PostgreSQL fixture, `tests/integration/autonomous-specialist-engine.test.ts`: **55 passed**.
- `npm run check`: exit 0; TypeScript passed, with the existing 82 Biome warnings / 56 informational diagnostics outside this change. Focused Biome check of all nine changed source/test files: clean.
- `npm run build`, `npm run check:boundaries`, `git diff --check` and local documentation-link checks: passed.
- Read-only ordinary Fleet health: `liveEnabled: false`. PACT working tree remains clean on master.

Completed within the 30-minute limit. Source changes remain uncommitted and unactivated at this handoff. PACT source is unchanged. Real Nemotron behavior remains unqualified; the pending-request real-model case remains unrun. No further trial follows from this assignment.

The subsequent user request authorized committing this repair and one fresh bounded probe. The repair is committed as `d3a05d1`; the [separate real result](nemotron-requested-facts-probe-20261023.md) records a passing status case and a first semantic failure in the pending-request case. Source remains unactivated. No further inference follows from either closed record.
