# Fleet agent engineering tooling proposal

30 October 2026. Planning and research only; implementation has not started.

The subsequent [Fleet target architecture study](fleet-target-architecture-20261030.md) applies the broader cross-game mission to a proposed complete end state, independent of migration phases. Its reference choices are proposals, not implementation approval.

The later [PACT-focused migration plan](../superpowers/plans/2026-10-30-pact-research-engine.md) scopes these choices into concrete source/offline deliverables, with complete observation and mandatory visualization. It defers cross-game generalization and does not activate any installation or experiment.

The owner selected six tools for the plan list: fast-check, Promptfoo, XState, OpenTelemetry, DSPy, and PostgreSQL full-text search with pgvector. Establish testing, measurement, and comparison infrastructure before implementing new architectures or paper-derived behavior. Other libraries remain research candidates. This proposal does not start installation, inference, experiments, deployment, or changes to retained worlds and accounting.

Evaluate languages by capability, correctness, operating cost, and maintainability. Python, .NET, Go, Java, Rust, C++, and TypeScript are eligible. Moving a component or migrating a larger part of Fleet is a valid option when evidence supports it; the current language is not a selection requirement.

## Selected tools for the plan list

| Tool | Intended use | Evidence needed before wider adoption |
| --- | --- | --- |
| [fast-check](https://fast-check.dev/docs/advanced/model-based-testing/) | Generate stateful operation sequences and asynchronous interleavings around claims, queues, cancellation, and settlement. | Reproduce meaningful failure sequences, preserve invariants, and produce small counterexamples. |
| [Promptfoo](https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/) | Compare prompts, models, and complete decisions using custom assertions around Fleet fixtures. | Repeated outcome success, correction quality, cost, and latency; native state and receipts own material correctness. |
| [XState](https://stately.ai/docs) | Express selected correction, waiting, cancellation, and recovery lifecycles as inspectable state machines. | Clear persistence and timer ownership; compatibility with terminal states and original commands. |
| [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) | Correlate task, context, model queue, inference, validation, command, and outcome measurements. | Useful failure attribution without exporting private payloads by default or changing authoritative accounting. |
| [DSPy](https://github.com/stanfordnlp/dspy) | Optimize bounded prompts and demonstrations offline against defined metrics. | Independent held-out results, all optimization costs, and reproducible frozen artifacts. |
| [PostgreSQL full-text search and pgvector](https://github.com/pgvector/pgvector#hybrid-search) | Compare structured, lexical, and semantic retrieval in the existing database stack. | Retrieval coverage, final delivered evidence, source validity, account isolation, and encryption/retention compatibility. |

The owner selected these for planning, not a fixed integration sequence or a production configuration. Research can continue while architecture implementation remains deferred.

## Existing Fleet boundaries

Fleet already has [versioned architecture registration](../../src/platform/architecture.ts), [scoped engine services](../../src/platform/engine-context.ts), [grounded cognition](../cognition.md), a [measured context envelope](../context-envelope.md), task supervision, accounting, and command reconciliation. Candidate benefits must be compared with those implementations.

The current engine contracts are TypeScript interfaces inside the process. A Python, .NET, Go, Java, Rust, or C++ engine is not an existing drop-in integration. It needs a versioned boundary for observations, model requests, proposals, cancellation, evidence, and state. Transport and deployment choices remain open.

Memory, context, and retrieval serve different purposes. Memory determines what is retained and revised; retrieval selects evidence; context assembly chooses what reaches a particular model request. A stored memory or a high retrieval score does not prove delivery, truth, or useful decision-making.

## Memory candidates

| Candidate | Distinct capability | Possible Fleet use | Main integration question |
| --- | --- | --- | --- |
| [LangMem](https://langchain-ai.github.io/langmem/) | Python primitives for extracting, consolidating, and managing long-term memory; functional APIs can use custom storage. | Compare policies for semantic knowledge, episodic outcomes, and procedural lessons while retaining Fleet's journal. | How can source references, versions, expiry, and all processing calls be preserved? |
| [Mem0 OSS](https://docs.mem0.ai/open-source/overview) | Memory engine available as a library or self-hosted service, with configurable models, embeddings, stores, and rerankers. | Compare memory extraction/update/search with Fleet's existing approach. | Which defaults and inferred updates must be replaced to preserve scope, evidence meaning, and accounting? |
| [Graphiti](https://github.com/getzep/graphiti) | Python temporal context graphs with source provenance and semantic, keyword, and graph retrieval. | Investigate relationship changes, superseded statements, and linked episodes over time. | Graph storage, tenancy, access control, retention, and extraction costs need explicit integration. |
| [Letta](https://docs.letta.com/agent-sdk/memory) | Stateful agents with persistent agent-managed memory and separation between always-present and on-demand context. | Evaluate a different complete memory/agent architecture. | Letta's current SDK and legacy APIs have different memory models; select an exact self-hostable version and define one owner for execution and persistence. |

These are alternative levels of adoption. Mem0 and LangMem can be evaluated as memory components; Graphiti supplies graph construction/retrieval; Letta is a larger stateful-agent alternative. They should not automatically become one combined dependency stack. Model-extracted statements remain derived claims in Fleet; a peer statement cannot become a verified delivery through extraction or consolidation.

## Context and retrieval candidates

| Candidate | Distinct capability | Possible Fleet use | Main tradeoff |
| --- | --- | --- | --- |
| [LlamaIndex memory](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/) | Python token-budgeted short-term history and custom/static/extracted/vector memory blocks with priorities. | Compare explicit context allocation and retrieval policies. | Default truncation and extraction need adaptation to preserve indispensable evidence and source links. |
| [Haystack](https://docs.haystack.deepset.ai/docs/intro) | Modular Python pipelines, retrievers, document stores, tools, and agents. | Build reproducible retrieval and context-processing comparisons. | Choose it or another pipeline framework for a concrete experiment; avoid duplicating orchestration ownership. |
| [Sentence Transformers](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html) | Embeddings and CrossEncoder reranking. | Rank a bounded set of candidate episodes against the actual current question. | Measure CPU/GPU time, memory, language coverage, and whether it recovers useful evidence beyond simple baselines. |
| [BM25S](https://github.com/xhluca/bm25s) | Local Python BM25 lexical retrieval. | Provide an inexpensive retrieval baseline for exact terms and identifiers. | PostgreSQL's standard full-text ranking is not BM25; compare results rather than treating them as identical algorithms. |
| [ColBERT](https://github.com/stanford-futuredata/ColBERT) | Token-level late-interaction neural retrieval. | Test richer matching when single-vector retrieval loses important details. | More indexing/storage and serving complexity than a small lexical or dense baseline. |
| [LLMLingua](https://github.com/microsoft/LLMLingua) | Python model-based prompt compression. | Compare compression of optional historical narrative. | Token removal is lossy; exact terms, identifiers, quantities, authority, receipts, and mandatory evidence need protected handling. |

Useful algorithm comparisons include exact structured lookup, lexical versus dense retrieval, Reciprocal Rank Fusion, reranking, diversity selection with maximal marginal relevance, temporal validity filtering, and graph traversal. Evaluate them on known evidence targets and final packets. A reranker cannot recover a source excluded from its candidate pool, and diversified results can still omit a critical obligation.

## Agent construction and planning candidates

| Candidate | Ecosystem | Distinct capability | Possible role |
| --- | --- | --- | --- |
| [Pydantic AI](https://pydantic.dev/docs/ai/overview/) | Python | Typed agents, dependencies, toolsets, capability hooks, output validation, and durable-execution integrations. | A separately versioned engine or a Python agent-worker implementation; use Fleet-mediated model/action ports for a fair comparison. |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | .NET and Python, with a separate Go SDK | Agent middleware and graph workflows for sequential, concurrent, handoff, and group patterns; OpenTelemetry support. | A serious alternative for agent composition or a broader worker migration. Confirm feature parity for the selected SDK. |
| [Google ADK](https://adk.dev/) | Python, TypeScript, Go, Java, Kotlin | Agents, workflow composition, tools, sessions, memory, and context management. | Compare a declarative/workflow-based agent implementation. Confirm individual SDK and model-route capabilities. |
| [Rig](https://github.com/0xPlaygrounds/rig) | Rust | Provider/tool abstractions, agent runtime, memory/compaction, and effect recording components. | A Rust worker candidate when profiling or deployment constraints justify it; language choice alone establishes no performance benefit. |
| [OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver) | C++ with Python, Java, and C# interfaces | Integer constraint solving with explicit feasible/infeasible/unknown outcomes. | Check resource/slot conflicts or bounded schedules from adapter-supplied facts; PACT still owns final legality. |
| [BehaviorTree.CPP](https://www.behaviortree.dev/) | C++ | Modular reactive behavior trees with asynchronous actions and transition logging. | A later control-architecture comparison where bounded reusable behaviors fit better than an open-ended model loop. |

Existing discussion candidates LangGraph, Temporal, and Unified Planning remain alternatives for later evaluation; they were not added to the owner's six selected tools. Papers and new architecture behavior remain deferred until the testing/comparison foundation is established.

## Comparison and migration criteria

Evaluate candidates against repeated complete tasks: prerequisite progress, stale-offer recovery, obligation recall, superseded information, and original-command recovery. Record final outcome correctness, evidence recall and delivery, false claims, attempts, queue/generation/retrieval latency, total model/helper/embedding work, CPU/GPU memory, and operating complexity. Use separate development and held-out cases and keep historical outcomes unchanged.

Start with synthetic fixtures and authored providers for protocol, lifecycle, and isolation checks. Actual model/retrieval quality requires a separately scoped measured experiment. Automatic memory extraction, consolidation, summarization, reranking, or reflection must expose its calls and resource use under the original limits; background work is not free work.

Cross-language prototypes can be libraries behind a narrow service, separate architecture workers, or candidates for replacing a larger subsystem. Compare boundary crossings, cancellation/late completion, restart behavior, exact numeric serialization, evidence identity, deletion, and operational burden. Full migration remains eligible when it beats component reuse on these measures; no rewrite has been selected.

A proposed first comparison shortlist after the selected tools is in place is: Sentence Transformers for retrieval, LangMem versus Mem0 for memory policies, Graphiti for temporal relationships, and Pydantic AI versus Microsoft Agent Framework for agent construction. Letta is a larger stateful-agent comparison; LlamaIndex/Haystack are pipeline alternatives; Rig, Google ADK, ColBERT, LLMLingua, OR-Tools, and behavior trees remain candidates for a demonstrated need. These priorities are research judgments, not owner-approved implementation assignments.
