# Overnight inactivity investigation — 25 October 2026

**The world is running. The inactivity combines weak goal-to-action behavior, deliberately narrowed views, and three independent integration defects.** This was a read-only investigation: no live settings, goals, mandates, budgets, processes, reservations or pending commands were changed. No provider inference requests or game actions were issued by the investigator. Existing Nemotron 4B workers continued their authorized observation run. E4/KQ1 remain blocked.

## Evidence examined

The active control root remains `/home/mnim/.local/share/pact-fresh-24h-20261025-232152eb/continuations/overnight-3596d150`. Evidence included bounded recent turn samples from every architecture, saved model requests/responses, the latest decisions of both blocked Hall owners, native read-only world/guide/outlook views, command journals/outcomes, serving error logs and the relevant host/adapter/decoder source. Native database reads used read-only connections. Private prompts, responses, identifiers and decrypted traces remain outside Git.

At the earlier 11:59 Berlin checkpoint, 24 kingdoms had 675 attempted turns: 575 WAIT, 96 CONTEXT_LIMIT, three MODEL_STREAM_INVALID needs-owner and one historical RUN_WINDOW_CLOSED. There were 581 reported calls, three unknown allocations and one not dispatched. One barracks upgrade completed; two Hall upgrades were waiting. There were no contact requests, contacts, messages, offers, contracts, scouting or raids. These counts are timestamped observations, not fixed final totals.

Final read-only check at **12:24:34 Berlin / 11:24:34 UTC**: world active at tick **487**, all 24 cohorts running, Fleet/rules/supervisor/guardian processes alive, supervisor heartbeat current, and no finalization record. Totals had reached **717 turns: 611 WAIT, 102 CONTEXT_LIMIT, three MODEL_STREAM_INVALID and one historical RUN_WINDOW_CLOSED**. There were **617 reported calls / 4270308 tokens**, the same three unknown allocations, three building instructions, zero messages and zero supply contracts. This confirms ongoing operation, not useful agent progress or completed qualification.

## 1. Why prerequisites are not being built

Both blocked Hall owners' latest saved inputs explicitly contain:

- The queued Hall level-2 target and missing farm level 2 / barracks level 2.
- `prerequisiteWork.readySteps` naming those exact two jobs.
- Free builder waiting slot 2.
- Farm/barracks options marked ready, not busy and stock-affordable.

Their returned decisions nevertheless wait for the prerequisites to become satisfied. One even describes slot 1 as available despite the actual packet identifying slot 2. This is not a hidden resource or construction-authority denial: the models do not submit the available prerequisite commands.

Their continuation records have `goalStatus: absent` and empty steps. Recent outputs repeat prior WAIT explanations and copy stale notes, including old turn deadlines. Those old notes are not current authority; the observed repetition is a contributing feedback pattern, not proof of the model's hidden reasoning. The owner ambition remains broad standing guidance explicitly permitting the agent to choose actions or waiting.

The host accepts a structurally valid wait. In [goal-state.ts](../src/games/pact/goal-state.ts), the extra factual wait basis is enabled only for a confirmed **stock-shortage** construction phase. A **building-prerequisites** blocker does not activate that check. The legacy path also accepts these waits without requiring a concrete dependency plan. As a result, an unresolved target plus available prerequisite work can repeatedly end in WAIT without corrective feedback.

**Conclusion:** a planning/liveness failure is being accepted as a valid no-op. Increasing worker concurrency will not make these particular recorded choices productive. A useful repair should require task-specific, evidence-grounded reasons for deferring a selected goal and should persist/reconcile dependency steps. It should preserve legitimate strategic waiting rather than mandate arbitrary activity.

## 2. Why there are no interactions

Sampled basic inputs contain eight public peers, the allowed `game.contact.request` action branch, contact-request authority and zero silver shortfall for cold introductions. The native policy explicitly describes cold introductions as free. Legacy samples retain fewer peers after packing but still deliver an eligible public peer. There is no universal visibility, contact-stock or scheduler barrier preventing all interaction.

The sampled model responses reason from absence of incoming offers/contacts to absence of work. With every kingdom initially unconnected, that creates a passive cold start: everyone waits for someone else to initiate. Periodic reviews do fire; the six non-held decision profiles repeatedly return WAIT.

There are also genuine input-scope mismatches:

- `reactive-cognition@1.1` uses an explicit negotiation projection. Its fitted packet omits construction state and can omit public discovery under pressure.
- Version 2 also uses a negotiation projection; its sample includes discovery but not the general construction briefing.
- These are specialized views, while the assigned ambitions include general kingdom development. Scoped reads exist, but the sampled decisions do not use them to obtain the missing development context.
- The coordinator's PACT menu takes at most two candidates per action **kind**. Both building candidates in the sampled menu are barracks level 2 in slots 1 and 2. Other building kinds are crowded out of that menu, even though the native decision-support catalog has them.
- That coordinator menu does not synthesize a cold-contact request to a discovered peer. It adds answers to existing requests and factual messages to existing contacts. With neither present, it has no initiation option through this quoted-choice protocol. Other architectures retain their full interface.

The coordinator's owner text is present under `shared.ownerValues.text`; it was not lost merely because `ownerPriorities` is empty. Focus rotation also exists in its controller, so a claim that every focus is permanently pinned to construction would be incorrect. The restriction is the content of the bounded per-kind choice menu.

**Conclusion:** broad goals and permissive no-op completion combine with task/view mismatches and incomplete coordinator initiation coverage. Some sampled summaries also confuse a proposed queue option with work already queued; a null proposal is accepted without checking that prose claim. This is not evidence that the game actually committed those claimed jobs.

## 3. Packing: reactive-cognition@1

Version 1 uses [ContinuityDecisionStep](../src/modules/continuity/v1/decision.ts) with the full current game view, a continuity/evidence bundle and a substantial structured output contract. Version 1.1 is an explicitly separate schema-sharing/negotiation-view amendment; it does not repair the original @1 path.

A local reconstruction used the affected profile's current native read-only game/outlook data, synthetic evidence IDs and empty subjective memory. The model boundary was a local stub that would throw before inference. It reproduced CONTEXT_LIMIT without claiming a turn or calling a provider:

| Component | Reconstructed size |
|---|---:|
| Full observation including continuity | 44484 bytes |
| Continuity context before reduction | 10268 bytes |
| Unshared generation schema during fitting | 9398–11703 bytes |
| Budget | 32000 bytes |

After removing optional history/evidence, the original layout left about 13201 bytes for the current observation and failed the protected-core fitter. A controlled counterfactual using schema sharing reduced the schema to 7606–9645 bytes but **still failed**, eventually at the retained-peer check. These are a current-data reconstruction, not the byte-identical original failed request: its observation trace was replaced by an omission marker above the logging size limit.

**Conclusion:** this is joint envelope budgeting and representation duplication, not an unexplained model timeout. Schema sharing alone is insufficient. Required current world/authority/queue facts, continuity references, instructions and generation schema need one coordinated budget; optional history must not crowd out those facts. A trade-only projection is not a general-game replacement for the missing construction context.

## 4. Streams: autonomous-specialists@1

The provider log records three startup-time errors from the pinned vLLM Guidance backend:

`Grammar error: Unimplemented keys: ["dependencies"]`

The captured specialist output schema contains the draft-7 rule `dependencies: { coordination: ["continuity"] }` inside its read-query branches. [read-queries.ts](../src/games/pact/read-queries.ts) emits it. The schema is valid to AJV, and [prepareVllmGenerationSchema](../src/model-schema.ts) preserves it, but this installed decoder cannot compile it.

A **CPU-only** check passed that captured prepared schema to the installed `llguidance` grammar validator and reproduced the exact unsupported-key error, with no model loading/request. Saved progress has one stream chunk, zero content characters, no first-content time and no finish reason. The serving trace rejects the request during input/grammar validation before generating content.

[vllm-transport.ts](../src/vllm-transport.ts) turns the stream's error object into generic MODEL_STREAM_INVALID and drops its detailed provider error. Because dispatch already occurred and no final usage receipt was returned, accounting conservatively marks usage unknown. Each actor is then held as needs-owner. The investigation did **not** clear, retry or reinterpret those three allocations as reported zero usage.

**Conclusion:** an untested provider-schema dialect mismatch disables the entire autonomous profile. Emit an equivalent supported read-query contract and preflight the exact generated schemas before dispatch; preserve the dependency's semantics. Do not merely delete the constraint. Keep useful provider error details without guessing missing usage receipts.

## 5. Leases: specialist-coordinator@1

All three rejected coordinator commands are barracks level-2 proposals with an `expectedVersion`, rejected as RUN_ALREADY_ACTIVE.

The source explains the conflict:

1. [PactCoordination.observe](../src/games/pact/coordination.ts) opens an MCP write lease in session A **before** obtaining exact effect quotes. Validation/cache state belongs to that coordination instance.
2. The host validates the proposal through that same observation session.
3. [CommandExecutor.dispatchPrepared](../src/platform/execution.ts) then connects a **new** environment session B.
4. B constructs a new McpGame/coordination instance and tries to open its lease before execution. A still owns the kingdom's live lease until the outer task closes.
5. PACT correctly refuses the different holder with RUN_ALREADY_ACTIVE. MCP session deletion releases only its matching lease.

**Conclusion:** the composed host/executor splits one operation across two session owners. This is not a reason to weaken PACT's single-writer rule or discard a lease. Execution must retain the validated live session/coordination instance through the command journal and guarded commit, preserving the original command ID/revision and receipt-based recovery. Reacquiring a lease between quote and commit would also change the state the quote was meant to bind.

The native coordinator tests exercised quote/validate/execute through one policy instance, so they did not cover the actual host opening a second execution session. That is a concrete integration-test gap.

## Repair priorities after investigation

1. Preflight/translate the autonomous read-query schema for the actual installed decoder; retain provider error details and leave unknown accounting untouched pending a separately authorized review.
2. Keep coordinator observation, validation and execution on the same authorized live session; test the real MCP/session/journal composition and one-time native receipt.
3. Budget native input composition across world facts, continuity and output schema for **every** registered profile, including @1; retain task-relevant minimum facts in negotiation views and broaden coordinator candidate coverage.
4. Add goal/dependency progress and evidence-grounded WAIT feedback, including social cold-start behavior. Preserve useful freedom to decline or wait; do not equate a valid JSON wait or null proposal with useful owner-goal progress.
5. Cover the full native compositions offline before any separately authorized behavioral trial. Earlier synthetic/isolated component success did not establish these combinations.

No repairs were applied to the running instance in this assignment. The world remains in the explicitly authorized actor-isolation observation mode with the original cutoff, E4/KQ1 blocked and all failures/unknowns preserved.
