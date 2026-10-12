// Seeded placement that doesn't pile things into each other: each placed thing claims a disc on the floor, and a new
// spot is only taken if its disc stays clear of the others (a few tries, then the thing is left out).

export interface Spot {
  x: number;
  y: number;
  /** footprint radius, meters */
  r: number;
}

export class Footprints {
  readonly taken: Spot[] = [];

  /** whether a disc of radius `r` at (x, y) keeps `gap` meters from every taken disc */
  fits(x: number, y: number, r: number, gap = 0.05): boolean {
    return this.taken.every((spot) => Math.hypot(spot.x - x, spot.y - y) >= spot.r + r + gap);
  }

  claim(x: number, y: number, r: number): void {
    this.taken.push({ x, y, r });
  }

  /** the first of up to `tries` candidate spots that fits, claimed; null when none does */
  place(candidate: () => [number, number], r: number, tries = 40): [number, number] | null {
    for (let i = 0; i < tries; i++) {
      const [x, y] = candidate();
      if (this.fits(x, y, r)) {
        this.claim(x, y, r);
        return [x, y];
      }
    }
    return null;
  }
}

/** the radius of a box footprint turned any way about z: half its diagonal */
export const footprintRadius = (sizeX: number, sizeY: number) => Math.hypot(sizeX, sizeY) / 2;
