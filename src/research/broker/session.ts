import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FleetError } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import type { ScopedServices } from "../../platform/engine-context.js";
import type { Store } from "../../store.js";
import { canonical, type RunScope } from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";
import type { StepJournal } from "./steps.js";
export type WorkerSession = { id: string };
export type SessionPorts = {
  services: ScopedServices;
  controller: AbortController;
  signal: AbortSignal;
  observation?: Observation;
};
export class WorkerSessions {
  private ports = new Map<string, SessionPorts>();
  constructor(
    readonly store: Store,
    readonly journal: StepJournal,
  ) {}
  async open(
    scope: RunScope,
    services: ScopedServices,
    roleId: string,
    signal: AbortSignal,
    observation?: Observation,
  ) {
    await this.journal.assertCurrent(scope);
    const manifest = await new ManifestRepository(this.store.pool).load(scope.manifestDigest),
      role = manifest.roles.find((r) => r.id === roleId);
    if (!role || (scope.participantId && scope.participantId !== roleId))
      throw new FleetError("AUTHORITY_DENIED", true);
    const token = randomBytes(32).toString("base64url"),
      id = randomUUID(),
      hash = createHash("sha256").update(token).digest("hex"),
      now = this.store.now(),
      turn = (await this.store.pool.query("SELECT deadline_at FROM turns WHERE id=$1", [scope.turnId])).rows[0];
    await this.store.pool.query(
      "INSERT INTO research_worker_sessions(id,token_hash,operation_id,scope,role_id,authority,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, hash, scope.operationId, scope, roleId, role.authority, turn.deadline_at, now],
    );
    const controller = new AbortController();
    this.ports.set(id, { services, controller, signal: AbortSignal.any([signal, controller.signal]), observation });
    return { scope, token, sessionId: id };
  }
  async authenticate(token: string): Promise<WorkerSession> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new FleetError("WORKER_SESSION_REQUIRED", true);
    const row = (
      await this.store.pool.query("SELECT id,scope FROM research_worker_sessions WHERE token_hash=$1", [
        createHash("sha256").update(token).digest("hex"),
      ])
    ).rows[0];
    if (!row) throw new FleetError("WORKER_SESSION_REQUIRED", true);
    await this.assert({ id: row.id }, row.scope);
    return { id: row.id };
  }
  async assert(session: WorkerSession, scope: RunScope) {
    const row = (await this.store.pool.query("SELECT * FROM research_worker_sessions WHERE id=$1", [session.id]))
        .rows[0],
      ports = this.ports.get(session.id);
    if (!row || canonical(row.scope) !== canonical(scope)) throw new FleetError("OPERATION_SCOPE_MISMATCH", true);
    if (row.status !== "active" || new Date(row.expires_at) <= this.store.now() || !ports || ports.signal.aborted)
      throw new FleetError("WORKER_SESSION_FENCED", true);
    await this.journal.assertCurrent(scope);
    return { ...row, ports };
  }
  async stop(id: string) {
    await this.store.pool.query(
      "UPDATE research_worker_sessions SET status='fenced',stopped_at=$2 WHERE id=$1 AND status='active'",
      [id, this.store.now()],
    );
    this.ports.get(id)?.controller.abort(new FleetError("WORKER_SESSION_FENCED"));
  }
  async acknowledge(session: WorkerSession) {
    await this.store.pool.query(
      "UPDATE research_worker_sessions SET status='acknowledged',acknowledged_at=$2 WHERE id=$1 AND status='fenced'",
      [session.id, this.store.now()],
    );
  }
}
