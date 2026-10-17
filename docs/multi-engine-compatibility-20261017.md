# Multi-engine compatibility — 17 October 2026

Source/offline acceptance only. No row certifies a deployed adapter, current credentials, a real provider, model quality or a live run. Fleet source candidate: 8c83be5da23b7bae2cbcdfb8986b696ffcd2ec28. PACT source: 60ec57b98c825eb1756d63121aa53d1aaa3b3315 (P1–P3 included). The installed local Fleet remains 7093cb8.

| Profile/version | PACT base v1 | PACT + events.v1 | PACT + events.v1 + outlook.v1 | Synthetic coordination board | Real route qualified |
| --- | --- | --- | --- | --- | --- |
| legacy-loop/1 | Compatible | Compatible | Compatible | Unsupported legacy schemas/timing | No |
| legacy-cognition/1 | Compatible, original recall/helper requirements | Same | Same | Unsupported legacy schemas/timing | No |
| reactive-basic/1 | Rejected before inference | Compatible | Compatible | Compatible | No |
| reactive-cognition/1 | Rejected before inference | Rejected: continuity absent | Compatible | Compatible | No |
| specialist-coordinator/1 | Rejected before inference | Rejected before inference | Rejected: coordination absent | Compatible, serial or fixture-negotiated parallel reasoning | No |

`legacy-loop` and `legacy-cognition` preserve the original controller; new event flags do not turn them into reactive engines. All real provider capacity remains 1; independent actors can have durable tasks, while route admission serializes model work. PACT has no F6 coordination/atomic-revision protocol or within-actor parallel exception. The fake independent-submit broker remains absent from runtime registration.

PACT flags remain opt-in on both sides: `PACT_AGENT_EVENTS_ENABLED`, `PACT_AGENT_OUTLOOK_ENABLED`; Fleet selects exact `FLEET_PACT_EVENT_FEED_VERSION=pact.agent-events.v1` and `FLEET_PACT_OUTLOOK_VERSION=pact.agent-outlook.v1`. None was changed in an installed process. Profiles/configuration of consumed cohorts remain immutable. The synthetic board is a test adapter, not a second selectable production integration.

| Evidence | What it establishes | Limit |
| --- | --- | --- |
| Legacy baseline tests and byte comparison against c212373 | Controller source preservation/parity | Does not certify a new binary/provider route |
| environment-profiles acceptance | Five actual runtime descriptors match review metadata; advertised capability combinations fail/pass as above | No connection/inference in metadata test |
| Existing real PACT handler acceptance | Actual command contracts, leases/scopes/mandates, human-only and construction recovery boundaries | Synthetic principals in a uniquely owned schema |
| Reactive/continuity/specialist integration suites | Delivery/resync, scoped evidence, claims, shared accounting, fencing/restart/uncertainty behavior | Deterministic fake models; no human-like survival claim |
| multi-engine-preservation + original release-preservation | Legacy/new records coexist; idempotent migrations; old-column read compatibility; full unknown allocation and original pending UUID survive; receipt lookup never replays | Synthetic databases; older worker execution on new task cohorts remains gated |
| PACT P3 actual rules/handler scenarios | Authoritative threat/help/recall/food/wait outcomes and retained playback | Registered 672 replicas are a design, not672 completed model runs |
| Installed local read-only fingerprint | Same22 application tables, release and retained identities/history/uncertainty | Snapshot comparison excludes ephemeral operator sessions/worker health/heartbeats |

The dependency follow-up resolves the original23 PACT findings at `60ec57b98c825eb1756d63121aa53d1aaa3b3315`: local and pruned-runtime-image audits now report0. Reviewed local braces/node-forge backports retain source provenance and direct regressions; UUID uses published11.1.1. Registry audit alone does not certify these private backports. Fleet audit also reports0. [Qualification evidence](dependency-qualification-20261017.md) and [release proposal/remaining gates](multi-engine-release-proposal-20261017.md).
