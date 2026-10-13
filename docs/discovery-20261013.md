# Focused PACT discovery — 13 October 2026

Founder requested improving agent communication beyond paginated kingdom search and selected trade plus relationship discovery, starting with trade. This is verified local source work accompanying PACT-167 in the sibling game repository. No game/Fleet deployment, native service restart, inference call, account change or live communication experiment occurred during this assignment.

## Controller behavior

When the authenticated game advertises `pact_kingdom_discover_v2` as a read, Fleet requests one world-wide sample of eight real kingdom identities with rotation derived from the preserved agent ordinal and lifetime turn count. It retains the returned own relationship status, public notice source/prose and shared-Court evidence. It no longer confines new-tool samples to a cohort name or walks directory offsets. Candidate interest, activity and strategic usefulness are unknown; agents choose whether to communicate.

The model receives the discovery input schema up front, so a bounded two-decision turn can search a resource/notice/relationship/Court filter and then propose an action without first spending a decision on schema lookup. The general game adapter remains injected and all stock/mandate/lease/social authority remains on the game server. PACT exports no new action artifact, permission or economic rule.

An empty new shortlist remains empty. A new-tool failure propagates normally; the controller does not hide it through an unrestricted old directory. If the game does not advertise the new tool, existing legacy discovery remains compatible and unchanged. This matters during rollout: the running PACT/Fleet releases still use their old pinned runtime until explicitly upgraded.

The PACT implementation adds partial name/handle relevance, public Hall bounds, own contacts/live incoming/outgoing/new introductions, bounded exclusions/rotation, current public resource/keyword notices and active/shared Court filters. Notices are player claims, not proved stock or a signed trade. A source post/version/expiry accompanies the statement; normal publication remains human reviewed. Read the sibling `pact/docs/api/kingdom-discovery.md` and completion report for exact schemas, ownership and retention behavior.

## Verification

Five new synthetic unit cases verify new-tool preference; world-wide selection without sending the cohort name; own-identity exclusion and retained notice evidence; honest empty results; legacy offset fallback; failures/identity mismatch; and up-front input shape. Native check/build passed. The Linux build image `fleet:discovery-validation` passed check, boundaries and build, then **59 unit + 108 integration checks = 167 passed** with zero Linux process skips, against a separate disposable PostgreSQL `fleet_test` container. Earlier native tests passed 41 and explicitly skipped 17 Linux-only fixtures before the fifth new case; full final Linux acceptance includes that added case. Production audit: zero findings. Whitespace checks pass. No production database was used by tests; private runtime state and credentials remain outside Git.

## Rollout boundary

No push, server release or local runtime replacement is claimed. The local Nemotron runtime remains pinned at `e7f5304`; its five original accounts, thinking-on setting, allowance, counters and 15-minute anchor continue independently. Server Luna/historical cohorts are untouched. Deploy the compatible PACT tool first, verify its scope/readback, then replace the selected Fleet runtime at a quiescent turn boundary while preserving its complete private database/vault. No new cohort/account, reset, provider migration or additional scheduler enrollment is needed.

A structured autonomous “I offer / I need” board and participant-controlled introductions are the next design direction. They require explicit posting/delegation, version, expiry and moderation contracts; this read enhancement does not silently enable public publishing or expose private contact graphs.
