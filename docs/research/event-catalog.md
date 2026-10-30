# Fleet evidence event catalog v1

The canonical allowlist is `EventKinds` in `src/research/evidence/types.ts`; generated Protobuf describes transport and the JSON adapter preserves decimal sequences. Event IDs are immutable; producer keys deduplicate only within one run/stream. A run ordinal orders committed ingestion for pagination, not causality or physical occurrence. Stream sequences and explicit parents preserve parallel/late behavior. A rolled-back transaction consumes neither counter.

| Family | Events / source boundary |
| --- | --- |
| Lifecycle | run.started/finished, task.received/state, checkpoint.saved; original task/turn/claim references |
| Compute | queue.enter/leave, model.request/dispatched/response/failed, usage.settled/late; original allocation identity |
| PACT reads | game.read.request/response; authorized delivered query/results only |
| Memory/context | memory.read/write, context.prepared; source/transform bodies in encrypted artifacts |
| Decisions/team | decision.proposed, validation.result, policy.transition, skill.invoked, participant.message |
| Commands | command.prepared/dispatched/result/receipt; original ID, no replacement/replay |
| Evaluation | evaluation.result; independent versioned evaluator/source references |
| Coverage | observation.record and recording.gap for compatibility events and explicit omissions |

Metadata accepts only typed mechanical attributes: owned IDs, stage/purpose/outcome enums, safe error codes and decimal counts/durations. Labels, prompts, schema content, peer text and exception messages are private artifacts, never free-form attributes. Occurrence UTC, server recording UTC, process-local monotonic nanoseconds/duration and typed game clock remain separate. An inter-event gap is not a measured duration.

Research scopes bind to an actual native task claim and registered research operation. Compatibility scopes bind to the original turn/agent/task and are labeled `compatibility`; their digest identifies the observed record, not a sealed research recipe. Late evidence may be appended after cancellation; evidence capture does not grant dispatch authority.

Coverage reconciles event units with the entire native ledger and command archive, including paths that failed to call the recorder. Private payload-byte coverage is tracked separately. A missing required record, unexposed result, revoked consent or expiry cannot be silently classified as complete.
