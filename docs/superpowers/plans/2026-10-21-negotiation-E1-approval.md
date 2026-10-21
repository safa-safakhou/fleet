# E1 negotiation pilot: approval package and preparation plan

> **Preparation update, 21 October:** P1 is implemented and verified. The actual @1 preflight fails `CONTEXT_LIMIT` before inference. The founder explicitly selected a separate offline packing repair; [the resulting unregistered @1.1 candidate and readiness report](../../negotiation-E1-readiness-20261021.md) preserve that failure. P2 and final P3 launch readiness remain incomplete. The historical proposal below is not an execution grant.

> **For agentic workers:** Future preparation uses `superpowers:executing-plans` inline, without delegation. Checkboxes below are unstarted preparation tasks. This document is a proposal, not an execution grant.

**Goal:** Prepare exactly two real-provider diagnostic cells of the frozen `reactive-cognition@1` baseline, with traceable settings, retained evidence and bounded native accounting.

**Architecture:** Use two independent treatment worlds and two matched no-interaction control worlds. Actual Fleet engines and PACT handlers/ticks remain authoritative. An explicitly owned operational adapter must replace fake wall time and disposable test cleanup; model inference remains fenced until a separately approved exact private grant.

**Tech Stack:** Existing Node 24, TypeScript, PostgreSQL 17, Fleet/PACT and the already installed Windows Ollama model/runtime. No new framework or runtime dependency.

**Spec:** [Frozen milestone design](../specs/2026-10-20-two-kingdom-negotiation-design.md), especially §§3–7. [Source acceptance](../../two-kingdom-negotiation-source-acceptance-20261020.md) is prior evidence, not an operational approval.

Date: **21 October 2026, Europe/Berlin**. Status: **ready for proposal review; not executable**. No experiment, fake-provider test, fixture, model/helper or live game run was started in preparing this package. The retained paused world was not contacted or changed. This preparation reads source and installed model files only and saves documentation plus a pure disarmed preview.

## Decision presented for review

My proposed choice is to reuse the established Nemotron artifact and thinking mode, rather than introduce a new model factor before observing the baseline. E1 can fail; it locates the first broken stage and does not qualify model quality. These are proposed settings for new fixtures, not amendments to any installed cohort.

[Exact machine-readable definition](../../negotiation-E1-approval-20261021.json) and [disarmed preview](../../negotiation-E1-preview-20261021.json) freeze both cells, descriptors and limits. The proposal contains `approved:false`, no usable private grant and no actual fixture bindings. The normal authorization validator rejects it as a grant. Existing E1–E4 result status remains unstarted.

**Material readiness gap:** the current CLI intentionally has no owned execution composition. The paired negotiation tests exercise `@2`; the five-profile parity suite preserves `@1`, but the full operational E1 `@1` fixture path is not yet certified. Neither a compiled library nor a model-file hash is proof that this operational path is ready. The unstarted preparation tasks below must supply that proof before launch approval. Today’s request does not implement those tasks or start their tests/fixtures.

## Global constraints

- Inline work only; no delegation. Retain all source histories and the paused twelve-actor world, its archives, goals, mandates, settings, queues, budgets and original unknowns by non-access.
- Only new nonce-owned synthetic fixtures may be prepared after covering authorization. Never borrow retained ports, databases, credentials, actor IDs or installed configuration. No server rollout, installation into a retained service, push, reset/replay, cancellation or uncertainty-owner review.
- Exactly `reactive-cognition@1`, `{}` architecture configuration and `merchant` persona for both roles. No candidate `@2`, specialist F6, Laya/helper, model judge, fallback model, extra event turn, hidden warmup or retry allowance.
- Preserve the frozen manifest, version-1 controller, prompts, packing, continuity ranking and native guards. A failed packet cannot be rescued by changing v1, raising its limits or substituting v2 under the E1 label.
- Real UTC governs usage, transport, evidence, leases and deadlines. Only the owned game clock is controlled; every intervening ordinary tick runs. No accelerated/native timing equivalence claim.
- No execution grant or automatic trigger is created here. Configuration review does not revoke the founder’s explicit no-run instruction.

## Exact model and settings

| Item | Proposed E1 value |
| --- | --- |
| Native route / model | Ollama, `nemotron-3-nano:4b` |
| Manifest SHA256 | `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197` |
| Weights | GGUF, `nemotron_h`, 4.0B, Q4_K_M; 2,837,586,496 bytes; SHA256 `527db2cf6c705d8fabb95693d038d9c06b4a2b0b8b0a4bbdbd01212d37242970` |
| Ollama runtime | Windows amd64 0.35.1; executable SHA256 `3cc17c238b081adf2bd3a206e52a063b637af1bf283d95b4ffd73a2bdec8b027`; exact library-tree inventory digest in JSON |
| Renderer / parser | Built-in `nemotron-3-nano` for both; binary and GGUF bytes pinned; no custom template, system override, LoRA or adapter |
| Thinking | `true`; no inline `/think` or `/no_think` override |
| Native HTTP request | `/api/chat`, `stream:false`, native JSON generation schema, `keep_alive:0`, `think:true` |
| Wire options | `num_ctx:32768`, `num_predict:2000`; unchanged `HttpModel` behavior |
| Sampling | Stored model parameters: temperature **1**, top-p **1**. No wire override. Other sampling parameters inherit the pinned runtime defaults. No sampling seed is supplied. Scenario seed 11 is not a generation seed. |
| Model settings object | `{route:"ollama", model:"nemotron-3-nano:4b", thinking:true}`; legacy `cognition`, `decisionPolicy`, `recallAssist` flags absent |
| Continuity | Original `continuity.1`, empty starting memory, synthetic-owner observation consent on, 30-day retention/source deletion; optional grounded authored updates within the original calls |
| Operation / request limits | Native turn deadline **120 s**; each provider request at most **90 s**, further bounded by remaining native turn/cell/batch time. Three calls is a ceiling, not a promise that three slow requests fit. |

Read-only inspection verified the manifest and all four config/model/license/parameter blobs by complete SHA256 and length. A recursive inventory covers **989 runtime library files / 2,930,392,048 bytes**. Version 0.35.1 is present in the binary and matches the earlier report; no live metadata endpoint was queried today. Future preflight must also verify the served version/tag/digest before dispatch. No model was loaded or probed.

### Owned host topology

Use a **new native Windows controller**, Node **24.19.0**, executable SHA256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`, so model HTTP stays on Windows loopback. This is a proposed host choice: prior source acceptance used WSL Node 24.12.0 and does not certify this operational composition. Its baseline transcript/scope/deadline behavior must be checked offline first.

The new provider is an owned hidden child process on **`127.0.0.1:11436`**, never the existing service/11434. Process-local environment: `OLLAMA_HOST=127.0.0.1:11436`, `OLLAMA_VULKAN=true`, and `OLLAMA_MODELS` pointing at `%LOCALAPPDATA%/PACT/Negotiation/E1/<batchNonce>/models`, a new E1 cache containing hash-verified copies of the pinned manifest/blobs. Copy the exact executable/library tree into a private run bundle as well; do not edit the installed runtime/cache or set global environment/service configuration. Refuse an occupied port. No download, pull, create-model, template replacement, proxy route or fallback endpoint.

Backend selection remains the pinned runtime’s automatic policy, with Vulkan enabled as in the previous setup; this does not claim Vulkan is the selected compute backend. The observed machine lists RTX 5070 Ti driver 32.0.16.1088 and Intel Graphics driver 32.0.101.5869. Capture actual backend/device from the first **metered** response/provider log. No unmetered load, warmup or backend experiment; no between-cell tuning. Preserve that provenance for a later E2 comparison.

PostgreSQL remains a **new WSL Docker fixture**, existing image `postgres:17-alpine`, exact image ID `sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537`, no pull, random loopback port. Two new databases: `fleet_test` and `pact_test`, each with the same fresh 64-hex ownership nonce as its container and retained volume. Reject ports 5432/5436/5437/5438/5439/5451/5452. Prove Windows-to-owned-WSL loopback reachability before inference; do not fall back to a gateway or retained DB. No PACT/Fleet HTTP listener or existing worker is needed: owned normal handler adapters run in process.

Copy the pinned Node executable into the private controller bundle as well. Use built JS and a validated Windows-compatible dependency bundle; never run Linux-native `tsx`/compiler binaries through Windows Node. The future preparation step owns that build packaging. Preview-only entrypoints must still create no provider, fixture, account or execution port.

## Exact fixture setup

Two sequential cells, seed **11**, replicate **1**, roles **AB**, controlled game time, baseline version **1**:

| Cell | Initial treatment state and private goals |
| --- | --- |
| `negotiation-v1:E1:C01:default:11:1:v1:AB` | A: 600 ordinary Iron, zero Silver; B: 600 ordinary Silver, zero Iron; other ordinary stock zero; no initial contact. A wants at least 1 Silver/hour, sends at most 4 Iron/hour. B wants at least 2 Iron/hour, sends at most 2 Silver/hour. |
| `negotiation-v1:E1:C02:default:11:1:v1:AB` | Same stocks. Accepted contact and unsigned opening offer of 4 Iron/hour for 1 Silver/hour are a labelled normal-handler prefix. A’s original synthetic goal permits 4 outgoing while seeding, then its normal owner amendment sets the current maximum to **2**. B’s current maximum is **1 Silver/hour** for at least 2 Iron/hour; A still needs at least 1 Silver/hour. |

Both allow one-hour terms, zero notice, null bonds. Normal onboarding supplies level-I buildings, Home Guard and founding allowances, separate from ordinary stock. Credits happen before decisions with ledger provenance. No post-decision stock/goal edit, scripted counteroffer, automatic signature or forced message/memory update. Agents choose actual legal terms; the 2:1 reference and opposing private goal objects are evaluator-only.

Normal synthetic mandates use `world.read`, `inbox.read`, `message.send.contact`, `contact.request`, `supply.sign`, existing 600,000-internal-unit resource ceilings and no reserve floor. Existing permission mapping governs offers/counters/signatures/contact answers; do not add a permission to obtain a result. Social delegation is `agent_decides`; normal authenticated leases/dispatcher/receipts still apply. Construction, training, gifts and military spending are outside these constrained owner tasks.

Write leases have the existing **15-minute wall TTL**. The owned controller must renew only the four fresh model actors’ same live account/holder/lease tuples every **five wall minutes**, including while a later cell waits, and verify authority before admitting work. This deterministic lease maintenance makes no model call and creates no agent turn. Released, expired or replaced leases stop the batch; do not silently reopen one. The existing opener can reacquire an expired lease, so P1 must add/test a narrow atomic same-live-lease renewal path instead of relying on a pre-read plus opener race. Nothing changes the TTL or renews a retained actor.

Each treatment has its **own separate matched no-interaction control world**, with the same non-social starting state/current goals and full tick horizon. No model calls or social receipts in controls. Total: **4 independent two-kingdom worlds, 8 fresh accounts, 4 model actors/bindings, 2 Fleet cohorts**. There is no cross-world communication or enrollment into the parked population. Actual world/account/cohort/binding UUIDs, DB endpoints, ownership nonces and private evidence references are intentionally **not fabricated or provisioned now**; a final prepared manifest must bind them before dispatch approval. Grant `actorIds` are **kingdom UUIDs**, not Fleet agent or account IDs; `bindingIds` are native Fleet environment-binding UUIDs. Record the account/kingdom/agent/binding mapping separately in the private manifest and check every join.

Game opportunities: offsets **0,15,…,165 minutes**, at most twelve per actor. For seed 11 use A/B at round zero, B/A at round one, alternating thereafter: `initialFirst=(seed+1)%2`, `first=(initialFirst+round)%2`. One shared provider slot and one canonical action lane. Extra event-triggered turns, wall-scheduler duplicates and catch-up bonus turns are forbidden. Advance only to an already scheduled game boundary with no operation in flight, executing every ordinary tick. Wall UTC never jumps.

## Budget and proposed window

| Limit | Per cell | Whole E1 batch |
| --- | ---: | ---: |
| Actor turns | 12 each / 24 total | 48 total |
| Actual provider allocations | 72 | **144** |
| Conservative token reservation | 2,880,000 | **5,760,000** |
| Reservation per call | 40,000 | unchanged |
| Serialized input / output setting | 24,000 bytes / 2,000 tokens | unchanged |
| Wall ceiling | 180 minutes | **6 hours**, sequential |
| Game horizon | 180 minutes | separate per world |
| Helpers / external judges / warmups | 0 | **0** |

Each cohort uses a finite shared 72-call/2,880,000-token budget, concurrency 1, `maxCallsPerTurn:3`, `maxActionsPerTurn:3`. The actual v1 controller returns after one submitted action, so it commits at most one action per turn. Do not turn the stored upper bound into a three-action loop. Corrections, reads requiring another decision, reflection and all other real inference consume the same native ledger ceiling. Reservations are not measured consumption or a monetary price quote. No quota from a historical experiment is reused.

**Proposed review window:** **21 October 2026, 09:00–15:00 CEST**, i.e. **07:00–13:00 UTC**. It is not scheduled or approved. C01 runs first; C02 may start immediately after C01 ends safely. A cell cutoff is `min(actual cell start +180 minutes, batch cutoff)`. If readiness/approval is late, stop and revise the proposal; never move the window or carry allowance forward automatically. The exact UTC window and resulting execution sources must be confirmed in the final grant after preparation. This window proposal alone grants nothing.

## Stop conditions and reporting

1. **Stop the whole batch immediately:** ownership/roster/isolation mismatch; private-evidence exposure; committed authority violation; duplicate effect; uncertain/pending command; unknown or missing model usage; source/model/template/parser/settings/limit drift; provider/transport uncertainty; or a native dispatch guard violation, including UTC/budget cutoff. Close admission for both actors. Preserve original IDs, receipts, full unknown reservation and late responses; no retry/replay/cancellation or owner review is inferred.
2. **Critical semantic false claim:** invented peer consent, activation, delivery, available resources, authority or validity fails and ends that cell’s model admission. E1 may continue only its other already listed diagnostic cell, only if native accounting is known, no operation remains in flight and safety/preflight still pass. No replacement world or repair between cells. Review each visible model response for critical claims before another inference or action admission; no review is assumed to pass. Review delay consumes the original UTC/120 s deadline, never an extension or a judge-model call.
3. **Known malformed/truncated output:** only the unchanged native corrective path, if eligible and within that turn’s three calls and 120 s. Otherwise retain the failed turn/cell. A timeout without exact usage is unknown and stops the batch; it is not a known-output retry.
4. **Normal caps or ordinary semantic failure:** retain fail/unresolved in its assigned cell, close normally at caps without attempting call 73 or turn 13, and make no grade-driven extra turn. Guard violations stop the batch. Formation after game minute 60 cannot qualify, even if later legal activity occurs. No new turn begins at minute 180 or after the wall cutoff; late success cannot rewrite that result.
5. **After stopping:** no new inference/action. Record already admitted receipts without replacement effects. Continue ordinary settlement only where ownership/accounting is certain and the approved horizon permits it; uncertainty parks the clock. Stop only the positively identified owned provider/controller. Preserve the new world databases/nonce and encrypted evidence; never invoke disposable test teardown on real history. No automatic E2/E3/E4 or remaining-budget reuse.

Report contact, actual peer-message exposure, useful two-way response, proposal/version, both signatures, activation, each flow’s installments/default/overflow, natural closure, matched stock delta and a later ordinary decision by each actor separately. A schema lookup is not a factual world read; a signature is not income; closure is not proof of delivery. The reference pays 60 installments per flow and yields A +600 internal Silver and B +1,200 Iron versus matched solo, with donor stocks equal after refill. Legal alternatives must satisfy both current goals and actual benefit, not a required price/script.

Record all attempts, original/corrective calls, reserved/measured/unknown usage and real UTC latency. Inline/manual claim review uses original scoped evidence and redacted locators, without a model-judge endpoint or additional actor turn; it is not independent review. Unassessable prose stays unresolved. G1 remains a diagnostic result even if both cells pass; it cannot clear G3/G4 or certify native pacing.

## Preparation tasks from the original proposal

These are concrete next steps for a subsequent covering instruction, **not work executed by this package**. Complete them inline before requesting execution approval.

### P1 — Retainable owned PACT fixture adapter

**Files:** proposed `pact/tests/evaluation/negotiation-owned-run.ts`, `pact/tests/integration/negotiation-owned-run.test.ts`; narrowly extend `pact/packages/runs/src/service.ts` for same-live-lease renewal; refactor common owned fixture construction from `negotiation-world.ts` only as needed, preserving its existing tests/default behavior.

**Interface:** `prepareOwnedNegotiationWorld(target, cell, {control, secrets, retention:"preserve"}):Promise<OwnedNegotiationWorld>`. Reuse normal actor reads/dispatch, outcomes and tick advancement; provide `disconnect():Promise<void>` which never drops schemas. Define `OwnedNegotiationWorld` as the existing `NegotiationWorld` surface with `close` replaced by `disconnect`; identity/rules/encryption secrets are fresh 32-byte values supplied privately. A retained nonce/volume remains owned. Add `RunService.renewMcpLease({accountId,holderId,expectedLeaseId})`, returning `{leaseId,expiresAt}` only for the same unreleased, unexpired MCP tuple under its row lock; use the unchanged 15-minute TTL and normal clock. Reject mismatches without replacement/acquisition. This is a separate minimal lifecycle safety addition, not an authority/TTL change. No runtime Fleet import of PACT test code.

- [x] Reproduce wrong-marker/retained-target writes, foreign actor/receipt access and destructive-finally cleanup with synthetic owned fixtures; require rejection/preservation, including an interrupted setup. Same-live renewal preserves lease ID/TTL; released/expired/wrong-holder or concurrent revocation rejects without reopening a lease.
- [x] Implement explicit retention and secret ownership without copying the test helper’s fixed key or `TRUNCATE`; normal handler setup and labelled C02 prefix remain identical.
- [x] Verify repeat migration, both C01/C02 initial states, unchanged source contracts and encrypted archive/restore of the owned fixture without gameplay replay; commit only verified changes.

### P2 — Native ledger/UTC execution composition and package

**Files:** proposed Fleet `scripts/lib/negotiation-owned-run.ts`, `tsconfig.negotiation.json`, `tests/unit/negotiation-owned-run.test.ts`, `tests/integration/negotiation-owned-run.test.ts`; modify `scripts/qualify-negotiation.ts` only to inject this fixed trusted composition after exact grant validation. Reuse `src/app/negotiation-ledger.ts`; no arbitrary module/environment loader.

**Interface:** `createOwnedNegotiationExecution(protocol, preparedManifest, dependencies):Promise<NegotiationExecutionPorts>`. `runCell` uses actual `PlatformHost`, `HttpModel`, guarded `ModelAdmission` and normal PACT facades. Store/evidence deadlines use actual UTC. Ledger and one-shot nonce remain the existing tables, not a new spend counter.

- [ ] Fake-port assertions: no grant/preview gives zero process/DB/provider activity; mismatched binary/model/settings/Windows DB ownership fails before dispatch. Test 120 s/90 s/cell/batch cutoffs, known correction vs unknown stop, counters and original receipt recovery. Withheld/critical manual review must prevent the next inference/action without extending the native deadline.
- [ ] Implement a Windows-compatible built-JS bundle, explicit owned WSL fixture bootstrap, actual endpoint guards, alternating game opportunities, durable admission close and encrypted evidence. Do not import `tests/helpers.ts`, fake `f.now()/advance`, scripted providers or test-grade self-reports.
- [ ] Verify prior v1 transcripts, real native ledger scope/reservations, five-minute same-live-lease renewal and expired/revoked admission stops, duplicate events, no extra UTC scheduler turns, late response retention and no disposable real-run teardown; source check/build/boundaries pass before committing.

### P3 — Baseline preflight, fenced roster and final manifest

**Files:** proposed Fleet `tests/acceptance/negotiation-baseline.test.ts`; private prepared manifest/evidence outside Git. Keep the current proposal/preview and historical statuses intact.

**Produces:** a private `preparedManifest` with exact verified execution source/bundle digests, actual UUIDs/endpoints/nonce, fresh secret/evidence references and confirmed UTC window, plus a rejected-by-default `approved:false` grant draft. No model dispatch in this preparation.

- [ ] Prove actual full `@1` C01/C02 packets and native scopes/caps with fake providers after authorization, including corrective/read packets. Packet failure blocks preparation; do not alter v1, enlarge 24 KB/2,000 tokens or silently select v2. This does not require a real model canary or a model-authored success.
- [ ] Verify the selected Windows controller and owned loopback DB route offline. Keep all real inference fenced while preparing the eight fresh identities and normal C02 prefix, and while copying/rechecking the pinned provider/model bundles. Stop/retain a partial setup; do not create replacements automatically.
- [ ] Pin the resulting committed execution sources, complete actual roster/key/evidence references, snapshot/cost-zero preflight and unchanged paused-world non-access statement. A changed source/window gets a new reviewed preview, never a silent grant amendment.
- [ ] Present that exact private manifest for the founder’s **explicit E1 launch approval**. Only then may a private `NegotiationGrantSchema` grant set `approved:true` and be atomically consumed within its UTC window. No private grant or execution command is generated now.

## Relationship to the architecture milestone

F02–F06 supply the exact-version/scoped foundation already accepted offline. E1 intentionally freezes the original `@1` modules; the new `@2` facts/evidence policy belongs to the separately approved E2 comparison, not this pilot. F07/F08 presentation and persistent specialists remain separate. No E1 result completes specialist A/K work, and no later stage follows automatically.

## Review focus and evidence boundary

| Failure to rule out | Owner / acceptance assertion |
| --- | --- |
| Alias matches but weights/runtime/template differ | P2/P3 reject digest/version drift before dispatch; no download or fallback. |
| Test helper erases history or fake wall time extends spend | P1/P2 interrupted-close and actual-UTC deadline tests; real data never reaches test `TRUNCATE`/drop teardown. |
| Correct budget, wrong peer/world/goal or leaked control state | P1/P3 actor/receipt boundaries and exact initial/current goal checks; own packet never contains evaluator/private opposing data. |
| Extra turn/correction or deadline overrun to obtain success | P2 repeated periodic-event and counter/cutoff tests; all calls stay in native ledger; P3 baseline packet checks. |
| Executable approval inferred from a complete-looking preview | P2 zero-effects preview/no-grant checks; P3 actual-source/roster/window match; proposal rejected by existing grant schema. |

Self-review was inline, with no delegation. Model/settings are proposed choices; file hashes are freshly observed; source suite results remain the prior checkpoint. Today’s validation is limited to read-only artifact hashes, exact cell/cap generation, descriptor digests, local links and rejection of this public proposal as an execution grant. No new tests or provider/game/fixture runs were performed.

Reviewed source heads: Fleet `e5f5745992e5756d443ba3440590d03df2742f34`, PACT `9f482be85a7a83b2809548abbaf114f73b1c8b09`. They precede this documentation commit and contain no owned executable composition. The source preview pins these reviewed heads; future P1/P2 changes require new verified execution pins and a new final preview. This package cannot serve as that future grant.
