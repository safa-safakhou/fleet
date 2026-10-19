# Typed target source acceptance

AR-F03 and AR-P03 / PACT-173 are source-verified on 15 October 2026. [Observed references](observed-references.md) documents target roles, fresh unit facts and ordinary read failures. [Joint report](https://github.com/safa-safakhou/pact/blob/master/docs/implementation/reports/agent-reliability-references-20261015.md) records controls and the reproduced PACT automatic scout-selection bug.

Fleet check/build/boundaries, 120 unit and 171 integration tests pass. Positive two-agent communication uses the real server request layout; two failed receipt lookups create no lease/command/pending ID or fictitious reconciliation. Request/offer role/version/expiry and stale/foreign/Home Guard/battle-lock unit controls pass. Source and isolated fake acceptance only; no live fleet, configuration, inference, deployment or history changes. Next: AR-P04 / AR-F04 executable compact observations and measured envelope.
