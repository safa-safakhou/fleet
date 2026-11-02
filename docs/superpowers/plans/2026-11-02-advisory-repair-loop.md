# Advisory contract and iterative live verification plan

> Execute inline using systematic-debugging, test-driven-development and executing-plans. The owner now explicitly authorizes investigation, fixes and fresh retries after validated fixes. Preserve all failed tasks/worlds/unknown allocations; no replay, reset or push.

**Goal:** Resolve each encountered failure and complete the bounded one-hour local Nemotron advisory experiment with honest native usage, full evidence and verified closure.

**Architecture:** Retain native authorization and the existing 24,000-byte model context builder. For a one-step advisory recipe, supply a host-built terminal-decision schema and explicit role/step instructions: advisory/wait only, bounded text, exact delivered source references and empty non-action preconditions. Both TypeScript and Python workers receive and validate that contract; multi-step/actor capabilities remain available through their existing paths. A model that ignores the contract still fails without side effects or hidden repair. Fresh attempts have new identities, manifests, namespaces and absolute windows; operators continue only after diagnosis and tests for a material fix.

**Tech stack:** Existing Node26/TypeScript/Zod/Ajv/Protobuf and Python3.12/Pydantic AI; pinned tools, local Ollama Nemotron4B, PostgreSQL17 and Temporal. No new library needed.

**Evidence:** [Previous retry and exact refusal](../../research/nemotron-advisory-retry-20261102.md). The actual response chose an invented tool, source references and clock. The generic free-text proposal schema and prompt failed to represent the sealed role and final-step constraints. An unsupported read would also exhaust a one-step worker even if its name were valid. This identifies interface defects, not the model's internal rationale or universal correctness.

## Constraints

Keep input24,000 bytes, output512 tokens, provider context32,768, calls<=2 / reserved tokens<=80,000 per attempt, concurrency1 and zero gameplay-command authority. Retain full raw/view/request/response/effect evidence, exact settlement, consent/quota/retention/integrity, source freshness and all stop conditions. No provider/model fallback or automatic qualification override; historical accepted performance variance stays separate. No real calls in tests. Never clear unknown usage or reconcile uncertain historical tasks to keep a test running.

## Tasks

- [ ] Reproduce the role/final-step/output-reference failures in synthetic contract and worker tests; include valid advisory/wait, forbidden read/action, invented references, empty references, nonempty preconditions, excessive text, zero hidden retries and ordinary multi-step behavior.
- [ ] Implement the one-step advisory contract in `src/research/recipes/advisory-contract.ts`, runtime role guidance and TypeScript worker validation; add an optional generated worker-input contract field and equivalent strict Python handling. Regenerate bindings from source and verify both workers through native owned fixtures.
- [ ] Run affected units, Python/conformance/native broker/evidence integrations, types/style/build/boundaries/contracts and full root units where appropriate. Verify packet fit including the new schema, required evidence refusal and fake-provider invalid output settlement; commit the fix.
- [ ] Prepare reusable private operator scripts with a dry-run seal before task creation; validate source/build digests, controller queries, absolute activation clocks, watchdog and read-only inspection. Keep every setup refusal separately recorded without moving consumed deadlines or modifying historical tasks.
- [ ] Launch a fresh finite one-hour attempt on an isolated world/namespace with the validated source and actual full-packet preflight. Inspect first native turn and the entire window. After any failure: close/preserve, diagnose from encrypted traces, add a regression and commit a verified targeted fix before another fresh attempt. Stop on unresolved uncertainty, preservation failure or genuinely missing owner information.
- [ ] At successful completion verify the full hour, useful advisory output, native usage, no forbidden effects, full evidence integrity/coverage, restored data and original-service preservation; render actual timeline/context/causal views, commit accurate results and report remaining limitations.

## Review focus

- Untrusted or ignored output schemas must not turn invented tools, references or preconditions into native authority.
- Empty source sets, repeated/long references and mandatory byte overhead must refuse honestly without truncating facts or increasing limits.
- Native model reservations settle even when a response later fails worker validation; no hidden retries or successful-state relabeling.
- Python protocol additions are optional and generated; existing deliberative/multi-step behavior and checkpoints keep their semantics.
- Retry authorization means a fresh bounded experiment after a validated fix, never a replay/unknown-usage refund; one success does not certify all agents or games.
