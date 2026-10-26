# Fresh six-hour game and Fleet — 26 October 2026

Status: **window ended; game paused**. The [morning inspection](six-hour-run-inspection-20261026.md) supersedes the initial snapshot below:2430 turn attempts,207 actions,3062 reported calls plus9 unknowns. Major specialist/coordinator failures and primary shutdown bookkeeping remain. Final encrypted restore passed167/77 tables. The early activity below is retained as launch evidence.

Owner request: archive the old run and start a fresh game/Fleet with all24 kingdoms for6hours. Work inline, no GUI, Nemotron4B only; E4/KQ1 blocked. This authorization covers new identities, budgets and game/model execution. It does not clear old uncertain usage.

## Archive and fresh state

- Old tick699 world and continuations retained in place. Encrypted snapshot `archive-six-hour-20261026` restored into isolated storage and matched all167 PACT/77 Fleet tables. Its five unknown ledger rows and queues were preserved; old owned console and both databases stopped. Volumes, keys, grants and private evidence retained.
- Fresh independently labeled PostgreSQL17 storage, new game identities/grants/vault/database credentials. New native game initially paused at tick0:24 kingdoms,24 agents,24 cohorts; zero turns, model allocations, commands or holds. All24 native scope/catalog checks and launch drafts valid. No old continuity/history imported. Human operator password reused for convenience.
- All eight registered architectures have three kingdoms each (guardian,merchant,diplomat), broad sustain/develop goals with ordinary owner-approved social delegation. No mandatory message/activity quota. Native timed/event scheduling retained with15-minute periodic reviews and per-kingdom concurrency1.
- All24 use only pinned `nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16` revision `dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f`; all11 pinned model files verified. Thinking enabled,8192 output-token cap,64000 input-byte limit,32768 model context, temperature0. Existing per-call40000 token limit, at most3 calls/1 action per turn. Finite each-kingdom ceiling2000 calls/80000000 tokens, deadline exact six-hour cutoff. These are ceilings, not expected consumption.

## Controls and verification

Added21600000ms as an explicit supported duration in the run gate/supervisor and `start-6h`. Fresh roster selects thinking/8192/64000 without changing historical canary defaults. Startup waits for a real supervisor heartbeat before launching the independent guardian and uses a pinned worker/console release. The fresh six-hour run uses actor isolation: individual failures/unknowns remain held without pausing other kingdoms. Clock/infrastructure faults still close admission; no automatic replay or uncertainty review. Admission closes by deadline and world/workers are parked; bounded210s primary drain, with independent host deadline enforcement.

- Tests: new deadline tests first failed, then passed;28 focused checks; full1088 unit checks pass. Type check, build, architecture boundary check, scoped formatting and diff whitespace check pass.
- Pinned release verified216 artifacts and244 source files, including repaired streaming/context path. Fresh encrypted baseline restore matched167 PACT/77 Fleet tables. Runtime uses staged worker/console; supervision uses the recorded source hashes.
- Fresh301-sample Windows/WSL clock control passed over300.374s with roughly0.00035% rate error and normal clock discipline; freshness checked at launch. Live authenticated vLLM cache profile matched pinned Nemotron model/endpoint,4 slots,94 physical blocks/92 usable,32768 context. Token admission ceiling65536; actual concurrent cache admission remains bounded by resource demand.
- Authenticated dashboard root and metrics return200. API, native publisher (external email/push disabled), rules, worker, primary supervisor and independent guardian verified alive;24 cohorts running and24 agents ready. Guardian holds a process-scoped keep-awake request during the run.

## Actual start and initial activity

Start: **2026-10-26 02:31:04 CET**. Cutoff: **2026-10-26 08:31:04 CET**. Exact window is in private `window.json`; current status `running`.

At `2026-10-26T01:33:10.489Z`: 24/24 actors reached, 26 turn attempts, 33 call reservations, 30 reported calls, 14 committed action effects, 0 unknown usage rows, 0 held agents. Turn outcome errors: `[{"state":"finished","code":"PACT_WAIT_STATE_MISMATCH","n":1}]`. Thinking observed in30 reported calls;33 requests explicitly enable thinking. Output-cap truncations0; provider preemptions[0]. Native clock status `active`, tick2. Counts are an early snapshot, not a completed run.

## Operation and evidence

[Dashboard](http://127.0.0.1:56207). Sign-in details kept privately at `/home/mnim/.local/share/pact-fresh-canary-20261026-523b92de/operator-access.txt`, not in Git. The console is execution-disabled; only the separately window-gated worker runs models. Normal finalization may stop the console while producing the final encrypted snapshots.

Private active root: `/home/mnim/.local/share/pact-fresh-canary-20261026-523b92de`. Pointers `/tmp/pact-six-hour-root`, `/tmp/pact-active-6h-root` (historical `/tmp/pact-active-24h-root` also updated). Key evidence: `evidence/preflight.json`, `evidence/baseline-restore.json`, `evidence/initial-health.json`, `evidence/independent-observer.ndjson`, `evidence/metrics-observer.ndjson`, `supervisor.json`, `guardian-ready.json`, live cache profile and staged manifest. Old archive proof is in its original root and the private preparation directory.

At cutoff inspect `window.json`, `evidence/run-final.json`, `evidence/guardian-final.json` and final encrypted restore proof. Do not infer success from the initial launch or silently clear/replay a held actor. No24-hour run, commit or push was requested/performed.
