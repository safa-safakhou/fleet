# RC2 shared-service qualification — 22 October 2026

Status: R2-D is terminal/unresolved due to review transport; R2-H is terminal/incomplete after an unresolved first-response review. R2-N remains unrun. No production qualification or release acceptance is claimed. The [registration](RC2-shared-service-registration-20261022.md) fixes the unchanged candidate, source pins, quotas and evaluation boundaries.

## Verified preflight

The existing Windows Ollama 0.35.1 executable, all 989 library files, selected model manifest/layers and the full 14320-file controller inventory matched their pins. No server was started or reconfigured. The separately pinned world factory is compiled from frozen PACT source; the controller bundle remains unchanged.

The first restored-only fake rehearsal failed before any allocation because the operator had paused controlled clocks that the runner expects active. Its failed grant, clone and evidence remain retained. Explicit arming affected only the new synthetic controlled clocks through the normal PACT API, with no game-time advancement or clock workers. A new archive/clone supplied a separate rehearsal: all four positive family/role-order worlds passed, including full ordinary deliveries, later decisions, one extraction and one guarded skill invocation. It used 252 simulated calls, not real provider calls; maximum input was 29158 bytes. The original four draft cohorts still had zero turns, allocations or learned skills and unchanged logical fingerprints.

## Terminal R2-D infrastructure failure

The real batch stopped at its first settled response with `ENOTSUP`: Windows hard-link publication is unsupported on the WSL UNC review directory. The review request was not published. A stale pending-review advisory does not mean its timestamp expired; the terminal reason and native ledger are authoritative. There was no timely semantic verdict and no action followed.

- Assigned worlds: 4; first cell failed/unassessable, 3 unstarted. This is not a candidate-quality pass or a behavioral-failure diagnosis.
- Real provider use: 1 call, 40000 reserved tokens, 3862 input + 847 output = 4709 measured tokens; all usage reported, none unknown.
- Game commands: 0. All eight treatment/control clocks are parked; no active turns.
- The final encrypted archive authenticated and restored into a separate clone with matching logical table/sequence fingerprints. Original and three restore containers are stopped with their volumes, keys and evidence retained.
- The consumed grant remains closed. Its unused allowance is forfeited; diagnostics cannot turn this result into a pass.

## Review transport repair and held-out boundary

The same encrypted review module reproduced `ENOTSUP` on the UNC directory and passed on a newly created private native Windows NTFS directory. Successful request/verdict exchange, duplicate-verdict rejection and expired-verdict rejection were tested with synthetic data and zero model calls. Only the new directory received owner/SYSTEM ACLs; old files and unrelated settings were not changed. This is a deployment-location correction, not a weaker atomic-publish fallback or candidate/prompt change.

R2-H was an independent, previously registered absolute qualification stage. The fixed actor was not tuned from the diagnostic response; its 35 held-out cells and 70 treatment/control worlds use fresh identities and canonical stage-specific seeds. No R2-D allowance or pass credit transfers. The held-out stage uses its own exact grant, 1230-call/49200000-reservation/51-hour-15-minute maximum and the unchanged per-world ceilings. Native-clock R2-N remains unstarted and separately gated. E4/KQ1 bindings and their old policy blocker remain unchanged.

The held-out PostgreSQL fixture is newly owned, loopback-only and uses the pinned PostgreSQL 17 image with 400 connection slots for its 70 isolated world schemas. It contains no preserved-world data. New controller state/reviews are on private native Windows storage; database archives remain in protected Linux storage. Every response required inline author review after native settlement and before further action; no automatic semantic pass or model judge was introduced.

Ruling: the administrative development interruption supplies no behavioral verdict. After reproducing and correcting the transport fault, proceed to the already planned unseen held-out stage without changing the candidate or replaying the failed grant. The cost is spending that stage's independent bounded allowance on a candidate whose real development study was unassessable; all denominators and this limitation remain disclosed.

## Terminal R2-H semantic stop

The native Windows request/verdict exchange worked. The first real response selected a read using invented document/request-type fields, asserted peer absence from a partial delivered view, and described that read as a way to signal intent. Its read did not itself claim or execute a supply agreement. The inline author returned `unresolved` before execution, with these recorded reasons:

- `PEER_ABSENCE_NOT_ESTABLISHED_BY_PARTIAL_DELIVERED_VIEW`
- `READ_REQUEST_NOT_TIED_TO_DELIVERED_TOOL`
- `READ_AS_COMMUNICATION_CAPABILITY_UNVERIFIED`

This verdict was posted within the response deadline. The native controller stopped with `RC2_UNRESOLVED_REVIEW`; it did not execute the decision or dispatch another call. This is a terminal incomplete qualification result, not evidence that all 35 cells were behaviorally tested.

- Assigned cells: 35; 0 passed, first cell failed/unassessable, 34 unstarted. The family denominators remain five each. All 35 registered cells are exposed for any subsequent development; do not reuse their held-out boundary.
- Real provider use: 1 reported call, 40000 reserved tokens, 3836 input + 511 output = 4347 measured tokens; no unknown usage.
- Runtime commands/resolutions: 0; one finished turn, none active. All 70 treatment/control clocks are paused. The 105 fixture-setup command receipts match the before-restore baseline; they are not model-issued commands.
- Final encrypted archive authenticated and restored separately with matching logical table/sequence fingerprints. Original, before-restore and after-restore containers are stopped; all volumes, native encrypted reviews/evidence and keys are retained privately.
- The exact H grant is closed and unused allowance forfeited. D/H together used 2 real calls, 80000 reserved tokens and 9056 measured tokens. These are separate from the earlier service smoke and E1–E3 totals.

Post-close checks found the same existing Ollama process and creation time, Ollama version 0.35.1, healthy empty PACT web/API and Fleet, and Fleet `liveEnabled: false`. No additional server, blocked E4 action, preserved-world access, release installation or activation occurred.

## Read-contract diagnosis and next candidate boundary

Source inspection confirms a concrete interface gap in the pinned candidate. The autonomous specialist packet includes action schemas but no read catalog or read-query contract. Its generation schema accepts an arbitrary query record. The PACT session expects an explicit read as `{tool:<advertised read name>,args:<validated arguments>}`; when `tool` is absent it refreshes the default authorized view and ignores the invented query fields. A read cannot deliver an internal message; specialist communication uses the final structured state update. The model was already instructed that reads change no game state and omitted facts remain unavailable. Missing tool guidance therefore does not excuse its peer-absence or communication assertions, establish causation by itself, or reverse the terminal verdict.

Affected modules (current source includes the separate RC3 repair; frozen RC2 remains unchanged): [specialist packet and read dispatch](../src/engines/autonomous-specialists/engine.ts), [open read-query schema](../src/modules/decision-step/v1/engine.ts), [PACT observation handler](../src/environments/pact.ts).

Define the next repaired candidate as **RC3 read-contract repair**, separate from all pinned RC2 artifacts and grants. Its narrow scope is to deliver the environment's actual supported read query shapes and bounded argument-schema access through existing injected environment interfaces, preserve an explicit default refresh, and reject unsupported query fields rather than silently treating them as a useful read. Keep reads observational, retain current authentication/mandates, whole-source coverage, packet/call ceilings and manual semantic review. Do not add negotiation scripts, model judges, provider changes or broader authority. The separate [RC3 local source record](RC3-local-read-repair-20261022.md) documents the implemented repair and its offline verification. It is not a real qualification result or an installed operational package.

Before another real study: complete the separately identified RC3 operational package and restored-only positive rehearsal; pin new source/artifact/settings digests; preregister fresh development, held-out and native-clock boundaries and exact grants; authenticate fresh before/after restores. The current R2 cells and all failed E-stage cells are development-only evidence. No R2 allowance transfers and no existing run may resume. A full positive real development result must precede the next held-out stage. R2-N is not started because H did not qualify. Real E4/KQ1 and isolated release/rollback/activation acceptance remain open gates; their old policy denial and ceilings are unchanged.

[Prior connection check](existing-model-service-readiness.md), [candidate design](superpowers/specs/2026-10-21-RC2-input-cap.md), [remaining qualification/release gates](negotiation-continuation-20261021.md). Private grants, credentials, responses and artifact paths remain outside Git.
