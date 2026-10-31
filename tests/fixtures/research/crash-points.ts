/** Boundary names are shared by recovery fixtures; every case uses original native references. */
export const crashPoints = [
  "before_reserve",
  "after_reserve",
  "durable_input",
  "provider_dispatch",
  "provider_result",
  "worker_checkpoint",
  "pact_acceptance",
  "pact_receipt",
  "task_ack",
] as const;
