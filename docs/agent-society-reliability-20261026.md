# Society reliability and research fields — 26 October 2026

This implements the mechanical repairs and reporting changes from the [system investigation](agent-society-system-investigation-20261026.md). The experimental goal remains a society of agents that can reason, communicate, coordinate and survive. A legal, imperfect strategy remains a valid experimental outcome. These changes do not force construction, contact acceptance, trade, or an optimal policy.

## Implemented behavior

| Area | Change | Boundary retained |
|---|---|---|
| Autonomous specialist skills | Empty optional skill objects/lists are no-ops. | Actual selection, publishing and adoption still require the existing skill permissions and reads. |
| Specialist inbox | Deliver an ordered prefix of whole events within a byte allowance. Acknowledge only IDs delivered during that operation. Keep a partially drained task runnable. | No truncation or acknowledging events that arrived during inference. An individually oversized oldest event preserves its evidence and blocks that task with `SPECIALIST_DELIVERY_TOO_LARGE`; later arrivals do not create a retry storm. |
| Decision evidence | Generated wait/action basis uses a compact `observationRef` derived from the actor, owner intent and relevant current construction/opportunity state. | Stale/foreign references fail. The full facts remain available to the host and observation. Existing explicit factual-basis validation remains compatible. A reference proves which facts were referenced, not that the model understood them. |
| Legacy read progress | Already delivered read schemas are executable choices, removed from lookup choices. A repeated lookup receives explicit feedback within the original call limit. | No invented read arguments, automatic reads or extra inference allowance. |
| Coordinator | Separate semantic choice from fresh execution admission. A scoped adapter hook checks the original evidence, current choice, expected outcome and claims. The engine rejects changes to the command identity or semantic intent. | PACT's atomic version/effect guard remains authoritative. Material changes fail; uncertain commands are never replayed. Command-specific promise keys are normalized only for comparison, with real native UUIDs retained in execution quotes. |
| Coordinator messages | The worker may compose bounded text for a contact present in its authorized menu. The host quotes that exact text, including byte costs and promise digest, before selection. | No invented recipients, zero-cost assumption, delivery guarantee or host-written negotiation policy. |
| Call deadline | Explicit cancellation timer, pre-dispatch deadline check and a one-second accounting reserve inside the turn deadline; late answers cannot authorize effects. | Capacity stays occupied until the provider settles. Ambiguous usage remains unknown; late usage evidence does not clear an old unknown allocation. |
| Supervisor diagnosis | Preserve sanitized original error classification, source locations and control stage; retain parking failure separately. | No provider text, SQL, credentials or raw exception messages in diagnostics. No live controller activation. |

The inbox allowance is currently one eighth of the existing request-byte budget, leaving space for current facts and the output contract. This is an explicit packet admission limit, not permission to discard large events. Resolving a genuinely oversized record remains an operator/source task; this patch does not modify retained queues.

The coordinator hook is optional. Environments without it retain the existing stale-proposal rejection. The implementation is forwarded through the environment registry, supervisor and scoped host, rather than exposed only in an adapter unit test.

## Added research fields

The existing authenticated Fleet metrics endpoint and dashboard now expose:

| Fields | Interpretation |
|---|---|
| `messageBytes`, `schemaBytes`, `inputBytePercent` | Actual serialized request allocation; bytes are distinct from token usage. |
| `inboxDelivered`, `inboxOmitted`, `quotedOptionsOmitted` | Packet coverage when that packet supplies these counts. Missing metadata stays unknown. |
| `queueDelayMs`, `generationMs`, `firstContentMs`, `finalTextChars` | Queueing, provider progress and final-answer presence, where recorded. Existing elapsed duration remains available. |
| `taskAttempts`, `distinctTasksAttempted`, `repeatedTaskAttempts`, `legacyAttempts` | Durable tasks versus repeat attempts. Legacy turns have no equivalent durable task ID and are reported separately. |
| `attemptsWithEffects`, `waitsWithoutEffects` | Effects are independent of a terminal code such as `WAIT`. Neither field grades strategic quality. |
| `responseMetadataCalls`, `truncatedCalls`, `emptyFinalCalls`, `outputErrorCalls` | Completion failures with an explicit metadata denominator. Historical missing metadata is not counted as a successful answer. |
| `lateUsage` | Late numerical evidence, separate from settled usage. No automatic uncertainty resolution. |
| `availability` | Current cohort, actor and credential states. This is not a time-integrated availability denominator. |
| `reciprocalCommunication` | Distinct observed native messages, directed edges, participant pairs and pairs with traffic in both directions. Deduplicated without decrypting message bodies. Only consented, retained communication observations are included. |

Aggregate counts cover the selected time window. Per-call details remain capped at the latest 200 calls. Message observation time is not send time, and an unseen message is not evidence of silence. Traffic in both directions is not proof of a relevant reply, agreement, cooperation or fulfilled trade. `strategicQuality` remains unknown. Fair architecture comparisons still require matched opportunities, budgets and exposure.

## Verification and compatibility

Verification uses synthetic providers and fresh, owned PostgreSQL fixtures. Native PACT checks exercise its actual authoritative handlers and guarded commits against disposable data. Existing matched workflow tests cover prerequisite work, introductions and messaging across all eight profiles; this reuses the established comparison fixture rather than adding a second simulation framework.

The original legacy controller digest and previous prompt goldens remain intact. The source-pin test explicitly reverses only the newly reviewed controller changes. A new [input golden](../tests/fixtures/legacy-read-progress-20261026.json) records the intentional removal of redundant schema lookup choices and links to the previous fixture. Direct/bridge/capacity accounting parity remains checked.

Verified results:

- Full Fleet unit run: **1,109 passed**. A final owner-intent revision regression expanded the coordinator file to **17/17 passing** cases (one additional distinct unit case).
- **170 distinct selected integration cases** passed across fresh fixture runs: 25 native PACT workflows (including all 24 profile/scenario combinations), six native architecture/long-history cases, 59 autonomous specialist cases, 11 messaging cases, 30 coordinator cases, seven native quote/commit cases, 12 legacy execution cases, two legacy capacity cases, one legacy read-progress case, 14 capacity cases, two wrapped deadline cases and one metrics case.
- TypeScript, style checks, production build and package boundaries pass. Style checking reports existing warnings plus non-null assertions in new fixtures; no errors. Documentation links and whitespace checks pass.

Intermediate regressions were corrected and rerun: the new fresh-admission port initially lacked registry forwarding and reference unscoping; the modern action generation contract still used the old factual-basis representation; command-specific training promises needed stable comparison keys; test providers needed the revised composed-message contract. The original legacy golden and source digest were preserved, with an explicit new reviewed input fixture. These checks verify composition, not model intelligence.

## Source versus live acceptance

This is source work, not a deployment or a behavioral qualification. No actual Nemotron/model calls, game runs, world changes, service activation, resets, replays, usage settlements, commits or pushes were made. The paused world's state and all retained allocations remain untouched; E4/KQ1 remain blocked.

The offline cancellation tests prove that cancellation propagates through the host, admission, capacity, run-window and streaming transport path, and that late completion cannot act or release capacity prematurely. They do **not** uniquely establish why the historical provider calls exceeded their deadlines. A provider that ignores cancellation can still occupy its slot until settlement; returning early and reusing that slot would risk overlapping uncertain work.

A future owner-authorized bounded real-model check is still needed to assess response quality, context comprehension, latency and actual interaction after deployment. Larger-model comparisons and presentation experiments are separate R&D decisions. No claim that Nemotron 4B is sufficiently intelligent, or that all eight architectures are equivalent, follows from these offline tests.
