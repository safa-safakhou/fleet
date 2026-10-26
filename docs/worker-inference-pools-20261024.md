# Worker and inference pools — 24 October 2026

Source adds independently bounded decision workers and inference slots. The existing durable task scheduler, per-agent admission/write fencing, provider FIFO leases, deadlines and usage accounting remain authoritative. Event intake deduplicates/coalesces events before creating work; four independent kingdoms can use four slots, while same-kingdom work retains its existing authority constraints.

## Configuration

All values are validated at startup. Existing defaults remain unchanged; installed services and game settings were not modified.

| Variable | Default | Range / meaning |
| --- | --- | --- |
| `FLEET_CONCURRENCY` | 1 | 1–16 decision tasks; shared across legacy and platform lanes |
| `FLEET_OLLAMA_CONCURRENCY` | 1 | 1–16 active inference calls per Ollama endpoint |
| `FLEET_COMPATIBLE_CONCURRENCY` | 1 | 1–16 calls per compatible endpoint; unrelated to this Nemotron benchmark |
| `FLEET_OLLAMA_CONTEXT_LENGTH` | 32768 | 512–262144 tokens per request |
| `FLEET_OLLAMA_KEEP_ALIVE_SECONDS` | 0 | 0–86400 seconds; 0 retains historical immediate-unload behavior |

Candidate configuration for an inactive future installation: 8 decision workers, **1 actual Nemotron inference slot**, context 16384 and keepalive 300. Codex process capacity remains fixed at one. Cohort budgets and authority remain additional limits; raising worker capacity never increases a cohort's budget or permissions. All worker processes sharing a database must use consistent admission/provider configuration.

Set Ollama's own `OLLAMA_NUM_PARALLEL` to the tested slot count as well: Fleet admission alone cannot make a serialized provider run concurrently. Keep exactly one loaded Nemotron model with separate request contexts. Parallel slots consume additional context/state memory and share the same GPU; measured throughput, rather than slot count, establishes capacity.

Existing `model_capacity_routes` rows deliberately reject a capacity mismatch. Source does not silently resize retained routes or erase leases. A future operator installation must stop admission, drain/check outstanding work and explicitly reconcile the selected route's capacity under separate operational authorization. No SQL against retained state is part of this change.

The common worker pool refuses overflow and new work after close, tracks failures and drains accepted jobs including progress recording. Legacy inference cancellation now tracks every active controller so global stop aborts all concurrent calls. It does not claim that abort refunds unknown provider usage or cancels already committed game actions.

## Reproducible benchmark

Explicit invocation from Fleet, using Node 24:

```sh
FLEET_LIVE_ENABLED=0 node --import tsx scripts/benchmark-nemotron-pools.ts --run /absolute/private/new-evidence-directory
```

The output directory must have no prior run marker. No inference occurs on import. The script starts only a positively owned temporary native Ollama process group at loopback 18534 and uses the existing model files, then stops that group after each phase. It refuses to proceed if the ordinary Ollama service has a loaded model or the private port is occupied. It changes no installed configuration, owner credential, game state or running worker.

Pinned model: `nemotron-3-nano:4b`, digest `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`; native Ollama 0.35.1, thinking false, context 16384, keepalive 300, max 512 output tokens. Concurrency 1/2/4, each one cold warmup followed by 8 measured calls in full parallel batches: 27 calls in the completed run and20 minutes maximum,90 seconds/call, no retries and stop on transport/usage failure; output schema and decision-field failures are counted separately. Concurrent calls already dispatched when a failure arrives may settle; no replacements are submitted.

Each synthetic prompt has an independent kingdom identifier, current resources, reserve, three offers and36 historical observations. The structured response reports a feasible offer and four checks, with `kind=wait` and no executable action. This exercises substantial prompt input and structured decision output without invoking a game runtime, credentials, real owner data or game commands. It is a throughput/correctness smoke benchmark, not acceptance of gameplay or negotiation behavior.

Raw per-call responses, native timings, provider logs, samples, pins and results stay in the private evidence directory. The summary uses wall-clock calls/minute, actual latency percentiles, measured tokens and loaded-model/GPU memory. Four concurrent requests are not assumed to yield four times the throughput. Cold warmup is excluded from steady-state throughput and reported separately.

## Measured results

The completed throughput run took **62.37 seconds** on 24 October 2026 at 04:14–04:15 Europe/Berlin. Eight measured requests per requested concurrency, plus one excluded cold warmup per stage: **27 calls, 85,158 input / 4,495 output tokens**. Measured input was3,154 tokens/call; mean measured outputs were173/172/154 tokens at 1/2/4. No request retry, timeout, HTTP failure, game command or real worker start. Keepalive300 and an entirely GPU-loaded3,155,154,697-byte model were verified. Context16384 was reported by the provider.

| Requested concurrent calls | Mean latency | p50 | p95 / maximum (8 samples) | Calls/minute | Peak total GPU memory | Schema-valid / checked core fields |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.836s | 1.809s | 2.210s | 32.65 | 4,639 MiB | 8/8 /5/8 |
| 2 | 2.626s | 2.024s | 4.004s | 33.88 | 4,639 MiB | 8/8 /2/8 |
| 4 | 4.164s | 3.391s | 6.778s | 35.62 | 4,639 MiB | 8/8 /4/8 |

Cold warmups were4.013/4.190/4.144 seconds; steady-state timings exclude them. The small throughput differences are not evidence of scaling: output lengths differ and there are only 8 samples/stage. GPU peak includes desktop/other GPU allocations, not just Ollama; the loaded model reports about 2.94 GiB VRAM. Minimum WSL available host memory was 9.12 GiB. The PACT/Fleet full application stack was not loaded in this inference-only measurement.

**The current backend does not execute this model in parallel.** Both parallel 2 and 4 logs explicitly say `model architecture does not currently support parallel requests`, architecture `nemotron_h`. All phases report `n_seq_max = 1` and one 16384-token context. Simultaneously outstanding HTTP requests therefore wait behind one inference slot. The private result field `effectiveOverlap` measures overlapping client request lifetimes, including provider queue time; it does not prove simultaneous GPU execution. Constant GPU memory at requested 4 likewise does not prove four contexts/replicas fit.

The source inference pool controls admission and supports independent outstanding calls; it cannot remove the provider's architecture limitation. For this exact native Ollama/Nemotron combination, recommend one inference slot and let Fleet's durable queue retain waiting work. True four-way model execution requires separately measured replicas or a backend that supports this model's parallel execution. Neither was installed or claimed by this change.

## Feasibility of 24 kingdoms

A–H three times means24 kingdoms /36 decision-makers under the previously discussed specialist presets. At2model calls per review, the conservative measured rate 32.65 calls/minute gives:

| Review interval | Calls/day | Estimated model busy time/day | Share of measured capacity |
| --- | --- | --- | --- |
| 15 minutes | 6,912 | 3.53 hours | 14.7% |
| 30 minutes | 3,456 | 1.76 hours | 7.4% |
| 60 minutes | 1,728 | 0.88 hours | 3.7% |

**Compute capacity looks feasible for the measured workload**, even with serialized model execution, because a warm call took about 1.8 seconds rather than the earlier assumed 10–20 seconds. Four simultaneous synthetic requests completed with maximum measured latency 6.78 seconds at requested 4. More model calls per decision, larger prompts, longer outputs, tool latency, frequent events and production background work all increase demand. If actual calls take 20 seconds instead, one slot provides 3 calls/minute: the15-minute schedule demands 4.8 calls/minute and is infeasible;30-minute reviews demand 2.4 calls/minute and leave little burst headroom. Pools do not create GPU capacity.

**Reliable autonomous gameplay is not established.** All 24 measured responses matched the JSON shape, but only11/24 matched every checked core field (exact kingdom ID, selected feasible offer and affordability). Offer selection itself was correct 14/24; affordability 21/24. These are deterministic checks of selected fields, not a complete evaluation of prose, whole architectures or negotiation. Small samples do not support comparing accuracy between concurrency levels. No correctness repair or behavioral requalification was silently included.

## Failed preliminary run and evidence preservation

An earlier one-call warmup stopped under the initial stricter semantic gate: 7.627 seconds including 5.813 seconds loading, 3,138 input/119 output tokens, changed kingdom ID and contradictory affordability. That run remains failed and its marker/evidence untouched. The following run used fresh request identities and recorded correctness separately from throughput, 8 measured requests per stage. **Combined actual usage: 28 calls / 88,296 input / 4,614 output tokens**, under the initially stated 39-call ceiling. No old request was retried and no historical grant was resumed.

Private roots: `/home/mnim/.local/share/fleet-probes/pool-bench-20261024-0413/` (failed preliminary) and `/home/mnim/.local/share/fleet-probes/pool-throughput-20261024-0415/` (completed throughput). The completed result SHA-256 is `b2ecc273bcb85bdb4a8ac3be04107a9a25f66e49f95d050d13951af5ee7ad483`. Both retain source hashes, exact synthetic outputs, native timings and provider logs. The completed private provider was stopped; loopback 18534 has no listener, ordinary Ollama remains reachable with no loaded model, and observed GPU use returned to about 1.3 GiB. No installed services or retained databases/worlds were changed.

## Verification and source status

Final verification: **917 unit tests across 174 files and 30 selected isolated integration tests passed**. Type checking, production build, changed-file style and architecture boundaries passed. Self-review was inline as requested; no independent reviewer is claimed. The baseline drift check explicitly reverses only the four reviewed concurrent-shutdown edits and retains the original controller/artifact hashes.

Repository-wide `npm run check` still reports the pre-existing formatting error in the pinned `docs/proposals/owner-clock-read-profile-20261024.json` (multi-line path array); changing that reviewed proposal would invalidate its stored digest, so it was preserved. There are 82 existing warnings and 56 informational diagnostics. Production dependency audit reports one existing moderate `fast-uri` vulnerability; dependency pins/lockfiles were not changed by this pool task. These checks are reported as outstanding, not passed. No installation, deployment, commit, push, 24-hour run or game activation is implied. Game execution remains disabled; E4/KQ1 remain blocked.
