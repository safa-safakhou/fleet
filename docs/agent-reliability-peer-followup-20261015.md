# Automatic peer-read correction follow-up

AR-F05 / AR-F08 source review follow-up, 15 October 2026. No rollout or real inference.

The automatic participating-contact read ran outside the ordinary read-error handler. A contact that became unavailable/blocked could return NOT_CONTACT, BLOCKED or FORBIDDEN and terminate observation before any model decision, despite submitting no command. A new fake-engine regression failed for all three known refusals before the fix; the server-503 control passed. The automatic path now uses the adapter's existing precise readRejection classifier, retains bounded durable feedback/outcome, and continues normal decisions inside the unchanged allowance. It never invents a pending command or retries a submission. Unclassified/server failures still interrupt without inference or replay.

All four controls pass after the fix; full Fleet acceptance passes 138 unit / 197 integration tests, check/build/boundaries. The known cases make one normal WAIT decision and one recorded compute allocation; 503 makes none. No lease/write is opened, the original account/schedule/budgets remain unchanged, and no live contact was modified. This is a reproducible source path, not proof it caused a particular historical missed reply. Guide acknowledgement remains a safeguard only: its reader already defaulted to false.
