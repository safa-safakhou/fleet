# Durable PACT runtime v1

Temporal ownership is explicit per fresh task. `TemporalTaskOwner.enroll` requires a sealed matching manifest and an unconsumed draft/paused cohort; existing tasks/profiles are never transferred automatically. Platform claims, retry wake promotion and recovery projections exclude Temporal-owned rows. Event intake keeps source identity and deadline while an atomic trigger creates reference-only immutable wake deliveries.

| Owner state | Native evidence | Next action |
| --- | --- | --- |
| ready | No prior unresolved execution | One SQL execution intent and native claim for the wake ID |
| executing | Original native turn retained | Await result; duplicate activity returns projection |
| waiting | Finished native WAIT with event wake | A new immutable wake may admit a new operation |
| awaiting_reconciliation | Missing result, pending command or reserved/unknown allocation | No replacement execution; inspect/reconcile original references |
| completed/cancelled | Recorded terminal native state with no unresolved obligations | Acknowledge old deliveries without starting another workflow |

| Boundary | Retry owner |
| --- | --- |
| Outbox delivery | Retry same delivery UUID; workflow ID `fleet-task/<taskId>` |
| SQL lookup/projection | Idempotent, bounded three activity attempts |
| Agent/model/action execution activity | `maximumAttempts:1`; no workflow retry; ambiguity parks |
| Native command receipt / model usage | Existing accounting and exact original identities; never a new model/game dispatch |
| Pydantic repair | Disabled implicit retries; an explicitly authorized repair needs a new observed step/allocation |

Workflow histories carry UUID/digest/reference data only. Private bodies stay in encrypted kernel artifacts. Native effect journals remain authoritative. A terminal task is a lifecycle result, not a claim of correct gameplay. Deployment-based routing pins each workflow to the runtime version plus manifest digest. Continue-as-new carries a bounded recent wake set; SQL retains the lifetime delivery/step deduplication records so an older repeated wake cannot dispatch again.

Source fixtures use verified Temporal CLI1.9.1 (bundled Server1.32.0), SHA256 `41e0425378fcb4fb5766340b97435e20fe47bbff2d7bf644ec2d51f7662b7c56` for macOS arm64, in an ignored local tool directory, with random loopback ports and disabled UI. The frozen synthetic history records the original workflow version and is replayed without running native effects. The separately pinned Server1.32.1 container remains an installation target, not an assertion that the source fixture installed that service.

The native runtime is disabled unless its explicit Temporal address, namespace and manifest are configured. There is no Temporal-to-platform fallback. Saving or previewing configuration starts no workflow, inference or gameplay. Isolation and cancellation details are extended by R2–R4.

Enrollment also seals the selected binding/task-key route for future source-created tasks. This prevents a completed logical task from accidentally falling back to platform ownership when its next event arrives. It affects only the explicitly enrolled fresh route. A closed execution grant is checked before native admission and parks the request; reopening historical grants is never inferred. Worker registration can briefly precede pinned-version availability at the server: outbox delivery retries the same UUID, never an unversioned workflow. The native CLI archive is checksum-verified; frozen history uses the SDK's canonical ProtoJSON representation.

## Scoped Python worker (R2)

The broker authenticates a short-lived random session token against its persisted hash and exact sealed scope. Each call checks the native claim, epoch, deadline and role again. Worker RPCs cannot supply allocations, usage settlements, receipts, credentials or arbitrary command IDs. Native reservation/command transactions attach their original IDs to the step journal before commit. Repeated requests return the existing recorded result. Unknown results block further steps.

The gRPC transport binds only an absolute Unix socket in a dedicated mode0700 directory (socket0600). The broker and worker must use the same dedicated UID. Messages are bounded, artifact frames are at most1MiB, checkpoints use CAS and validate SQL step references. Private checkpoint and result bodies use encrypted O2 storage. Native provider preparation remains captured by O3. Broker quotas use the sealed manifest; compatibility retention policies retain their first-use behavior.

Python3.12/Pydantic AI2.63.0 uses a custom `Model.request` with native JSON-schema output and an allowlisted read tool. Both output and tool retries are zero. A tool request produces a distinct observed model step on the next request. Unknown usage or invalid output halts. A partial operation cannot restart the entire agent; terminal checkpoints restore without another call. Framework exceptions are suppressed at the process boundary; only a fixed operational failure is exposed.

`runPythonWorker` requires an explicit executor. Native development execution carries **no container isolation certificate**. Container execution requires Linux and an exact local image SHA256; it never falls back. It uses network-none, readonly root and IPC mount, UID10001, dropped capabilities, no-new-privileges, bounded CPU/memory/PIDs and a scratch tmpfs. Only the scoped broker token and operation input travel on stdin. No host credentials or provider/network configuration are inherited.

Synthetic validation: real Python→Protobuf/gRPC→native admission and one allocation per call; direct raw socket/filesystem/privilege probes inside the production Docker envelope. The build used the pinned Python base and hash-locked base dependencies. Runtime image ID for this source checkpoint: `sha256:ebd785cc50c406848afbb9c38d722faa50de798888d2384e9066be454c5ea21d`. Later source changes require a new build and digest. macOS native UDS validation and Linux container isolation are separate fixtures; a deployed broker/container IPC installation is not certified by them.

Migration049 owns worker sessions/checkpoints. Still-unimplemented memory/evaluation/qualification plans now reserve050–053, avoiding migration-number collisions.
