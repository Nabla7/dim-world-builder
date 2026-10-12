// Project -> World: every item as a rigid body of MuJoCo-shaped geometry. The page draws exactly this and the exporter
// writes exactly this, so what the editor shows is what the robot collides with and the lidar sees.

import { fbm } from "./noise.ts";
import type {
  AprilTagParams,
  DoorOpening,
  Floor,
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
/** "editor": drawn only in the editor (a handle to pick), never exported */
export type Role = "both" | "visual" | "collision" | "editor";

export interface InlineMesh {
  vertices: number[];
  faces: number[];
  /** per-vertex (u, v), when the mesh carries an image */
  texcoords?: number[];
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
  /** an image on the shape's +x face (AprilTags): a path under the app's assets, e.g. apriltags/tag36h11_00003.png */
  texture?: string;
  hfield?: {
    nrow: number;
    ncol: number;
    size: [number, number, number, number];
    elevation: number[];
  };
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
  /** where MuJoCo's infinite ground plane sits: 0, or under the ground floor's slab */
  groundZ: number;
  bodies: Body[];
  spawns: { name: string; pos: Vec3; yaw: number }[];
  movers: WorldMover[];
}

const IDENTITY: Quat = [0, 0, 0, 1];
const rgba = (color: Rgb, alpha = 1): Rgba => [color[0], color[1], color[2], alpha];

/** MJCF-safe, unique-ish body name from an item's name and id */
export function bodyName(item: Item): string {
  if (item.key) return item.key;
  const base = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") ||
    item.kind;
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

/** rotation of `angle` about a unit axis, as [x, y, z, w] */
function axisAngle(axis: Vec3, angle: number): Quat {
  const half = Math.sin(angle / 2);
  return [axis[0] * half, axis[1] * half, axis[2] * half, Math.cos(angle / 2)];
}

function rotatedBox(center: Vec3, size: Vec3, quat: Quat, color: Rgba, role: Role = "both"): Shape {
  return { ...box(center, size, color, role), quat };
}

function cylinderAlong(
  axis: "x" | "y" | "z",
  center: Vec3,
  radius: number,
  length: number,
  color: Rgba,
  role: Role = "both",
): Shape {
  const quat: Quat = axis === "z"
    ? IDENTITY
    : axis === "x"
    ? axisAngle([0, 1, 0], Math.PI / 2)
    : axisAngle([1, 0, 0], Math.PI / 2);
  return { type: "cylinder", pos: center, quat, size: [radius, length / 2], rgba: color, role };
}

/** a surface of revolution around +z from a (radius, height) profile; `closed` caps both ends */
function latheMesh(profile: [number, number][], segments = 24): InlineMesh {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (const [r, z] of profile) {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      vertices.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring++) {
    for (let s = 0; s < segments; s++) {
      const a = ring * segments + s;
      const b = ring * segments + ((s + 1) % segments);
      faces.push(a, b, a + segments, b, b + segments, a + segments);
    }
  }
  return { vertices, faces };
}

function mapVertices(mesh: InlineMesh, f: (x: number, y: number, z: number) => Vec3): InlineMesh {
  const vertices: number[] = [];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    vertices.push(...f(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]));
  }
  return { vertices, faces: mesh.faces };
}

const visualMesh = (mesh: InlineMesh, color: Rgba): Shape => ({
  type: "mesh",
  pos: [0, 0, 0],
  quat: IDENTITY,
  size: [],
  mesh,
  rgba: color,
  role: "visual",
});

/** a bowling pin: a lathe for the look, an ellipsoid belly + neck + head to collide with */
function bowlingPinShapes(sx: number, sy: number, sz: number, color: Rgba): Shape[] {
  const r = Math.max(sx, sy) / 2;
  const profile: [number, number][] = [
    [0, 0],
    [0.55, 0],
    [0.8, 0.08],
    [1, 0.25],
    [0.95, 0.4],
    [0.62, 0.58],
    [0.42, 0.7],
    [0.5, 0.82],
    [0.55, 0.9],
    [0.42, 0.97],
    [0, 1],
  ];
  const pin = latheMesh(profile.map(([pr, pz]) => [pr * r, pz * sz]));
  return [
    visualMesh(pin, color),
    {
      type: "ellipsoid",
      pos: [0, 0, 0.28 * sz],
      quat: IDENTITY,
      size: [r, r, 0.28 * sz],
      rgba: color,
      role: "collision",
    },
    cylinderAlong("z", [0, 0, 0.64 * sz], 0.5 * r, 0.2 * sz, color, "collision"),
    {
      type: "sphere",
      pos: [0, 0, 0.87 * sz],
      quat: IDENTITY,
      size: [0.55 * r],
      rgba: color,
      role: "collision",
    },
  ];
}

/** a hollow pipe lying along x: a tube for the look, a ring of boxes to collide with (MuJoCo can't do hollow) */
function pipeShapes(sx: number, sy: number, sz: number, color: Rgba): Shape[] {
  const radius = Math.min(sy, sz) / 2;
  const wall = Math.max(0.01, radius * 0.15);
  const inner = radius - wall;
  const half = sx / 2;
  const tube = latheMesh([[inner, -half], [radius, -half], [radius, half], [inner, half], [
    inner,
    -half,
  ]], 28);
  const shapes: Shape[] = [visualMesh(mapVertices(tube, (x, y, z) => [z, x, y + radius]), color)];
  const pieces = 14;
  const chord = 2 * radius * Math.sin(Math.PI / pieces) * 1.05;
  for (let i = 0; i < pieces; i++) {
    const a = (i / pieces) * Math.PI * 2;
    const middle = radius - wall / 2;
    shapes.push(rotatedBox(
      [0, Math.cos(a) * middle, radius + Math.sin(a) * middle],
      [sx, wall, chord],
      axisAngle([1, 0, 0], a),
      color,
      "collision",
    ));
  }
  return shapes;
}

/** a two-step stool: a low step in front (-x), the top step behind (+x), each on its own side panels */
function stepStoolShapes(sx: number, sy: number, sz: number, color: Rgba): Shape[] {
  const t = Math.min(0.03, sz * 0.08);
  const low = sz * 0.48;
  const shapes: Shape[] = [];
  for (const [x, height] of [[-sx / 4, low], [sx / 4, sz]] as const) {
    shapes.push(box([x, 0, height - t / 2], [sx / 2, sy, t], color));
    for (const side of [1, -1]) {
      shapes.push(box([x, side * (sy / 2 - t / 2), height / 2], [sx / 2, t, height], color));
    }
  }
  return shapes;
}

/** a ladder lying flat on the ground: two rails along x and round rungs across */
function ladderShapes(sx: number, sy: number, sz: number, color: Rgba): Shape[] {
  const rail = Math.min(0.05, sy * 0.12);
  const shapes = [
    box([0, sy / 2 - rail / 2, sz / 2], [sx, rail, sz], color),
    box([0, -sy / 2 + rail / 2, sz / 2], [sx, rail, sz], color),
  ];
  const rungs = Math.max(2, Math.round(sx / 0.3));
  for (let i = 0; i < rungs; i++) {
    const x = -sx / 2 + (i + 0.5) * (sx / rungs);
    shapes.push(cylinderAlong("y", [x, 0, sz / 2], sz * 0.3, sy - 2 * rail, color));
  }
  return shapes;
}

/** an open-topped bucket / can: tapered walls you can see into, a solid cylinder to collide with */
function bucketShapes(sx: number, sy: number, sz: number, color: Rgba): Shape[] {
  const r = Math.max(sx, sy) / 2;
  const wall = latheMesh([[0, 0], [r * 0.82, 0], [r, sz], [r * 0.94, sz], [r * 0.77, 0.03 * sz], [
    0,
    0.03 * sz,
  ]]);
  return [
    visualMesh(wall, color),
    cylinderAlong("z", [0, 0, sz / 2], r * 0.92, sz, color, "collision"),
  ];
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
    case "bowling_pin":
      return bowlingPinShapes(sx, sy, sz, color);
    case "pipe":
      return pipeShapes(sx, sy, sz, color);
    case "soccer_ball":
      return [{
        type: "sphere",
        pos: [0, 0, Math.max(sx, sy, sz) / 2],
        quat: IDENTITY,
        size: [Math.max(sx, sy, sz) / 2],
        rgba: color,
        role: "both",
      }];
    case "step_stool":
      return stepStoolShapes(sx, sy, sz, color);
    case "ladder":
      return ladderShapes(sx, sy, sz, color);
    case "bucket":
      return bucketShapes(sx, sy, sz, color);
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
    const openings = p.doors
      .filter((d) => d.wall === w.wall)
      .map((d) => {
        const width = Math.min(Math.max(d.width, 0.1), w.length);
        const center = Math.min(Math.max(d.offset, -half + width / 2), half - width / 2);
        const bottom = Math.min(Math.max(d.bottom ?? 0, 0), p.height - 0.05);
        return {
          start: center - width / 2,
          end: center + width / 2,
          bottom,
          top: Math.min(Math.max(d.height, bottom + 0.05), p.height),
        };
      })
      .sort((a, b) => a.start - b.start);
    // full-height pieces between openings; under each opening its sill, over it its lintel
    let cursor = -half;
    const pieces: { start: number; end: number; bottom: number; top: number }[] = [];
    for (const o of openings) {
      if (o.start > cursor) pieces.push({ start: cursor, end: o.start, bottom: 0, top: p.height });
      if (o.bottom > 0) pieces.push({ start: o.start, end: o.end, bottom: 0, top: o.bottom });
      if (o.top < p.height) {
        pieces.push({ start: o.start, end: o.end, bottom: o.top, top: p.height });
      }
      cursor = Math.max(cursor, o.end);
    }
    if (cursor < half) pieces.push({ start: cursor, end: half, bottom: 0, top: p.height });
    for (const piece of pieces) {
      const length = piece.end - piece.start;
      const height = piece.top - piece.bottom;
      if (length < 1e-3 || height < 1e-3) continue;
      const mid = (piece.start + piece.end) / 2;
      const cx = w.center[0] + w.along[0] * mid;
      const cy = w.center[1] + w.along[1] * mid;
      const size: Vec3 = w.along[0] ? [length, t, height] : [t, length, height];
      shapes.push(box([cx, cy, piece.bottom + height / 2], size, color));
    }
  }
  return shapes;
}

/** a ready-made opening of each kind (offset 0, on the given wall) */
export function openingPreset(kind: DoorOpening["kind"], wall: DoorOpening["wall"]): DoorOpening {
  switch (kind) {
    case "double":
      return { wall, kind, offset: 0, width: 1.8, height: 2.1, bottom: 0 };
    case "window":
      return { wall, kind, offset: 0, width: 1.2, height: 2.0, bottom: 0.9 };
    case "crawl":
      return { wall, kind, offset: 0, width: 0.7, height: 0.6, bottom: 0 };
    case "arch":
      return { wall, kind, offset: 0, width: 2.4, height: 2.5, bottom: 0 };
    default:
      return { wall, kind: "door", offset: 0, width: 0.9, height: 2.1, bottom: 0 };
  }
}

/** one straight flight rising along +x from x0 (at height z0), solid or open-riser */
function flight(
  p: StairsParams,
  steps: number,
  x0: number,
  y: number,
  z0: number,
  direction: 1 | -1,
  color: Rgba,
): Shape[] {
  const shapes: Shape[] = [];
  const tread = Math.min(Math.max(p.treadThickness ?? 0.04, 0.01), p.stepHeight * 0.9);
  for (let i = 0; i < steps; i++) {
    const top = z0 + (i + 1) * p.stepHeight;
    const x = x0 + direction * (i + 0.5) * p.stepDepth;
    if (p.openRisers) {
      shapes.push(box([x, y, top - tread / 2], [p.stepDepth + 0.02, p.width, tread], color));
    } else {
      const bottom = z0;
      shapes.push(box([x, y, (top + bottom) / 2], [p.stepDepth, p.width, top - bottom], color));
    }
  }
  const run = steps * p.stepDepth;
  const rise = steps * p.stepHeight;
  const slope = axisAngle([0, 1, 0], -direction * Math.atan2(rise, run));
  const length = Math.hypot(run, rise);
  if (p.openRisers) {
    const depth = Math.min(0.2, p.stepHeight * 1.2);
    for (const side of [1, -1]) {
      shapes.push(rotatedBox(
        [x0 + direction * run / 2, y + side * (p.width / 2 + 0.02), z0 + rise / 2 - depth / 2],
        [length, 0.04, depth],
        slope,
        color,
      ));
    }
  }
  shapes.push(...railings(p, x0, y, z0, direction, run, rise, color));
  return shapes;
}

/** handrails along a flight's sides: posts and a top rail, a solid panel, or posts and three cables */
function railings(
  p: StairsParams,
  x0: number,
  y: number,
  z0: number,
  direction: 1 | -1,
  run: number,
  rise: number,
  color: Rgba,
): Shape[] {
  const which = p.railing ?? "none";
  if (which === "none") return [];
  const sides = which === "both" ? [1, -1] : which === "left" ? [1] : [-1];
  const style = p.railingStyle ?? "posts";
  const height = 0.9;
  const slopeAngle = Math.atan2(rise, run);
  const slope = axisAngle([0, 1, 0], -direction * slopeAngle);
  const length = Math.hypot(run, rise);
  const metal: Rgba = [0.35, 0.36, 0.38, 1];
  const shapes: Shape[] = [];
  for (const side of sides) {
    const ry = y + side * (p.width / 2 + 0.05);
    const at = (fraction: number, lift: number): Vec3 => [
      x0 + direction * run * fraction,
      ry,
      z0 + rise * fraction + lift,
    ];
    if (style === "panel") {
      shapes.push(
        rotatedBox(at(0.5, height / 2 + p.stepHeight / 2), [length, 0.03, height], slope, color),
      );
      continue;
    }
    const posts = Math.max(2, Math.round(run / 0.6) + 1);
    for (let i = 0; i < posts; i++) {
      const f = i / (posts - 1);
      const base = at(f, p.stepHeight);
      shapes.push({
        type: "cylinder",
        pos: [base[0], base[1], base[2] + height / 2],
        quat: IDENTITY,
        size: [0.02, height / 2],
        rgba: metal,
        role: "both",
      });
    }
    const rails = style === "cables" ? [0.3, 0.6, 0.9] : [1];
    for (const r of rails) {
      shapes.push(
        rotatedBox(at(0.5, p.stepHeight + height * r), [length + 0.1, 0.04, 0.04], slope, metal),
      );
    }
  }
  return shapes;
}

/** stairs; origin at the bottom of the first step's front edge, centered across */
export function stairsShapes(p: StairsParams): Shape[] {
  const color = rgba(p.color);
  const steps = Math.max(1, Math.round(p.steps));
  const style = p.style ?? "straight";
  if (style === "switchback") {
    // up along +x, a landing, then back along -x beside the first flight
    const first = Math.ceil(steps / 2);
    const second = steps - first;
    const run1 = first * p.stepDepth;
    const landingZ = first * p.stepHeight;
    const gap = 0.1;
    const offset = p.width + gap;
    const landing = p.width;
    const shapes = flight(p, first, 0, 0, 0, 1, color);
    shapes.push(box(
      [run1 + landing / 2, offset / 2, landingZ / 2],
      [landing, p.width * 2 + gap, landingZ],
      color,
    ));
    shapes.push(...flight(p, second, run1, offset, landingZ, -1, color));
    return shapes;
  }
  if (style === "spiral") {
    // wedge-like treads around a center post, climbing counterclockwise
    const turn = ((p.spiralTurn ?? 360) * Math.PI) / 180;
    const core = Math.max(0.05, p.spiralCore ?? 0.1);
    const outer = core + p.width;
    const tread = Math.min(Math.max(p.treadThickness ?? 0.05, 0.02), p.stepHeight * 0.9);
    const step = turn / steps;
    const shapes: Shape[] = [{
      type: "cylinder",
      pos: [0, 0, (steps * p.stepHeight + 1) / 2],
      quat: IDENTITY,
      size: [core, (steps * p.stepHeight + 1) / 2],
      rgba: color,
      role: "both",
    }];
    const middle = (core + outer) / 2;
    const chord = 2 * outer * Math.sin(step / 2) * 1.05;
    for (let i = 0; i < steps; i++) {
      const angle = (i + 0.5) * step;
      const top = (i + 1) * p.stepHeight;
      shapes.push(rotatedBox(
        [Math.cos(angle) * middle, Math.sin(angle) * middle, top - tread / 2],
        [outer - core, chord, tread],
        axisAngle([0, 0, 1], angle),
        color,
      ));
      if (p.railing && p.railing !== "none") {
        shapes.push({
          type: "cylinder",
          pos: [Math.cos(angle) * (outer - 0.04), Math.sin(angle) * (outer - 0.04), top + 0.45],
          quat: IDENTITY,
          size: [0.02, 0.45],
          rgba: [0.35, 0.36, 0.38, 1],
          role: "both",
        });
      }
    }
    return shapes;
  }
  return flight(p, steps, 0, 0, 0, 1, color);
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
      const v = fbm(
        x * scale + 1000,
        y * scale + 1000,
        Math.max(1, Math.round(p.octaves)),
        p.roughness,
        p.seed,
      );
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
    case "hole":
      // the hole is cut out of its floor's slab (floorSlab); this is only a handle to pick it by in the editor
      return [box(
        [0, 0, -item.params.depth / 2],
        [item.params.sizeX, item.params.sizeY, item.params.depth],
        [0.9, 0.3, 0.2, 0.18],
        "editor",
      )];
    case "apriltag":
      return aprilTagShapes(item.params);
  }
}

/**
 * the AprilTag printed with its white margin (10 cells around tag36h11's 8-cell black square), facing +x: a thin
 * slab whose front face carries the image (texcoords set so it reads correctly from in front, +y to the right)
 */
export function aprilTagShapes(p: AprilTagParams): Shape[] {
  const h = (p.size * (10 / 8)) / 2;
  const t = 0.002;
  // front corners (x = t) then back corners (x = 0): bottom-left, bottom-right, top-right, top-left as seen from +x
  const vertices = [t, -h, -h, t, h, -h, t, h, h, t, -h, h, 0, -h, -h, 0, h, -h, 0, h, h, 0, -h, h];
  const faces = [
    0,
    1,
    2,
    0,
    2,
    3,
    4,
    6,
    5,
    4,
    7,
    6,
    0,
    4,
    5,
    0,
    5,
    1,
    1,
    5,
    6,
    1,
    6,
    2,
    2,
    6,
    7,
    2,
    7,
    3,
    3,
    7,
    4,
    3,
    4,
    0,
  ];
  const texcoords = [0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0];
  return [{
    type: "mesh",
    pos: [0, 0, 0],
    quat: IDENTITY,
    size: [t / 2, h, h],
    mesh: { vertices, faces, texcoords },
    rgba: [1, 1, 1, 1],
    role: "visual",
    texture: `apriltags/${p.family}_${String(p.id).padStart(5, "0")}.png`,
  }];
}

/** a floor's slab with its holes cut out: boxes over the cells a grid of the hole edges makes; pits keep a bottom */
export function floorSlab(floor: Floor, holes: Item[], elevation: number): Body | null {
  const slab = floor.slab;
  if (!slab || slab.thickness <= 0) return null;
  const color: Rgba = [0.26, 0.27, 0.29, 1];
  const x0 = slab.center[0] - slab.sizeX / 2, x1 = slab.center[0] + slab.sizeX / 2;
  const y0 = slab.center[1] - slab.sizeY / 2, y1 = slab.center[1] + slab.sizeY / 2;
  const rects = holes.flatMap((h) =>
    h.kind === "hole"
      ? [{
        x0: Math.max(x0, h.position[0] - h.params.sizeX / 2),
        x1: Math.min(x1, h.position[0] + h.params.sizeX / 2),
        y0: Math.max(y0, h.position[1] - h.params.sizeY / 2),
        y1: Math.min(y1, h.position[1] + h.params.sizeY / 2),
        depth: Math.min(h.params.depth, slab.thickness),
      }]
      : []
  ).filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  const xs = [...new Set([x0, x1, ...rects.flatMap((r) => [r.x0, r.x1])])].sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...rects.flatMap((r) => [r.y0, r.y1])])].sort((a, b) => a - b);
  const shapes: Shape[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    // the cells of this row, each the depth cut there (0: solid), merged into runs of equal depth
    let run: { start: number; depth: number } | null = null;
    const flush = (end: number) => {
      if (!run) return;
      const top = -run.depth;
      const bottom = -slab.thickness;
      if (top - bottom > 1e-6) {
        shapes.push(box(
          [(run.start + end) / 2, (ys[j] + ys[j + 1]) / 2, (top + bottom) / 2],
          [end - run.start, ys[j + 1] - ys[j], top - bottom],
          color,
        ));
      }
      run = null;
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      const depth = Math.max(
        0,
        ...rects.filter((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1).map((r) =>
          r.depth
        ),
      );
      if (run && run.depth !== depth) flush(xs[i]);
      run ??= { start: xs[i], depth };
    }
    flush(xs[xs.length - 1]);
  }
  return {
    name: `slab_${floor.id.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
    label: `${floor.name} slab`,
    kind: "slab",
    itemId: `slab:${floor.id}`,
    floor: floor.id,
    pos: [0, 0, elevation],
    quat: IDENTITY,
    mocap: false,
    shapes,
  };
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
  let groundZ = 0;
  for (const floor of project.floors) {
    const slab = floorSlab(
      floor,
      project.items.filter((i) => i.kind === "hole" && i.floor === floor.id),
      floor.elevation,
    );
    if (slab) {
      bodies.push(slab);
      if (floor.elevation === Math.min(...project.floors.map((f) => f.elevation))) {
        groundZ = floor.elevation - (floor.slab?.thickness ?? 0);
      }
    }
  }
  const spawns = project.spawns.map((s) => ({
    name: s.name,
    pos: [s.position[0], s.position[1], s.position[2] + (elevation.get(s.floor) ?? 0)] as Vec3,
    yaw: s.yaw,
  }));
  return { groundZ, bodies, spawns, movers };
}
