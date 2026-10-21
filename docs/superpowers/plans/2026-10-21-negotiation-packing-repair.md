# Separate negotiation packing repair implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` inline. No delegation or real model/game execution.

**Goal:** Prepare an explicitly separate offline candidate after frozen `@1` failed C01/C02 packing before admission.

**Architecture:** An unregistered `reactive-cognition@1.1` candidate subclasses the unchanged v1 decision step and factors repeated generation-schema fragments through the existing lossless sharing module. The original `@1`, its prompts, continuity ranking, decoder, accepted-output constraints and PACT observation packer remain byte-identical. No negotiation-v2 memory, decoder or subjective-learning policy is borrowed. Candidate fixtures reuse E1 initial states; their selected engine is recorded separately and is not eligible for an original E1 grant.

**Tech Stack:** Existing TypeScript, Zod, AJV, native Host/ledger and nonce-owned PostgreSQL offline fixtures. No new dependency.

**Spec:** User's explicit choice “Prepare separate offline packing repair,” following the measured frozen-baseline failure. This candidate and any source/policy amendment must be reviewed separately before launch.

## Global constraints

Keep 24,000 input bytes, 2,000 output tokens, 40,000 reservation, three calls per turn, 120-second native turns, real UTC and existing budgets. Keep the paused world untouched by non-access. No production registration/default switch, installation, provider start, live game run, push or real grant.

## Review focus

Schema equivalence with delivered evidence IDs and with empty evidence; literal enum/const content remains literal; corrective and read packets count against native limits; candidate cannot be silently selected by frozen E1; original histories/fixtures and v1 bytes remain unchanged.

### R1 — Lossless candidate

**Files:** create `src/engines/continuity/engine-packing-repair.ts`; `tests/unit/continuity-packing-repair.test.ts`.
**Interface:** `PackingRepairDecisionStep extends ContinuityDecisionStep`; `definition` exports exact ref `reactive-cognition@1.1`, unregistered. `generationSchema` applies sharing only after v1 binds delivered evidence IDs.

- [x] Add and observe a failing size/equivalence test on the actual v1 schema, with zero/four delivered IDs, valid waits/actions/optional continuity and invalid evidence/fields/bounds.
- [x] Implement structural factoring only. Keep numeric/enum bounds, output acceptance and optionality exact; no observation/continuity rewrite.
- [x] Run unit schema tests and verify original controller/schema/prompt/packer bytes and default registry remain unchanged; record the repository constructor type widening explicitly.

### R2 — Paired offline preflight

**Files:** modify `tests/fixtures/negotiation/driver.ts` for explicit candidate-only registry injection and measured input bytes; add `tests/acceptance/negotiation-packing-repair.test.ts`; authored fake-output options in `providers.ts` only if alternating order needs them.
**Interface:** test-only candidate definition override, actual UTC owned worlds/normal native Host, finite native ledger, actual serialized message+schema byte measurement. Candidate engine ref is explicit; fixture cells remain the frozen initial-state definitions.

- [x] Reproduce C01/C02 admission failure without sharing. Prove actual candidate packets, known correction and scoped read fit the unchanged caps; missing initial fit blocks later-path claims.
- [x] Run paired fixtures with authored fake outputs, exact native accounting and original receipts. No model-authored quality claim.
- [ ] Commit verified candidate and report explicit readiness gaps. A successful source preflight alone cannot approve E1 or populate/launch a revised roster.

**R1 integration finding:** the native continuity adapter incorrectly forced profile version `1` even for a definition declaring the continuity-v1 module. The candidate reproduced `CONTINUITY_BINDING_MISMATCH`. Pass the exact already-authorized task profile version into `ContinuityV1Repository` and retain its binding/profile checks and version-separated namespace. Existing @1 behavior is identical; this is a host adapter correction, not v1 controller/schema mutation.

**R1 measured scope amendment:** schema sharing alone saves 681 bytes with no IDs / 1,351 bytes with four IDs and still fails paired admission. The retained general-game observation core cannot fit alongside v1 continuity. The candidate therefore explicitly selects the existing audited `negotiation@1` observation policy via the normal environment port, including marked omissions and ordinary scoped reads. This changes delivered input selection and is **not** described as a lossless-only baseline repair. The v1 continuity ranking, context/decoder/updates, model output schema acceptance and engine loop remain inherited. Exact candidate `@1.1` + input policy and new source/policy digests need review; original E1 authorization cannot select it.

**R2 migration finding:** Fleet replays its migration SQL on every migrate call. New namespace rows exposed the older 017 constraint being narrowed before 023 ran. Include the exact candidate namespace in 017 as well as the new audited 023 constraint so repeat migration preserves populated candidate history. Add no backfill, enrollment, default or runtime-setting change. Corrective preflight is proven from the native ModelAdmission retry events, including whether additional correction text fit; it is not assumed to originate in the v1 decision loop.
