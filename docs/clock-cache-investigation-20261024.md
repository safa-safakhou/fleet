# Clock and cache investigation — 24 October 2026

Status: clock-only and offline allocator investigation complete. **No model calls, model loading, GPU allocations, worker/game execution, provider startup, host-setting changes or new rehearsal.** The fixes below are concrete proposals, not activated or behaviorally verified fixes. Work is inline; E4/KQ1 remain blocked. Existing services, paused worlds, exact pending work, private evidence and historical unknown allocations are preserved.

The subsequent [25 October repair record](clock-cache-repairs-20261025.md) reports implementation, the approved clock maintenance and actual verification; the proposal/status below is the historical investigation checkpoint.

This follows the [720-request rehearsal](native-progress-contracts-rehearsal-20261024.md). Private numeric clock samples, CPU allocation controls, source hashes and the proposed capacity descriptor are retained under `/home/mnim/.local/share/fleet-clock-cache-20261024-y9hszgr4/` outside Git.

## 1. Clock cause: adjusted guest clocks have the wrong rate and also step

Three persistent PowerShell/Python exchanges compare Windows `Stopwatch`/QueryPerformanceCounter and UTC with WSL wall, monotonic, raw-monotonic and boottime clocks. Each request is bracketed by guest timestamps; maximum measured round trip is 9.813ms. There are 111 samples across the three controls. No clock setting is changed.

| Control | Windows elapsed | Windows UTC elapsed | WSL raw elapsed | WSL monotonic elapsed | WSL wall elapsed |
|---|---:|---:|---:|---:|---:|
| 25 samples | 24.950356s | 24.949398s | 24.952834s | 24.017335s | 26.488456s |
| 25 samples, stable tick | 26.215316s | 26.214852s | 26.216178s | 24.031496s | 24.031496s |
| 61 samples | 65.186580s | 65.187300s | 65.187636s | 60.075230s | 65.552924s |

The raw guest counter agrees with the independent Windows reference to roughly 16–100ppm over these short controls. Adjusted guest monotonic time is **3.74–8.33% slow**, far beyond pipe latency. Wall time additionally jumps. In the 61-sample control, wall-minus-monotonic steps by **+2.706555s and +2.771141s**, totaling 5.477695s.

### Confirmed mechanism

The read-only `adjtimex` probe reports `USER_HZ=100`, coarse `tick=9167us` and fine frequency `-33.338577ppm`. Nominal tick for this host is 10,000us. The running kernel version's frequency formula predicts:

```
adjusted_rate = 9167 / 10000 - 33.338577 / 1000000
              = 0.916666661
```

The stable control measures 0.916696816 against Windows, matching that prediction within about 30ppm. **The large slowdown is explained by software clock discipline, rather than a slow raw TSC in these controls.** Monotonic prevents backward wall-clock jumps; it does not make the adjusted clock's rate correct.

The longer control observes the tick changing between 9,167, 10,000, 9,265 and 9,179us, with corresponding fine-frequency changes. These are ongoing adjustments, not merely one stale boot value.

Two time services are confirmed active:

- Ubuntu `systemd-timesyncd`, synchronized against an external Ubuntu NTP server.
- WSL's VM-level chrony, reached through the already-running WSL system environment, tracking `PHC0`. One tracking read reports residual frequency **+80,280.711ppm**, consistent with a large correction conflict. This service is not visible as a normal Ubuntu service.

Hyper-V implicit synchronization is also enabled (`hv_utils.timesync_implicit=1`). The installed WSL is 2.6.3.0/kernel 6.6.87.2. Its [init source](https://github.com/microsoft/WSL/blob/2.6.3/src/linux/init/main.cpp) launches chrony against `/dev/ptp0`, polling every eight seconds. Its [kernel host-time path](https://github.com/microsoft/WSL2-Linux-Kernel/blob/linux-msft-wsl-6.6.87.2/drivers/hv/hv_util.c) can step time on explicit synchronization or when implicit synchronization finds the guest at least five seconds behind. It does **not** unconditionally step on every host sample. Docker Desktop is stopped; the current Docker engine is native Ubuntu. An active Docker Desktop time service is therefore not established here.

### Attribution limit

**Multiple clock controllers are confirmed; competing discipline is the leading cause of the repeated corrections. The individual writer of every tick change and wall step is not proven.** Ubuntu's inspected upstream systemd 255 adjustment path uses offset/status adjustments and does not set `ADJ_TICK`; chrony's [Linux adjustment path](https://github.com/mlichvar/chrony/blob/master/sys_linux.c) explicitly sets coarse tick and fine frequency. That supports the VM chrony as the coarse-rate writer, but a privileged syscall trace or a controlled single-authority intervention would be required to close attribution. No tracing permissions, service state or kernel setting is changed in this assignment.

### Concrete clock fix proposal

1. During reviewed host maintenance, retain WSL's host/PTP chrony as the single frequency authority and disable Ubuntu's duplicate NTP service. Snapshot settings first. WSL shares the underlying clock across distributions, so this is a host change, not an isolated Fleet setting.
2. Normalize the coarse tick to 10,000us and clear the stale fine-frequency correction through `ADJ_TICK | ADJ_FREQUENCY`, then let the selected authority make small measured corrections. Do not rewrite stored deadlines, schedules, budgets or command IDs. Merely restarting a service need not reset the coarse tick.
3. Keep the current clock source initially: raw TSC already agrees with Windows. Preserve boot/resume synchronization behavior during the first control. Change another clock source or Hyper-V stepping policy only if separately demonstrated necessary.
4. Require a five-minute, Windows-referenced, clock-only control spanning multiple time-service polls: adjusted clocks agree with host elapsed time within 0.1%, no unexplained wall-minus-monotonic steps above 50ms, and no recurring percent-scale tick corrections. If the selected authority drives the rate back off-scale, stop there and investigate its PHC input/write attribution; do not start a model run.
5. Add a clock-health qualification gate before another rehearsal. Raw time can serve as an independent diagnostic here, but switching only the rehearsal timer to raw would leave application/OS timeouts and durable wall-clock scheduling exposed.

This is a **testable repair candidate**, not a claim that disabling one service alone has already fixed the host.

### Effect on the prior report

The 720 correct receipts and known usage remain valid. **The earlier “30-minute” duration and latency values are local-clock measurements, not certified physical elapsed time.** Neither the preceding wall span nor its adjusted monotonic span can be retroactively treated as the exact host duration. Do not rescale every past latency by one constant: the tick changes and wall steps vary over time. Exact duration acceptance needs a clock-qualified repeat.

## 2. Cache cause: a token equivalent was treated as additive physical capacity

The retained provider reports six Mamba groups with 16,384-token block-table sizes and one attention group with 976-token blocks. Prefix caching and speculative decoding are disabled. In this mode each request occupies one block per Mamba group, plus attention blocks:

```
reserved_blocks(request) = 6 + ceil((exact_prompt_tokens + max_output_tokens) / 976)
```

All groups draw from the same physical block pool. The pinned allocator reports capacity by converting **maximum-context concurrency** into a token equivalent; that number is not a freely additive token budget for arbitrary request mixes. Fleet's [shared admission guard](../src/platform/admission.ts) consumes that token equivalent and does not include the six fixed blocks in its cost.

The pinned vLLM implementation computes advertised capacity as `floor(num_blocks / blocks_per_max_context_request * max_model_len)`. Here a full 16,384-token request needs `6+17=23` blocks. The advertised 40,603 figure uniquely implies **57 pool blocks**; the allocator reserves one null block, leaving **56 usable**. Independent cache-usage increments of 1/56 corroborate that inference.

### Offline proof using the installed allocator

The CPU-only fixture constructs matching group/block topology and invokes the actual pinned vLLM coordinator and block pool. It loads no model weights, initializes no GPU and dispatches no requests. The per-request formula agrees with the allocator for **every context length 1–16,384**. These are allocation metadata controls, not a serving benchmark.

| Four equal requests, total tokens each including reserved output | Existing token guard | Physical demand | Actual allocator result |
|---|---:|---:|---|
| 3904 | 15616 ≤40000 | 40/56 blocks | All four fit |
| 7808 | 31232 ≤40000 | 56/56 blocks | All four fit, no spare block |
| 8784 | 35136 ≤40000 | 60/56 blocks | Fourth cannot fit |
| 9760 | 39040 ≤40000 | 64/56 blocks | Fourth cannot fit |

This explains why “we stayed below 40,000” failed to prevent preemption. The retained 601 pool samples include **242 samples whose admitted maximum-output reservations exceed 56 physical blocks**, reaching 64. All six preemption increments follow a sample whose admitted bound is 61–63 blocks. Reservations include future maximum output, so exceeding the bound does not mean every such sample already exhausted physical memory. Actual output lengths determine when a preemption occurs.

### Concrete cache fix proposal

1. Export the owned provider's exact cache topology and usable pool size at startup, with version/config fingerprints. Do not infer a durable capacity contract solely from a rounded log token equivalent. Reject unsupported or mismatching topology.
2. Keep four inference slots, but reserve physical cache blocks in the shared admission layer across legacy and native engines. This pinned profile uses the formula above. Other provider/cache modes need their own declared estimator; the six-block constant must not enter generic engine behavior.
3. The prepared candidate allows **55 admission blocks**:57 total minus one null block minus one extra safety block. Queue larger request combinations before provider dispatch; four small requests still overlap. This replaces the physical-capacity assumption without truncating context or changing Nemotron 4B. Throughput under stricter admission remains unmeasured.
4. Name capacity units explicitly as cache blocks. Keep measured/budgeted billing tokens, historical unknown allocations and their full reservations separate and unchanged. Reuse the shared FIFO/lease/fencing behavior, rather than introducing eight independent engine limiters.
5. Verify four-small overlap, three/four-large queueing, boundary rounding, changing topology, cancellation and uncertainty offline. Only after that and clock qualification should a new approved rehearsal measure preemptions, queue latency and 720-request completion. No GPU-memory increase is needed for the initial repair; additional cache could be assessed later if physical headroom supports it.

The private `proposed-provider-capacity.json` records this candidate and its allocator source fingerprints. It is **not active**, and zero future preemptions are not yet certified.

## Verification and preservation

- Three independent Windows/WSL clock controls,111 samples; read-only kernel/time-service inspection; pinned primary-source checks.
- Actual installed allocator formula checked at 16,384 context lengths; four boundary allocation scenarios;601 retained pool samples audited, accounting for all six preemption increments.
- Zero real/scripted model decisions, zero GPU initialization, zero game commands or worker activations in this assignment. No provider, database or container was started or restarted.
- All 276 frozen runtime-source hashes remain unchanged. Historical unknown allocations and retained evidence are untouched. No time-service/kernel/clock-source setting, model version or installed Fleet configuration changed.
- Repository changes are this report, its current-state entry and a linked timing qualification on the previous report. Documentation link/content and whitespace checks apply; the application suite is not rerun for documentation-only changes. No commit, push, rehearsal or 24-hour run is included.
