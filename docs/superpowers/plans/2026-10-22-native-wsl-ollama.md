# Native WSL Ollama Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user explicitly prohibits delegation.

**Goal:** Replace the ordinary Windows Ollama route with native WSL Ollama, retain all ten models and rollback files, and verify Fleet's direct connection.

**Architecture:** Install the pinned Linux Ollama 0.35.1 release under the Linux user's private application directory. A user systemd service serves only loopback; the existing empty, live-disabled Fleet instance connects directly. Windows is stopped before Linux starts.

**Tech Stack:** WSL2, NVIDIA CUDA passthrough, Ollama 0.35.1, user systemd, existing Fleet TypeScript HTTP adapter.

**Spec:** The native migration plan approved in the current chat on 22 October 2026. This document records that approved design; no additional approval round is required.

## Global Constraints

- Work inline on the normal master repositories; no delegation or separate checkout.
- Copy all model manifests/blobs and independently verify every destination digest. Retain Windows originals and private configuration snapshots for rollback.
- Preserve existing game identities, databases, paused worlds, unknown allocations, grants and terminal studies. Frozen E4/KQ1 routes are not migrated or retried.
- Change only the ordinary empty-instance Fleet provider route; keep live execution disabled.
- No simultaneous Windows/Linux provider servers, model upgrades, downloads of replacement weights, game runs or automatic inference.
- Verification allows one fresh synthetic model request, at most 128 output tokens, no retries/helpers, with a 15-minute absolute cutoff and native usage accounting. It is not qualification or an existing-study continuation.
- Credentials, raw process commands, environment snapshots, traces and migration evidence stay private outside Git.

## Review Focus

- Changed source manifests/blobs: detect source drift and refuse cutover.
- Wrong release/archive contents: verify official asset SHA-256 and installed version before start.
- Active Windows requests or an unrelated listener: positively identify targets, drain rather than interrupt, refuse unknown ownership.
- Fleet restart drift: preserve all environment fields except the provider endpoint and verify normal restart uses the direct route without recreating the bridge.
- Partial failure: retain copies and exact rollback settings; never silently restart the Windows provider or retry inference.

### Task 1: Stage and verify the Linux runtime and complete model library

- [x] Save private source inventory, model metadata and Windows process/startup snapshots.
- [x] Download the official Linux amd64 0.35.1 archive; verify its published SHA-256 and safe archive layout.
- [x] Copy the complete model store into Linux storage and hash every source and destination file; verify manifest references and source stability.
- [x] Install a disabled user service and verify the binary version without starting a server.

### Task 2: Cut over the ordinary provider and empty Fleet instance

- [x] Positively identify Windows Ollama, confirm requests drained and preserve its startup configuration.
- [x] Stop only the identified Windows provider/application; disable only its automatic startup and confirm its listener closed.
- [x] Start the Linux user service on 127.0.0.1:11434; verify version, ten model names/digests and process ownership.
- [x] Back up the empty-instance provider settings/restart helper; change only its endpoint and bridge-specific startup logic.
- [x] Restart only its two Fleet processes, retire its positively identified bridge, and verify health, live-disabled state and idempotent direct-route restart.

### Task 3: Verify and record acceptance

- [x] Make one bounded synthetic request through Fleet's HTTP adapter; retain native token usage and GPU residency/load evidence privately, with no game/database access.
- [x] Confirm service restart and model inventory without further inference; preserve rollback evidence and Windows files.
- [x] Update the paired current-state documents and migration report, check links/content and git diff --check, and review changes inline.

## Execution decisions

- The approved native user-service installation avoids requiring sudo; systemd user services are already available.
- This operational task uses direct acceptance checks rather than introducing tests that mirror one-off configuration edits.
- Existing no-start instructions are superseded only for this explicitly approved replacement provider. Historical denials and study grants remain unchanged.

## Progress

Completed and verified inline: all ten models copied and hashed, Windows provider/startup stopped with rollback retained, native user service and direct Fleet route accepted, one GPU-backed response (52 input / 19 output tokens), successful native service restart and two idempotent application checks. No game activation or historical-study retry occurred. The [migration report](../../native-wsl-ollama-migration-20261022.md) owns the results; private operational evidence remains outside Git.
