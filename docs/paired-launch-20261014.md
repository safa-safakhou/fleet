# Five-minute paired Fleet launch — 14 October 2026

Founder authorized two new local fleets on this Windows machine: ten fresh PACT accounts per group, Nemotron 4B shared by both, LLM-only versus LLM-centered cognition with Laya recall, starting together. The follow-up explicitly selects **every five minutes until stopped**. Codex owns this assignment without delegation. Existing server/Mac groups and historical experiments retain their identities, histories, runtime releases and schedules.

## Source behavior

The draft/template schema and both interval selectors now accept five minutes. Additive migration `009_five_minute_schedule.sql` expands only the database constraint; it neither rewrites existing rows nor resets schedules. The normal scheduler retains staggering, original anchors, bounded turns/calls, per-owner cooling, lifetime accounting and skipped late slots.

The comparison's authenticated POST `/api/comparisons/:id/start` and **Start both fleets together** button validate and transition both groups in one transaction with the same clock value. Cohort locks are acquired in stable ID order. Incomplete accounts, disabled live execution, missing budgets/model, expired deadlines, pending social setup or terminal state roll back both transitions. Initial launch requires both original anchors to be unset, checked while locked; concurrent launches cannot create two anchors. Normal later pause/resume preserves each original anchor. Both groups share model/thinking, allowance and corresponding strategy preferences; their account-owned cognition remains separate. Laya orders two recall candidates and may abstain; the LLM decides gameplay.

## Verification

- `npm ci`, `npm run check`, `npm run build`, `npm run check:boundaries` and `npm audit --omit=dev` pass; zero production dependency vulnerabilities. Existing lint warnings remain.
- Linux Node 24.12: **105 unit tests pass**. Full PostgreSQL integration suite passes **161 tests**; after adding migration preservation/concurrent start coverage, the focused comparison suite passes **9 tests**, including the eight previously covered cases. Total distinct checks covered: **267 (105 unit +162 integration)**.
- PostgreSQL **17.8** disposable `fleet_test` on loopback 5437 is separate from the new local installation's 5439 database. Fake model/game providers only. The first integration attempt ran before the image download finished and failed with connection refused; after bringing up the isolated database, the complete suite passed. No failed prerequisite is presented as behavioral acceptance.
- New tests cover ten-plus-ten five-minute phase slots, next-cycle admission, incomplete-pair rollback, live gating, concurrent initial launches, original-anchor preservation on resume, repeated migration over the prior constraint with byte-identical existing cohort/agent rows, and origin/CSRF on the paired endpoint.
- `git diff --check` passes. No hosted CI claim or server/Mac deployment is made.

## Operational boundary

This report records source verification before local installation/enrollment. Model/helper download, exact checkpoint certification, twenty-account enrollment, shared launch, private backup and actual scheduled-turn acceptance are recorded separately in `windows-nemotron-comparison-20261014.md` when performed. Installing this source elsewhere does not authorize enrollment or inference.
