# RC2 local acceptance — 21 October 2026

This record covers source tests and a passive package. It is not a real-model qualification, operational grant, installation or activation. Work stays inline on the two master checkouts.

## Candidate and evidence boundary

[RC2](superpowers/specs/2026-10-21-RC2-input-cap.md) keeps the pinned full/guarded specialist actor and game source. The changes are 32000 input bytes and, as selected by the user, external reviews every 30 game minutes. The world call ceiling stays 72; provider context/output/wire settings and other ceilings stay fixed. R2-D/H/N have distinct canonical protocols, seeds, configuration digests and grants. R1 and old E-stage grants cannot authorize R2.

RC1's 24000-byte positive fake attempt stalled safely when the complete action packet no longer fit. The original planner and failed evidence remain unchanged. RC2 development is confined to R2-D and mechanism tests; held-out behavioral qualification has not run. E1/E2/E3 remain terminal failures, and real E4/KQ1 remain unrun with ceilings of 144/288 calls respectively and six hours each.

## Local verification

The positive paired test uses four fresh controlled-clock R2-D worlds (C01/C02 and both role orders), four independent solo controls and eight ordinary native participants per treatment world. An authored fake reads only each actor's delivered packet. Discovery, contact, dialogue, offers, counters and signatures pass through normal guarded commands; delivery requires ordinary installments, and later decisions must follow closure for both kingdoms. Fake prose reviews are disclosed authored reviews, never real-model behavioral evidence or R2-N timing acceptance.

Fresh checks passed: Fleet 511 unit tests, PACT 415 unit tests, 17 affected Fleet negotiation/specialist regression tests and 17 affected PACT ownership/world/lifecycle tests. Fleet production build, controller compilation, both type checks, style/lint and boundary checks passed. Production dependency audits found zero vulnerabilities in both repositories. Existing style warnings remain; no manifest or lockfile change was introduced. R2 later-decision latency also has a passing regression: an early decision or absent contract cannot count as a decision after closure. The mirrored R2 planner matches across repositories apart from its local design JSON import.

Final R2-D positive acceptance passed all four assigned worlds: material, dialogue and history checks passed with zero critical failures; each actual contract expired after full delivery in both directions, both kingdoms decided later, all commands committed, input stayed within 32000 bytes and all eight treatment/control clocks were parked. The test retained a prior routine goal and one memory, performed one separately accounted extraction and completed one guarded invocation with a confirmed command in a turn with no model allocation. The fake prioritizes ordinary signing when too little offer validity remains for learning and later reuse. Earlier failed fake attempts remain diagnostic evidence; deduplicated reads do not create learning opportunities and expired offers cannot be signed. No actor rule or ceiling was weakened.

Passive packaging freezes committed harness sources separately from the original actor pins. Its frozen artifact inventory is recorded below.

Twelve additional paired checks passed: eight owned-run failure/accounting/clock tests, two exact-world/checkpoint tests (including serialized R2 reopening and R1 checkpoint refusal), and two specialist learning tests. These demonstrate whole-source extraction, actual prior-goal reuse without inference, full delivery, and refusal of forbidden actions in evidence-only review. The shared host preserves known costs before review, full unknown reservations, exact command identities, lost-lease fences and parked owned clocks. Checkpoint reopening is not an encrypted operational archive/restore proof.

## Policy resolution and remaining operations

The original E4 owned Ollama start and loopback readiness check was denied at **2026-10-21 15:24:57.870 UTC**, with only **“blocked by policy”** as its stated reason. No matching clearance has been established; no retry, alternate provider route or approval-setting change occurred.

The [official denial procedure](https://learn.chatgpt.com/docs/sandboxing/auto-review#denials-and-failure-behavior) documents `/approve` in the originating Codex TUI context. Select that exact denial for one reviewed retry. The platform must supply the narrow approval marker; the retry may still be denied. Desktop support and availability of this older denial are not established. If the action is absent or this desktop session has no supported picker, contact OpenAI support or the managed-policy administrator with the timestamp, denied action and reason, asking for supported resolution in its original context. Chat permission or Full Access does not clear it.

For the desktop support route, use the bottom-right chat bubble at the [OpenAI Help Center](https://help.openai.com/en/articles/6614161-how-can-i-contact-support). A concise request is: “Codex automatic approval review denied an isolated E4 Ollama standby start and loopback readiness check on 21 October 2026 at 15:24:57.870 UTC, reporting only ‘blocked by policy.’ Please provide the supported way to review this exact denial in its originating context from Codex desktop.” This requests review, not guaranteed approval.

After actual resolution, complete the [operational preflight and release gates](negotiation-continuation-20261021.md): positively owned provider/route, exact fresh targets and rosters, encrypted archive and separate logical restore proof, restored-only packaged rehearsal, exact stage grants and UTC cutoffs, real qualification on a separate unseen boundary, and final archive/parking. Only valid qualification permits disabled isolated installation, rollback/restore acceptance and a separately bounded activation. RC2 needs its own operational composition and grants; a passive library package is not a Windows launcher or a release.

The preserved paused world, original services, identities, unknown allocations, private evidence and frozen artifacts are outside these test targets and remain retained.

The separately owned empty local PACT web/API and Fleet console remain available on loopback ports 3410/3411 and 8840. Read-only checks from both Windows and WSL returned HTTP 200 for the web pages and both health endpoints; Fleet reported `liveEnabled: false`. No production activation or real-provider run is implied.

## Frozen passive artifact

Harness source pins: Fleet `60cba14942c2ce8e7dc723d6e18766421a0ed5ce`; PACT `17e2eac8cbd8250e33a623e5c2e60196caa30aaa`. Later report-only commits do not alter these artifact pins. Original actor pins remain Fleet `7ca67b2891c511a33ad129396ac5aaeed1305fb7` / PACT `81007a449aab049bbb0beb9ccef18eca0b6d40aa`; the reviewed actor/game directories have no changes against those pins.

| Inventory | Value |
| --- | --- |
| Files | 14320 |
| bundleDigest | `8cbfeecf61282e41beddbcb96d28c67f0a72d14f6d4790dbe564b5bf98db452b` |
| modelDigest | `d2119dbb017e6ec2383dd7aaa7c5df702dcaecdcce147d7c372172efbcb160e5` |
| policyDigest | `c714cdd06d713dfe66cf161064a8cda9164fc81d5fc1c273168b22fc1df41c10` |
| settingsDigest | `ab079ee96e94820ba8f8b98e7207ecb80961c5e39961eceda013c1f65d016047` |

The builder passed after a minimal copy fix: copy controller-tree entries into the exclusively created output root, preserving refusal of an existing output and its files. The earlier partial artifact was retained. Compilation ran on Linux with pinned Node 24.21.0; the bundled Windows Node is pinned separately. This is a library/composition artifact, not a Windows R2 operational factory or launcher. Private roots, manifests and proof locations remain outside Git.

Windows passive verification passed at **2026-10-21 20:23:53.804 UTC** using the bundled Node **24.19.0**: full file inventory, settings round trip, all metadata digests and the owned RC2 composition import passed. The original KQ1 bundle matched its pre-copy frozen manifest and all file hashes; its bundle digest remains `218801a698939102649d50d18354257e7d20f2061a7559dd137feeeda6c4dcf3`.

The first cold import failed because the verifier inherited the PACT workspace as its working directory. The successful full rerun used the required runtime working directory `<bundle>/fleet`, which resolves packaged vendor files; no artifact or actor source change was needed. The private sidecar proof records zero provider starts, zero real model calls, no installation and no activation. This does not certify an operational provider, a restored-only Windows rehearsal, real qualification or release acceptance.
