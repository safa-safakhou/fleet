# Codex Terra fresh one-hour comparison

> Execution: inline, following the owner's explicit request. No delegation, GUI, old-world reset, or E4/KQ1 execution.

**Goal:** Run the same 24-kingdom/eight-architecture baseline for one hour with Codex GPT-6.1 Terra and at least 256K model context, then pause and report measured results.

**Architecture:** Reuse Fleet's subscription Codex adapter and native PACT handlers. Add architecture-specific response validation, explicit Codex context selection, opt-in larger request/accounting bounds, and a fresh Codex one-hour operator profile. Preserve the existing serialized subscription pool, native guards, deadlines, usage holds, and all old model settings.

**Tech stack:** Existing Node 24/TypeScript/PostgreSQL 17; installed native Codex CLI. No new package dependencies.

**Spec:** The owner's current request: fresh world, same comparison population, Codex provider, GPT-Terra, context at least roughly 256K, one-hour observation.

## Constraints and decisions

- Exact selected model: `gpt-6.1-terra`. Installed catalog advertises 500000 context tokens with a 95% effective-context margin; explicitly select 500000, rather than assuming the API's advertised maximum applies to Codex.
- Reasoning effort medium; desired output 8192 tokens. Codex output allowance is not a hard provider-side cap.
- New run only: 1048576 input bytes; conservative per-execution reservation 1200000 tokens; 500 executions/600000000 reserved tokens per kingdom. The byte-based conservative packer and CLI aggregate accounting are separate from the model context window. Do not inflate prompts to fill the window.
- One shared subscription execution at a time. Report queueing and the changed throughput boundary; do not claim a controlled model-only benchmark.
- Use a private isolated Codex auth home and decision-only process sandbox. No PACT credentials, tools, filesystem access to repositories, or inherited user instructions in model executions.
- Fresh databases/owners/roster, same objectives and 15-minute review schedule. Preserve all previous worlds, allocations and evidence. E4/KQ1 remain frozen.
- The latest request authorizes required preparation/deployment/run, not a new Git push. Keep verified work on master.

## Tasks

- [x] Add failing synthetic Codex process tests for nonlegacy schemas, strict output contracts, context configuration, and retained usage on invalid output. Implement using the existing schema/evidence validators; retain legacy cognition compatibility.
- [x] Add opt-in large-context budget validation and tests. Existing ordinary budget bounds remain unchanged without the explicit context/accounting opt-in.
- [x] Add a fresh Codex one-hour operator profile and ownership tests. Branch provider readiness/telemetry cleanly; do not weaken the Nemotron profile or touch historical windows.
- [x] Run focused process/budget/ownership and composed architecture checks, full units, types/build/boundaries. Verify installed CLI and private login, then one bounded game-free Terra contract probe; stop preparation if it fails.
- [x] Create and verify a separate fresh world, baseline backup, frozen deployed artifacts, and fresh clock evidence. Start the one-hour run; observe without changing behavior mid-run.
- [x] Drain, pause, verify owned processes stopped and all accounting/commands preserved, restore-check snapshots, and write aggregate results with source-versus-live limitations.

## Review focus

Schema failures must retain completed usage; absent usage remains unknown. Larger limits require explicit opt-in, never implicit changes to old cohorts. All eight architecture contracts must pass the Codex adapter. Context metadata must describe the actual selected Codex window. Shutdown must wait for or bound owned CLI process groups without affecting the user's interactive Codex session.

## Actual outcome

The fresh world completed its hour and is paused; the model-active objective remains **partially fulfilled**. Native Codex quota exhaustion stopped successful inference after about 24 minutes. Further dispatch stopped, 14 unknown usage reservations remain preserved, and final restore/process checks passed. See [the actual results](../../codex-terra-hour-run-20261027.md). No automatic rerun, account switch, quota reset or hold clearing occurred.
