import type { Data } from "../../domain.js";

/** Meaning of this confirmed operation, not a forecast or interpretation of model prose. */
export function pactCommandMeaning(action: Data, receipt: Data): Data | undefined {
  if (!["COMMITTED", "ALREADY_COMMITTED"].includes(String(receipt.code))) return;
  switch (action.kind) {
    case "game.supply.offer":
      return {
        stage: "unsigned_proposal_created",
        ownSignatureRecorded: false,
        contractActivated: false,
        resourcesDelivered: false,
      };
    case "game.supply.sign":
      return {
        stage: "own_consent_recorded",
        activation: "Check current same-version peer consent and contract state.",
        resourcesDelivered: false,
      };
    case "game.building.queue":
      return {
        stage: "construction_instruction_admitted",
        completedByReceipt: false,
        existingOrdersCancelled: false,
        resourcesAcquired: false,
      };
  }
}
