# Serialized24-kingdom attempt02 — owner-stopped

The owner requested closing this run to replace its single inference slot/two-review setup with a higher-capacity experiment. The planned hour did not finish; no old world/task is being resumed. [Exact result](kingdoms24-attempt02-20261102.json).

{
  "reason": "OPERATOR_STOP",
  "world": {
    "status": "paused",
    "tick": "14",
    "gameTimeMs": 1793626200000
  },
  "startsAt": 1793625759433,
  "endsAt": 1793629359433,
  "closedAt": 1793626640033,
  "closureVerification": "pass",
  "actualCalls": 24,
  "inputTokens": 133464,
  "outputTokens": 5036,
  "commands": 0,
  "restoredTables": 327,
  "artifacts": 1566,
  "plaintextBytes": 28707361,
  "originalContainers": 67,
  "originalVolumes": 115,
  "unknowns": 0,
  "maxQueueSeconds": 424.587
}

All24first reviews finished as validated waits, with known usage and zero gameplay commands. The worst dispatch wait was424.587seconds; mean review service time18.389seconds. This establishes the artificial serialization bottleneck, not responsive multiplayer behavior. Fifteen waiting tasks and nine completed tasks are preserved according to native state (exact DB snapshot is authoritative). Native observation occurs after dispatch; freshness checks do not recover missed opportunities.

Independent closure verifies paused tick14, stopped owned execution/provider/rules/watchdog, no running turns, unknown allocations, pending commands, capacity leases or active worker sessions. All24research runs reconcile complete;327restored table projections,1566artifact references/28,707,361plaintext bytes and240state files/37,332,624stored bytes match. Original67container configurations/115volume definitions match, with all3original services healthy. The previous early native timeline/context/causal renders remain retained; final closed rendering/reason review stays separate from claims of gameplay achievement.
