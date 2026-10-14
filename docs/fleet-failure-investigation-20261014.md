# Fleet failure investigation — 14 October 2026

The founder requested best-practice research for tool-call formatting/input pressure, and deeper investigation of construction/outreach. This report distinguishes verified defects, valid game gates and behavior that remains an inference. Production Fleet is still `406d64b`, with the same twenty accounts, histories, permissions, Nemotron/Laya settings and five-minute anchor. No production code, provider/sampling setting, mandate, model budget or queue was changed by this investigation. No extra LLM inference was invoked. Authenticated owned reads and read-only SQL snapshots supplied current evidence; offline probes used pure validators/context fitting without gameplay.

## 1. Structured output exists, but the executable call is unconstrained

`src/model.ts` already passes the output schema to Ollama's `format`. The gap is `src/domain.ts`: the action branch permits a free string `action.kind` and a catch-all argument object; the read branch permits any tool name and arbitrary args. Actual PACT schemas are partly supplied as prompt data and validated only after generation. A JSON document can satisfy the provider schema while naming `building.queue`, adding an extra `summary` inside `action`, omitting the message body, or inventing `pact_conversation_read_v2`.

The pure synthetic probe `docs/verification/decision-envelope-research-20261014.ts` reproduced **four bad calls accepted by both current envelope validators**, subsequently rejected by actual tool validation. A small closed-schema prototype rejected all four while retaining a legitimate building command. This validates the schema-gap diagnosis, not provider-generation accuracy or a complete replacement implementation. Reproduce from Fleet with `node --import tsx docs/verification/decision-envelope-research-20261014.ts`.

Recommended correction: derive closed generation schemas from the authenticated live tool catalog and reviewed game adapter. Bind each admitted command/tool name to its exact argument schema, disallow extra fields, and distinguish request/kingdom/unit IDs. Ground references in actual observed records; retain server-side validation for current stock, permission, ownership, expiry and receipts. Preserve the original command ID when reconciling an uncertain result. Bounded known non-committing errors can replan within remaining decisions; prompts alone are insufficient.

[Ollama's structured-output guidance](https://docs.ollama.com/capabilities/structured-outputs) recommends shared generated schemas, response validation, grounding the schema and lower sampling variance. [Its native tool-calling protocol](https://docs.ollama.com/capabilities/tool-calling) carries typed tool definitions and results. Native calling is worth qualifying on the exact installed model/parser before adopting it; it is not automatically a fix for semantic state errors, and a full catalog must fit the existing input budget.

The installed model's stored metadata has temperature **1**, top-p **1**, and native `nemotron-3-nano` renderer/parser. The `{ .Prompt }` template alone is not evidence of a broken chat renderer. [NVIDIA's actual 4B card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16) recommends temperature 0.6/top-p 0.95 for tool calling, versus 1.0/0.95 for reasoning. Qualify lower-variance settings on a held-out bounded fixture set after closing the schema; do not silently alter consumed runs or turn off the owner's selected thinking mode. No such model experiment was run here.

## 2. Some valid-shaped commands target invalid game state

Thirty-three archived `INVALID_COMMAND` rejections comprised twenty contact answers, nine scout starts, two messages and two introductions. Their recorded identifier fields passed a UUID-shape check; malformed UUID syntax did **not** explain these samples, although `src/tools.ts` currently disables JSON Schema format validation and is a separate hardening concern. [Ajv's format guidance](https://ajv.js.org/guide/formats.html) documents explicit format support.

A scoped server read of the **twenty rejected answer targets** found ten existing requests where the submitting kingdom was the **sender**, not the recipient, and ten request IDs that do not exist. The ten existing requests remain pending. Answering one's own outgoing request is invalid regardless of its current status. No target was an existing kingdom ID substituted directly for a request ID. The missing IDs' origin is not proven. This is semantic reference/direction failure, not merely JSON syntax and not evidence of a contact engine malfunction.

The scout handler requires ordinary Spearmen; the observed fleets have Home Guard and no ordinary trained army. A permission advertisement does not mean the current army/resources satisfy scouting. The exact causal failure of every archived scouting command was not individually replayed, and no uncertain action was replayed. Recorded explicit rejections keep their originals/history.

Recommended correction: preflight answers against fresh incoming pending IDs plus actual delegation, and scouting against ordinary available units and current resources. The game remains authoritative. Preserve allowed conditional queueing as distinct from immediate startability. Carry concise actionable denial reasons; a generic `INVALID_COMMAND` is poor learning feedback. Do not repair a bad ID by silently guessing another player's record or expand owner authority.

## 3. Input limit is controller packet pressure, not machine/model memory exhaustion

Recent failing turns concentrate on cognition Agent 09 and fail **before reserving a model call**. Example diagnostics show about 15 KB environment, 6.7 KB cognition, 5.1 KB output schema and 2.7 KB instructions before other sections and transport escaping. The controller caps the complete serialized packet at **24,000 bytes**; the route separately sets a 32,768-token model context. These are different units. No RAM/GPU OOM is demonstrated.

An offline reconstruction used current stored cognition, the actual instruction/feedback fields and fresh owned reads, with deterministic recall and an explicit fallback representation. It is not a byte-identical replay of an earlier request. The current fitter's smallest attempted packet was **24238 bytes**, failing the cap even after removing all optional prefetched schemas and whole subjective plan/belief/reflection records. It still contained about 3.1 KB protected cognition, 6.4 KB current environment, 904 bytes projected old feedback, and omission/coverage metadata. The retained packet is too close to the cap for routine state growth.

For the same reconstruction, projecting stale rejection feedback from 1,288 to 409 bytes fitted at **23566 bytes**, retaining a real discovery candidate. Early explicit subjective-state projection also fitted, while the layered late fallback had accumulated extra coverage overhead. Removing feedback entirely was a diagnostic control, not a recommendation to remove useful error evidence. The original feedback and all stored history stayed untouched.

Recommended correction: reserve a measured envelope budget for current authority, required receipts/requested feedback, executable schemas and protected source cues **before** selecting optional memory. Bound rejection feedback, plans, peer evidence and redundant descriptors; keep exact source IDs/direction/results. Keep full history encrypted outside the prompt, retrieve relevant details on demand, and compact safely before reaching the hard ceiling. Account for serialized escaping/schema overhead and token/output headroom rather than assuming byte count equals token count. Select deliverable evidence before accepting/pinning recall advice; never silently drop or relabel an already accepted pair. Avoid repeated replays of the same unfit packet on the next scheduled turn.

[Anthropic's context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) supports small high-signal working context, on-demand retrieval, structured external notes and deliberate compaction rather than enlarging context indiscriminately. Here that applies inside existing account/budget/privacy boundaries; no extra model summarization call is implicitly authorized.

## 4. Waiting construction has concrete legitimate gates

A repeatable-read snapshot at **17:24:43 UTC /19:24:43 Berlin**, tick 24,948, examined all twenty owned kingdoms, instructions, actual stock, current mandate/commitment state and reserve floors. The same pure `checkUpgrade`/`upgradeQuote` rules and the server's documented start gates explained all **17 waiting instructions**:

| Fleet | Waiting | Stock-short | Prerequisite-blocked | Both |
| --- | ---: | ---: | ---: | ---: |
| LLM only | 12 | 12 | 4 | 4 |
| Cognition + Laya | 5 | 3 | 4 | 2 |

Counts overlap. No waiting instruction had all checked start gates ready. Current Iron/Silver reserve floors were zero; the affordability check's repeated ordinary-shortfall result must not be described as a separate positive reserve-floor restriction. No current mandate-version/closed-commitment failure explained these waits.

For example, a Hall II quote is 108,000 marked Iron units and 54,000 Silver. One LLM-only kingdom has only 58,800 usable Iron and 28,700 usable Silver, even though its building prerequisites are ready. Another cognition Hall has enough resources but still lacks a prerequisite. Waiting orders reserve authority, not stock; another construction can consume available founding/ordinary resources before the waiting order starts.

A follow-up at **17:39:12 UTC**, tick 24,963, found both previously active sampled orders (Mine and Wall) **completed**. The clock/settlement path is progressing. There is no evidence in this sample of a construction engine refusing otherwise startable jobs. This does not certify every game subsystem or future queue.

The smallest attempted packed input in the offline reconstruction explicitly omitted `constructionStockChecks`, `developmentRules` and `resourceRules` while retaining stock/prerequisite facts. Thus the authoritative guide already has affordability data, but the current delivery path can discard it under pressure; this is an observation-quality gap rather than evidence that the model had every condition and ignored it.

Recommended correction: retain compact current quote/stock/authority conditions as high-priority facts, and describe *all* owned start conditions, stock deficit/conditional ETA, occupied-slot effects and authority separately from prerequisite readiness. Show queue admission versus active work versus completed upgrades clearly. Models should reason about prerequisite order and simultaneous spending. Do not cancel original jobs, relax permissions or change economics to make the run appear productive.

## 5. Outside outreach: usable identities, unequal context and two wiring defects

Confirmed external contacts/messages remain absent in the investigated archive. All twenty agents have actually received outside candidates. The game is not restricting discovery to a cohort now; the earlier repair established access/delivery, not behavioral or strategic certification.

Two verified neutral-guidance gaps remain:

- `src/games/pact/adapter.ts:accountObjective` reads `world.profile.ambition`. Actual PACT returns the owner's ambition at **`world.ambition`**; the profile contains identity/portrait only. The real-account probe returns no account objective despite the actual value being present. The earlier synthetic test put ambition in the wrong profile shape, so it missed this contract error. `compactFacts` also does not retain the root ambition.
- `src/engine.ts` seeds `cognitiveQuery` from the **historical generated strategy objective**, even in `account_autonomy` mode. The displayed owner guidance removed direct strategy instructions, but this retrieval input still influences what the cognition model recalls. Existing plans/notes must remain history; they should not silently substitute for current owner priorities.

A structural attention effect also remains: each turn automatically reads one **existing accepted contact's** conversation/history. Those account-owned conversations are valid useful evidence, but the peers are currently own-fleet members. New worldwide candidates are often reduced to one or a few identity/contact/activity records under packing pressure, with notice/Court details omitted. This favors familiar conversation context relative to new opportunities without an explicit partner instruction.

Observed behavior is consistent with this: most waits reference construction; the LLM-only arm made one valid-name discovery-read selection, while cognition selected invented peer-finding/memory-read tool names. No successful external introduction followed. Some valid-looking contact answers target outgoing/nonexistent requests, as established above. We cannot prove that any single wiring or attention issue alone causes all missing outreach, nor that every stranger would reply.

Recommended correction: deliver the actual owner objective, align recall queries with current owner intent/facts, invalidate stale waiting intentions against completed work, and expose compact current opportunities plus correct typed follow-up routes. Keep fact delivery balanced and provenance explicit. Let the agent choose whether communication is useful; do not impose outside-contact quotas, a trading personality, partner class or autonomous advertising.

## Proposed implementation/acceptance order

1. Correct the real account-objective contract and residual historical strategy retrieval input, using faithful PACT response fixtures.
2. Close generation schemas, bind observed typed targets/current incoming requests and improve concise safe rejection feedback. Keep exact receipt reconciliation and server authority.
3. Replace unbounded/layered prompt growth with measured section budgets and tested compact feedback/evidence, preserving history and accepted recall provenance.
4. Explain complete construction start gates and improve neutral current opportunity delivery. Separate genuine resource/prerequisite waits from technical failures.

Validate with fabricated contract/state/failure fixtures first: malformed calls, correct-shape/wrong-direction IDs, stale/expired records, growing 20-agent memory, explicit omissions, actual packet limits and retry/permission boundaries. Any provider-generation qualification must use a concrete bounded proposal and pinned settings; this report ran none. Roll out only verified source at quiescent boundaries, retaining the exact twenty bindings, lifetime history/accounting, models and original five-minute anchor. First-round delivery is insufficient: include multiple growing-memory rounds and actual state-based progression/readback.

## Evidence and verification

Repository `npm run check` (type/lint; existing warnings), game-boundary check, PACT backlog check and whitespace checks passed.

Pure schema probe: four bad calls accepted by broad envelope, all rejected by small closed prototype, one valid command retained. Offline context reconstruction/projection checks, twenty-kingdom read-only game snapshot, twenty rejected-answer reference checks and two-job completion follow-up succeeded. This is research/diagnostic evidence, not a deployed repair or proof of model intelligence.

Private artifacts stay under the protected installation: `investigation-context-failures.json`, `investigation-offline-probes.json`, `investigation-game-private.json`, `investigation-game-followup-private.json`, `investigation-construction-gates.json`, `investigation-invalid-answers-private.json` and `investigation-outreach-behavior.json`. No credentials, raw correspondence or private runtime state are committed.

PACT-170's local acceptance is reopened for the verified objective/retrieval defect. Its prior successful discovery/readiness/source-deployment evidence is preserved; the real-contract and growing-memory gap does not erase that history. Runtime repair is pending; no remote tracker update is claimed.
