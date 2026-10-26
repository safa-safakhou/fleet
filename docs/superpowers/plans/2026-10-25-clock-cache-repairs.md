# Clock and cache repairs implementation plan

Execute inline with the planning, debugging, TDD and verification workflows. User approval covers the [investigated design](../../clock-cache-investigation-20261024.md); no repeated approval, delegation, GUI, model calls, game execution or E4/KQ1. No commit/push or rehearsal is requested.

Goal: implement named physical-resource admission independent of token accounting, and repair/validate clock discipline against Windows time.

Architecture: add optional fingerprinted resource capacity to the existing shared FIFO leases; compute cache-block demand once from exact prompt tokens and provider metadata. Preserve token-only/default routes and unknown allocations. Keep provider-profile logic out of game engines. Clock repair uses the already-approved single-authority/tick-reset sequence, with private settings snapshots and Windows QPC validation.

Review focus: unknown old resource demand consumes the full pool; changed units/topology fail closed; canceled queued calls never dispatch; model billing/unknown state is independent of resource lease release; clock validation must use Windows-referenced elapsed time and reject jumps/rate instability.

- [x] Clock: snapshot settings, disable duplicate Ubuntu NTP, reset coarse/fine rate only; run five-minute clock-only Windows comparison. If rate corrections recur, stop the trial and inspect the remaining controller; no model trial.
- [x] Admission RED: four small/four large shared leases, oversized demand, unknown resource lease, profile mismatch, cancellation and default-route regressions in fresh synthetic DBs. Expected: fail before implementation.
- [x] Admission GREEN: additive migration, explicit resource unit/capacity/fingerprint and costs in shared RouteCapacity; validated provider profile/config/composition/rehearsal wiring. Keep billed tokens unchanged. Expected: targeted unit/integration passes.
- [x] Clock gate: persist validated host-clock evidence and require a bounded, fresh successful clock preflight before the rehearsal runner can dispatch. Test stale/failed/malformed controls offline.
- [x] Verification: affected tests, selected owned integration suite, full units, types/build/boundaries/style; review changes inline; document actual clock/cache results and any blocker. No installed Fleet activation or rehearsal.

Pre-flight: clock validation and cache changes share only the final rehearsal gate. Clock results do not alter existing deadlines, schedules, original requests or unknown allocations.

Execution ledger:
- Clock: one approved duplicate-NTP disable and rate-only reset. The first control failed during chrony filter convergence; its final four minutes were stable. A second fresh control after settling, without another settings change, passed. This is retained as a failed control followed by an independently passing window, not a hidden successful rerun.
- Resource admission: three shared physical-capacity tests RED→GREEN; final pool suite14/14; eight-architecture scripted composition2/2. Python exporter3/3 and Python→TypeScript profile round-trip pass with zero GPU initialization/model calls.
- Live-identity unit RED→GREEN; missing-profile parallel guard RED→GREEN. Inline final review found provider-marker omission could bypass a configured cache identity; regression RED→GREEN and final full unit suite1,016/1,016.
- Selected integrations153/153 across10 files; types/build/boundaries/style and C/Python checks passed. Review is author self-review because delegation is explicitly prohibited. No commits, activation, model trial or rehearsal.
- Source versus live: host clock repair is applied; cache/identity/qualification code remains unactivated. See [actual report](../../clock-cache-repairs-20261025.md) for remaining live acceptance.
