import { expect, it } from "vitest";
import { assertFreshHostClock, assessHostClock } from "../../scripts/lib/host-clock.js";

function control() {
  return {
    samples: Array.from({ length: 301 }, (_, i) => ({
      index: i,
      qpc: 100000 + i * 10000000,
      hostFrequency: 10000000,
      hostUtcTicks: 638000000000000000 + i * 10000000,
      before: {
        wall: 1700000000000000000 + i * 1000000000,
        mono: 100000000000 + i * 1000000000,
        raw: 100000000000 + i * 1000000000,
        boot: 100000000000 + i * 1000000000,
      },
      after: {
        wall: 1700000000000000000 + i * 1000000000,
        mono: 100000000000 + i * 1000000000,
        raw: 100000000000 + i * 1000000000,
        boot: 100000000000 + i * 1000000000,
      },
      timex: { tickUs: 10000, freqPpm: 0 },
    })),
  };
}
it("requires a complete Windows-referenced clock window with stable rate and no jumps", () => {
  const d = control();
  expect(assessHostClock(d)).toMatchObject({ passed: true, samples: 301 });
  expect(() => assertFreshHostClock(d, { qpc: d.samples[300].qpc + 10000000, frequency: 10000000 })).not.toThrow();
});
it.each([
  [10001, -77.124343872],
  [9999, 77.124343872],
])("accepts compensated tick %i with fine correction %f when host measurements pass", (tickUs, freqPpm) => {
  const d = control();
  for (const s of d.samples) s.timex = { tickUs, freqPpm };
  expect(assessHostClock(d)).toMatchObject({ passed: true, samples: 301 });
});
it.each([
  [10010, 500],
  [9990, -500],
  [10000, 501],
  [10000, -501],
])("refuses excessive combined or fine clock correction %i/%f", (tickUs, freqPpm) => {
  const d = control();
  d.samples[100].timex = { tickUs, freqPpm };
  expect(assessHostClock(d).reasons).toContain("CLOCK_DISCIPLINE_UNSTABLE");
});
it("still refuses measured drift with otherwise normal compensated discipline", () => {
  const d = control();
  for (const s of d.samples) {
    s.timex = { tickUs: 10001, freqPpm: -77 };
    s.before.mono *= 1.002;
    s.after.mono *= 1.002;
  }
  expect(assessHostClock(d).reasons).toContain("CLOCK_RATE_MISMATCH");
});
it("refuses adjusted-clock drift even when wall time was stepped back into agreement", () => {
  const d = control();
  for (const s of d.samples) {
    s.before.mono *= 0.9166667;
    s.after.mono *= 0.9166667;
  }
  expect(assessHostClock(d).passed).toBe(false);
});
it("refuses local jumps, bad tick, short controls, stale controls and host restarts", () => {
  const d = control();
  const jumped = structuredClone(d);
  jumped.samples[100].after.wall += 100000000;
  expect(assessHostClock(jumped).passed).toBe(false);
  const tick = structuredClone(d);
  tick.samples[100].timex.tickUs = 9167;
  expect(assessHostClock(tick).passed).toBe(false);
  expect(assessHostClock({ samples: d.samples.slice(0, 100) }).passed).toBe(false);
  expect(assessHostClock({ passed: true }).passed).toBe(false);
  for (const now of [
    { qpc: d.samples[300].qpc + 6010000000, frequency: 10000000 },
    { qpc: 10, frequency: 10000000 },
  ])
    expect(() => assertFreshHostClock(d, now)).toThrow();
});
