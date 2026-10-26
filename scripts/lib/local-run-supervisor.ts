/** Operator policy, independent of worker scheduling/model generation. No authority or replay logic. */
export type SupervisorSample = {
  wallMs: number;
  monoMs: number;
  bootId: string;
  healthy: boolean;
  calls: number;
  unknownUsage: number;
  unknownCommands: number;
  failedTurns: number;
  inFlight: number;
};
export type SupervisorRecord = {
  id: string;
  durationMs: number;
  maxCalls: number;
  wallStartMs: number;
  monoStartMs: number;
  bootId: string;
  drainMs: number;
  /** Explicit exploratory mode: actor errors/unknowns stay held by native per-actor admission. */
  faultPolicy?: "stop-all" | "isolate-actors";
  status?: "running" | "draining" | "parked";
  reason?: string;
  closedMonoMs?: number;
};
type Ports = { close(reason: string): Promise<void>; park(drainTimedOut: boolean): Promise<void> };
export class LocalRunSupervisor {
  private state: SupervisorRecord & { status: "running" | "draining" | "parked" };
  private last: Pick<SupervisorSample, "wallMs" | "monoMs">;
  private restarted = false;
  private closed = false;
  constructor(
    record: SupervisorRecord,
    private ports: Ports,
  ) {
    if (
      !record.id ||
      (record.faultPolicy !== undefined && !["stop-all", "isolate-actors"].includes(record.faultPolicy)) ||
      ![900000, 1800000, 3600000, 21600000, 86400000].includes(record.durationMs) ||
      !Number.isSafeInteger(record.maxCalls) ||
      record.maxCalls < 1 ||
      !Number.isSafeInteger(record.drainMs) ||
      record.drainMs < 1 ||
      !Number.isFinite(record.wallStartMs) ||
      !Number.isFinite(record.monoStartMs) ||
      !record.bootId
    )
      throw Error("INVALID_SUPERVISOR_RECORD");
    this.state = { ...record, status: record.status ?? "running" };
    this.last = { wallMs: record.wallStartMs, monoMs: record.monoStartMs };
  }
  static resume(record: SupervisorRecord, ports: Ports) {
    const supervisor = new LocalRunSupervisor(record, ports);
    supervisor.restarted = supervisor.state.status !== "parked";
    return supervisor;
  }
  record() {
    return structuredClone(this.state);
  }
  stop(reason: string, monoMs: number) {
    if (this.state.status === "running") {
      this.state.status = "draining";
      this.state.reason = reason;
      this.state.closedMonoMs = monoMs;
    }
  }
  async poll(s: SupervisorSample) {
    if (this.state.status === "parked") return this.record();
    const elapsed = s.monoMs - this.state.monoStartMs;
    const invalid = Object.values(s).some((v) => typeof v === "number" && !Number.isFinite(v));
    const stopOnActorFault = this.state.faultPolicy !== "isolate-actors";
    const reason = this.restarted
      ? "SUPERVISOR_RESTART"
      : invalid
        ? "INVALID_SAMPLE"
        : s.bootId !== this.state.bootId
          ? "HOST_RESTART"
          : s.monoMs < this.last.monoMs
            ? "MONOTONIC_REVERSED"
            : Math.abs(s.wallMs - this.last.wallMs - (s.monoMs - this.last.monoMs)) > 250 ||
                Math.abs(s.wallMs - this.state.wallStartMs - elapsed) > 500
              ? "CLOCK_DISAGREEMENT"
              : !s.healthy
                ? "SERVICE_UNHEALTHY"
                : stopOnActorFault && s.unknownUsage > 0
                  ? "UNKNOWN_USAGE"
                  : stopOnActorFault && s.unknownCommands > 0
                    ? "UNKNOWN_COMMAND"
                    : stopOnActorFault && s.failedTurns > 0
                      ? "FAILED_TURN"
                      : stopOnActorFault && s.calls >= this.state.maxCalls
                        ? "CALL_CEILING"
                        : elapsed >= this.state.durationMs || s.wallMs >= this.state.wallStartMs + this.state.durationMs
                          ? "DEADLINE"
                          : undefined;
    this.last = { wallMs: s.wallMs, monoMs: s.monoMs };
    if (this.restarted && this.state.status === "draining") this.state.closedMonoMs = s.monoMs;
    this.restarted = false;
    if (this.state.status === "running" && reason) {
      this.state.status = "draining";
      this.state.reason = reason;
      this.state.closedMonoMs = s.monoMs;
    }
    if (this.state.status === "draining") {
      // The close port writes atomically/idempotently. A failed write must be retried; no
      // subsequent observer tick can return to running or extend the saved interval.
      if (!this.closed) {
        await this.ports.close(this.state.reason ?? "SUPERVISOR_STOP");
        this.closed = true;
      }
      const timedOut = invalid || s.monoMs - (this.state.closedMonoMs ?? s.monoMs) >= this.state.drainMs;
      if (s.inFlight === 0 || timedOut) {
        await this.ports.park(timedOut);
        this.state.status = "parked";
      }
    }
    return this.record();
  }
}
