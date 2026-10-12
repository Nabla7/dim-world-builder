// New items with sensible sizes, and an empty project. Colors are data (the world's paint), not page styling.

import type { Floor, HillParams, Item, Project, Quat, Rgb, RoomParams, StairsParams, Vec3 } from "./types.ts";

export const PAINT = {
  concrete: [0.62, 0.62, 0.6] as Rgb,
  wall: [0.82, 0.8, 0.76] as Rgb,
  wood: [0.6, 0.45, 0.3] as Rgb,
  orange: [0.95, 0.45, 0.1] as Rgb,
  blue: [0.25, 0.45, 0.8] as Rgb,
  red: [0.75, 0.2, 0.2] as Rgb,
  green: [0.35, 0.6, 0.3] as Rgb,
  grass: [0.38, 0.52, 0.3] as Rgb,
  slate: [0.35, 0.38, 0.42] as Rgb,
  white: [0.92, 0.92, 0.9] as Rgb,
  black: [0.12, 0.12, 0.13] as Rgb,
  yellow: [0.95, 0.78, 0.15] as Rgb,
  steel: [0.55, 0.57, 0.6] as Rgb,
};

/** a small seeded random number generator (mulberry32), so a scatter or a hill is the same every time */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const IDENTITY: Quat = [0, 0, 0, 1];

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function yaw(angle: number): Quat {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}

export const defaultRoom = (): RoomParams => ({
  width: 6,
  depth: 5,
  height: 2.8,
  wallThickness: 0.15,
  floor: false,
  ceiling: true,
  doors: [{ wall: "south", offset: 0, width: 1.2, height: 2.1 }],
  color: PAINT.wall,
});

export const defaultStairs = (): StairsParams => ({
  steps: 8,
  stepHeight: 0.15,
  stepDepth: 0.3,
  width: 1.2,
  color: PAINT.concrete,
});

export const defaultHill = (): HillParams => ({
  sizeX: 10,
  sizeY: 10,
  amplitude: 0.6,
  roughness: 0.45,
  frequency: 2,
  octaves: 4,
  seed: 7,
  resolution: 64,
  edgeFade: true,
  color: PAINT.grass,
});

type Base = { name: string; floor: string; position?: Vec3; rotation?: Quat; scale?: Vec3 };

export function makeItem<K extends Item["kind"]>(
  kind: K,
  params: Extract<Item, { kind: K }>["params"],
  base: Base,
): Extract<Item, { kind: K }> {
  return {
    id: newId(),
    kind,
    params,
    name: base.name,
    floor: base.floor,
    position: base.position ?? [0, 0, 0],
    rotation: base.rotation ?? IDENTITY,
    scale: base.scale ?? [1, 1, 1],
  } as Extract<Item, { kind: K }>;
}

export function emptyProject(name = "untitled_world"): Project {
  const ground: Floor = { id: "ground", name: "Ground floor", elevation: 0 };
  return {
    format: "dim-world-builder.project.v1",
    name,
    floors: [ground],
    items: [],
    spawns: [{ name: "start", floor: ground.id, position: [0, 0, 0], yaw: 0 }],
    activeFloor: ground.id,
  };
}
