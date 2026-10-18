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
