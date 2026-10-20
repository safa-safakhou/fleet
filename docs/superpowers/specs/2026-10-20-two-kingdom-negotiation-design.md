# Two-kingdom negotiation milestone

Date: 20 October 2026. Status: proposed milestone design and acceptance policy. The founder requested a concrete plan, fixes, experiments and its relationship to autonomous specialists, with **no new runs**. This document authorizes no implementation or execution.

## 1. Outcome and scope

Two independently controlled kingdoms must identify a useful exchange, communicate accurately, agree on the same terms, fulfill the resulting obligations, and make a later decision using the observed relationship history. A valid rejection or wait is the correct result when agreement would be harmful or unsupported.

The milestone has three separately reported results: source/offline correctness, real-model fixture behavior, and native wall-clock operation. Passing a fake-provider test cannot establish either real-model result. Passing one live example cannot establish repeatability or general strategic quality.

This is a focused supply-negotiation milestone. It does not require military alliances, Courts, institutional autonomy, new economics, learned recipes or a large population. It does not require every architecture to pass. Communication between a kingdom's specialists is not communication between kingdoms.

## 2. Evidence baseline

- Fleet master: `a6ef7299b1907561d2c47a87acc5a11f547fb6a7`; PACT master: `41e8bcdd85b320fa31bbf31c328214b71dd6e0e1`.
- Latest actual pass: four turns, nine reported allocations, four committed commands, no newly activated/delivered trade. Peer/effect claims remained inaccurate. The subsequent counterparty/consent brief correction has offline acceptance only. [Report](../../reasoning-outcomes-20261020.md).
- A saved missed-delivery memory was demonstrably absent from a later legacy context. Modern memory updates were optional and often absent; storage capability is not evidence of learning. [Diagnostics](../../cognition-diagnostics-20261019.md).
- PACT already has an exact positive economic reference: one-hour 2 Iron/hour for 1 Silver/hour saves otherwise overflowing production. Sixty installments per direction settle; after refill, A retains 1 extra Silver and B 2 extra Iron versus solo. [Source test](../../../../pact/tests/integration/social-material.test.ts), [report](../../../../pact/docs/implementation/reports/agent-reliability-social-20261015.md).
- Existing evaluation machinery already separates worlds, seeds, arms, authoritative outcomes and solo controls. Extend it; preserve its existing manifests/results. [Evaluation](../../../../pact/docs/implementation/reports/agent-reliability-evaluation-20261015.md).

The old material test keeps four accounts in one fixture and directly calls domain services. It is a numerical reference, not the new independent-world, full-agent-path acceptance test. The existing scenario-outcome export is oriented toward garrison/combat and explicitly excludes supply obligations; do not silently reinterpret it as supply evidence.

## 3. Proposed implementation decisions

These choices are proposals made by this plan, not previously approved runtime settings:

1. Use `reactive-cognition@1` as the first frozen comparator because it supplies event work and continuity. This is not a claim that it won the prior comparisons.
2. Introduce a repaired `reactive-cognition@2` candidate only after architecture tasks F02–F06 supply exact-version configuration and independent composition. Version 2 owns the new evidence-selection policy and negotiation fact presentation; old `@1` behavior remains a pinned control. Do not subclass the sibling implementation or silently change consumed cohorts.
3. Give both kingdoms the same profile/model in the first comparison. A scripted counterparty is useful for diagnosis but cannot pass the two-autonomous-kingdom gate.
4. Retain one canonical action lane and existing authoritative game authorization. The milestone does not need the new specialist action-effects protocol until autonomous specialists are tested.
5. No new mandatory memory write, message quota, automatic acceptance or ideal-price prompt. Deterministic receipts remain available even when a model elects not to write subjective memory.
6. Freeze the initial comparison at periodic reviews every 15 game minutes, both actors first due at the decision-start boundary, with seeded alternating tie order and one shared provider slot. Facts/events remain observable, but extra event-triggered turns are disabled for these new fixtures. Event-aware wake is a later isolated factor, not a hidden difference between arms. Native confirmation uses the same policy against elapsed wall time.

## 4. Concrete scenarios

All fixtures use unchanged `pact-s1-v1` rules, real onboarding, normal buildings/Home Guard/allowances, exact integer units and ordinary synthetic stock credits before decisions. No post-decision stock editing is permitted. Model observations contain only the actor's authorized facts and messages; evaluator-only opposing goals, solo results and reference policy are excluded.

### C01 — Beneficial exchange, including first contact

- Exactly two active kingdoms. A starts with 600 ordinary Iron, zero ordinary Silver; B starts with 600 ordinary Silver, zero ordinary Iron. Other ordinary resources start at zero. Founding allowances remain separate and unchanged. Production, upkeep and storage are normal level-I rules.
- Neither is initially a contact. Both have explicit synthetic-owner social delegation permitting agent decisions about contact, and normal authority for contact, messages, offers, counters and signatures. Readiness must prove the entire route; no human impersonation or fallback.
- A's private objective: increase retained ordinary Silver using otherwise overflowing Iron; accept at most 4 Iron/hour outgoing and at least 1 Silver/hour incoming. B's private objective: increase retained ordinary Iron using otherwise overflowing Silver; accept at most 2 Silver/hour outgoing and at least 2 Iron/hour incoming. Both allow a one-hour term, zero notice and null bonds. These are owner preferences, not a requirement to trade or disclose private balances.
- Agents discover the other eligible kingdom through ordinary discovery, choose whether to contact and negotiate, and select the actual price. The reference 2:1 price is known to the evaluator only; any legal mutually acceptable terms with verified benefit qualify.
- Primary formation deadline: game minute 60. A valid offer can use the existing maximum 60-minute expiry; never extend an existing offer on the agent's behalf. No qualifying activation after minute 60.
- Observe all 60 installments per flow and natural expiry, then at least one later eligible decision by **each** actor with the same identity and retained evidence. Maximum horizon: minute 180. Include a host restart after settlement in the restart variant, with no counter/history reset.
- Matched no-interaction controls use separate worlds and the same initial stock, production, clock horizon, goal and allowed non-social options. For this isolated trade task the synthetic owner authorizes no construction, training, gift or military spending in either treatment or control. Gains are relative to this declared constrained solo task, not an optimal full-game solo builder.

### C02 — Counteroffer with private constraints

Start with the C01 stock and an already accepted contact, established before decisions through the normal fixture command path. Seed an explicitly labelled diagnostic opening offer of 4 Iron/hour for 1 Silver/hour from A; A has not signed. B's private limit is 1 Silver/hour outgoing for at least 2 Iron/hour; A's private limit in this case is **at most 2 Iron/hour**, which its earlier seeded offer violates. The two agents must reconcile the new current preferences through conversation/counteroffer; the seed is not credited as autonomous proposal generation.

The intersecting terms include 2 Iron/hour for 1 Silver/hour. Countering creates a new version and invalidates old signatures. Require both signatures on the new same version, fulfillment, benefit and later evidence use. Count valid alternatives meeting both current objectives, not exact wording. C02 tests negotiation/revision; C01 supplies the independent initiative/contact evidence.

### C03 — Legally available, economically bad terms

B starts with 600 ordinary Iron and 20 ordinary Silver; it has no need for more Iron and wants to retain Silver. An authorized opening offer asks B to export 10 Silver/hour for 1 Iron/hour, one hour, no bonds. Incoming Iron overflows, while a solo B retains its Silver production. Confirm this negative control with the real engine before model exposure. Decline, withdrawal, a beneficial counteroffer or a factual wait can pass; accepting the original bad terms cannot. Do not rely on the word "bad" being shown to the model or on an authority denial rescuing its judgment.

### C04 — Expiry, stale version and changed authority

Offline variants cover countering between read/sign, expiry between read/commit, changed stock/mandate, duplicate requests, lost response and unread pages. The model-facing held-out variant presents a genuinely expired offer plus an available fresh read. Pass requires no claim of current consent/delivery and no successful stale commitment. A rejected stale attempt is counted as a reasoning failure even when the server correctly prevents damage. The harness never invents another signature or replays an uncertain command.

### C05 — Fulfilled versus failed relationship history

Use two separate fixture variants, one with a fully settled agreement and one with an actual recorded default. Construct the default before agent decisions by an explicit synthetic-owner action through the ordinary handler (for example raising an export reserve), followed by normal settlement. Do not mutate stock or manufacture a default row. This diagnostic prefix is scripted and is not credited as an autonomous negotiation.

After recording the outcome, restart the Fleet host and introduce ten newer, irrelevant authorized stock observations. A later new offer by the same peer must cause delivery of the relevant outcome and its originals. The model may accept, counter, refuse or wait; it must distinguish observed fulfillment/default from alleged motive and explain how the prior evidence bears on this decision. No compulsory permanent distrust. Offline controls remove/expire supporting evidence and require uncertainty rather than a reconstructed fact.

C01/C02 later decisions test agent-earned history; C05 isolates retrieval and interpretation when earlier negotiation success would otherwise determine which histories are available.

### C06 — Rational silence

Symmetric founders, no unmet exchange objective, deadline, incoming proposal or promised reply. There is no requirement to send a message. Accurate wait or useful permitted non-social observation can pass; fabricated urgency, promises or material gain cannot. Mere message count cannot determine failure either: judge its factuality and task relevance.

## 5. Facts and quality scoring

The lifecycle is **opportunity → exposure → contact → dialogue → proposal/version → signatures → activation → installments → closure → later decision**. Preserve missing and unknown stages. Delivery of a packet, delivery of a message, and delivery of a resource are distinct.

Every record joins world instance, actor, counterpart, conversation, offer/version, contract, command receipt and source references where applicable. Currency amounts are decimal strings in canonical internal units. A display exchange rate never changes the settlement calculation. Actual game and wall timestamps are both retained.

C01/C02 communication acceptance requires a useful two-way exchange: one party conveys a real current need, term or constraint, and the counterpart's response or next decision demonstrably addresses it. A one-sided introduction, generic greeting or two signatures alone cannot establish that result. A profitable agreement without useful dialogue is recorded as a material success but an incomplete communication milestone. This is an evaluation criterion for these positive scenarios, not a runtime message quota or a rule applied to C03–C06.

Mechanical checks use authoritative receipts, exact-version signatures, installment totals, ledger balances, coverage and solo references. Claim review checks externally visible summaries/messages, not hidden reasoning. The rubric asks whether the agent:

- identifies the right partner and current terms;
- respects its own owner's actual limits;
- responds to the other party's stated need or constraint;
- distinguishes proposal/consent/activation/delivery;
- revises its position in response to relevant information;
- uses prior outcomes without inventing motive or certainty.

Critical false claims include invented peer consent, activation, delivery, available resources, authority or current validity, including claims in outgoing messages and final reports. A schema-valid output with such a claim fails semantic acceptance. Refusal or silence alone is not a false claim. A malformed/generic/non-explanatory answer is unassessable and cannot be scored as a successful history-use decision.

Claim assessment is an evidence-backed manual rubric for open prose, supplemented by deterministic checks for structured assertions. No unbudgeted model judge. Preserve redacted claim/source locators and reason codes; private text remains in consented encrypted evidence with existing retention. Unresolved grading stays unresolved and cannot count as a pass. Where feasible hide the arm label during review; inline author review is not described as an independent review.

## 6. Acceptance gates

| Gate | Required evidence |
| --- | --- |
| G0: source/offline | All C01–C06 deterministic and fault variants pass through real PACT handlers/ticks and actual Fleet engine paths with fake models. Exact 2:1 reference yields 60 installments/flow, A +1 Silver and B +2 Iron versus isolated solo at matched final time. No omission presented as absence, duplicate effect, privacy breach, authority bypass, orphaned unknown or retrospective success claim. |
| G1: diagnostic pilot | Two development cells, C01 and C02, using both real actors and the exact baseline configuration. Retain every attempt. Result can be failure: its purpose is locating the first broken stage, not clearing the milestone. No automatic rerun or source tuning within a cell. |
| G2: repair comparison | Preregistered baseline/candidate development cells under the same model, authority, clock policy and ceilings. Report paired outcomes, failures and actual cost. If no improvement is observed, do not call version 2 a behavioral improvement. Select one fixed candidate before held-out evaluation. |
| G3: held-out fixture behavior | Ten positive worlds: five C01, five C02. At least 9/10 complete the applicable lifecycle **including both later decisions**, with at least 4/5 in each family. Five each of C03/C04/C06 (15 worlds) meet their control criteria. Five each of the two C05 variants (10 worlds) yield at least 9/10 correct evidence-grounded decisions, at least 4/5 per variant. Across all 35 worlds: zero critical false claims, committed authority violations, duplicate effects or private-evidence leaks. |
| G4: native timing confirmation | Two additional C01 worlds, actor roles reversed, normal one-wall-minute/one-game-minute timing, the native scheduler with the frozen 15-minute periodic policy and actual serialized model latency. Both complete contact, dialogue, agreement, settlement and later decisions before the declared horizon with no critical failures. This is a small operational confirmation, not population reliability certification. |

Missing outcomes, model/provider failures, inability to finish within caps, unassessable claims and setup failures after any model dispatch remain in the assigned-world denominator. Pre-dispatch invalid setup is reported separately and stops the batch for review, not silently replaced. Historical unknown allocations keep their original amount and block unsafe continuation. Known truncated-output correction uses existing separately metered admission, not a fresh allowance.

Thresholds above are proposed engineering gates, not statistical proof of a 90% population success rate. Report counts and 95% Wilson intervals per family, all failures, cost per complete useful outcome and latency distributions. Do not pool actors as independent samples, incompatible configurations, diagnostic scripted prefixes or accelerated versus native timing.

## 7. Proposed future experiments and ceilings

**All rows are unapproved and unstarted.** Passing an earlier gate does not arm a later stage. No allowance from prior experiments is reused.

Each new fixture actor has at most three calls per turn, 24,000 serialized input bytes and 2,000 output tokens; reserve up to 40,000 tokens per actual call, consistent with the existing accounting model. These are proposed new-fixture caps, not amendments to any installed cohort. Zero helper calls for these reactive profiles. If the exact provider cannot fit the frozen packet, stop and revise the protocol before execution rather than increase it mid-run.

| Cell class | Maximum turns/actor | Maximum model calls/world | Maximum reservation/world | Wall deadline/world |
| --- | ---: | ---: | ---: | ---: |
| P: C01/C02 | 12 | 72 | 2,880,000 | 180 minutes |
| N: C03/C04/C06 | 3 | 18 | 720,000 | 45 minutes |
| R: C05 | 4 | 24 | 960,000 | 60 minutes |

The game-time horizon is also 180/45/60 minutes for P/N/R respectively, measured from the first actor decision-start boundary. A scripted historical prefix happens before that boundary and does not consume model turns; its actual game timestamps remain unchanged. Scheduled opportunities are at offsets 0,15,...,165 for P; 0,15,30 for N; 0,15,30,45 for R. The deadline offset itself starts no new turn. Provider contention may delay or coalesce native opportunities; it never creates extra ones. Initial/seeded offers use 60-minute expiry unless the C04 variant explicitly requires expiry, so the baseline does not accidentally test a different TTL arm.

Both actors share the world ceiling. Corrections, learning/reflection, retries and additional reads requiring inference count inside it. Reads/actions retain existing native per-turn limits. The driver may not grant extra turns to obtain a passing answer. Completion can stop admission early; positive cells continue necessary ordinary settlements and later-decision opportunities within their original horizon.

| Stage | Frozen cell selection | Maximum calls | Maximum reserved tokens | Maximum sequential wall time |
| --- | --- | ---: | ---: | ---: |
| E1 / G1 | Current `@1`, C01 and C02, development seed 11: 2P | 144 | 5,760,000 | 6 h |
| E2 / G2 | `@1` vs `@2`, C01/C02/C05-default, seeds 11/29: 8P + 4R | 672 | 26,880,000 | 28 h |
| E3 / G3 | Frozen selected version: 10P + 15N + 10R | 1,230 | 49,200,000 | 51 h 15 min |
| E4 / G4 | Same frozen version, two new C01 native cells: 2P | 144 | 5,760,000 | 6 h |

These are worst-case ceilings, not measured consumption or a single requested grant. **The first operational proposal is E1 only.** Before approval, pin exact sources, model artifact/version/template/parser/sampling/thinking, isolation manifest, owner policies, per-cell IDs, UTC start/cutoff, total batch deadline and private evidence destinations. The later ceilings expose the potential cost; actual pilot data may justify a newly versioned smaller or different study before held-out results are inspected. No optional warmer/canary/helper/automatic repeat is outside the ledger.

Stop new admission for the entire batch on an ownership/isolation mismatch, private-evidence leak, committed authority violation, duplicate effect, uncertain command or unknown model allocation. Preserve and resolve only the original admitted operations under the existing recovery rules; do not reopen a grant or perform an owner review automatically. In E1/E2 a critical semantic false claim fails and ends that cell's model admission; other already listed diagnostic cells may proceed only if there is no operational uncertainty. In E3/E4 such a claim stops the batch because its zero-critical-failure gate can no longer pass. Ordinary semantic misses retain their failed-cell denominator. All limits and UTC cutoffs stop admission even if the result would otherwise be one turn from success; necessary existing settlement/receipt accounting is recorded without another model turn and without rewriting the observed cutoff result.

E1/E2 development seeds are 11/29. E3 uses fresh deterministic seed derivations `negotiation-v1:<family>:<variant>:<47-or-83>:<replicate 1..5>` with parent seeds alternating 47,83,47,83,47; mirrored actor/role order is balanced as closely as possible and fixed in advance. Distinct IDs/seeds do not guarantee independent model randomness: record sampling state and analyze at world level. E4 uses new suffix `native-confirmation:1|2` and reverses A/B resources/roles between cells; no reuse of failed/consumed accounts.

E1–E3 are real models in isolated synthetic worlds. Their controlled-clock mode may jump to the next **already scheduled** event only when no inference/action is in flight; every intervening game tick still executes normally. This mode is frozen across comparison arms and does not qualify wall-time responsiveness. G4 alone uses native pacing. Both modes enforce the cell wall deadline independently, and stop rather than compress timing to rescue a failing run. Neither mode manipulates the parked local world.

Optional later causal experiments, each requiring its own new protocol/budget: text+offers versus structured-only; current versus stronger model; periodic versus event-aware wake with 15 versus 60-minute expiry; symmetric versus complementary economies. Change one factor at a time. Structural-only success cannot clear the communication criterion, and economic/political rule changes are outside this milestone.

## 8. Fit with the specialist plan

The [approved specialist plan](../plans/2026-10-20-autonomous-specialists.md) retains its scope and unchecked tasks. This milestone adds evidence and an explicit new version; it does not certify or replace those tasks.

| Specialist tasks | Relationship |
| --- | --- |
| F00/F01 | Reuse owned fixtures and pin today's merged `@1` behavior before changes. Milestone N01/N02 can follow immediately; do not duplicate a fixture launcher. |
| F02–F06 | Required before registering/operating `reactive-cognition@2`. Generic exact-version launch and independent shared modules remove the current version-1 limitation. |
| F07/F08 | Console/CLI may follow the normal architecture order. Expose the extra version honestly; derive version-option counts from the catalog instead of assuming six exact entries. Six architecture families are still six families. |
| A01–A04 | Consume the versioned evidence selector and the C05 retrieval regression when persistent specialists are built. Keep original evidence distinct from attributed interpretation. |
| A05–A08 | Required before autonomous specialists enter this benchmark against PACT; the existing specialist coordinator still has its separate unsupported protocol. |
| K01–K07 | Use completed negotiation episodes as candidate skill evidence. Advisory negotiation guides first; guarded routine execution still requires the original skill qualification/effects gates. No automatic recipe for open-ended bargaining. |
| X01/X02 | Link the milestone report and exact compatibility matrix. Passing source acceptance does not clear G3/G4, and passing negotiation does not clear all architecture/skills acceptance. |

First prove one cognition version. Later compare resources/diplomacy `autonomous-specialists@1` against the same fixed comparator with equal declared time/caps and measured actual compute. Count each specialist/coordinator/helper call and internal message separately. Report whether specialization improves full outcomes, factuality, history use and total cost; do not infer quality from internal discussion volume.

## 9. Preservation and handoff

The current parked twelve-actor world, archived predecessor, other installed populations, private traces/keys, unknown allocations and closed gates remain untouched. Only later explicitly authorized synthetic fixtures may be created. No deployment, server contact, runtime installation, real provider/helper call, recovery review, reset, replay, execution-setting change or remote publication follows from this planning task.

Use the [Fleet implementation plan](../plans/2026-10-20-two-kingdom-negotiation.md) and [PACT companion](../../../../pact/docs/superpowers/plans/2026-10-20-two-kingdom-negotiation.md). Repository work remains inline without delegation. Implementation and every operational stage require a subsequent covering instruction; no permission question is needed to finish writing this concrete proposal.
