# Autonomous specialist implementation — 21 October 2026

Founder requested continuous inline implementation and isolated verification of the remaining approved plan. Existing `codex/two-kingdom-offline` paired worktrees are retained. No deployment, retained-world change or real inference follows from source implementation. Behavioral experiment gates remain distinct from software checks.

## F07 — exact-version console

The Profiles screen now includes the common launch wizard: exact version, preset/configuration, existing account roster, existing model/allowance controls, readiness and an explicit start. Drafts can be resumed by ID/digest and edited with compare-and-swap. Editing invalidates readiness. The old comparison screen remains, with exact-version selection and manifest-derived event support.

Bounded object/string/number/enum/boolean/array configuration fields reject unsupported schema vocabulary with a precise error. No remote schema loading or guessed widget is used. Existing account connection/provisioning remains in Fleet settings. Saving or connecting accounts never starts execution.

Verification: new missing-module RED, then 10/10 focused UI/controller/handler checks; existing launch suite 9/9. Full unit suite 436/436, TypeScript, changed-file Biome, build and import boundaries pass. Authenticated Fastify injection covers edit/resume/start, stale digest, disabled execution, missing provider and absent accounts. Static fixture rendering is verified; browser interaction has not yet been certified.

Ruling: keep the existing authenticated account provisioning and model controls, and select complete existing cohort rosters as required by F03; do not create a second enrollment or credential path. Cost if wrong: account setup remains a separate Fleet settings operation.

## F08 — authenticated CLI

The `fleet` package entry uses the same HTTP launch service as the console. Commands list architectures, check JSON launch files, save inactive drafts and explicitly start a draft with its expected digest. Draft/start accept a caller-persisted request ID for idempotent retries. Exit codes: 0 success, 2 invalid input, 3 not ready, 1 transport/authentication failures.

Login reads the operator secret from hidden terminal input or stdin, never a command-line flag. Optional `--session-file` storage is origin-bound and written atomically with mode0600; symlinks, foreign ownership and group/other access are rejected on POSIX. Windows file-mode semantics do not certify an ACL boundary: use a private user-owned directory. Cookies and CSRF remain private; redirects are refused and errors emit bounded codes. Logout removes local session material even if the request fails.

Verification: missing-module RED→GREEN; six new unit/integration checks plus existing launch9/9; fullunit439/439, type/style/build/boundaries pass. Integration uses Fastify injection and a fake board; no real login, provider or game connection occurs. Offline lockfile update reports zero vulnerabilities in120 installed packages.

## Remaining

A01 source verification is complete: five new scoped-state tests,16 existing continuity checks, four architecture parity checks and seeded multi-engine preservation pass; fullunit439/439, type/style/build/boundaries pass. Migration024 is additive because023 already belongs to the packing candidate. Private state has scope-bound encryption, immutable charters/rosters, version checks, operation deduplication, bounded goals and terminal history. Source deletion immediately clears derived state; expiry withholds private content and bounded maintenance redacts it. Unsupported message/delivery/intent effects reject the whole envelope until their owning tasks are implemented.

A02 is verified: four new transaction/deduplication/gap tests and13 original reactive checks pass; fullunit439/439, type/style/build/boundaries pass. Recipient deliveries have their own keys and participant task metadata; original task-source behavior is unchanged. Cursor, receipt, all deliveries and task changes commit in the same transaction. Opaque concern keys are hashed without changing original source IDs/times. A registered pure routing hook permits pre-inference fan-out without constructing an operation or exposing concrete services. The original engines have no such hook and retain their compatibility lane. Migration025 stages addressed outbox/wake storage for A03.

A03–A08, K01–K07 and X01/X02 remain open. E1 operational preparation and E1–E4 behavioral gates remain separate. No production-readiness claim is made by this interim report.
