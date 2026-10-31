/** Recheck long deadlines rather than overflowing the signed 32-bit browser timer. */
export function scheduleExpiry(expiresAt: string, expire: () => void): () => void {
  let cancelled = false,
    timer: ReturnType<typeof setTimeout>;
  const deadline = Date.parse(expiresAt);
  const check = () => {
    if (cancelled) return;
    const remaining = deadline - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      expire();
      return;
    }
    timer = setTimeout(check, Math.min(remaining, 2147483647));
  };
  check();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
