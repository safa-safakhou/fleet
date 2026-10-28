import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);
const clock = z.object({
  wall: z.number().finite(),
  mono: z.number().finite(),
  raw: z.number().finite(),
  boot: z.number().finite(),
});
const control = z.object({
  samples: z
    .array(
      z.object({
        index: z.number().int(),
        qpc: z.number().finite(),
        hostFrequency: z.number().positive(),
        hostUtcTicks: z.number().finite(),
        before: clock,
        after: clock,
        timex: z.object({ tickUs: z.number(), freqPpm: z.number().finite() }),
      }),
    )
    .min(301)
    .max(601),
});
export function assessHostClock(input: unknown) {
  const parsed = control.safeParse(input);
  if (!parsed.success) return { passed: false, reasons: ["CLOCK_EVIDENCE_INVALID"], samples: 0, hostSeconds: 0 };
  const rows = parsed.data.samples,
    first = rows[0],
    last = rows[rows.length - 1],
    reasons = new Set<string>();
  const mid = (r: typeof first, k: keyof typeof r.before) => (r.before[k] + r.after[k]) / 2;
  const hostSeconds = (last.qpc - first.qpc) / first.hostFrequency;
  if (hostSeconds < 300) reasons.add("CLOCK_WINDOW_TOO_SHORT");
  const errors = Object.fromEntries(
    (["wall", "mono", "raw", "boot"] as const).map((k) => [
      k,
      ((mid(last, k) - mid(first, k)) / 1e9 / hostSeconds - 1) * 100,
    ]),
  );
  if (Object.values(errors).some((x) => !Number.isFinite(x) || Math.abs(x) > 0.1)) reasons.add("CLOCK_RATE_MISMATCH");
  if (Math.abs((last.hostUtcTicks - first.hostUtcTicks) / 1e7 / hostSeconds - 1) > 0.001)
    reasons.add("HOST_CLOCK_DISAGREEMENT");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      row.index !== i ||
      row.hostFrequency !== first.hostFrequency ||
      row.after.mono < row.before.mono ||
      (row.after.mono - row.before.mono) / 1e6 > 50
    )
      reasons.add("CLOCK_SAMPLE_INVALID");
    // Linux disciplines frequency with both coarse microseconds/tick and fine ppm.
    // A non-nominal tick can be compensated normally; assess their combined rate
    // against the same 0.1% bound as the independent Windows measurements.
    const disciplinePpm = ((row.timex.tickUs - 10000) / 10000) * 1e6 + row.timex.freqPpm;
    if (Math.abs(disciplinePpm) > 1000 || Math.abs(row.timex.freqPpm) > 500) reasons.add("CLOCK_DISCIPLINE_UNSTABLE");
    if (i > 0) {
      const prev = rows[i - 1];
      if (row.qpc <= prev.qpc) reasons.add("CLOCK_SAMPLE_INVALID");
      if (Math.abs((mid(row, "wall") - mid(prev, "wall") - mid(row, "mono") + mid(prev, "mono")) / 1e9) > 0.05)
        reasons.add("CLOCK_WALL_STEP");
    }
    if (i >= 10) {
      const prev = rows[i - 10],
        elapsed = (row.qpc - prev.qpc) / row.hostFrequency;
      for (const k of ["wall", "mono", "raw", "boot"] as const)
        if (Math.abs((mid(row, k) - mid(prev, k)) / 1e9 / elapsed - 1) > 0.001)
          reasons.add("CLOCK_LOCAL_RATE_MISMATCH");
    }
  }
  return {
    passed: reasons.size === 0,
    reasons: [...reasons],
    samples: rows.length,
    hostSeconds,
    rateErrorPercent: errors,
  };
}
export function assertFreshHostClock(input: unknown, now: { qpc: number; frequency: number; utcTicks?: number }) {
  const result = assessHostClock(input);
  if (!result.passed) throw Error(`HOST_CLOCK_NOT_QUALIFIED:${result.reasons.join(",")}`);
  const rows = control.parse(input).samples,
    last = rows[rows.length - 1],
    age = (now.qpc - last.qpc) / now.frequency;
  const wallAge = now.utcTicks === undefined ? age : (now.utcTicks - last.hostUtcTicks) / 1e7;
  if (
    now.frequency !== last.hostFrequency ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 600 ||
    wallAge < 0 ||
    wallAge > 600
  )
    throw Error("HOST_CLOCK_EVIDENCE_STALE");
  return result;
}
export async function currentWindowsClock() {
  const { stdout } = await exec(
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::WriteLine(('{0},{1},{2}' -f [Diagnostics.Stopwatch]::GetTimestamp(),[Diagnostics.Stopwatch]::Frequency,[DateTime]::UtcNow.Ticks))",
    ],
    { timeout: 15000, maxBuffer: 4096 },
  );
  const [qpc, frequency, utcTicks] = stdout.trim().split(",").map(Number);
  if (!Number.isFinite(qpc) || !Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(utcTicks))
    throw Error("HOST_CLOCK_REFERENCE_UNAVAILABLE");
  return { qpc, frequency, utcTicks };
}
