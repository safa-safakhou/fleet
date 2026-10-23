# Production PACT requested-fact wiring — 23 October 2026

The user selected three tasks: commit the verified delivery-summary repair, run one fresh game-free Nemotron 4B probe, and connect trusted typed fact requests to the intended production adapter. Work remains inline. Game execution stays disabled and E4/KQ1 blocked. No installation or activation is included.

The summary repair is committed as `1bc3023`. This adapter change connects configuration → runtime composition → authenticated PACT session → specialist observation → v3 schema/runtime checks. It does not infer requests from freeform owner goals, peer messages, tool-returned instructions or model output.

## Operator-authored requests

`FLEET_PACT_FACT_REQUESTS` is an optional JSON array. Unset means no requests and preserves existing behavior. Each entry identifies an authenticated kingdom, a request ID, an existing read tool, exact native arguments, and a path into that tool's returned JSON object. For example, using synthetic identifiers:

```json
[
  {
    "entityRef": "00000000-0000-4000-8000-000000000001",
    "id": "peer.thread.messages",
    "tool": "pact_council_thread_v1",
    "args": { "kingdomId": "00000000-0000-4000-8000-000000000002" },
    "path": ["messages"]
  }
]
```

These are explicit read requirements for turns on that binding, not permission to contact a peer or invoke an absent tool. Configure only facts relevant to the intended task, and only nonsecret read arguments. The server's catalog, read-only annotations, argument validation and authorization remain binding. A request for another kingdom is not delivered to this session. No active configuration was edited for this work.

Configuration is bounded to 16,000 JSON bytes / 32 entries total / eight unique requests per entity. Unknown keys, duplicate scoped IDs, malformed paths and prototype traversal components refuse with `PACT_FACT_REQUESTS_INVALID`. Paths are bounded arrays of own-property names, not executable expressions.

## Lifecycle and scope

Each authenticated session starts configured requests as unknown, with no placeholder value. Metadata-only reads, initial snapshots, wrong tool/arguments and absent selected result fields cannot promote the fact. A matching completed read supplies the selected value; an empty collection or null is a real value. An absent or non-read-only catalog tool produces a typed `READ_TOOL_UNAVAILABLE` blocker. Cached states last only for the session; a new session begins unknown. Returned fact lists are cloned and the session cannot silently change request scope.

The generic `RequestedFact` contract gains optional exact `args`. Existing callers without args are compatible. v3 includes the requested scope in its observation, intersects it with the existing native argument schema, and rejects a mismatched raw-provider query as `SCOPED_READ_SCOPE_REQUIRED` before observation. Fact reconciliation rejects changed tool or args. This prevents a read of the right tool for a different peer from satisfying the request. PACT specialist projection and packing preserve the top-level metadata; byte admission remains authoritative and may refuse an oversized packet.

The engine still does not choose owner goals, configure requests itself, or certify every narrative. The existing unknown/blocked final-wait rule and fixed action proposal summary remain in force. No stored goal, mandate, queue, allocation or model selection was modified.

## Verification and operational boundary

Regression tests first exposed the missing production metadata and missing explicit-args support. Focused checks cover strict config parsing, authenticated-entity separation, absent/write tools, metadata-only reads, wrong arguments, missing fields, matching result promotion, scope-change refusal, schema intersection and legacy compatibility. The actual PACT adapter is exercised with a fake GamePort. A fresh isolated binding integration verifies unknown → known through the authenticated production session, with zero submitted commands. Broader specialist HTTP tests also remain in the verification set.

Offline verification passed 893 unit tests in 170 files, 57 specialist HTTP tests and five isolated binding integrations. The modified authenticated binding case also passed in a separate fresh owned fixture. Type/style checks passed with the existing 82 warnings / 56 informational diagnostics; all 15 changed source/test files are clean. Build, architecture boundaries, documentation links and diff whitespace checks passed. The separately authorized fresh probe result is recorded in the current-state checkpoint after execution.

This source integration does not enable requests in the running service, restart Fleet, install a candidate or qualify native game execution. PACT source remains unchanged. Production activation and broader qualification are outside the three selected tasks.

The integration is committed as `ce86fd4`. The separately authorized [fresh game-free probe](nemotron-action-summary-probe-20261023.md) passed both synthetic cases in four calls; this does not activate this adapter configuration or establish full native-game acceptance.
