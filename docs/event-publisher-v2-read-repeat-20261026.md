# Event publisher and v2 read repair: bounded native repeat

Owner scope: repair the omitted native event publisher and malformed v2 reads, verify the complete path offline, repeat two scheduled fleet rounds on the retained world and pause. Inline, Nemotron 4B only, no GUI; E4/KQ1 blocked. No reset, unknown review, commit or push.

## Source and offline verification

The run controller omitted PACT’s native notification worker, which owns agent-event publication. API feed reads alone cannot publish the native outbox. The controller now starts that worker with local external delivery adapters disabled, requires its startup readiness, supervises it and stops it before final snapshots. Native outbox delivery remains idempotent; no game command is replayed.

Version two advertised arbitrary read-query objects despite the existing exact PACT read contract. A nested observation-shaped query could therefore pass generation and fail at native read validation. Version two now binds the environment’s existing read-query schema. Existing metered bounded output correction handles invalid answers; older versioned request contracts remain unchanged. No arbitrary output unwrapping or uncertain-command retry was added.

Offline checks: 1,078 unit tests; 33 selected Fleet integration tests, with the new native event test repeated after additional privacy/idempotence assertions; one native notification batch test; types, build, boundaries, style and diff checks. Style retains 115 warnings and 60 informational findings, with zero errors. Fresh owned synthetic databases and scripted inference only. The event integration starts the real built publisher process, publishes a native contact request, reads its authenticated private feed, creates a durable event task, rejects a deliberately malformed v2 query, delivers correction feedback, performs a valid read and confirms exactly one contact acceptance. Repeated publication/polling does not duplicate the event/task/effect; an unrelated owner sees no events.

## Actual live result

The same world ran **26 October 2026, 00:08:49–00:35:43 Berlin** (26 minutes 54 seconds of admission). The monitor required **two separate completed scheduled turns for each of 20 eligible kingdoms**, then closed admission automatically. Four original unresolved kingdoms stayed held. No 24-hour run, reset or uncertainty review occurred.

There were **73 turns / 111 reported model calls / 1,146,155 tokens** (1,100,683 input +45,472 output). Native receipts confirm **26 effects**, all from the two eligible coordinator kingdoms:

- Eight building orders: two FarmII, two MarketII, MineII, StorehouseII, HallII and WallII.
- **Six upgrades completed**: both FarmII, both MarketII, MineII and StorehouseII. The new HallII and WallII orders remain active in the paused world; neither is reported complete.
- Nine training orders and nine introduction requests.
- **Zero accepted contacts, messages, supply offers or supply contracts**. Total introduction requests increased2→11.

Of 73 turns,26 had a confirmed action,44 were zero-action successful waits, two ended `STALE_PROPOSAL` and one ended `RUN_WINDOW_CLOSED`. The database labels the 26 successful action turns `WAIT` too; action counts here use native receipts and state.

### Before and after

Comparison is with the [previous doubled-limit two-round run](two-round-doubled-limits-20261025.md). Same retained world and eligible input/budget/model/schedule settings; the world naturally advanced, so this is not a randomized model-quality comparison.

| Measurement | Previous run | Repaired repeat |
|---|---:|---:|
| Eligible kingdoms with two scheduled turns |20|20|
| Turns / reported calls |43 /48|73 / 111|
| Confirmed effects |5|26|
| Completed upgrades |2|6|
| New introduction requests |1|9|
| Published owner-scoped agent event records |0|43|
| New malformed v2 read failures |2|0|
| Accepted contacts / messages |0 /0|0 /0|
| New unknown usage |0|0|

### By architecture

| Architecture | Eligible kingdoms | Turns | Calls | Confirmed actions | Other observations |
|---|---:|---:|---:|---:|---|
| Legacy loop @1 |3|6|6|0|Six waits|
| Legacy cognition @1 |3|6|6|0|Six waits|
| Reactive basic @1 |3|7|7|0|One additional native event turn|
| Reactive cognition @1 |3|8|10|0|Two additional native event turns|
| Reactive cognition @1.1 |3|8|8|0|Two additional native event turns|
| Reactive cognition @2 |3|7|11|0|Five valid live read decisions; no read/model-output error|
| Specialist coordinator @1 |2|31|63|26|Two stale rejections, one cutoff; one truncated response|
| Autonomous specialists @1 |0|0|0|0|Three original holds preserved|

The fourth original hold is the remaining coordinator kingdom. All goals, mandates, finite-budget limits, model settings, anchors, identities and original lifetime cutoff remain preserved. No additional trials were started.

### Native event and read acceptance

The publisher delivered **32 native source events**, producing **43 owner-scoped journal records**: nine building-completion,22 contact-request and12 training-completion records. Source events can have multiple owner copies; these are different counters.

Fleet received **37 event references**, creating 32 event tasks and 33 event-triggered turns; one task had more than one attempt. The40 scheduled turns plus 33 event turns account for all 73 turns. Event-driven execution was observed in all five eligible reactive/coordinator variants. Twenty-two confirmed actions came from event turns and four from scheduled turns. Held kingdoms and timed-only profiles do not have the same event-intake coverage.

Version two made **five valid live reads** across its seven turns. No `INVALID_READ_QUERY` or invalid v2 output occurred. The offline test separately forces the original malformed nested query through the real HTTP/admission correction path and confirms a corrected read plus contact acceptance within three accounted calls. Live correction was not needed for v2.

### Remaining caveats

- **Two coordinator proposals were rejected for freshness before submission.** Their native effects were not committed. The coordinator requires at least two remaining calls to prepare and select a new proposal; the available per-turn allowance did not support another full reconsideration. Native freshness enforcement was preserved. The exact changing revision/expiry field was not attributed in this bounded observation.
- **One worker response hit its 1,536-token output cap** (`MODEL_OUTPUT_TRUNCATED`, finish reason `length`, fully reported usage) in the second stale turn. A subsequent accounted call produced a proposal, but its freshness check failed. This is separate from v2 reads and separate from shutdown; the cause of its verbosity was not investigated here.
- **One event turn was already admitted when the second fleet round completed.** It finished with `RUN_WINDOW_CLOSED`; no second call/new command was allowed after closure. Its reported first call is retained. The corresponding waiting task remains preserved.
- One event task remains ready with a stale-proposal code and one remains waiting at the closed window. Queues were not cancelled or cleared. No new actor hold was created.
- **Interaction quality remains unqualified.** Requests are now delivered, but recipients still chose waits and no contact was accepted. All 26 confirmed actions came from two coordinator kingdoms. The other 18 eligible kingdoms performed reads/waits. Transport and read-contract acceptance do not establish good strategy across all architectures.

### Capacity and preservation

The same hash-pinned Nemotron 4B served with 32,768-token context, four configured slots, 94 physical/ 92 admissible cache blocks and unchanged exact admission. Eligible logical inputs remain 64,000 bytes; four held cohorts remain 32,000. Observed peak: **four running provider requests, one waiting, zero preemptions, 14,183MiB / 16,303MiB GPU**. All 111 calls reported usage. No new packing, authentication, lease, stream-transport, unknown-allocation or invalid/duplicate-effect failure was recorded. The truncated answer above is an explicit output failure.

Preflight verified 214 staged artifacts, 224 source/control pins, five native pins, all 11 model files, a fresh 301-sample clock control and encrypted restore matching 167 PACT / 77 Fleet tables. A copied old archive-key name initially stopped preflight before gameplay/model calls; inherited copies were retained separately and fresh snapshot keys used. The successful preflight is retained separately. Final pins match: **zero source/artifact drift**.

Final verification:

- World paused at **tick 685**, from 659; all 24 cohorts paused.
- Worker, API, rules, publisher, supervisor, guardian, round monitor and provider stopped. GPU returned to 1,626MiB at the final check.
- Zero running turns, capacity leases or pending/unknown commands; zero new unknown usage.
- Four original unknown rows byte-equivalent after serialization; budget/model/anchor pins unchanged.
- Final encrypted restore matched complete rows in **167 PACT / 77 Fleet tables**. New orders, queues and private evidence retained.
- E4/KQ1 remain blocked. No 24-hour run, commit or push.

Private segment pointer: `/tmp/pact-event-rounds-root`. Earlier private windows remain closed.
