# PACT/Fleet continuation gates — 21 October 2026

The platform source is integrated; real qualification and release remain blocked. This continuation defines operational gates and creates no execution grant, installation or activation. The subsequent [RC2 local acceptance record](RC2-local-acceptance-20261021.md) supersedes its earlier source-implementation status. Work is inline on the two main master checkouts.

## Execution-policy investigation

The original automatic-review rejection was located in the local Codex record at **2026-10-21 15:24:57.870 UTC / 17:24:57.870 Europe/Berlin**. It rejected the isolated E4 owned Ollama standby start through `tools.exec_command`, reporting only **“blocked by policy.”** The rejected operation included provider startup and a loopback version readiness check. It was not an inference result or an E4 behavioral attempt.

Targeted inspection of the originating record after that rejection and developer messages in the local 20–21 October records found no matching platform-issued override for that exact denied action. This is a bounded local-record finding, not a query of a platform-wide approval ledger. Neither the current permission profile nor a broad instruction to finish establishes that the old rejection was cleared. No provider start was retried, and no approval or execution setting was changed. Raw records, commands and private paths remain outside Git.

The permitted resolution route is the platform's supported denial review. [Official OpenAI documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review) describes an explicit `/approve` denial picker in the current open-source TUI: an operator selects the exact denied action; the platform records a narrow approval marker for one retry in the same context, and review can still deny it. That documentation does not establish that the desktop client exposes this interface, that this older action remains selectable, or that an approval transfers to another chat. No supported in-chat denial-resolution tool is available here. If the original denial cannot be selected, the operator must obtain resolution through the platform/managed-policy owner; there is no documented automatic clearance to infer.

Before any retry, require a platform-issued resolution that actually covers the denied action and context, plus verification of its exact retained targets. A platform approval does not approve inference or replace a game-stage grant. Do not switch shells, launchers, users, providers, endpoints, chats or KQ1 stages to obtain the denied outcome. Do not disable review or weaken policy. Until resolution is established, both real E4 and KQ1 stay blocked.

## Candidate after E3

[RC1 candidate and separate evaluation boundary](superpowers/specs/2026-10-21-post-E3-candidate-design.md) selects the already implemented specialist source with one explicit full/guarded configuration as a **repair hypothesis**, not a qualified release. Its owned two-model-kingdom composition is now implemented separately from KQ1. RC1's 24000-byte positive fake attempt stalled at the action-context fence; the [separate RC2 candidate](superpowers/specs/2026-10-21-RC2-input-cap.md) increases input to 32000 bytes and uses user-selected 30-minute reviews without raising the call ceiling. Prevention of E3's real-model prose authority failure is unproven. Sealed E3/E4 and passive KQ1 artifacts are unchanged.

E1/E2/E3 remain terminal failures. The complete old E3 registry is treated as development/exposed material for future candidate selection; its 34 unstarted cells are not a replacement held-out set. E4 measures the old frozen candidate and cannot repair that candidate's failed G3 result. KQ1 remains an eight-cell specialist diagnostic with disclosed scripted peers, not proof of autonomous two-sided negotiation. Neither result alone can qualify RC1.

## Operational preflight sequence

These are pending acceptance requirements, not completed checks. Do not create rosters or start retained marker-only storage merely to fill this checklist while the provider policy block is unresolved. Never inspect or connect to the preserved local world or default live routes for these checks.

| Order | Required evidence | Existing implementation/reference |
| --- | --- | --- |
| 1 | Exact action/context policy resolution, retained privately; otherwise stop | Investigation above |
| 2 | Artifact/source/model/settings inventory, private ACLs and real paths; pinned Windows Node, Ollama and all libraries/model bytes; no fallback | [Windows verifier](../scripts/lib/negotiation-windows.ts), [model-store verifier](../scripts/lib/negotiation-model-store.ts) |
| 3 | Positively owned PID, executable, command, isolated model-store root and sole `127.0.0.1:11436` listener; expected version and route | Windows verifier; no substitution of an unrelated existing provider |
| 4 | Exact container ID, loopback ports, fresh `fleet_test`/`pact_test` targets and owner nonce; no retained game schemas/accounts or borrowed live databases | [Preparation](../scripts/lib/negotiation-prepare.ts), [specialist preparation](../scripts/lib/specialist-windows.ts), [target validation](../scripts/lib/negotiation-artifacts.ts) |
| 5 | Stage-specific fresh roster, exact mandates/resource limits, bindings, live lease IDs, zero model allocations, no pending commands and disarmed cohorts/clocks | Stage preparation and normal authoritative PACT handlers |
| 6 | Encrypted authenticated before archive; separate restore clone, logical table/sequence fingerprints, matching sources/protocol/fixture nonce and vault material | [Backup/restore gate](../scripts/lib/negotiation-backup-proof.ts), [backup entrypoint](../scripts/backup-negotiation-fixture.ts) |
| 7 | Restored-only fake preflight of the exact packaged controller, including restart, serialization, review hard stops, leases, accounting and ordinary clock progression | [Native mechanism evidence](negotiation-native-preflight-20261021.md), [specialist source acceptance](specialist-KQ1-source-acceptance-20261021.md); prior fixtures are evidence, not reusable rosters |
| 8 | Original fresh roster still unchanged/draft, clocks parked, zero allocations; protocol and grant validators pass for exact sources, model, settings, identities and fresh nonce | [Negotiation authorization](../src/negotiation-run.ts), [KQ1 authorization](../src/specialist-qualification.ts) |
| 9 | Exact operator-supported one-shot grant, absolute UTC start/cutoff, encrypted evidence/review destinations; launch only within the validated interval | Keep grants, keys, URLs and raw responses private |

If route acceptance or a canary dispatches inference, it requires its own covering exact grant and ledger admission before dispatch; it is not a free preflight call. Do not attach extra calls to E4/KQ1 or consume their roster during a mechanism rehearsal. Clock workers may run only for positively owned fixtures under the applicable preparation scope.

## Frozen outstanding stages

The [blocked launch record](negotiation-blocked-launch-manifest-20261021.json) remains unchanged and non-executable. It retains full exact artifact/model/settings pins. Missing runtime values remain unset; this continuation does not invent them.

| Stage | Frozen arm / fixture | Independent ceiling | Runtime state |
| --- | --- | --- | --- |
| E4 | `reactive-cognition@2`; original Fleet `cc07350496fbc6136eae3054e2386055e6d6d569` / PACT `9d0f480d71cf9f1a7c966117ded039bb35e07d07`; two reversed-role native C01 worlds and separate solo controls; eight accounts/four model actors | 144 calls / 5,760,000 reserved tokens / 6 hours | Marker-only storage retained/stopped; no roster, PID, protocol digest, UTC interval or grant |
| KQ1 | Passive Fleet `7ca67b2891c511a33ad129396ac5aaeed1305fb7` / PACT `81007a449aab049bbb0beb9ccef18eca0b6d40aa`; eight cells, eight fresh model kingdoms/eight disclosed scripted peers | 288 calls / 11,520,000 reserved tokens / 6 hours; 96 role turns, 45 minutes/cell | Passive bundle verified; no operational root/roster, PID, protocol digest, UTC interval or grant |

Both retain 40,000 reservation/call, 24,000 input bytes, 2,000 output tokens, at most three calls/turn, one shared provider slot, zero helpers and zero fallback providers. All corrections, extraction and reflection count. No spare allowance from failed stages transfers. Combined E1–E3 usage remains 14 calls / 560,000 reserved / 71,886 measured tokens.

An exact E4 grant uses `fleet.negotiation-grant.v1`: approval/authorization reference, protocol digest, batch nonce, source/model/policy/settings pins, UTC interval, new-owned-synthetic-world scope and every cell/world/control/cohort/actor/binding/fixture/evidence/key binding. KQ1 uses `fleet.specialist-qualification-grant.v1`: approval/authorization reference, protocol digest, batch nonce, UTC interval, the same scope and exactly eight cell/world/cohort/actor/peer/binding/fixture/evidence/key bindings; its protocol pins the source/model/policy/settings/bundle. A grant must be validated and consumed by its normal durable nonce path. Merely writing `approved: true` is not operator authorization or policy clearance.

After any real dispatch: settle known usage before inline response review; stop the batch on critical or unresolved claims, drift, uncertain commands, unknown usage, privacy or lease failure, duplicate effects or any ceiling/cutoff. Never reacquire a lost lease or retry an uncertain command. Preserve failed/unknown records and full reservations. Park only owned clocks/cohorts, verify no active admissions, retain the positively identified provider's terminal state, then authenticate a final encrypted archive into a separate restore clone and compare logical fingerprints. Keep partial fixtures/evidence on failure; never reset/replay to obtain a pass.

## Release acceptance

No installation or activation is authorized by diagnostic success. Require valid qualification of the selected repaired candidate on its own exact release configuration and unseen evaluation boundary, together with the applicable specialist/skill diagnostic. Source integration and historical E3 failure remain separate facts.

Then prepare a concrete isolated, disabled candidate installation with exact package/configuration digests, owned paths/service names/ports/database/vault, no automatic enrollment and no scheduler/autostart activation. Verify migration only against a fresh candidate database, authenticated backup/restore to a separate clone, disabled restart/health/authentication, isolation from preserved services and a rollback rehearsal. The rollback proof must preserve identities, ledgers, unknown allocations, pending command IDs and matching vault material; an old backup cannot overwrite newer writes. Never run two controllers for the same accounts.

Only after those results can an exact activation package identify its new accounts/mandates/lease IDs, permitted services, bounded allowance and UTC observation window, stop conditions, responsible operator and rollback decision. Actual activation needs covering authorization and a permitted execution route. No public deployment or push follows from this document.

## Earlier documentation-only continuation acceptance

Documentation/content checks passed across the five changed/new documents: 27 local links resolve, the RC1 JSON configuration matches the selected source configuration, old frozen records/ceilings remain unchanged, and text/secret-pattern checks found no copied private paths or credential material. `git diff --check` passed. Review was inline author review, without delegation. Application checks remain the historical results in [current state](current-state.md); no new full-suite, model, runtime-preflight, backup/restore or operational acceptance is claimed. Existing private artifacts, grants, archives, frozen bundles and the paused world are preserved by non-access.
