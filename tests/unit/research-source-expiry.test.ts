import { afterEach, expect, test, vi } from "vitest";
import { scheduleExpiry } from "../../web/research/expiry.js";

afterEach(() => vi.useRealTimers());
test("30-day evidence stays readable beyond the browser timer range and expires on its recorded deadline", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  let expired = false;
  const cancel = scheduleExpiry("2026-10-31T00:00:00Z", () => {
    expired = true;
  });
  vi.advanceTimersByTime(25 * 86400000);
  expect(expired).toBe(false);
  vi.advanceTimersByTime(5 * 86400000);
  expect(expired).toBe(true);
  cancel();
});
test("invalid deadlines expire immediately and cancellation leaves no scheduled disclosure state", () => {
  vi.useFakeTimers();
  let count = 0;
  scheduleExpiry("invalid", () => count++);
  vi.advanceTimersByTime(1);
  expect(count).toBe(1);
  const cancel = scheduleExpiry(new Date(Date.now() + 1000).toISOString(), () => count++);
  cancel();
  vi.advanceTimersByTime(2000);
  expect(count).toBe(1);
});
