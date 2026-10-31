# Owned prompt evaluation

A3 uses Promptfoo 0.125.1 through the native evaluation broker, never a framework provider registry. Run `npm run eval:prompts -- --mode offline --config evals/pact/promptfooconfig.yaml` from Fleet with the pinned Node toolchain. The command creates and removes a fresh owned PostgreSQL fixture. It does not select retained worlds or providers.

Frozen synthetic train/development/heldout splits record family, world and actor-input hashes. Cross-split overlap is refused. Optimizers cannot load heldout files. Rubrics independently check strict proposal shape, authorized citations, owner constraints, exact identifiers and pending-versus-completed receipts. Self-reported success is not grading evidence.

Each candidate, teacher, judge or repair call needs a native scoped grant and a durable reservation. The shared budget caps this suite at 16 actual allocations across native turns of at most three calls. Retries are disabled; unknown dispatches retain their reservations. Evaluation roles are advisory and have no game tools. Optional future judge calls consume their own allocations; this suite uses deterministic assertions.

The child receives only its Unix-socket capability on stdin, a clean environment and a protected temporary directory. Runtime guards deny TCP, HTTP, DNS, subprocesses and fetch; the worker probes denial before evaluating. This is defense in depth for trusted offline framework code, not an operating-system sandbox certification. Production worker isolation remains a separate runtime requirement.

Promptfoo caching, sharing, telemetry and persisted latest results are disabled. Temporary framework files are removed. Detailed native events/results stay in encrypted O2 artifacts. The offline command preserves encrypted O5 archives and the preregistered A2 study under an ignored `.state/research/offline/<id>` directory with a private archive key. Exported summary JSON contains identifiers and scalar scores, not prompts. These fixture archives remain private local evidence and are not an independent deployment retention service.

The worked fixture scores reference 8/8, deliberately invalid 0/8, with 16 reported native allocations. All batches share one synthetic world, so this is protocol/grading evidence and has insufficient independent units for a superiority claim. No real model quality, gameplay improvement, runtime deployment or automatic promotion is established.
