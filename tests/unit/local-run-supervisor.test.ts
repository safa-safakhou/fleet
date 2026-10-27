import { expect, it } from "vitest";
import { LocalRunSupervisor, type SupervisorSample } from "../../scripts/lib/local-run-supervisor.js";

function fixture(durationMs = 900000) {
  const calls: string[] = [];
  let sample: SupervisorSample = {
    wallMs: 10000,
    monoMs: 20000,
    bootId: "boot",
    healthy: true,
    calls: 0,
    unknownUsage: 0,
    unknownCommands: 0,
    failedTurns: 0,
    inFlight: 0,
  };
  const supervisor = new LocalRunSupervisor(
    {
      id: "owned",
      durationMs,
      maxCalls: 144,
      wallStartMs: sample.wallMs,
      monoStartMs: sample.monoMs,
      bootId: sample.bootId,
      drainMs: 90000,
    },
    {
      close: async (reason) => {
        calls.push(`close:${reason}`);
      },
      park: async (timedOut) => {
        calls.push(`park:${timedOut}`);
      },
    },
  );
  return {
    supervisor,
    calls,
    sample,
    advance: (ms: number) => {
      sample = { ...sample, wallMs: sample.wallMs + ms, monoMs: sample.monoMs + ms };
      return sample;
    },
  };
}
it.each([900000, 1800000, 3600000, 21600000, 86400000])(
  "closes exactly at the %s cutoff and parks without extending admission",
  async (duration) => {
    const f = fixture(duration);
    expect((await f.supervisor.poll(f.advance(duration - 1))).status).toBe("running");
    expect((await f.supervisor.poll(f.advance(1))).status).toBe("parked");
    expect(f.calls).toEqual(["close:DEADLINE", "park:false"]);
    await f.supervisor.poll(f.advance(500));
    expect(f.calls).toHaveLength(2);
  },
);
it.each(["wall", "mono", "boot", "unhealthy", "usage", "command", "turn", "budget"])(
  "fails closed for %s and preserves the stop reason",
  async (cause) => {
    const f = fixture(),
      sample = { ...f.sample, inFlight: 1 };
    if (cause === "wall") sample.wallMs += 1000;
    if (cause === "mono") sample.monoMs -= 1;
    if (cause === "boot") sample.bootId = "another";
    if (cause === "unhealthy") sample.healthy = false;
    if (cause === "usage") sample.unknownUsage = 1;
    if (cause === "command") sample.unknownCommands = 1;
    if (cause === "turn") sample.failedTurns = 1;
    if (cause === "budget") sample.calls = 144;
    const state = await f.supervisor.poll(sample);
    expect(state.status).toBe("draining");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatch(/^close:/);
    expect(
      (await f.supervisor.poll({ ...sample, monoMs: sample.monoMs + 90000, wallMs: sample.wallMs + 90000 })).status,
    ).toBe("parked");
    expect(f.calls.at(-1)).toBe("park:true");
  },
);
it("settles dispatched work before parking and retains unknowns for operator review", async () => {
  const f = fixture();
  await f.supervisor.poll({ ...f.advance(900000), inFlight: 2, unknownUsage: 1 });
  expect(f.calls).toEqual(["close:UNKNOWN_USAGE"]);
  await f.supervisor.poll({ ...f.advance(100), inFlight: 0, unknownUsage: 1 });
  expect(f.calls).toEqual(["close:UNKNOWN_USAGE", "park:false"]);
});
it("a restarted supervisor closes the saved interval instead of minting a new start", async () => {
  const f = fixture();
  await f.supervisor.poll(f.sample);
  const saved = f.supervisor.record();
  const restarted = LocalRunSupervisor.resume(saved, {
    close: async (reason) => {
      f.calls.push(`restart:${reason}`);
    },
    park: async () => {},
  });
  expect((await restarted.poll(f.advance(1))).reason).toBe("SUPERVISOR_RESTART");
  expect(restarted.record().wallStartMs).toBe(saved.wallStartMs);
  expect(f.calls).toContain("restart:SUPERVISOR_RESTART");
});
it("a failed close or park is retried idempotently without reopening the interval", async () => {
  const f = fixture();
  let attempts = 0;
  const s = new LocalRunSupervisor(f.supervisor.record(), {
    close: async () => {
      if (!attempts++) throw Error("storage unavailable");
    },
    park: async () => {},
  });
  await expect(s.poll({ ...f.advance(900000), inFlight: 1 })).rejects.toThrow();
  expect(s.record().status).toBe("draining");
  expect((await s.poll({ ...f.advance(1), inFlight: 0 })).status).toBe("parked");
});
it("bounds a restarted drain after a host reboot using the new monotonic origin", async () => {
  const f = fixture();
  await f.supervisor.poll({ ...f.advance(900000), inFlight: 1 });
  const saved = f.supervisor.record();
  const restarted = LocalRunSupervisor.resume(saved, { close: async () => {}, park: async () => {} });
  const sample = { ...f.sample, bootId: "new", wallMs: 9999999, monoMs: 10, inFlight: 1 };
  expect((await restarted.poll(sample)).status).toBe("draining");
  expect((await restarted.poll({ ...sample, wallMs: sample.wallMs + 90000, monoMs: 90010 })).status).toBe("parked");
});
it("invalid numeric counters fail closed and force a bounded park", async () => {
  const f = fixture();
  expect((await f.supervisor.poll({ ...f.sample, inFlight: NaN })).status).toBe("parked");
  expect(f.calls).toEqual(["close:INVALID_SAMPLE", "park:true"]);
});

it("keeps an observation world running when individual actors fail or exhaust their budgets", async () => {
  const f = fixture(86400000);
  const observer = new LocalRunSupervisor({ ...f.supervisor.record(), faultPolicy: "isolate-actors" } as never, {
    close: async (reason) => {
      f.calls.push(reason);
    },
    park: async () => {
      f.calls.push("park");
    },
  });
  expect(
    (
      await observer.poll({
        ...f.advance(1000),
        failedTurns: 7,
        unknownUsage: 1,
        unknownCommands: 1,
        calls: 144,
        inFlight: 1,
      })
    ).status,
  ).toBe("running");
  expect(f.calls).toEqual([]);
  expect(
    (
      await observer.poll({
        ...f.advance(86399000),
        failedTurns: 7,
        unknownUsage: 1,
        unknownCommands: 1,
        calls: 144,
        inFlight: 0,
      })
    ).status,
  ).toBe("parked");
  expect(f.calls).toEqual(["DEADLINE", "park"]);
});
it("observation mode still stops for lost world/control health", async () => {
  const f = fixture(86400000);
  const observer = new LocalRunSupervisor({ ...f.supervisor.record(), faultPolicy: "isolate-actors" } as never, {
    close: async (reason) => {
      f.calls.push(reason);
    },
    park: async () => {},
  });
  expect((await observer.poll({ ...f.advance(1000), healthy: false })).reason).toBe("SERVICE_UNHEALTHY");
});
it("supports six hours and closes admission at the original deadline", async () => {
  const f = fixture(),
    base = f.supervisor.record();
  const supervisor = new LocalRunSupervisor(
    { ...base, durationMs: 21600000 },
    {
      close: async (reason) => {
        f.calls.push(reason);
      },
      park: async () => {},
    },
  );
  expect(
    (await supervisor.poll({ ...f.sample, wallMs: base.wallStartMs + 21599999, monoMs: base.monoStartMs + 21599999 }))
      .status,
  ).toBe("running");
  expect(
    (
      await supervisor.poll({
        ...f.sample,
        wallMs: base.wallStartMs + 21600000,
        monoMs: base.monoStartMs + 21600000,
        inFlight: 1,
      })
    ).status,
  ).toBe("draining");
  expect(f.calls).toContain("DEADLINE");
});
