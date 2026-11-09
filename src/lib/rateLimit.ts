/** Sliding-window limiter kept in memory. Good enough for one server; use Redis/Upstash when scaling out. */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return {
    /** Returns true if this attempt is allowed, false if the key has hit the limit. */
    hit(key: string, now: number = Date.now()): boolean {
      if (hits.size > 10_000) hits.clear(); // crude memory cap
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
