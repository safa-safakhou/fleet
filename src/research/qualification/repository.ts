import type { Pool } from "../../db.js";
import { digest } from "../contracts.js";
import {
  assertAssessedDecision,
  type QualificationDecision,
  type QualificationEvidence,
  QualificationPolicy,
} from "./policy.js";
/** Internal-only repository: no browser ingestion or automatic runtime enrollment. */
export class QualificationRepository {
  constructor(
    private pool: Pool,
    private policy = new QualificationPolicy(),
  ) {}
  async record(decision: QualificationDecision): Promise<string> {
    assertAssessedDecision(decision);
    if (
      decision.schemaVersion !== "fleet.qualification/v1" ||
      decision.activationAuthorized !== false ||
      !/^[a-f0-9]{64}$/.test(decision.manifestDigest) ||
      !["fixture", "installation", "provider", "behavior"].includes(decision.scope) ||
      !["qualified", "blocked"].includes(decision.status) ||
      (decision.status === "qualified" &&
        (decision.reasons.length > 0 || !/^[a-f0-9]{64}$/.test(decision.evidenceDigest)))
    )
      throw Error("INVALID_QUALIFICATION_DECISION");
    const id = digest(decision);
    await this.pool.query(
      "INSERT INTO research_qualifications(id,manifest_digest,scope,status,decision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      [id, decision.manifestDigest, decision.scope, decision.status, decision],
    );
    return id;
  }
  async reassess(id: string, evidence: QualificationEvidence): Promise<QualificationDecision> {
    const stored = (await this.pool.query("SELECT decision FROM research_qualifications WHERE id=$1", [id])).rows[0]
      ?.decision;
    if (!stored || digest(stored) !== id) throw Error("QUALIFICATION_UNAVAILABLE");
    const current = this.policy.assess(stored.manifestDigest, evidence);
    if (current.scope !== stored.scope || current.evidenceDigest !== stored.evidenceDigest)
      return { ...current, status: "blocked", reasons: [...current.reasons, "EVIDENCE_CHANGED"] };
    return current;
  }
}
