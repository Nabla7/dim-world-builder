// A seeded mess of clutter: what the palette's "Scatter clutter" and the example worlds drop on the floor.
import { makeItem, PAINT, seeded, yaw } from "./defaults.ts";
import type { Item, PrimitiveParams, Vec3 } from "./types.ts";

/** small things a robot trips over, as [shape, size, paint] */
const CLUTTER: [PrimitiveParams["shape"], Vec3, PrimitiveParams["color"]][] = [
  ["bowling_pin", [0.12, 0.12, 0.38], PAINT.white],
  ["pipe", [1.6, 0.2, 0.2], PAINT.steel],
  ["soccer_ball", [0.22, 0.22, 0.22], PAINT.white],
  ["step_stool", [0.5, 0.45, 0.5], PAINT.blue],
  ["ladder", [2.4, 0.45, 0.06], PAINT.yellow],
  ["bucket", [0.32, 0.32, 0.38], PAINT.black],
  ["box", [0.4, 0.3, 0.3], PAINT.wood],
  ["cone", [0.3, 0.3, 0.45], PAINT.orange],
];

/** a seeded mess of clutter in a ~6 m disc around `at`, each piece a normal item you can move after */
export function scatterClutter(
  floor: string,
  at: Vec3,
  seed: number,
  count = 14,
  radius = 3,
): Item[] {
  const random = seeded(seed);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const [shape, scale, color] = CLUTTER[Math.floor(random() * CLUTTER.length)];
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius;
    const position: Vec3 = [
      Math.round((at[0] + Math.cos(angle) * distance) * 100) / 100,
      Math.round((at[1] + Math.sin(angle) * distance) * 100) / 100,
      0,
    ];
    const name = shape.replace("_", " ");
    items.push(makeItem("primitive", { shape, color }, {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      floor,
      position,
      rotation: yaw(random() * Math.PI * 2),
      scale,
    }));
  }
  return items;
}
