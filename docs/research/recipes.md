# Experimental PACT research recipes

R1–R5 add source-level runtime, worker and policy capabilities. These recipes are experimental; no qualification or gameplay-accuracy claim follows from installing a library. Existing consumed profiles, budgets, schedules, authority, prompts and world state remain on their original paths.

| Recipe | Authority | Worker | Policy |
|---|---|---|---|
| `pact-research-deliberative@1` | Actor, through the native PACT broker | TypeScript reference or Python/Pydantic AI | `pact-reference@1` |
| `pact-research-scripted@1` | Actor, through the native PACT broker | TypeScript reference | `pact-scripted@1`, pure XState |
| `pact-research-advisory@1` | Advisory only | TypeScript reference or Python/Pydantic AI | `pact-reference@1` |

An actor decision is a proposal, never a success receipt. The kernel checks its role, current claim/epoch, manifest, observation age, source refs, revision and game clock. It selects claims and expected outcomes from the exact delivered PACT quote, invokes the existing native proposal validator, and submits the deterministic original command through the existing command journal. Unknown or pending outcomes remain unresolved. Custom text composition and specialist arbitration continue through the existing native specialist engines; this first broker version accepts exact quoted action payloads.

The specialist bridge retains the original `specialist-coordinator` or `autonomous-specialists` identity, scoped memory/codecs, participant ports and arbitration owner. It adds an identity guard around the original runtime; it does not translate historical engines into Python or create a replacement authority.

## Draft configuration and preview

The existing architecture form exposes worker, policy, checkpoint-memory namespace, observed-PACT context policy, maximum reasoning steps and an optional scripted action family. Schemas and semantic checks reject incompatible combinations, legacy cognition flags and unsupported workers. The advisory recipe cannot acquire actor authority through a configuration change.

`compileRecipeManifest` and authenticated `POST /api/research/recipes/preview` map the selected draft components into the C2 compiler. The endpoint requires a trusted capability resolver; missing or mismatched descriptors refuse. Preview returns an immutable manifest/digest and starts nothing. Runtime admission requires the selected draft to match that manifest and an explicitly enrolled Temporal task. Generic architecture metadata declares the required scheduler owner, so the ordinary scheduler cannot consume a research turn before enrollment. Consumed profiles remain locked by the existing handlers. No arbitrary worker executable or container image comes from an operator form or model message.

For these initial recipes, context is the authorized observation plus local read/model sequence, and memory is the encrypted operation checkpoint. Retrieval stays `baseline-v1`, indexing stays disabled and compression stays off. The later M tasks own additional context/retrieval/memory algorithms; their configurations are not silently accepted as implemented here. Native provider admission and token accounting remain authoritative.

The scripted policy selects only a delivered native option matching the configured action family. Empty or unavailable choices wait. A selected action needs an explicitly observed pause status; unavailable clock status refuses with `CLOCK_STATUS_UNAVAILABLE`. A paused or expired clock cannot select an action. A terminal scripted checkpoint restores the original proposal reference without another submission. Partial or unresolved worker histories require reconciliation.

## Runtime selection

The runtime is disabled by default. Trusted installation selects an explicit Temporal address, namespace and sealed manifest digest. Python additionally requires exactly one trusted executor configuration:

- `FLEET_RESEARCH_PYTHON_EXECUTABLE`: native development only, without a container isolation certificate.
- `FLEET_RESEARCH_PYTHON_IMAGE`: exact local `sha256:` image ID matching sealed `components.workerImage`, Linux only. The broker runs as dedicated UID10001, with its private IPC directory/socket owned by that UID. The worker has network-none, readonly root/socket mount and bounded scratch/resources. There is no native fallback.

These settings do not enroll or run a cohort. Existing run grants/window checks and the explicit task-owner gate still apply. Source implementation authorizes no installed-runtime activation, live enrollment, provider call or game run.

## Conformance evidence and limits

The language-independent corpus is [pact-reference.json](../../tests/fixtures/research/pact-reference.json). Tests compare normalized TypeScript/Python proposals, source refs and read sequences. Further tests exercise native PACT quotes/guarded execution against fresh synthetic databases, preserve the original receipt with one committed construction effect, test all three enrolled runtime recipes and restore their checkpoints without another model call. Existing frozen architecture transcripts remain unchanged.

RPC tests use real Python, Pydantic AI, Protobuf/gRPC and native Fleet allocation accounting. Separate Linux container probes bypass the wrapper and verify raw egress/filesystem/privilege restrictions. Temporal tests use an owned local server, frozen replay, restart and continue-as-new. This is source/offline validation, with fake model providers and disposable databases. Deployed broker/container IPC compatibility, model quality, long-run reliability and Q-series qualification remain separate acceptance work.
