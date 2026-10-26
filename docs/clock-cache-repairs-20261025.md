# Clock and physical cache repairs — 25 October 2026

Status: cache admission is implemented and verified offline; the approved host clock repair is applied and its settled five-minute Windows-referenced validation passes. Final verification passed. **No model calls, model loading, GPU initialization, GUI, worker activation or rehearsal.** Game execution remains disabled and E4/KQ1 blocked.

The subsequent [isolated activation and measured repeat](native-cache-block-rehearsal-20261025.md) verifies the live hook and reports 720/720 with zero preemptions. The offline-only status below is the preceding repair checkpoint.

The user approved implementation of the [investigated repair](clock-cache-investigation-20261024.md), inline, with offline admission checks and clock-only validation before another rehearsal. Private evidence and settings snapshots are under `/home/mnim/.local/share/fleet-clock-cache-fix-20261025-03tul7s9/`. No commit or push was requested.

## Clock repair and actual result

Ubuntu's duplicate `systemd-timesyncd` service is stopped and disabled through `timedatectl set-ntp false`. WSL's VM-level host/PTP chrony remains running. One explicit maintenance operation resets coarse tick from 9167 to 10000us and fine frequency to 0 through `ADJ_TICK | ADJ_FREQUENCY`. It does not call a wall-time setter or rewrite any stored deadline, schedule or command. Clock source remains `tsc`; Hyper-V boot/resume synchronization settings are unchanged. Prior settings and operation outputs remain private.

The first five-minute control **fails** the 0.1% rate gate: Windows 300.978518s versus adjusted monotonic 300.426626s, error−0.183366%. Analysis finds retained chrony corrections during the first minute, including six samples at tick 9167; each of the remaining four minute windows stays at tick 10000 with negligible rate error. We make no further settings change and run one fresh five-minute control after that convergence. Both controls remain retained.

| Settled control, 301 samples | Measured elapsed |
|---|---:|
| Windows QPC reference | **300.428612900s** |
| Windows UTC | 300.428611800s |
| WSL monotonic | **300.429473361s** |
| WSL wall | 300.429473132s |
| WSL raw | 300.429462490s |
| WSL boottime | 300.429473622s |

Monotonic differs from Windows by **0.860461ms**, about **2.864ppm**, versus up to 8.33% slow before repair. All 301 ticks are10000us. The verifier finds no wall steps over 50ms, no whole-window or moving-window rate mismatch over 0.1%, and no off-scale fine correction. Maximum IPC round trip is 5.761382ms. Observed guest wall offset from Windows UTC has median 0.378ms and maximum absolute 1.411ms. This passes the declared clock-only gate. Continued normal tick/fine correction is checked after the regression suite.

The intervention supports competing time discipline as the cause in this setup: leaving the host/PTP authority alone permits convergence and stops the repeated percent-scale corrections. We have not traced every historical writer or tested reboot, suspend/resume, day-long stability or GPU inference load. The earlier 720 receipt results remain valid; their clock-local timings are not retroactively rewritten.

## Cache admission implementation

An additive migration adds **named resource capacity** and a topology/instance fingerprint to shared provider routes, plus separate resource units on leases. Existing token columns, billing limits, measured usage and historical unknown allocations remain unchanged. Unknown old resource demand consumes the entire resource budget until the existing lease is legitimately released; it is never treated as zero.

A strict versioned provider cache profile supplies actual physical pool/group metadata, selected model/endpoint, context length, concurrency ceiling, engine-configuration hash and a fresh provider instance identity. The estimator measures prompt tokens once, reserves the existing maximum output and computes physical blocks from the declared groups. For this pinned Nemotron 4B profile:

```
request_blocks = 6 + ceil((exact_prompt_tokens + reserved_output_tokens) / 976)
admission_capacity = 57 pool blocks - 1 null block - 1 safety block = 55
```

Both legacy and native engines use the same FIFO leases. Four small requests can overlap; four requests needing 16 blocks each admit three, and requests needing 19 blocks admit two. Queued cancellation does not dispatch. Oversized demand, invalid metadata and route/profile mismatch fail before invocation. Releasing a resource lease does not settle or erase unknown model usage.

Parallel explicit vLLM configuration now requires a physical profile; a 40000-token setting alone cannot re-enable the unsafe parallel path. Default single-slot and other-provider behavior remains covered. A configured cache endpoint also refuses an omitted/wrong provider marker, closing the bypass found during inline review. Known usage continues to settle independently of semantic output validity. The inline-review bypass test failed before its fix and passes afterward; the full 1,016-test unit suite then passed again. Review was performed inline by the implementing agent, in accordance with the no-delegation constraint.

### Live metadata identity, implemented but not activated

The supported vLLM worker-extension hook exports the worker's actual `KVCacheConfig`. Its authenticated ASGI metadata endpoint performs no inference. Unsupported prefix-cache, speculative, distributed or cache-group modes are refused rather than approximated. Fleet checks the live profile fingerprint immediately before inference dispatch, so a changed/restarted provider cannot silently use an old profile. Engine code does not contain Nemotron-specific block constants.

The Python hook is checked against actual installed vLLM cache-spec classes and a fake engine client, including authentication and unsupported-mode rejection. A Python-exported metadata fixture round-trips through the TypeScript profile loader and block estimator. **The hook has not been exercised against a newly started model server**, because model startup/loading and rehearsal are outside this assignment. The installed Fleet runtime and provider configuration are not activated or changed.

## Verification

Verification passed **1,016 unit tests across 191 files**, **153 isolated integration tests across 10 selected files**, **three CPU-only Python metadata tests**, types/build/boundaries/changed-code style, C helper compilation with warnings-as-errors and the reset helper refusing invocation without `--apply`. The integration total comprises 84 tests in seven files, 67 in two additional files and two physical-profile native-composition tests. Final logs are retained privately. All database checks use fresh owned synthetic fixtures and scripted providers; none select retained worlds or live routes.

Specific coverage includes physical pool boundaries; four-small/three-large/two-largest concurrency; unknown old resource demand; changed topology/instance fingerprint; canceled queue admission; unknown token-reservation preservation; default token-only/slot-only routes; and all eight registered architectures with scripted proposals through the shared limiter. The tests do not claim measured throughput or zero preemptions under real model load.

A rehearsal startup gate now requires recent Windows-referenced evidence, recomputes the clock verdict from the samples, and checks freshness against the current Windows QPC and UTC. A `passed:true` field on its own, stale evidence, a host restart, short window, rate discrepancy, tick instability or wall step cannot substitute for validation. The current proof is historical evidence, not a permanent launch grant; collect a fresh control before the next rehearsal.

## Operating the repairs

For a newly approved owned provider startup, copy/pin `scripts/lib/fleet_vllm_capacity.py` into its Python module path and add these supported vLLM flags to the already-pinned Nemotron 4B launch:

```
--worker-extension-cls fleet_vllm_capacity.CacheInspector
--middleware fleet_vllm_capacity.CacheProfileMiddleware
```

Set a fresh `FLEET_PROVIDER_INSTANCE_ID` and the exact `FLEET_CAPACITY_ENDPOINT` ending in `/v1`; use the existing private `VLLM_API_KEY`. Once ready, fetch authenticated `GET /fleet/cache-profile` into a private mode-600 `cache-profile.json`. Record its instance ID and engine hash in the owned service record. Set `FLEET_VLLM_CACHE_PROFILE` for Fleet. No key value belongs in a command log, profile, Git or report. Existing route records reject a changed fingerprint; this assignment does not rewrite retained route policies.

For clock qualification, compile the read-only `scripts/read-clock-rate.c` helper into a private directory. Run `scripts/clock-probe.py --output <new-private-file> --rate-helper <private-helper>`; it collects 301 samples and changes no settings. Then run Node24 with `node --import tsx scripts/validate-host-clock.ts <private-file>`. Success requires a full five-minute host-reference window and evidence no older than ten minutes. Set `FLEET_CLOCK_VALIDATION` to that evidence before the rehearsal runner; missing or stale evidence stops it before fixture/model activity. The rate-reset helper is a separately explicit privileged maintenance tool, never an automatic validation step.

The next model rehearsal still requires a new assignment. It must validate the live metadata hook, measure preemptions and queue latency, and verify 720-request completion under physical-block admission. No claim of unchanged throughput, reboot/resume acceptance, 24-hour readiness or game activation follows from these offline results.

## Preservation

Only the approved clock service/rate settings are changed live. PACT source, installed application settings/processes, paused worlds, identities, pending work and historical unknown usage remain preserved. Old rehearsal providers/databases stay stopped; evidence and volumes are retained. No original allocation, mandate, budget or schedule is reset. Fleet source changes remain uncommitted on master; E4/KQ1 remain blocked and game execution disabled.
