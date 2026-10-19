# Cognition diagnostics implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Inline execution only; founder prohibits delegation.

**Goal:** Test matched longitudinal memory behavior and controlled Laya recall within the newly approved caps.
**Architecture:** A fresh, private, exclusively-created hash-chained diagnostic journal reserves every invocation before dispatch, encrypts request/response details, and fences both modes on uncertainty. Synthetic fixtures use the actual unchanged engines and persistent same-identity cognition across three turns, with commands withheld. No existing qualification grant is reopened.
**Tech Stack:** Node24/TypeScript, existing PostgreSQL fixture5436, Ollama0.35.1 and unchanged certified Laya0.4.6.
**Spec:** docs/cognition-recall-investigation-20261019.md, proposed diagnostic protocol; founder approved19October.

## Global constraints

64 Nemotron calls /2560000 reserved tokens;32/1280000 per mode;16/640000 per profile/mode;2 calls per logical turn. 160 helper invocations:96 standalone (88 planned +8 known pre-dispatch failure retries only),64 embedded (4/legacy turn). All attempts count. Existing40000 reservation,24000 input bytes,2000 output tokens,90s call/120s turn. Serial, source-pinned, maximum2h wall-clock window. Preserve410 earlier calls/allocations, all old grants/reviews/history and installed disabled953034e. No server/game traffic, real accounts, installation, push, shadow/population, threshold changes or uncertain replay.

## Review focus

- Crash after reservation: unfinished journal entry is uncertainty; no resume/regrant.
- Helper abstention: retain raw score/certificate; never retry legitimate abstention.
- Temporal identity: later turn uses same actor/binding and retained owned evidence; game-time advances independently from real deadlines.
- Budget exhaustion/unknown: swallowed helper errors still stop later model/helper dispatch through shared journal fence.
- Elicitation versus spontaneous choice: controls explicitly request memory; ordinary episodes never require it; source ownership is distinct from semantic fidelity/usefulness.

### Task1: Preserving diagnostic journal and metered ports

**Files:** src/cognition-diagnostic-journal.ts; tests/unit/cognition-diagnostic-journal.test.ts.
**Interfaces:** DiagnosticJournal.create(path,approval,vault,clock); model(provider,scope); recall(endpoint,scope); summary(); close(). Scope includes mode/profile/logical-turn or standalone arm/order/expected.
- [ ] Write failing tests for exclusive creation,64/32/16/2 model caps,160/96/64/4 helper caps, deadlines/source scope, raw abstention capture, encrypted chain and unknown cross-mode stop.
- [ ] Run focused unit tests RED; implement minimal journal with fsync reservations, strict approval and no resume; run GREEN.
- [ ] Commit verified journal.

### Task2: Matched longitudinal fixtures and controlled helper suite

**Files:** src/games/pact/cognition-diagnostics.ts; src/cognition-diagnostic-cases.ts; tests/integration/cognition-diagnostics.test.ts; tests/unit/cognition-diagnostic-cases.test.ts.
**Interfaces:** createDiagnosticEpisode(store,profile,thinking,scenario,deadline); run(turn,model,recall) -> identity/turn/persistence result. buildRecallCases(frozen,savedPairs) ->88 labelled invocations.
- [ ] Write/run failing tests for same-identity three-turn delivery, no-evidence control, withheld commands, matched semantic histories,32 frozen/48 paired/8 negative cases and exact order inversion.
- [ ] Implement fixtures using real legacy/continuity engines, only synthetic observations and isolated scheduling; helper suite validates lengths/ASCII and source-preserving compact arms.
- [ ] Run focused integration/unit GREEN and commit.

### Task3: Source-pinned CLI, offline gates and bounded execution

**Files:** scripts/diagnose-cognition-local.ts; docs/cognition-diagnostics-20261019.md; AGENTS.md.
**Interfaces:** CLI review-only default, --execute-approved requires clean exact source, private journal/key/evidence, fixture5436 only and metadata pins. No warmup/canary inference.
- [ ] Test runner with fake model/helper; run full unit/integration/paired/helper-stub/check/build/boundary/audit gates; self-review without delegation, commit source.
- [ ] Capture installed38-table and all historical qualification/cognition baselines; create fresh exact approval/journal; metadata-only preflight.
- [ ] Run32 logical model turns and88 standalone helper cases serially within caps; retain failures and raw evidence; stop on new uncertainty, pending/scope/deadline/exhaustion.
- [ ] Audit persistence/source fidelity/later delivery and Laya arms separately; encrypted authenticated archive and preserved history proof; pause new synthetic fixtures; stop only owned provider/databases.
- [ ] Record actual results/usage/limitations, verify final diff and local commits. No deployment or activation.
