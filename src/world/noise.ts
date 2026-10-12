// Seeded fractal value noise for hills: the same seed gives the same terrain on the page and in the export.

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

/** fBm in 0..1: octaves of value noise, each twice the frequency and `roughness` times the weight. */
export function fbm(
  x: number,
  y: number,
  octaves: number,
  roughness: number,
  seed: number,
): number {
  let sum = 0;
  let weight = 1;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    sum += weight * valueNoise(x * frequency, y * frequency, seed + octave * 101);
    total += weight;
    weight *= roughness;
    frequency *= 2;
  }
  return total > 0 ? sum / total : 0;
}
