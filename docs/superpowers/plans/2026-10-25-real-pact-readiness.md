# Real PACT coordinator, supervision and bounded canary implementation plan

> Execute inline using executing-plans and test-driven-development. The user approved these three deliverables; no delegation, GUI or 24-hour activation. E4/KQ1 remain blocked.

**Goal:** Complete the real coordinator protocol and independently enforced run supervision, then measure a bounded real PACT/Nemotron 4B canary before any 24-hour run.

**Architecture:** PACT's existing authenticated decision-support blueprints and exact action-effects quotes supply the coordination frame. Fleet checks complete claims and uses the same native guarded execution and receipts, without recreating game economics. An independent operator supervisor owns monotonic admission closure, health observations, drain and owned-world parking; durable control evidence prevents automatic relaunch after supervisor restart.

**Tech stack:** Existing Node 24/TypeScript, PostgreSQL 17, pinned vLLM/Nemotron 4B. No new dependency/model/provider fallback.

**Spec:** [Prepared package and concrete remaining tasks](../../fresh-24h-preparation-20261025.md), [coordinator protocol](../../specialist-coordinator-20261017.md), existing PACT action-effects and authoritative handlers.

## Global constraints and review focus

- Preserve the fresh 24-hour baseline and all retained worlds/allocations/receipts. Use another owned real PACT/Fleet instance for the canary, with normal founding state and fresh credentials.
- No model/network calls inside transactions; no model-provided authority or identifiers. Exact quoted claims and atomic expected revision remain enforced at native commit.
- Missing/truncated/mixed-revision quotes fail closed. Message promise keys bound to a native command UUID need an explicit, checked protocol translation. Read-lease establishment must precede the quoted revision; never renew/reacquire after a stale proposal to conceal it.
- Run-window closure denies fresh dispatch; already dispatched usage/receipts settle. Unknowns retain full reservations and exact IDs. No automatic replay, reset or recovery approval.
- Canary: one attempt, at most **144 model calls**, at most **15 minutes** of admissions, stop on first failed turn, unknown usage/action delivery, lost lease or health/control failure. Bounded metered correction inside a turn is allowed; no automatic canary rerun. Cover all eight architectures and real periodic/event-triggered interactions where reachable, reporting unexercised paths honestly.
- The 24-hour prepared world stays paused and game-disabled. Only the canary instance may enable external Fleet gameplay for this assignment. PACT built-in model calls stay off. No 24-hour start.

## Task 1 — Real coordinator adapter

- [x] Add failing tests for default-disabled capability; complete native claims; mixed revisions/forged claims/expiry; atomic stale refusal and one lease acquisition.
- [x] Add `src/games/pact/coordination.ts`, opt-in configuration/composition and adapter frame/validation/commit integration. Source options from `pact_decision_support_v2`, not invented costs; narrow worker generation to quoted choices without granting permission.
- [x] Run unit/owned fake integration and applicable paired native-guard tests, types/build/boundaries. Keep ordinary adapter behavior unchanged without the explicit protocol flag.

## Task 2 — Independent observer/cutoff supervisor

- [x] Add failing fake-clock/fake-port tests for exact cutoff, monotonic/wall drift, process/clock restarts, unhealthy services, unknowns, exhausted admission and stuck drain; verify preservation of original commands/reservations.
- [x] Implement small reusable supervision policy and owned local-world operator entrypoint. Persist start/control identity before dispatch; never extend a window on restart. Close admissions first, drain boundedly, pause only owned cohorts/world, stop owned processes after identity checks; snapshot and isolated restore.
- [x] Verify with scripted providers and a clock-only process rehearsal; support approved 15-minute canary and 24-hour durations explicitly.

## Task 3 — Bounded real-workflow canary and final package

- [x] Finish all offline gates before provider/model work. Create separate owned real databases/24 actors, source/model pins and encrypted baseline. Keep the 24-hour baseline untouched.
- [x] Obtain a fresh Windows-referenced clock control, start isolated pinned Nemotron/vLLM with cache metadata, verify actual topology/instance and four-slot admission.
- [x] Run the single bounded canary under the supervisor using real PACT adapters, native receipts and actual Nemotron decisions. Measure dispatches/tokens/corrections/outcomes/event wakes/queue/latency/resources/clock/unknowns; do not equate abstention or lack of a peer reply with success.
- [x] Close admissions, settle, park and stop the owned provider/workers. Restore-check final encrypted snapshots. Revalidate all 24-hour launch drafts and stage the completed activation package if all required gates pass; otherwise preserve the blocked package with exact remaining causes.

No commit or push is requested. Record actual verification and operational results in both repositories' current-state checkpoints.

## Outcome

Implementation and the single bounded canary attempt are complete; qualification failed, so no ready activation package or 24-hour start was produced. See [actual results and remaining gates](../../real-pact-canary-20261025.md). Three real completions, zero completed workflows; final encrypted restore passed 167 PACT / 77 Fleet tables. Metadata/admission/preparation repairs pass offline afterward; no successor model trial. All 24 baseline launch drafts now validate, with execution disabled and package explicitly blocked. A fresh canary and final installed-runtime/clock/provider checks plus approval remain.
