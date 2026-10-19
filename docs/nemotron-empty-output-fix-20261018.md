# Nemotron empty final output investigation —18 October2026

Founder authorizes local investigation/fix, offline tests first, retaining qualification usage and server/game/population boundaries. No delegation, push, source installation, server contact/reset or population. Existing installed953034e remains execution-disabled. The original failed Q1 run/plan/two calls are immutable; Q2 remains blocked.

## Evidence and hypotheses

Original Q1 run f8facc31-f95a-40cc-a40d-4bb526efbb6a retained2 calls/80000 reservations,136 input+266 output tokens,0 unknown. Second final output empty with44 generated tokens, well below2000; local Ollama log reports no truncation. The adapter did not retain done reason or the presence/size of the thinking channel, so the historical response alone cannot establish its exact cause.

Existing local model6cc467f0…386197 is Q4_K_M, configured with renderer/parser nemotron-3-nano; local params temperature1/top_p1. Pinned Ollama0.35.1 [parser](https://github.com/ollama/ollama/blob/v0.35.1/model/parsers/nemotron3nano.go) begins in thinking mode when think=true and emits final content only after its closing marker; [renderer](https://github.com/ollama/ollama/blob/v0.35.1/model/renderers/nemotron3nano.go) supplies an open thinking prefix. No inference occurred during source/model metadata investigation.

Q1 sends its schema through format but does not describe the JSON fields in the model's prompt. [Ollama guidance](https://docs.ollama.com/capabilities/structured-outputs) recommends supplying the schema in the prompt as well. Hypothesis for controlled local testing: grounding the requested fields avoids an ambiguous calibration prompt without disabling thinking or changing sampling/model/budget. This is a hypothesis, not a proven explanation for the original missing content.

## Local instrumentation and bounded diagnosis

HttpModel now returns safe completion metadata: final/thinking character counts, tool-call count, completion boolean and allowlisted done reason. It never returns provider thinking text or treats reasoning as an executable decision. Empty final+nonempty thinking has a specific MODEL_THINKING_WITHOUT_FINAL error; length still takes precedence as MODEL_OUTPUT_TRUNCATED. Usage is retained for every unusable response. Non-Ollama route behavior remains unchanged.

An explicit eight-call/320000-token,≤15-minute diagnostic approval can append output-diagnostic rows to the **existing parent ledger**, while preserving its original blocked row and Q1 calls exactly. Both original and diagnostic allocations count against104/4160000. No replacement allowance, refund, stage reopening or Q2 admission. One route lock,24000-byte inputs,2000 output setting,90s calls and parent deadline still apply; unknown/overrun blocks diagnostics without rewriting the historical Q1 error. Fixed approval/reference/source and private operator files are required. Default `scripts/diagnose-output.ts` is review-only.

After source/offline verification and commit, the planned one-shot comparison uses at most four original and four schema-grounded versions of the failed probe, interleaved; exact same local model, thinking=true, default sampling/context/output/unload settings. No game ports/accounts/helper supplied. All raw final responses remain encrypted in the parent call ledger; public diagnostics show only metadata/usage/validation. Results and actual remaining allowance will be appended after execution. These diagnostics cannot qualify four engines or automatically restart Q1/Q2.

## Verification status

Red tests demonstrated missing provider diagnostics and missing bounded diagnostic admission. Targeted green tests now preserve usage/private reasoning boundaries and failed-parent row equality while enforcing eight-call, expiry, changed/duplicate approval, unknown and shared parent ceilings. Offline acceptance passed:190 unit/339 integration/12 paired PACT handler/profile tests; type/style/build/boundaries passed; audit0 findings. Existing24 non-failing style warnings remain. Actual diagnostic outcome is pending. Author review confirms original rows remain immutable, child reservations share parent ceilings, no model retry/promotion and no installed-runtime import/config change. Independent review is not claimed under no-delegation instructions.

## Thinking-enabled comparison and approved mode correction

First diagnostic approval71fdde40-19d7-4bc3-ad7d-4ccf43e151da, source401a39d78ff68d86c115f8e3e778e0c4a992aa9e, ran exactly8 calls. Original prompt3/4 valid; schema-grounded prompt3/4 valid. Both failures were done=true/done_reason=stop,0 final characters, nonempty thinking (283 and113 characters),64 and28 output tokens. This reproduces the thinking-only mechanism, **refutes schema grounding alone as a sufficient fix**, and provides no support for simply raising the output allowance. The original historical response did not preserve these metadata, so its identical mechanism remains a strong inference, not a reconstructed raw fact. No reasoning text was returned, promoted or logged by the adapter.

Founder then explicitly selected supporting both thinking modes, qualified separately, with installed Fleet settings unchanged. Source qualification plans now require an explicit boolean; it is included in immutable digests. No automatic thinking toggle or model retry. A separate approved non-thinking diagnostic stage may use≤8 calls from the same104/4160000 parent, preserving the first closed stage and original Q1 rows. Each mode has≤8 diagnostic calls across grants; splitting approval IDs cannot mint more per-mode allowance. A separate mapping table links new/earlier diagnostic rows without changing any original call columns/ciphertexts. Changing modes without a matching grant fails before allocation/dispatch. Mode isolation regression passes, including explicit-mode mismatch, per-mode eight-call caps and combined parent ceilings. Actual non-thinking verification follows.

The pinned Nemotron renderer also scans inline /think and /no_think strings inside user/system messages, even when an explicit mode is supplied. HttpModel now fails such a conflict before dispatch when Nemotron mode is explicit; peer data cannot silently toggle the selected mode. It reports MODEL_PROMPT_MODE_CONFLICT without copying peer text. This is a refused incompatible prompt, not permission to alter or strip evidence. A red/green regression proves no request is dispatched. It does not change other model families or implicit-thinking callers.

Final pre-control source verification:192 unit/340 integration passed, type/style/build/boundary checks passed;12 paired PACT checks and audit0 retained from this investigation. Relevant red/green mode/toggle regressions passed; no legacy engine/baseline, installed files or PACT application source changed.

## Verified correction and limitations

Non-thinking approvalf46e4d45-d411-40a0-9836-e8f247139fbe ran source `5beccbd2cf52dc8b726ba5de1eadb614be8a913a` in its original10:20:39.351–10:34:39.351UTC window, with thinking=false explicitly selected. Same model digest/route, temperature1/top_p1 defaults,32768 context,2000 output setting and keep_alive0; only the approved mode differed. All8/8 final outputs were schema-valid, done=true/stop, with0 thinking characters and0 unknown usage. Both original and schema-grounded prompts passed4/4. Usage720 input+230 output=950 reported tokens,320000 reserved. No sampling, model-weight or installed setting change.

| Evidence set | Calls | Valid final JSON | Unknown | Reserved tokens |
| --- | --- | --- | --- | --- |
| Preserved original Q1 |2 |1 |0 |80000 |
| Explicit thinking=true diagnostic |8 |6 |0 |320000 |
| Explicit thinking=false diagnostic |8 |8 |0 |320000 |
| Aggregate parent ceiling usage |18/104 |15/18 |0 |720000/4160000 |

Aggregate measured usage1576 input+1712 output=3288 tokens. Both diagnostic grants are closed; no additional call/retry/probe was made. Remaining86 executions/3440000 reservations are unused, not an automatic grant to restart qualification. Original Q1 remains blocked with QUALIFICATION_CALIBRATION_FAILED, its original plan and two call rows/ciphertexts match exactly; Q2 trials0, helper calls0. The new mode succeeds in this bounded provider control; **full Q1/Q2/four-engine qualification has not passed**. Eight same-probe controls cannot establish long-term reliability, game strategy or performance of either mode. Thinking=true remains visibly unreliable for final JSON in this evidence and is not relabelled passed.

The fix supports a workable explicit non-thinking structured-output path while retaining the thinking path as a separately configured, separately evaluated option. It does not manufacture a final answer from reasoning, silently toggle modes, retry inside HttpModel, relax schemas, increase model/output limits, or overwrite a failed qualification. Hypothesis testing rejected the schema-only fix, so no blanket prompt/schema injection was added to production requests.

## Final verification/preservation

Final source checks:192 unit/340 integration tests;12 PACT handler/profile acceptance checks during this investigation; type/style/build/boundaries passed; audit0 findings and diff checks passed. Unit suite was repeated after the final pre-dispatch toggle guard; the latest full340 integration run preceded only that adapter guard, whose separate red/green unit coverage verifies the new branch. Existing non-failing style warnings remain. Author review only, no delegation or hosted CI claim. The legacy engine and baseline files are unchanged.

All38 retained installed-table fingerprints match the preflight and prior handoff: same953034e release,20 needs_owner agents/ready credentials,10121 turns,40 historical unknown40000 allocations/1600000 conservative tokens, zero new pending/running turns or commands. Primary live0 and persistent console/worker Env0 retained; loopback health200/liveEnabled=false, readiness503/LIVE_DISABLED. Installed files/configuration/services/helper/account identities/history/mandates/budgets/anchors and all recovery gates were untouched. Server Fleet/game host were never contacted, no game reset/account enrollment/population started. No push or installation.

Owned Windows Ollama was started hidden with its retained process-only host/Vulkan settings solely for the two metered local controls. Verified no loaded model, then stopped only owned PID46256, restoring its original absent state. No autostart/registry/power/provider upgrade/download change. Owned5436 database is stopped with its volume retained;5438 acceptance fixture is stopped. Temporary test ledgers are distinct from the actual parent ID and never change its allocations.

All new request/final-response/validation/metadata/latency evidence is row-bound AES-GCM encrypted with the original qualification vault key. Original encrypted archive/key remain unchanged. A separate authenticated post-diagnosis archive preserves both diagnostic stages/mappings:14032801 bytes, SHA256 `b83ecde47ed94201ff4bab83fd778b470d6a945b028ad913d9ba12a842d2c339`,268 readable PostgreSQL TOC entries. This is encrypted archive authentication/readability, not a new full restore rehearsal. No plaintext dump or provider reasoning text was retained. Separate existing key stays outside artifacts. Private evidence: `/home/mnim/.local/share/fleet-phase0-validation-20261017/nemotron-empty-fix-20261018/`; original run under its sibling `local-qualification-20261018/`.

Next provider work requires a concrete plan for the remaining aggregate ceiling and separately labelled mode/source evidence; no provider/deployment/release eligibility gate is cleared here.


## Subsequent resilience repair

Founder subsequently requested correcting fail-fast handling. [The recovery report](model-output-recovery-20261018.md) records exact upstream grammar evidence and bounded separately metered retries. This follow-up does not rewrite the controls above, alter installed settings or turn either mode into a fully qualified provider.
