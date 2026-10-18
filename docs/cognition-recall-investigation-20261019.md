# Memory coverage and Laya abstention investigation

19 October2026. Founder requests retained-evidence investigation, local tests and a budget proposal before any more model runs. No Nemotron or Laya inference, new grant, installation, model/threshold/pacing/budget change, server/game contact, shadow/population, game accounts, recovery review/replay, push or delegation. The existing disabled release is953034e. Qualification sourcea140194 and its completed108-call verdict/allocations remain unchanged.

## Corrected finding: legacy cognition did save memories

The previous private coverage script inspected only `reactive-cognition`'s `continuity` envelope. Its zero count was incorrectly generalized to both cognition paths. A profile-aware audit of all108 retained responses, then a read-only join from the96 trials to actual owned cognition tables, gives:

| Profile/mode | Model calls | Saved source-linked memory interpretations | Final saved beliefs | Final saved plans |
|---|---:|---:|---:|---:|
|Legacy cognition /thinking|12|3|10|2|
|Legacy cognition /non-thinking|16|0|7|1|
|Reactive cognition /thinking|12|0|0|0|
|Reactive cognition /non-thinking|12|0|0|0|

The3 memory proposals match3 persisted interpretation episodes with retained, same-agent evidence references. Legacy accepted12 thinking and16 non-thinking cognitive update records, including unchanged reviews. The belief/plan counts are final state, not the number of all proposals or proof they are good interpretations. Source-link validation establishes owned citations, not semantic truth, useful motive inference or improved decisions. In particular, a saved plan containing a minimal goal is not evidence of competent planning. Non-thinking was not globally incapable of cognition: it saved7 beliefs and1 plan despite writing no memory summaries.

`auditCognitionOutputs(samples)` in `src/qualification-cognition-audit.ts` now counts both named envelopes (`cognition.memories[].summary` and `continuity.memories[].text`) by mode/profile, separates invalid/omitted/empty outputs and labels its scope model_proposals_only. Join accepted writes separately; an output alone never establishes persistence. The audit is an offline reporting utility; agent/runtime behavior is unchanged. A regression covers the previously missed legacy memory count.

## Why the modern profile wrote no memories

All24 actual reactive-cognition requests began with version0, zero saved memories, exactly1 delivered source fact, empty needs/dependencies and no explicit coverage omissions. The source ID was present and admissible in the final schema. Thinking omitted continuity11 times and emitted1 empty structure; non-thinking omitted it7 times and emitted5 empty structures. There was no rejected substantive update, storage exception, evidence eviction or input-budget failure in these calls.

Every matrix cell creates a fresh identity/binding/journal. Repeats do not continue earlier accounts. Observations/readbacks remain the same snapshot and game time; no later decision depends on forgetting or retaining the first fact. Modern continuity is explicitly optional, and omitting it is a valid completion. These are observed design limitations of the qualification task, consistent with low incentive to summarize a fact already visible in the same decision. They do not reveal the model's internal reason for choosing omission; provider internal reasoning was not retained. Causal claims about prompt complexity or constrained generation require a controlled future comparison.

The profiles also received different cognition stimuli. Legacy cognition was seeded with two earlier episodes and received a mandatory evidence-review operation with an honest none option. Modern continuity had no seeded history and could omit the whole update. Its threat/help story was collapsed into one state/self/situation fact, rather than separate peer statements, commitments and later outcomes; this supplies no separately observed peer subject for a grounded relationship belief. It still permits a source-linked memory summary. This qualification therefore cannot isolate an architecture effect or compare memory usefulness fairly. Future matched episodes must give both profiles equivalent authorized facts/history while retaining their declared differences in review policy.

Offline AJV checks against all24 exact retained modern generation schemas admit a nonempty memory using that request's delivered source ID, and reject a fabricated source ID. No model or original response was replayed or rewritten. This rules out a schema that allowed only empty updates; it does not measure any constrained-generation bias in the provider.

A new deterministic two-turn test runs the real modern engine, admission, database and continuity module with a fake provider. Turn1 saves an optional cited memory; a later task on the same binding receives version1, the earlier memory/original source and a changed current fact. Both calls remain metered and no command is submitted. This proves local storage/delivery capability; it does not manufacture a real-model success. Existing invalid/foreign/evicted citation, stale version, bounded correction and unsafe-stop tests still apply. No prompt was changed to require belief or memory production in ordinary gameplay.

## Why Laya abstained

All28 helper calls belonged to legacy-cognition (12 thinking/16 non-thinking). The modern continuity profile does not call Laya. Laya ranks two already-retrieved events; it never writes a memory, and abstention retains deterministic recall rather than blocking the main model. Three accepted legacy memory writes despite all28 abstentions independently demonstrate that it is not a write gate.

The unchanged helper returns abstained=true when its chosen option's score is below0.65. All28 retained outcomes are this explicit code, not timeout, language/configuration error or service absence. The actual helper server source matches the investigated source. The pinned historical certificate accepted18/32 frozen predictions, all18 correct;14 abstained. This is historical selective-task evidence, not a new inference run or a general confidence calibration guarantee. Stubbed HTTP tests exercise the actual handler:0.649 abstains,0.65 and0.9 select the supplied candidate; metadata/weight certificate checks remain required.

Input mismatch is the strongest supported hypothesis for this batch's uniformly low scores:

- 27/28 queries were the same broad owner goal, "Maintain a viable kingdom and pursue worthwhile opportunities under current authority; choose your own response." The other was a saved plan, "avoid risky command execution, monitor peer activity." Neither asks a specific missing-fact question comparable to the certified recall cases.
- Candidates were current synthetic peer stories versus generic earlier supply/stock observations. Several pairs can both relate to a broad survival goal, with no independently labelled best choice. A "less relevant" option was not a controlled distractor.
- 19/56 candidate texts reached the220-character limit. Message direction/peer UUID prefixes consume part of that allowance; one seeded earlier message lacked direction and was labelled unknown. This can weaken useful contrast, but truncation alone cannot be declared causal without comparing the same semantic facts in controlled formats.

The client throws LAYA_ABSTAINED before preserving the returned option score/certificate in qualification helper details. Original encrypted records retain query, candidates and code, but no numerical score. Exact margins and counterfactual focused-query scores therefore cannot be recovered without fresh approved helper calls. Do not lower the threshold, relabel abstention as failure-to-think, retry legitimate abstentions until a selection occurs, or infer that0.65 is a calibrated probability. Future diagnostic capture should retain the bounded raw helper response before applying the unchanged acceptance rule.

## Proposed diagnostic budget — not approved or started

Use a fresh source-pinned, synthetic-only diagnostic journal, rather than reopening completed qualification or repeating the same snapshot matrix. Preserve all410 historical executions,16.4M reservations,1023602 reported tokens, the exact historical unknown/review, original deadlines and both unused allowances. Do not amend the old qualification policy/results to make positive memory output a retrospective condition.

| Work | Minimum logical attempts | Explicit cap including recovery |
|---|---:|---:|
|Nemotron:2 modes ×2 cognition profiles ×(2 capability controls +2 three-turn episodes)|32|64 executions /2560000 reserved tokens|
|Laya standalone:32 frozen/order controls +48 paired input comparisons +8 negative/order controls|88|96 invocations, including≤8 known pre-dispatch failure retries|
|Laya invoked by the legacy engine during those model episodes|≤64|64 invocations included in the same diagnostic ledger|
|Total Laya|≤152 before failure retries|160 invocations, separately counted from Nemotron|

Recommend **64 Nemotron executions /2.56M reserved tokens, plus160 Laya invocations**, with a≤2-hour window and serial operation. Model per-mode cap32/1280000; per-profile/mode16/640000. Keep40000 reservations/call, existing model/runtime/explicit thinking flags,24000 input bytes,2000 output tokens,90-second calls and120-second turns. Every read/correction uses the same two-call per-turn cap. The16 legacy logical turns can call Laya during each model-round context and each explicit memory-recall read: up to4 helper calls/turn,64 total. Counting only model calls would underbudget this path. Unused allocation is not a spend target or a refund. No extra model call is needed for summaries.

The two capability controls per mode/profile explicitly test a cited memory request and a no-evidence abstention. Label these as elicited capability, not spontaneous gameplay behavior. The two three-turn episodes per mode/profile test an earlier promise followed by observed outcome/contradiction, and an earlier resource constraint needed after a time gap. These free-choice tasks preserve optional memory and action; omission, uncertainty, another read or waiting can be valid. Score citation ownership/content fidelity, actual persistence, later delivery/use and honest uncertainty separately from the count of updates. Compare both architectures/modes on matched histories; do not reward indiscriminate writing or fabricated motives.

For Laya, choose8 retained representative pairs. Run each in both option orders under3 arms: original query/text; focused missing-fact query with identical texts; then the same focused query with semantically faithful compact text. These48 calls test query and formatting changes separately. Add the unchanged32 frozen predictions and4 no-relevant/ambiguous pairs in both orders (8 calls). The remaining8 standalone calls cover known pre-dispatch failures only, never repeated legitimate abstentions or uncertain executions. Include all engine-triggered helper calls in the160 shared helper ceiling. Preserve raw scores, labels, option order, schema/settings/source hashes and abstention reasons. If relevant evidence is absent, selecting confidently is a false positive, not success.

New journal/fixtures and raw-score observation plumbing must be built and fake-tested before execution under an explicit approval. Stop on new unknown usage, uncertain command, scope mismatch, deadline or exhausted caps. No shadow/population or game-host traffic. This is a proposed diagnostic experiment; no provider/helper call or authorization was created during this investigation.

## Verification and preservation

Focused checks:25 TypeScript tests passed, including the new audit and two-turn memory test, plus3 Python service tests with a stub predictor. No checkpoint was loaded or installed helper called by those tests. Full verification/preservation results are recorded in the adjacent status register after completion. All raw decrypted evidence, source-linked write details, before/after proofs and keys remain private outside Git. Earlier encrypted archives are untouched.

Final verification:226 unit tests,388 serial integration tests and12 paired PACT/profile acceptance checks passed, plus3 helper service stub tests (629 total). Type/style, build, boundary and full/production audits passed with0 findings. The initial full integration run had386 passes and two5-second timeouts: fresh208-call registration and two104-call allocation tests. Isolated bounded reruns completed in6.03/5.13seconds; these SQL stress cases now declare15-second test limits, and the full388 integration rerun passed. No production turn/model deadline, allowance, database history or acceptance rule changed. Author self-review was used per the no-delegation instruction; hosted CI and independent review are not claimed.

All pre-existing qualification rows across25 tables compare exactly, including all410 actual calls/16400000 reservations/1023602 reported and the original unknown40000/review. Actual410-call SHA256 is `88e8ed6849e507d40409930ff188a9240be20366a9e3c61273b7bdc182f80305`. Original persisted cognition—including all3 memories and their owned retained non-interpretation sources—also compares exactly. The completed qualification's raw/recovery verdicts, calls, budgets and original deadlines are unchanged; only the ambiguous coverage summary was corrected and scoped.

At22:52:17UTC (19 October local time), installed38 application-table fingerprints are exact: same953034e release,20 needs_owner agents,10121 turns and40 installed historical unknowns/1600000 allocations. Execution remains disabled in the health/readiness response and persistent worker/console overrides; worker, console and existing Laya service remain active unchanged. No Ollama process was started and none remains. Owned5436/5438 fixture databases are stopped; pre-existing5437 is retained. No server Fleet/game host, population, shadow, new game account, grant, model/helper inference, installation, push or recovery operation occurred. See [the status register](cognition-recall-investigation-status-20261019.json).
