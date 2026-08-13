/**
 * Seeded, deterministic RNG. Composition variation ("give me another take")
 * needs randomness that is *reproducible* — same seed, same song — so results
 * are testable and a good take can be regenerated. Pure; no global state.
 *
 * This is a canonical "promoted util": born inline in a composer, pulled here
 * once a second caller wanted it, now covered by tests. Follow this pattern.
 */

/** mulberry32 — small, fast, good-enough PRNG for musical choices. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive, drawn from `rng`. */
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element from a non-empty array. Throws on empty. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() called on empty array");
  return items[Math.floor(rng() * items.length)]!;
}

/** Turn any string (e.g. a mood description) into a stable numeric seed. */
export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
