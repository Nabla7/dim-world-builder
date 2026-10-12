// Project -> World: every item as a rigid body of MuJoCo-shaped geometry. The page draws exactly this and the exporter
// writes exactly this, so what the editor shows is what the robot collides with and the lidar sees.

import { fbm } from "./noise.ts";
import type {
  HillParams,
  Item,
  MeshAsset,
  PrimitiveParams,
  Project,
  Quat,
  Rgb,
  RoomParams,
  StairsParams,
  Vec3,
} from "./types.ts";

export type Rgba = [number, number, number, number];

/** "both": collides and is seen; "visual": seen only (lidar, camera); "collision": collides only (hidden). */
export type Role = "both" | "visual" | "collision";

export interface InlineMesh {
  vertices: number[];
  faces: number[];
}

export interface Shape {
  type: "box" | "cylinder" | "sphere" | "ellipsoid" | "mesh" | "hfield";
  pos: Vec3;
  /** [x, y, z, w] */
  quat: Quat;
  /** MuJoCo sizes: box half-extents, cylinder [radius, half-height], sphere [radius], ellipsoid radii */
  size: number[];
  mesh?: InlineMesh;
  meshFile?: { asset: string; file: string; scale: Vec3 };
  hfield?: { nrow: number; ncol: number; size: [number, number, number, number]; elevation: number[] };
  rgba: Rgba;
  role: Role;
}

export interface Body {
  /** MJCF body name and scene entity id */
  name: string;
  label: string;
  kind: string;
  itemId: string;
  floor: string;
  pos: Vec3;
  quat: Quat;
  mocap: boolean;
  shapes: Shape[];
}

export interface WorldMover {
  body: string;
  waypoints: Vec3[];
  speed: number;
  mode: "loop" | "pingpong";
  heading: "path" | "fixed";
}

export interface World {
  bodies: Body[];
  spawns: { name: string; pos: Vec3; yaw: number }[];
  movers: WorldMover[];
}

const IDENTITY: Quat = [0, 0, 0, 1];
const rgba = (color: Rgb, alpha = 1): Rgba => [color[0], color[1], color[2], alpha];

/** MJCF-safe, unique-ish body name from an item's name and id */
export function bodyName(item: Item): string {
  const base = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || item.kind;
  return `${base}_${item.id.slice(0, 6)}`;
}

function box(center: Vec3, size: Vec3, color: Rgba, role: Role = "both"): Shape {
  return {
    type: "box",
    pos: center,
    quat: IDENTITY,
    size: [size[0] / 2, size[1] / 2, size[2] / 2],
    rgba: color,
    role,
  };
}

// ── generated meshes (convex, so MuJoCo's hull of them is the mesh itself) ──

function coneMesh(radius: number, height: number, segments = 24): InlineMesh {
  const vertices: number[] = [0, 0, height, 0, 0, 0];
  const faces: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    vertices.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = 2 + i;
    const b = 2 + ((i + 1) % segments);
    faces.push(0, a, b, 1, b, a);
  }
  return { vertices, faces };
}

/** a wedge rising along +x: full height at +x/2, zero at -x/2 */
function rampMesh(sx: number, sy: number, sz: number): InlineMesh {
  const x0 = -sx / 2, x1 = sx / 2, y0 = -sy / 2, y1 = sy / 2;
  const vertices = [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0, x1, y0, sz, x1, y1, sz];
  const faces = [0, 2, 1, 0, 3, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 3, 5, 2, 0, 4, 5, 0, 5, 3];
  return { vertices, faces };
}

/** a slumped, lumpy blob: an ellipsoid flattened at the bottom, with a soft dent on top */
function beanbagMesh(sx: number, sy: number, sz: number, rings = 12, segments = 24): InlineMesh {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const lump = 1 + 0.06 * Math.sin(theta * 3) * Math.sin(phi);
      let x = Math.sin(phi) * Math.cos(theta) * lump;
      let y = Math.sin(phi) * Math.sin(theta) * lump;
      let z = Math.cos(phi);
      z = z < -0.55 ? -0.55 : z; // sits flat
      if (z > 0.6) z = 0.6 + (z - 0.6) * 0.4; // a seat dent
      x *= sx / 2;
      y *= sy / 2;
      vertices.push(x, y, ((z + 0.55) / 1.15) * sz);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + ((s + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      faces.push(a, c, b, b, c, d);
    }
  }
  return { vertices, faces };
}

function primitiveShapes(params: PrimitiveParams, scale: Vec3): Shape[] {
  const [sx, sy, sz] = scale.map((v) => Math.max(Math.abs(v), 0.01)) as Vec3;
  const color = rgba(params.color);
  const lift: Vec3 = [0, 0, sz / 2];
  switch (params.shape) {
    case "box":
      return [box(lift, [sx, sy, sz], color)];
    case "cylinder":
      return [{
        type: "cylinder",
        pos: lift,
        quat: IDENTITY,
        size: [Math.max(sx, sy) / 2, sz / 2],
        rgba: color,
        role: "both",
      }];
    case "sphere":
      return [{
        type: "ellipsoid",
        pos: lift,
        quat: IDENTITY,
        size: [sx / 2, sy / 2, sz / 2],
        rgba: color,
        role: "both",
      }];
    case "cone":
      return [{
        type: "mesh",
        pos: [0, 0, 0],
        quat: IDENTITY,
        size: [],
        mesh: coneMesh(Math.max(sx, sy) / 2, sz),
        rgba: color,
        role: "both",
      }];
    case "ramp":
      return [{
        type: "mesh",
        pos: [0, 0, 0],
        quat: IDENTITY,
        size: [],
        mesh: rampMesh(sx, sy, sz),
        rgba: color,
        role: "both",
      }];
    case "beanbag":
      return [
        {
          type: "mesh",
          pos: [0, 0, 0],
          quat: IDENTITY,
          size: [],
          mesh: beanbagMesh(sx, sy, sz),
          rgba: color,
          role: "visual",
        },
        {
          type: "ellipsoid",
          pos: [0, 0, sz * 0.45],
          quat: IDENTITY,
          size: [sx * 0.48, sy * 0.48, sz * 0.45],
          rgba: color,
          role: "collision",
        },
      ];
  }
}

/** walls split around door openings; floor slab and ceiling; origin at the room's floor center */
export function roomShapes(p: RoomParams): Shape[] {
  const color = rgba(p.color);
  const t = Math.max(p.wallThickness, 0.02);
  const shapes: Shape[] = [];
  const slab = 0.1;
  if (p.floor) {
    shapes.push(box([0, 0, -slab / 2], [p.width + t, p.depth + t, slab], color));
  }
  if (p.ceiling) {
    shapes.push(box([0, 0, p.height + slab / 2], [p.width + t, p.depth + t, slab], color));
  }
  const walls = [
    { wall: "north", length: p.width + t, center: [0, p.depth / 2], along: [1, 0] },
    { wall: "south", length: p.width + t, center: [0, -p.depth / 2], along: [1, 0] },
    { wall: "east", length: p.depth - t, center: [p.width / 2, 0], along: [0, 1] },
    { wall: "west", length: p.depth - t, center: [-p.width / 2, 0], along: [0, 1] },
  ] as const;
  for (const w of walls) {
    const half = w.length / 2;
    const doors = p.doors
      .filter((d) => d.wall === w.wall)
      .map((d) => {
        const width = Math.min(Math.max(d.width, 0.1), w.length);
        const center = Math.min(Math.max(d.offset, -half + width / 2), half - width / 2);
        return { start: center - width / 2, end: center + width / 2, height: Math.min(d.height, p.height) };
      })
      .sort((a, b) => a.start - b.start);
    // full-height pieces between doors, then a lintel over each door
    let cursor = -half;
    const pieces: { start: number; end: number; bottom: number }[] = [];
    for (const d of doors) {
      if (d.start > cursor) pieces.push({ start: cursor, end: d.start, bottom: 0 });
      if (d.height < p.height) pieces.push({ start: d.start, end: d.end, bottom: d.height });
      cursor = Math.max(cursor, d.end);
    }
    if (cursor < half) pieces.push({ start: cursor, end: half, bottom: 0 });
    for (const piece of pieces) {
      const length = piece.end - piece.start;
      if (length < 1e-3) continue;
      const mid = (piece.start + piece.end) / 2;
      const height = p.height - piece.bottom;
      const cx = w.center[0] + w.along[0] * mid;
      const cy = w.center[1] + w.along[1] * mid;
      const size: Vec3 = w.along[0] ? [length, t, height] : [t, length, height];
      shapes.push(box([cx, cy, piece.bottom + height / 2], size, color));
    }
  }
  return shapes;
}

/** solid steps rising along +x; origin at the bottom of the first step's front edge, centered across */
export function stairsShapes(p: StairsParams): Shape[] {
  const color = rgba(p.color);
  const shapes: Shape[] = [];
  const steps = Math.max(1, Math.round(p.steps));
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * p.stepHeight;
    shapes.push(box([(i + 0.5) * p.stepDepth, 0, top / 2], [p.stepDepth, p.width, top], color));
  }
  return shapes;
}

/** heights in meters on a resolution x resolution grid, rows from -y to +y, columns from -x to +x */
export function hillHeights(p: HillParams): { n: number; heights: Float32Array } {
  const n = Math.max(8, Math.min(256, Math.round(p.resolution)));
  const raw = new Float32Array(n * n);
  let lo = Infinity;
  let hi = -Infinity;
  const scale = p.frequency / 10;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = (col / (n - 1) - 0.5) * p.sizeX;
      const y = (row / (n - 1) - 0.5) * p.sizeY;
      const v = fbm(x * scale + 1000, y * scale + 1000, Math.max(1, Math.round(p.octaves)), p.roughness, p.seed);
      raw[row * n + col] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const heights = new Float32Array(n * n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      let h = hi > lo ? (raw[row * n + col] - lo) / (hi - lo) : 0;
      if (p.edgeFade) {
        const edge = Math.min(col, row, n - 1 - col, n - 1 - row) / ((n - 1) * 0.15);
        const fade = Math.min(1, edge);
        h *= fade * fade * (3 - 2 * fade);
      }
      heights[row * n + col] = h * p.amplitude;
    }
  }
  return { n, heights };
}

export function hillShapes(p: HillParams): Shape[] {
  const { n, heights } = hillHeights(p);
  const top = Math.max(p.amplitude, 1e-3);
  return [{
    type: "hfield",
    pos: [0, 0, 0],
    quat: IDENTITY,
    size: [],
    hfield: {
      nrow: n,
      ncol: n,
      size: [p.sizeX / 2, p.sizeY / 2, top, 0.1],
      // MuJoCo's (and three's PlaneGeometry's) first row is +y; hillHeights' first row is -y
      elevation: Array.from({ length: n * n }, (_, i) => {
        const row = n - 1 - Math.floor(i / n);
        return heights[row * n + (i % n)] / top;
      }),
    },
    rgba: rgba(p.color),
    role: "both",
  }];
}

function meshShapes(asset: MeshAsset | undefined, scale: Vec3): Shape[] {
  if (!asset) return [];
  const shapes: Shape[] = asset.visuals.map((v) => ({
    type: "mesh" as const,
    pos: [0, 0, 0] as Vec3,
    quat: IDENTITY,
    size: [],
    meshFile: { asset: asset.id, file: v.file, scale },
    rgba: v.rgba,
    role: "visual" as const,
  }));
  for (const hull of asset.hulls) {
    shapes.push({
      type: "mesh",
      pos: [0, 0, 0],
      quat: IDENTITY,
      size: [],
      meshFile: { asset: asset.id, file: hull, scale },
      rgba: [0.9, 0.3, 0.9, 1],
      role: "collision",
    });
  }
  return shapes;
}

export function itemShapes(item: Item, assets: Record<string, MeshAsset>): Shape[] {
  switch (item.kind) {
    case "primitive":
      return primitiveShapes(item.params, item.scale);
    case "room":
      return roomShapes(item.params);
    case "stairs":
      return stairsShapes(item.params);
    case "hill":
      return hillShapes(item.params);
    case "mesh":
      return meshShapes(assets[item.params.asset], item.scale);
  }
}

export function buildWorld(project: Project, assets: Record<string, MeshAsset>): World {
  const elevation = new Map(project.floors.map((f) => [f.id, f.elevation]));
  const bodies: Body[] = [];
  const movers: WorldMover[] = [];
  for (const item of project.items) {
    const lift = elevation.get(item.floor) ?? 0;
    const name = bodyName(item);
    const mover = item.mover && item.mover.waypoints.length >= 2 && item.mover.speed > 0;
    bodies.push({
      name,
      label: item.name,
      kind: item.kind === "primitive" ? item.params.shape : item.kind,
      itemId: item.id,
      floor: item.floor,
      pos: [item.position[0], item.position[1], item.position[2] + lift],
      quat: item.rotation,
      mocap: Boolean(mover),
      shapes: itemShapes(item, assets),
    });
    if (mover && item.mover) {
      movers.push({
        body: name,
        waypoints: item.mover.waypoints.map((w) => [w[0], w[1], w[2] + lift] as Vec3),
        speed: item.mover.speed,
        mode: item.mover.mode,
        heading: item.mover.heading,
      });
    }
  }
  const spawns = project.spawns.map((s) => ({
    name: s.name,
    pos: [s.position[0], s.position[1], s.position[2] + (elevation.get(s.floor) ?? 0)] as Vec3,
    yaw: s.yaw,
  }));
  return { bodies, spawns, movers };
}
