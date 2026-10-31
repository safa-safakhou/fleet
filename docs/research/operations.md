# Research operations gates

Source qualification does not select or modify an installed deployment. Retained worlds, identities, pending commands, unknown allocations, grants, budgets, queues, schedule anchors and terminal states remain preserved. Historical grants are not reusable activation authority.

## Installation gate

Before any installation action, obtain a covering assignment naming the target host/release digest/world incarnation and intended read-only or execution scope. Record exact Node/npm/Python/service/extension versions, Fleet versus Temporal database roles, owned evidence/backup volumes, private env/key references, TLS/ingress and network policies. All credentials are references in the reviewed manifest, never values in Git or copied logs. Missing values block installation; they have no guessed defaults.

Apply additive migrations only under that assignment, with a verified pre-change paired backup and disabled execution. `node dist/server/research/package.js` is the compiled inspection entry point; it requires the normal private configuration plus an owner-only encrypted key-proof file and checks the pgvector extension by default. The key proof is a Vault-encrypted `{schemaVersion:"fleet.package-key/v1"}` under binding `fleet.research.package-key/v1`; generate it using the selected vault key in an owned private process. Never print the key or proof configuration. `/health` reports execution disabled; `/research/ready` reports explicit schema/key/extension reasons without enabling execution. Missing/wrong keys or extension fail readiness.

Use the target's reviewed private invocations to start inspection and authenticate a read-only source/receipt view. Do not start `worker.js` or a Temporal worker as a readiness shortcut. Verify paused/terminal states and exact original pending/unknown identities before/after startup and restart. Run target-specific SQL+chunk restore and role/egress tests before recording installation acceptance.

## Backup, restore and rollback

Stop/fence new dispatch using the existing authorized controller/run-window mechanism, then drain or retain unresolved obligations. Do not cancel, replay, clear unknown usage or reconcile an uncertain command without its own authority. Capture a coherent Fleet SQL backup, encrypted chunk tree, manifest/coverage digests and protected key references; keep Temporal history/persistence as a separately versioned backup. Protect backups as private evidence. Login/session changes must not be mistaken for changed game state.

Restore into a separately owned isolated target, with original vault/artifact keys supplied privately, then compare canonical row counts/hashes, IDs, reservations and chunk/archive integrity. The synthetic `test:research-migration` runner demonstrates the mechanism on77 legacy table projections; it is not permission to run `pg_dump` against retained data. Never overwrite the original world to test recovery.

Forward rollback retains all new records. Binaries predating scheduler-owner filtering are incompatible: they may consume Temporal-owned work. Stop/fence/drain and select the tested current ownership-aware compatibility build; preserve pending command IDs and unknown reservations. Do not drop research tables, downgrade ownership semantics or relabel incomplete evidence to make an old binary boot. Actual target rollback remains an installation gate.

## Later bounded activation record

Every field below is currently **ungranted**, so no activation command is prepared with live defaults:

| Required field | Exact later record |
| --- | --- |
| Target and release | Host/service image digest, source/lock/build digests, world incarnation and paused-state fingerprint. |
| Agent scope | Exact manifest/capability digests, cohort/binding/participant IDs and one scheduler owner. |
| Provider and isolation | Exact provider/model/parameters, schema/tool support, worker image/UID/IPC policy; no fallback. |
| Data consent | Observation consent/version, namespace/index policy and grant refs, retention/disk envelope. |
| Finite resources | Calls/tokens/concurrency/context/output limits, absolute start/end/deadline clocks and accounting acknowledgment. |
| Stop conditions | Hard end time, uncertainty/evidence/lease/quota/error limits and preservation/backup requirements. |
| Permitted commands | Exact installation/activation/stop invocations and identities approved in that later assignment. |
| Behavior design | Preregistered metrics, world/session assignment, independent unit counts, split digests and stopping rule. |

After a bounded run, settle known usage, retain unknown full reservations, reconcile evidence independently and stop within the granted window. Record provider and behavior acceptance separately. No fixture result changes E4/KQ1 or certifies strategic improvement.
