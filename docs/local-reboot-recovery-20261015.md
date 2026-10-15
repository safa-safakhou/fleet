# Local reboot recovery — 15 October 2026

Founder reported a full computer restart and explicitly requested running the existing local cohorts again. This is recovery of the same twenty accounts, not a new experiment. Server50 was inspected but not restarted or changed; historical Windows/Mac/terminal populations remain untouched.

## Failure and restoration

Local failures began at 21:10:35 Berlin; WSL booted at 21:11:41. Both cohorts retained running intent but all twenty agents became `needs_owner`: nineteen `TRANSPORT_UNCERTAIN`, one `WORKER_EXPIRED`. No pending game command existed. Windows had no Ollama process or port11434 listener and WSL model connectivity timed out.

Started the existing Windows Ollama0.35.1 executable hidden with its previous process settings (`OLLAMA_HOST=0.0.0.0:11434`, `OLLAMA_VULKAN=true`), confirmed from its earlier server log. Its original Nemotron4B digest remains `6cc467f054393a55e98a74098abde0c762ffb6d1d8cd64becf30458f38886197`. No download, model/configuration change or extra inference probe was used; version/tags checks preceded ordinary scheduled acceptance.

The reboot also exposed a missing helper artifact: local release243d9e4, extracted from the Docker image during the earlier upgrade, did not contain `laya-service/`. The existing helper service consequently failed to restart. Restored its ten files from the previous9fe70e2 installation after byte equality checks against the current Fleet source. The Node application release, launcher, service definitions, model checkpoint and acceptance certificate are unchanged. Restarted only the helper; its loopback8832 health returned the pinned runtime0.4.6, checkpoint revision and original certificate `375c09206bddc4bcb4550199398fbfb96caa6602ff27e9a36bee2f8c1c8a0edc`. The container artifact itself remains unchanged; future local image extraction must explicitly retain this separately installed helper.

## Scoped review and preservation

Protected pre-review database/configuration backup is encrypted in the existing local restic repository, snapshot `5112c4cc2fc376233cd99a2cb7678d67ef94500875e16fdae96b1a7d64bc0c52`. A fresh dump readback from that snapshot matched SHA256 `edef2591ec82efb4833414feed5e5f944667d980e0b0e8262443477ad6d3efc8`. Never restore it over later commands, usage or rotated credentials.

Temporary supported maintenance holds prevented new dispatch while each of the twenty exact interrupted turns was inspected and reviewed through `Store.reviewTurn`. Each has exactly one review audit. Only the supported recovery state changes to `cancelled`; original code, timestamps, calls, unknown flag and all other turn fields remain identical. All pre-existing ledger rows match exactly, including twenty unknown40000 allocations (800000 allocated tokens, not measured consumption). Accounts, kingdom bindings, strategy, credential material and all other agent fields were preserved at the review boundary except supported eligibility state/reason/fence and next due time.

Both cohorts remain running generation18 with their original `2026-10-14T14:39:05.532Z` five-minute anchor. Next due times advance to future slots on their original ordinal phase; no missed-slot catch-up or uncertain action replay occurs. A first preservation assertion incorrectly expected overdue `next_due_at` values to stay identical; verification was corrected to the documented supported future-slot behavior. No review was repeated. Laya's first immediate health request also preceded initialization; its later healthy readback was required before release.

Maintenance holds were released at **22:17:13 Berlin** after model identity, helper certificate, twenty ready agents and preservation checks passed. Acceptance uses existing scheduled turns, requiring every original agent to finish a turn with reported model usage and no pending command/new unknown state. Readiness or `WAIT` alone is not strategic-success evidence.

## Acceptance

Verified at **22:22:22 Berlin**: all **20/20 original agents** completed at least one ordinary scheduled turn after release, each with reported model usage, no pending command and no new unknown usage. Both cohorts have all ten agents ready; worker dispatch is ready with a fresh heartbeat. Existing scheduled execution continues.

Final preservation readback matched **all8049 pre-recovery ledger rows**, all twenty reviewed turn contents except the supported state transition, original identities and complete cohort configurations. The twenty historical unknown allocations remain exactly800000 tokens allocated, with actual usage unknown. All maintenance holds are released. Helper health still returns its original certificate.

Protected exact per-agent turn IDs/times/codes, review events and backup/restoration proofs are under `/home/mnim/.local/share/local-reboot-recovery-20261015`. Raw runtime state, grants and correspondence are excluded from Git. Validation: fresh twenty-agent scheduled coverage, model version/digest and helper health, preservation assertions, PACT canonical backlog check (181 tickets/37 release criteria/six views) and both repositories' `git diff --check`. No application source changed; no extra provider experiment or application regression run was necessary for this operational recovery. These observations establish execution recovery, not improved strategic quality. The first reported turn per agent contained ten cognition waits; LLM-only had four `INVALID_MODEL_OUTPUT`, three waits and three observed-building-busy results. These twenty turns recorded zero committed actions; reported usage and restored eligibility do not mean every model answer was valid.

## Restart procedure

Windows Ollama must be available before local work can proceed; the WSL keepalive does not by itself launch Windows Ollama. This recovery did not add a Windows autostart task or alter sleep/power policy. After a future reboot, inspect model connectivity and the helper health, then inspect exact interrupted executions. New unknown usage needs its own scoped owner review; retain allocations/history and reconcile any original pending receipt before resuming. Do not blanket-clear recovery gates or restart terminal populations.
