import { describe, expect, it } from "vitest";
import { Footprints } from "./placement.ts";
import { scatterClutter } from "./scatter.ts";
import { playground } from "./examples_playground.ts";
import { clutterYard } from "./examples_clutter.ts";
import type { Item, MeshAsset } from "./types.ts";

describe("Footprints", () => {
  it("refuses a disc that overlaps a taken one and takes one that clears it", () => {
    const footprints = new Footprints();
    footprints.claim(0, 0, 1);
    expect(footprints.fits(1.4, 0, 0.4)).toBe(false);
    expect(footprints.fits(1.4, 0, 0.4, 0)).toBe(true);
    expect(footprints.place(() => [0.5, 0], 0.2, 5)).toBeNull();
  });
});

/** footprint discs of primitives (scale = size) don't overlap */
function primitivesOverlap(items: Item[]): string[] {
  const discs = items
    .filter((i) => i.kind === "primitive")
    .map((i) => ({
      name: i.name,
      x: i.position[0],
      y: i.position[1],
      r: Math.hypot(i.scale[0], i.scale[1]) / 2,
    }));
  const overlaps: string[] = [];
  discs.forEach((a, i) =>
    discs.slice(i + 1).forEach((b) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) overlaps.push(`${a.name} / ${b.name}`);
    })
  );
  return overlaps;
}

describe("seeded placement", () => {
  it("scatters clutter without pieces overlapping", () => {
    expect(primitivesOverlap(scatterClutter("ground", [0, 0, 0], 3, 30, 3))).toEqual([]);
  });

  it("keeps the clutter yard's pieces apart", () => {
    expect(primitivesOverlap(clutterYard().items)).toEqual([]);
  });

  it("keeps the playground's outdoor plants apart", () => {
    const library: MeshAsset[] = ["tree", "pine", "bush"].map((id) => ({
      id,
      name: id,
      category: "plants",
      size: [3, 3, 5],
      base: "",
      visuals: [],
      hulls: [],
    }));
    const plants = playground(library, 7).items.filter((i) => i.kind === "mesh");
    plants.forEach((a, i) =>
      plants.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]))
          .toBeGreaterThanOrEqual(3 * Math.SQRT2);
      })
    );
  });
});
