# Specialist KQ1 implementation plan

> **For agentic workers:** use superpowers:executing-plans inline. Founder explicitly forbids delegation and approved completing this diagnostic under its existing limits.

**Goal:** Build and verify the separate retained-world KQ1 diagnostic, without treating it as a negotiation qualification or release gate.

**Architecture:** A strict KQ1 protocol binds eight cells, exact source/artifact/settings digests, fresh owned identities and one terminal grant. Normal PlatformHost specialist tasks, PACT action-effect guards and native accounting remain authoritative. Authenticated backups and explicit response reviews precede dispatch and further effects respectively; no disposable fixture teardown is exposed.

**Tech stack:** Existing TypeScript/Zod/PostgreSQL native host, encrypted review channel and pinned Windows provider composition; no new dependency.

**Spec:** [Approved numeric diagnostic proposal](../../autonomous-specialists-qualification-proposal-20261021.md), with the later founder six-task approval recorded in [execution progress](../../negotiation-execution-progress-20261021.md). Earlier disarmed wording describes its pre-approval checkpoint. Limits below are unchanged.

## Global constraints

- Eight cells: resources-diplomacy/full × advisory/guarded × existing-goal/changed-consent-reserve. One model kingdom and one disclosed scripted peer per cell.
- At most four native turns per role:96turns/288calls/11,520,000reserved tokens in six hours;45-minute per-cell UTC cutoff,120GAME-minute controlled horizon.
- Per call40,000reservation/24,000input bytes/2,000output tokens, three calls per native turn, one shared provider slot; no helper/fallback/download or hidden inference.
- Non-model parent limits remain256/24/64/512 for two roles and512/48/128/1024 for four roles (reads/actions/messages/steps),7,200,000ms cumulative invocation time.
- Keep the selected E3/E4 artifact frozen. KQ1 source/package is separate. No replay or replacement of failed E1–E3, preserved histories or uncertain work. Preserve the original paused world/public services by non-access.
- Actual full delivery and a zero-extra-model-call exact-goal reuse are separately necessary for a guarded positive; fixture signatures are disclosed setup. Advice cannot qualify guarded effects. Production acceptance/activation is blocked by failed E3.

## Review focus

1. Missing, duplicate or changed KQ1 cell/actor mapping must refuse dispatch rather than borrow negotiation permission (Task1).
2. A setup or reconnect failure must retain partial owned state without dropping schemas, reissuing identities or clearing unknowns (Task2).
3. Guarded effect quotes and original receipt IDs must survive a persisted wait; a reserved signature is not full delivery (Task2).
4. Role-trigger delivery must never add a fifth role turn, reset parent work or admit a parallel provider call (Task3).
5. A critical review or unknown outcome must close all sibling admission after known usage is settled; late evidence remains retained (Task3).

## Task1 — Exact protocol and terminal diagnostic evaluation

**Files:** `src/specialist-qualification.ts`, `tests/unit/specialist-qualification.test.ts`.
**Interfaces:** `prepareSpecialistQualification(selection)` returns a canonical eight-cell protocol; `validateSpecialistGrant(protocol,grant,now)` verifies exact one-shot scope/roster/cutoffs; `assessSpecialistCell(cell,evidence)` cannot pass without native source/cost/outcome coverage.

- [x] Write cases for exact eight cells/caps, changed source/cell/roster, duplicate identities, expired grant, unknown accounting and guarded signature-without-delivery. Run focused unit tests and observe RED.
- [x] Implement strict canonical schemas/validation/evaluation, preserving unknown usage and diagnostic-only status.
- [x] Run focused and full unit suites/check/boundaries, inspect GREEN and commit. Three focused/494full unit pass; type/style and boundaries pass (existing82warnings/51infos, no new warnings).

## Task2 — Retained PACT action-effect world

**Files:** PACT `tests/evaluation/specialist-owned-world.ts`, `tests/integration/specialist-owned-world.test.ts`; share existing synthetic construction only through an explicit bootstrap descriptor, never score that descriptor as a negotiation result.
**Interfaces:** retained world has scoped normal read/quote/guarded-dispatch/receipt, same-live lease renewal, controlled settlement, encrypted checkpoint and disconnect; no drop/reset method. The scripted peer and synthetic setup remain labelled in evidence.

- [x] Write native RED cases for marker/scope rejection, preserved state on disconnect/reconnect, actual guarded signature followed by full delivery, and changed peer consent/reserve rejection.
- [x] Implement dedicated retained adapter over existing PACT services, with exact source/nonce/identity checks and no destructive fallback.
- [x] Verify paired PACT/Fleet suites and commit only GREEN source. Four KQ1 plus ten retained negotiation-world integration tests; nine Fleet paired controller/skill checks;415PACT unit; type/style/contracts/boundaries and controller compilation pass. Initial invalid1440-minute expiry repaired to the published60-minute maximum; later reuse at32minutes remains in-window. Stale withdrawn-offer rejection is a native exception, retained as such.

## Task3 — Owned KQ1 host, operator and full fake acceptance

**Files:** `scripts/lib/specialist-owned-run.ts`, `scripts/qualify-specialists.ts`, `tests/integration/specialist-owned-run.test.ts`, private operator preparation and public result report.
**Interfaces:** strict prepared manifest and actual native ledger/nonces; fixed Windows provider; response review after settlement; atomic batch close and normal park. Reuse artifact/ACL/route/backup checks without arbitrary code paths or environment-selected adapters.

- [ ] Write native RED cases for four turns/role maximum, exact parent work limits, zero-call reuse retained across waits, critical stop before sibling call/action, unknown usage and grant replay.
- [ ] Implement bounded retained host/CLI, authenticated before/after restore, manifest/preflight and separately bound exact KQ1 grant under the existing founder approval.
- [ ] Run all eight fake cases with actual native handlers and full source checks; freeze/pin KQ1 before model inspection. Execute the diagnostic only after its prerequisites pass, review every response inline and retain all failed/unstarted cases.
- [ ] Park/verify restore, publish honest complete-cost/outcome report and commit verified changes. Real E4 remains a separate same-frozen-artifact task; neither result repairs failed E3. Candidate acceptance/activation stays closed.
