/**
 * Deterministic pseudo-random number generation.
 *
 * Sampling-based planners (RRT / RRT*) must be reproducible so that
 * side-by-side comparisons run on identical random sequences and so
 * users can replay a run and see the same tree.
 */

/** A seeded RNG returning floats in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — tiny, fast, high-quality-enough 32-bit PRNG.
 * @param seed Any 32-bit integer.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [0, max). */
export function randInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

/** A fresh random seed suitable for mulberry32. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
