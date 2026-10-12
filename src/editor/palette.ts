// What the Add panel offers, and how each choice becomes an item placed where the camera looks.

import { defaultHill, defaultRoom, defaultStairs, makeItem, PAINT } from "../world/defaults.ts";
import type { Object3D } from "three";
import { scatterClutter } from "../world/scatter.ts";
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
  group = "Shapes",
): PaletteEntry {
  return {
    key: `shape:${shape}`,
    title,
    group,
    icon,
    make: (floor, at) =>
      makeItem("primitive", { shape, color }, { name: title, floor, position: snap(at), scale }),
  };
}

export const BUILT_IN: PaletteEntry[] = [
  // geometric solids: sized freely with the scale gizmo or the inspector
  primitive("box", "Box", [1, 1, 1], PAINT.wood, "cube"),
  primitive("cylinder", "Cylinder", [0.6, 0.6, 1.2], PAINT.blue, "record"),
  primitive("sphere", "Sphere", [0.6, 0.6, 0.6], PAINT.red, "target"),
  primitive("cone", "Cone", [0.35, 0.35, 0.5], PAINT.orange, "arrow-up"),
  primitive("ramp", "Wedge", [2, 1.2, 0.3], PAINT.slate, "line"),
  // procedural things a robot meets on the floor (the library has modeled ones too)
  primitive("beanbag", "Beanbag", [0.9, 0.9, 0.6], PAINT.red, "sparkle", "Clutter"),
  primitive("bowling_pin", "Bowling pin", [0.12, 0.12, 0.38], PAINT.white, "pin", "Clutter"),
  primitive("pipe", "Pipe", [2, 0.3, 0.3], PAINT.steel, "minus", "Clutter"),
  primitive("soccer_ball", "Soccer ball", [0.22, 0.22, 0.22], PAINT.white, "record", "Clutter"),
  primitive("step_stool", "Step stool", [0.5, 0.45, 0.5], PAINT.blue, "grid", "Clutter"),
  primitive("ladder", "Ladder (lying)", [2.4, 0.45, 0.06], PAINT.yellow, "list", "Clutter"),
  primitive("bucket", "Bucket", [0.32, 0.32, 0.38], PAINT.black, "fill", "Clutter"),
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
