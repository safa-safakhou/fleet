# Isolated cache-block activation and rehearsal — 25 October 2026

Status: **live metadata verified; the 24-kingdom/30-minute rehearsal passes 720/720 requests with zero cache preemptions**. All eight architectures answer 90/90. All 1,610 calls have known usage; all 1,230 tasks complete before cutoff. The owned provider, simulation and database are stopped with evidence retained. Game execution remains disabled and E4/KQ1 remain blocked. No 24-hour run or installed-runtime deployment occurs.

The user authorized a fresh clock check, isolated activation, live metadata verification and one measured repeat, using only Nemotron 4B, inline and without GUI. The [repair implementation](clock-cache-repairs-20261025.md) and [cause investigation](clock-cache-investigation-20261024.md) define the candidate. This report compares with the preceding [720-request repeat](native-progress-contracts-rehearsal-20261024.md), whose clock-local timings were not physical-duration qualified.

## Gates and isolated activation

The fresh 301-sample clock check passes: Windows QPC 300.423925200s versus WSL monotonic 300.424729703s, difference 0.804503ms, with no rate, tick or wall-step failures. Ubuntu duplicate NTP remains disabled; no further host-clock change is made. Fresh focused offline checks pass 36 tests across four files, plus TypeScript and whitespace checks. All eleven pinned model files are independently rehashed before startup; no model/dependency download occurs.

The owned vLLM 0.32.0 server loads the same pinned NVIDIA Nemotron 4B BF16 weights. It uses Guidance compact decoding, 16384-token context, four inference slots, no prefix cache/speculation, eight task workers, 1536-token output limit, 45-second provider timeout, three calls/one action per turn and 3000 total invocation ceiling. Model settings remain thinking=false, temperature 0, topP 1 and seed 42. The test deliberately pins the physical pool to 57 blocks, matching the earlier measured pool; one null block and one safety block leave **55 admission blocks**. This is an explicit controlled startup setting, rather than claiming unchanged default cache sizing.

The worker extension exports the actual live cache configuration. Anonymous metadata access is rejected 401. Two authenticated reads agree, identify the owned instance and served model, and report six Mamba groups plus one 976-token attention group. Fleet validates the fingerprint and selected route before dispatch. Generation counters are verified zero before the workload: these checks make no model decisions. The earlier offline-only hook is therefore now exercised against a real initialized provider.

Startup evidence includes one failed launch before inference: the long evidence-root path made the ZMQ Unix socket exceed 107 characters. A short, private owned IPC temporary directory fixes that launch configuration. The original service/log/key records are retained as attempt 01. The replacement process starts successfully; there are no model-call retries, provider fallbacks or restarts during the measured run.

## Actual outcomes

| Registered architecture, three kingdoms each | Answered | Model calls | Failed turns |
|---|---:|---:|---:|
| `legacy-loop@1` | 90/90 | 192 | 0 |
| `legacy-cognition@1` | 90/90 | 192 | 0 |
| `reactive-basic@1` | 90/90 | 104 | 0 |
| `reactive-cognition@1` | 90/90 | 102 | 0 |
| `reactive-cognition@2` | 90/90 | 105 | 0 |
| `reactive-cognition@1.1` | 90/90 | 102 | 0 |
| `specialist-coordinator@1` | 90/90 | 192 | 0 |
| `autonomous-specialists@1` | 90/90 | 621 | 0 |

| Measure | Previous repeat | Cache-block repeat |
|---|---:|---:|
| Correctly answered requests |720/720|**720/720**|
| Failed turns / unknown allocations |0 /0|**0 /0**|
| Incorrect / duplicate confirmed effects |0 /0|**0 /0**|
| Provider cache preemptions |6|**0**|
| Samples whose reserved physical bound exceeds usable capacity |242/601|**0/593**|
| Largest observed reserved block bound |64 against56 usable|**55 against55 admission budget**|
| Model calls |1646|**1610**|
| Known measured tokens |9986431|**9698205**|
| Active turns at offered-load cutoff |2|**0**|
| Admitted-work drain |16.596s|**0.012s**|

All 720 receipts are independently joined to their original request and binding. Every request chooses the exact affordable maximum-score option (including none where applicable). There are no invalid effects, duplicate answers, scope violations or host-fact mismatches; 1350 host-bound fact checks agree. There are 720 synthetic peer messages, ten persistent autonomous specialists and 90 settled specialist intents. All 1230 task records are completed, with no residual capacity lease. Final-round peer messages remain retained; no extra unoffered follow-up round is claimed.

The model is still imperfect on first proposals: six inferior numerical choices require feedback. Native feedback has 1140 groups: 1054 first-valid and 86 first-invalid, all 86 recovered and all 1140 final-valid. Legacy has 180 semantic groups: 156 first-valid and 24 first-invalid, all 24 recovered. **110/110 initially rejected groups recover**, with no repeated-failure counts. These are stage/feedback groups, not unique-request first-pass accuracy. Rejections comprise 104 stale-revision cases and six numerical cases; 96 deliberately stale observations are served. Extra stale cases are not all attributed to injection. Every turn stays within three calls.

There are 36 fewer calls than before, matching the reduction in stale-revision rejections from 140 to 104; the six numerical rejections are unchanged. Asynchronous scheduling and prompt IDs/timestamps vary, so this is not evidence of an intrinsic model-accuracy improvement.

## Accounting, concurrency and resources

All 1610 attempts dispatch exactly once and end with final reported usage. All streams finish with `stop`, have unique provider IDs and show zero inter-field whitespace runs. Fleet's **9581496 input /116709 output tokens** independently match the final provider counters, total **9698205**. The ledger retains original 40000-token allowance units per invocation—64400000 cumulative—separately from measured usage. No historical unknown reservation is settled or cleared.

All 1610 admission records independently match actual prompt usage plus reserved output, including the six fixed Mamba blocks and attention rounding. Across 593 pool observations, active reservations never exceed 55 blocks; maximum active slots is four, queued slots six, actual provider concurrency four. Maximum provider cache occupancy is91.07%, with zero preemptions and a maximum of one sampled provider-side waiting request. This verifies physical admission under this workload, rather than inferring safety solely from a token equivalent.

Current measured call latency is median **2.642s**, p95 **5.967s**, max **7.903s**. First-content median 0.801s/p95 1.877s. Turn latency median 6.017s/p95 18.590s/max34.728s. Provider-capacity delay median 2.459s/p95 7.125s/max10.033s; receipt latency median 17s/p95 38s/max68s. No pending request survives cutoff. Earlier latency figures used a faulty local clock and are not used for a causal speedup percentage.

Peak total GPU usage is **13212/16303MiB**; minimum available system RAM is **8.817GiB**, with no out-of-memory failure. These are global device/system readings, not isolated allocator bytes. Background GPU use differed between runs. The physical cache pool and model/turn limits are held as specified; this workload fits this machine, without certifying arbitrary request rates or four simultaneous maximum-length contexts.

## Clock and publication under load

All thirty rounds publish on independent minute boundaries; round 30 starts at **29m00.443s**. Controller elapsed time is **1800189.513ms**, while UTC spans **1800189ms**: disagreement **0.513ms**, versus 2m52.639s previously. All requests and tasks finish before the 30-minute cutoff; the 11.715ms drain is closure work, not unfinished requests.

An independent sidecar records 59 Windows/WSL clock exchanges spanning 1740.084s across load and completion. Monotonic rate differs from Windows QPC by **0.604ppm**; raw rate differs by 0.567ppm. All sampled ticks are 10000us, and maximum wall-minus-monotonic step is 0.004474ms. The repaired clock remains stable during this observation. Reboot, suspend/resume and day-long stability remain untested.

## Preservation, shutdown and limits

All **280 pinned source files** match throughout the measured run, and the serving hook copy matches its source. The provider is verified idle before an ownership-checked process-group SIGTERM. Provider/simulation ports close; the owned database stops with storage retained. Final snapshots, the preclose dump, model/source pins, bounded stream diagnostics, provider counters, clock exchanges and failed startup evidence stay private under:

`/home/mnim/.local/share/fleet-native-rehearsal-20261025-013449-tj_b2d4h/`

Both older retained databases remain stopped, their result hashes match and their nine+three historical unknown allocations remain untouched. PACT source is unchanged. Installed Fleet/PACT/Ollama settings and paused worlds are not activated, reset or replayed. Source remains uncommitted on master; no push or 24-hour run. Game commands remain zero; E4/KQ1 remain blocked.

A final live-only request-count query reached the already-stopped fixture and returned connection refused; it did not restart storage. The primary exported snapshot and independent receipt audit supply the final 720 count. Pool, clock and preclose observers otherwise complete without error. This diagnostic query is not a model/turn failure.

This accepts the declared isolated simulation and live metadata/admission path. It does not certify unrestricted negotiation, free-text factuality, adversarial privacy, an independent full false-rejection rate, all optional memory variants, real PACT mechanics or installed production activation. Those remain explicitly ungraded/not executed. A future 24-hour run needs its own assignment and a fresh clock qualification; none is started here.
