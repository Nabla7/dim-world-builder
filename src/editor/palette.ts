// What the Add panel offers, and how each choice becomes an item placed where the camera looks.

import {
  defaultHill,
  defaultRoom,
  defaultStairs,
  makeItem,
  PAINT,
  seeded,
  yaw,
} from "../world/defaults.ts";
import type { Object3D } from "three";
import type { Item, MeshAsset, PrimitiveParams, Vec3 } from "../world/types.ts";

export interface PaletteEntry {
  key: string;
  title: string;
  group: string;
  icon?: string;
  thumb?: string;
  make: (floor: string, at: Vec3) => Item;
  /** a palette entry that adds several items at once (a scatter) */
  makeMany?: (floor: string, at: Vec3) => Item[];
  /** a palette entry that is a click-to-place tool instead */
  tool?: "tag";
}

/** the ground point the camera orbits and the drawn world, set by the viewport */
export const view: { center: Vec3; worldRoot: Object3D | null } = {
  center: [0, 0, 0],
  worldRoot: null,
};

const snap = (at: Vec3): Vec3 => [Math.round(at[0] * 2) / 2, Math.round(at[1] * 2) / 2, 0];

function primitive(
  shape: PrimitiveParams["shape"],
  title: string,
  scale: Vec3,
  color: PrimitiveParams["color"],
  icon: string,
): PaletteEntry {
  return {
    key: `shape:${shape}`,
    title,
    group: "Shapes",
    icon,
    make: (floor, at) =>
      makeItem("primitive", { shape, color }, { name: title, floor, position: snap(at), scale }),
  };
}

export const BUILT_IN: PaletteEntry[] = [
  primitive("box", "Box", [1, 1, 1], PAINT.wood, "cube"),
  primitive("cylinder", "Cylinder", [0.6, 0.6, 1.2], PAINT.blue, "record"),
  primitive("sphere", "Ball", [0.6, 0.6, 0.6], PAINT.red, "target"),
  primitive("cone", "Cone", [0.35, 0.35, 0.5], PAINT.orange, "arrow-up"),
  primitive("ramp", "Ramp", [2, 1.2, 0.3], PAINT.slate, "line"),
  primitive("beanbag", "Beanbag", [0.9, 0.9, 0.6], PAINT.red, "sparkle"),
  primitive("bowling_pin", "Bowling pin", [0.12, 0.12, 0.38], PAINT.white, "pin"),
  primitive("pipe", "Pipe", [2, 0.3, 0.3], PAINT.steel, "minus"),
  primitive("soccer_ball", "Soccer ball", [0.22, 0.22, 0.22], PAINT.white, "record"),
  primitive("step_stool", "Step stool", [0.5, 0.45, 0.5], PAINT.blue, "grid"),
  primitive("ladder", "Ladder (lying)", [2.4, 0.45, 0.06], PAINT.yellow, "list"),
  primitive("bucket", "Bucket", [0.32, 0.32, 0.38], PAINT.black, "fill"),
  {
    key: "build:room",
    title: "Room",
    group: "Builders",
    icon: "home",
    make: (floor, at) =>
      makeItem("room", defaultRoom(), { name: "Room", floor, position: snap(at) }),
  },
  {
    key: "build:stairs",
    title: "Staircase",
    group: "Builders",
    icon: "grid",
    make: (floor, at) =>
      makeItem("stairs", defaultStairs(), { name: "Stairs", floor, position: snap(at) }),
  },
  {
    key: "build:hill",
    title: "Hill",
    group: "Builders",
    icon: "map",
    make: (floor, at) =>
      makeItem("hill", { ...defaultHill(), seed: Math.floor(Math.random() * 1000) }, {
        name: "Hill",
        floor,
        position: snap(at),
      }),
  },
  {
    key: "build:scatter",
    title: "Scatter clutter",
    group: "Builders",
    icon: "sparkle",
    make: (floor, at) => scatterClutter(floor, at, 1)[0],
    makeMany: (floor, at) => scatterClutter(floor, at, Math.floor(Math.random() * 100000)),
  },
  {
    key: "build:hole",
    title: "Hole in the floor",
    group: "Builders",
    icon: "minus",
    make: (floor, at) =>
      makeItem("hole", { sizeX: 1.5, sizeY: 1.5, depth: 0.5 }, {
        name: "Hole",
        floor,
        position: snap(at),
      }),
  },
  {
    key: "tool:apriltag",
    title: "AprilTag (click a wall)",
    group: "Builders",
    icon: "grid",
    make: (floor, at) =>
      makeItem("apriltag", { family: "tag36h11", id: 0, size: 0.1 }, {
        name: "Tag 0",
        floor,
        position: at,
      }),
    tool: "tag",
  },
  {
    key: "build:wall",
    title: "Wall",
    group: "Builders",
    icon: "panels",
    make: (floor, at) =>
      makeItem("primitive", { shape: "box", color: PAINT.wall }, {
        name: "Wall",
        floor,
        position: snap(at),
        scale: [4, 0.15, 2.5],
      }),
  },
];

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

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function assetEntries(assets: MeshAsset[]): PaletteEntry[] {
  return assets.map((asset) => ({
    key: `asset:${asset.id}`,
    title: asset.name,
    group: asset.category === "imported" ? "Imported" : titleCase(asset.category || "Library"),
    thumb: `${asset.base}/thumb.png`,
    make: (floor, at) =>
      makeItem("mesh", {
        source: asset.category === "imported" ? "import" : "library",
        asset: asset.id,
      }, {
        name: asset.name,
        floor,
        position: snap(at),
      }),
  }));
}
