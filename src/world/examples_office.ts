// The 555 office, both floors, traced from its lidar floor plans ("555 OFFICE - FLOOR 1/2", same frame, meters): walls
// as thin boxes along the scanned wall lines (trimmed where they meet so they don't overlap), the two stairs as a long
// straight flight and a 90° turn stairs, and furniture from the library where the scan shows desks, chairs,
// boxes, shelves and couches. Floor 2 sits 4.7 m above floor 1 over the building's west block.

import { defaultLight, defaultStairs, emptyProject, makeItem, PAINT, yaw } from "./defaults.ts";
import type { Item, Project, Rgb, Vec3 } from "./types.ts";

const WALL = 0.15;
const UPPER = "upper";
const UPPER_Z = 4.7;
const UPPER_SLAB = 0.3;
// the angles below were written for these two facing the other way
const BACKWARD = new Set(["office_chair", "computer_monitor"]);
const FLOOR: Rgb = [0.66, 0.64, 0.6];
// near-white paint
const WALL_PAINT: Rgb = [0.93, 0.92, 0.9];

type Segment = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  height: number;
  /** its foot above the floor (a window's lintel) */
  bottom?: number;
  floor: string;
  name: string;
};

/**
 * Closed joins with no overlap (lidar can't see through, the clip check stays quiet). Where two walls' ends meet (an L
 * corner) the earlier wall runs on to the corner's outer face and the later one stops at its inner face; a wall ending
 * against another wall's side (a T) stops at that face.
 */
function trimmed(walls: Segment[]): Segment[] {
  const half = WALL / 2;
  const ends = (w: Segment): [number, number][] => [[w.x0, w.y0], [w.x1, w.y1]];
  const inside = (w: Segment, x: number, y: number) => {
    const dx = w.x1 - w.x0;
    const dy = w.y1 - w.y0;
    const length = Math.hypot(dx, dy);
    const along = ((x - w.x0) * dx + (y - w.y0) * dy) / length;
    const across = Math.abs((x - w.x0) * dy - (y - w.y0) * dx) / length;
    return along > -1e-6 && along < length + 1e-6 && across < half + 1e-6;
  };
  return walls.map((w, index) => {
    const length = Math.hypot(w.x1 - w.x0, w.y1 - w.y0);
    const ux = (w.x1 - w.x0) / length;
    const uy = (w.y1 - w.y0) / length;
    const others = walls.map((o, k) => ({ o, k })).filter(({ o }) =>
      o !== w && o.floor === w.floor
    );
    /** how far to move this end outward (+) or inward (-) */
    const shift = (x: number, y: number): number => {
      const corner = others.find(({ o }) =>
        ends(o).some(([ex, ey]) => Math.hypot(ex - x, ey - y) < half)
      );
      if (corner) {
        const { o } = corner;
        const ol = Math.hypot(o.x1 - o.x0, o.y1 - o.y0);
        const square = Math.abs(ux * (o.x1 - o.x0) / ol + uy * (o.y1 - o.y0) / ol) < 0.2;
        // at a slanted join running on would poke through the other wall: meet it at its centerline instead
        if (!square) return 0;
        return corner.k > index ? half : -half;
      }
      return others.some(({ o }) => inside(o, x, y)) ? -half : 0;
    };
    const start = shift(w.x0, w.y0);
    const end = shift(w.x1, w.y1);
    return {
      ...w,
      x0: w.x0 - ux * start,
      y0: w.y0 - uy * start,
      x1: w.x1 + ux * end,
      y1: w.y1 + uy * end,
    };
  }).filter((w) => Math.hypot(w.x1 - w.x0, w.y1 - w.y0) > WALL); // a jog no longer than a wall is thick is already closed
}

function wallItem(w: Segment): Item {
  const length = Math.hypot(w.x1 - w.x0, w.y1 - w.y0);
  return makeItem("primitive", { shape: "box", color: WALL_PAINT }, {
    name: w.name,
    floor: w.floor,
    position: [round((w.x0 + w.x1) / 2), round((w.y0 + w.y1) / 2), w.bottom ?? 0],
    rotation: yaw(Math.atan2(w.y1 - w.y0, w.x1 - w.x0)),
    scale: [round(length), WALL, w.height],
  });
}

export function office555(): Project {
  const project = emptyProject("office_555");
  const ground = project.floors[0].id;
  project.floors[0].name = "Floor 1";
  // the scan spans x -0.5..29.8, y -12.6..17.6
  // a light office floor, so shadows read
  project.floors[0].slab = {
    thickness: 1.5,
    sizeX: 36,
    sizeY: 36,
    center: [14.6, 2.5],
    color: FLOOR,
    finish: "concrete",
  };
  project.floors.push({
    id: UPPER,
    name: "Floor 2",
    elevation: UPPER_Z,
    slab: { thickness: UPPER_SLAB, sizeX: 10.5, sizeY: 30.2, center: [4.7, 2.5], color: FLOOR },
  });

  const walls: Segment[] = [];
  // pieces standing inside a window's gap: the joins don't apply to them (they'd trim a mullion away)
  const inGaps: Segment[] = [];
  /** a run of wall along x0,y0 -> x1,y1 with gaps (door openings) at [from, to] distances along it */
  const wall = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    floor = ground,
    height = 3,
    gaps: [number, number][] = [],
    name = "Wall",
  ) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / length;
    const uy = (y1 - y0) / length;
    let start = 0;
    for (
      const [from, to] of [
        ...gaps.sort((a, b) => a[0] - b[0]),
        [length, length] as [number, number],
      ]
    ) {
      if (from - start > 0.05) {
        walls.push({
          x0: x0 + ux * start,
          y0: y0 + uy * start,
          x1: x0 + ux * from,
          y1: y0 + uy * from,
          height,
          floor,
          name,
        });
      }
      start = to;
    }
  };

  /**
   * a big window in a run of wall: pass its [from, to] as one of the wall's gaps, then this fills the gap below `sill`
   * and above `head` and stands mullions about every 2.4 m
   */
  const bigWindow = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    [from, to]: [number, number],
    sill: number,
    head: number,
    height: number,
    floor = ground,
  ) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / length;
    const uy = (y1 - y0) / length;
    const at = (d: number): [number, number] => [x0 + ux * d, y0 + uy * d];
    const piece = (a: number, b: number, bottom: number, top: number, name: string) => {
      const [ax, ay] = at(a);
      const [bx, by] = at(b);
      inGaps.push({ x0: ax, y0: ay, x1: bx, y1: by, bottom, height: top - bottom, floor, name });
    };
    piece(from, to, 0, sill, "Window sill wall");
    piece(from, to, head, height, "Window lintel");
    const panes = Math.max(1, Math.round((to - from) / 2.4));
    for (let i = 1; i < panes; i++) {
      const d = from + ((to - from) * i) / panes;
      piece(d - 0.08, d + 0.08, sill, head, "Window mullion");
    }
  };

  // ── floor 1: the shell (west block walls reach floor 2's slab; the east hall is double height) ──
  const shell = 6;
  const west = UPPER_Z - UPPER_SLAB;
  wall(-0.45, -12.45, -0.45, 17.55, ground, west, [[27.05, 28.85]], "Outer wall"); // the west entrance at y 14.6..16.4
  wall(-0.45, 17.55, 9.85, 17.55, ground, west, [], "Outer wall");
  wall(9.95, 17.55, 29.7, 17.55, ground, shell, [], "Outer wall");
  // the east hall's outer wall: two big windows, their sills above the shelving
  wall(29.7, 17.55, 29.7, -12.6, ground, shell, [[4.5, 11.5], [18.5, 25.5]], "Outer wall");
  bigWindow(29.7, 17.55, 29.7, -12.6, [4.5, 11.5], 2.0, 5.0, shell);
  bigWindow(29.7, 17.55, 29.7, -12.6, [18.5, 25.5], 2.0, 5.0, shell);
  wall(29.7, -12.6, 9.9, -12.6, ground, shell, [], "Outer wall");
  wall(9.9, -12.6, 9.9, -12.45, ground, west, [], "Outer wall");
  wall(9.9, -12.45, -0.45, -12.45, ground, west, [], "Outer wall");

  // meeting room (x 3.45..9.85, y 6.9..11.25) with a phone pod at its south door
  wall(3.45, 11.25, 9.85, 11.25, ground, west, [], "Meeting room wall");
  wall(3.45, 11.25, 3.45, 6.9, ground, west, [], "Meeting room wall");
  wall(3.45, 6.9, 9.85, 6.9, ground, west, [[2.55, 3.75]], "Meeting room wall");
  wall(9.85, 6.9, 9.85, 11.25, ground, west, [], "Meeting room wall");
  wall(6.0, 6.9, 6.0, 8.9, ground, 2.4, [], "Phone pod");
  wall(7.2, 6.9, 7.2, 8.9, ground, 2.4, [], "Phone pod");
  wall(6.0, 8.9, 7.2, 8.9, ground, 2.4, [[0.3, 0.9]], "Phone pod");
  // the stairwell's north wall
  wall(-0.45, 11.1, 3.45, 11.1, ground, west, [], "Stairwell wall");

  // the lab (x -0.45..9.55, y -3.7..5.15): a door onto the corner stairs' foot, a wide opening to the stairwell, a door south
  wall(-0.45, 5.15, 9.55, 5.15, ground, west, [[0.15, 1.15], [2.05, 3.75]], "Lab wall");
  wall(9.55, 5.15, 9.55, -7.1, ground, west, [], "Lab wall");
  wall(1.8, -3.65, 5.3, -3.65, ground, 3, [], "Lab wall");
  wall(6.35, -3.85, 9.55, -4.85, ground, 3, [], "Lab wall");
  // the small room south-west of the lab
  wall(0.45, -1.95, 1.8, -1.95, ground, 3, [], "Small room wall");
  wall(1.8, -1.95, 1.8, -4.45, ground, 3, [], "Small room wall");
  wall(-0.45, -4.45, 1.8, -4.45, ground, 3, [[0.0, 0.9]], "Small room wall");

  // the south rooms
  wall(1.45, -7.0, 1.45, -11.15, ground, 3, [[2.0, 3.6]], "South room wall");
  wall(1.45, -11.15, 6.35, -11.15, ground, 3, [[3.6, 4.6]], "South room wall");
  wall(6.35, -11.15, 6.35, -7.35, ground, 3, [], "South room wall");
  wall(6.6, -7.3, 9.55, -7.3, ground, 3, [], "South room wall");
  wall(6.35, -10.55, 9.55, -10.55, ground, 3, [[1.0, 2.0]], "South room wall");
  wall(9.55, -7.1, 9.55, -12.45, ground, west, [[3.5, 4.5]], "South room wall");

  // ── floor 2 ──
  const up = UPPER;
  wall(-0.45, -12.5, -0.45, 17.55, up, 3, [], "Outer wall");
  wall(-0.45, 17.55, 9.85, 17.55, up, 3, [], "Outer wall");
  wall(9.85, 17.55, 9.85, -12.5, up, 3, [], "Outer wall");
  wall(9.85, -12.5, -0.45, -12.5, up, 3, [], "Outer wall");
  // north: the kitchen (x -0.45..4.85, y 11.1..17.55), two rooms east of it, the big room south of those
  wall(-0.45, 11.1, 4.5, 11.1, up, 3, [[3.4, 4.5]], "Kitchen wall");
  wall(4.85, 17.55, 4.85, 14.1, up, 3, [], "Room wall");
  wall(4.85, 14.1, 9.85, 14.1, up, 3, [[0.75, 1.75], [3.35, 4.25]], "Room wall");
  wall(7.85, 17.55, 7.85, 14.1, up, 3, [], "Room wall");
  wall(5.4, 8.3, 5.4, 11.6, up, 3, [], "Big room wall");
  // rails along the corner stairwell's long sides (it opens at its east end, where the stairs arrive)
  wall(0.6, 8.92, 3.4, 8.92, up, 1.1, [], "Stairwell rail");
  wall(0.6, 10.26, 3.4, 10.26, up, 1.1, [], "Stairwell rail");
  // south: two rooms west of the corridor, three east of it
  wall(-0.45, -2.05, 4.2, -2.05, up, 3, [], "Room wall");
  wall(5.8, -2.05, 9.85, -2.05, up, 3, [], "Room wall");
  wall(4.2, -2.05, 4.2, -12.5, up, 3, [[0.9, 1.9], [6.4, 7.4]], "Room wall");
  wall(5.8, -2.05, 5.8, -12.5, up, 3, [[2.8, 3.8], [6.5, 7.5], [9.0, 10.0]], "Room wall");
  wall(-0.45, -7.85, 4.2, -7.85, up, 3, [], "Room wall");
  wall(5.8, -7.85, 9.85, -7.85, up, 3, [], "Room wall");
  wall(5.8, -10.05, 9.85, -10.05, up, 3, [], "Room wall");

  const items: Item[] = [...trimmed(walls), ...inGaps].map(wallItem);
  const add = (...more: Item[]) => items.push(...more);
  const mesh = (
    asset: string,
    floor: string,
    x: number,
    y: number,
    angle = 0,
    z = 0,
    name = asset,
  ) =>
    makeItem("mesh", { source: "library", asset }, {
      name: name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      floor,
      position: [round(x), round(y), z] as Vec3,
      rotation: yaw(angle + (BACKWARD.has(asset) ? Math.PI : 0)),
    });
  const box = (
    floor: string,
    x: number,
    y: number,
    size: Vec3,
    color: Rgb,
    name: string,
    angle = 0,
  ) =>
    makeItem("primitive", { shape: "box", color }, {
      name,
      floor,
      position: [round(x), round(y), 0],
      rotation: yaw(angle),
      scale: size,
    });
  const D = Math.PI / 180;

  /** a workstation: a desk with a monitor and a tower on it and a chair pulled up on the side `facing` (radians) */
  const station = (floor: string, x: number, y: number, facing: number) => {
    // the desk's long side runs across `facing`; the chair sits in front of it
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    add(mesh("desk", floor, x, y, facing + Math.PI / 2));
    add(
      mesh(
        "computer_monitor",
        floor,
        x - c * 0.15,
        y - s * 0.15,
        facing + Math.PI / 2 + Math.PI,
        0.76,
        "monitor",
      ),
    );
    add(mesh("office_chair", floor, x + c * 0.75, y + s * 0.75, facing + Math.PI / 2));
  };

  // ── floor 1 furniture ──
  // the open hall's two desk islands
  for (const x of [11.95, 13.45]) {
    station(ground, x, 4.15, Math.PI / 2);
    station(ground, x, 3.35, -Math.PI / 2);
  }
  for (const x of [12.3, 13.8, 15.3]) station(ground, x, 0.5, Math.PI / 2);
  for (const x of [13.0, 14.5]) station(ground, x, -0.3, -Math.PI / 2);
  station(ground, 17.1, 1.45, 30 * D);
  // desks between the islands and the meeting room
  station(ground, 16.05, 5.95, Math.PI);
  station(ground, 17.4, 6.1, 0);
  add(mesh("cardboard_box", ground, 17.3, 7.9, 10 * D));
  add(mesh("cardboard_box", ground, 18.4, 7.25, -20 * D));
  // by the meeting room's east wall
  station(ground, 10.75, 10.85, Math.PI / 2);
  station(ground, 12.25, 10.85, Math.PI / 2);
  add(mesh("desk", ground, 13.3, 9.3, Math.PI / 2));
  add(mesh("shelving_unit", ground, 12.4, 9.05, Math.PI / 2));
  add(mesh("office_chair", ground, 13.95, 9.3, -Math.PI / 2));
  add(mesh("office_chair", ground, 10.5, 9.55, 30 * D));
  add(mesh("wooden_crate", ground, 10.5, 7.6, 0));
  add(mesh("office_chair", ground, 10.25, 2.4, 0));
  add(mesh("office_chair", ground, 10.25, 3.6, 0));
  add(mesh("trash_can_round", ground, 10.3, 4.6, 0));

  // the north wall: desks, a lounge with bean bags, storage
  add(mesh("office_desk", ground, 7.4, 16.95, 0));
  add(mesh("office_chair", ground, 7.4, 16.1, Math.PI));
  add(mesh("table", ground, 9.2, 15.6, Math.PI / 2));
  add(mesh("office_chair", ground, 8.2, 15.3, 0));
  add(mesh("office_chair", ground, 10.1, 15.1, 0));
  station(ground, 11.4, 16.6, Math.PI);
  station(ground, 13.0, 16.75, Math.PI);
  add(mesh("office_desk", ground, 15.6, 16.95, 0));
  add(mesh("computer_monitor", ground, 15.3, 17.15, Math.PI, 0.8, "monitor"));
  add(mesh("computer_monitor", ground, 15.9, 17.15, Math.PI, 0.8, "monitor"));
  add(mesh("office_chair", ground, 15.6, 16.0, Math.PI));
  add(mesh("steel_shelves", ground, 19.6, 17.15, 0));
  add(mesh("drawer_cabinet", ground, 20.9, 17.15, 0));
  add(mesh("sofa", ground, 22.45, 16.95, Math.PI));
  add(mesh("table", ground, 23.1, 15.1, Math.PI / 2, 0, "table"));
  for (const [x, y] of [[24.55, 16.25], [24.35, 15.15], [24.45, 14.05]]) {
    add(makeItem("primitive", { shape: "beanbag", color: [0.55, 0.6, 0.65] }, {
      name: "Bean bag",
      floor: ground,
      position: [x, y, 0],
      scale: [1.0, 1.0, 0.6],
    }));
  }
  station(ground, 26.3, 16.6, Math.PI);
  add(mesh("bookcase", ground, 28.4, 17.15, 0));
  add(mesh("houseplant_tall", ground, 29.2, 17.1, 0));

  // the east wall: boxes, a couple of desks, shelving
  for (
    const [x, y, a] of [[26.2, 12.35, 0], [27.1, 12.35, 0], [25.9, 11.2, 20], [26.6, 10.5, -15], [
      27.6,
      10.6,
      10,
    ]]
  ) {
    add(mesh("cardboard_box", ground, x, y, a * D));
  }
  for (const y of [9.6, 10.5, 11.4]) add(mesh("wooden_crate", ground, 29.1, y, Math.PI / 2));
  station(ground, 27.55, 7.2, 210 * D);
  add(mesh("office_chair", ground, 26.9, 5.1, 0));
  add(mesh("office_chair", ground, 27.45, 4.35, 0));
  for (const y of [4.6, 5.6, 6.6]) add(mesh("cardboard_box", ground, 29.2, y, Math.PI / 2));
  station(ground, 26.9, 1.75, Math.PI);
  add(mesh("shelving_unit", ground, 29.3, 1.0, Math.PI / 2));
  add(mesh("shelving_unit", ground, 29.3, -0.9, Math.PI / 2));
  add(mesh("steel_shelves", ground, 28.8, -6.6, Math.PI / 2));
  add(mesh("tool_cart", ground, 28.9, -4.1, Math.PI / 2));
  add(mesh("steel_shelves", ground, 28.3, -10.8, Math.PI / 2));
  add(mesh("steel_shelves", ground, 29.2, -11.3, Math.PI / 2));
  add(makeItem("primitive", { shape: "cylinder", color: PAINT.steel }, {
    name: "Column",
    floor: ground,
    position: [24.85, -2.05, 0],
    scale: [0.3, 0.3, 6],
  }));

  // the south wall: cabinets, desks, crates
  add(mesh("drawer_cabinet", ground, 11.15, -12.2, 0));
  add(mesh("office_desk", ground, 12.8, -12.0, 0));
  add(mesh("desk", ground, 14.65, -11.5, 0));
  add(mesh("office_chair", ground, 14.65, -10.75, Math.PI));
  add(mesh("wooden_crate", ground, 14.5, -12.3, 0));
  add(mesh("wooden_crate", ground, 16.7, -11.75, 35 * D));
  add(mesh("cardboard_box", ground, 17.7, -11.1, 15 * D));
  add(mesh("drawer_cabinet", ground, 17.6, -12.2, 0));
  add(mesh("cardboard_box", ground, 19.2, -12.15, Math.PI / 2));
  add(mesh("table", ground, 21.1, -11.85, 0));
  add(mesh("monobloc_chair", ground, 12.5, -8.6, 0));
  add(mesh("cardboard_box", ground, 16.2, -10.6, 20 * D));

  // the lab: couches and chairs along its west wall, a bench in the middle
  add(mesh("sofa", ground, 0.15, -0.65, -Math.PI / 2));
  add(mesh("sofa", ground, 0.15, 1.6, -Math.PI / 2));
  for (
    const [x, y, a] of [
      [2.4, 4.3, 10],
      [1.4, 3.0, -20],
      [1.6, 1.0, 30],
      [1.25, -0.2, -35],
      [3.3, 2.9, 0],
      [4.8, 3.05, 40],
      [3.8, -1.0, 20],
      [2.6, -1.4, -10],
      [4.6, -1.55, 60],
      [6.5, 2.6, 0],
    ]
  ) {
    add(mesh("office_chair", ground, x, y, a * D));
  }
  add(mesh("table", ground, 5.75, 1.0, 80 * D, 0, "bench"));
  add(mesh("houseplant_round", ground, 8.9, 4.5, 0));
  add(mesh("bookcase", ground, 9.15, -1.5, -Math.PI / 2));
  // the small room and the south rooms
  add(mesh("cardboard_box", ground, 0.35, -3.0, 0));
  add(mesh("wooden_crate", ground, 1.0, -2.55, 0));
  add(box(ground, 4.55, -9.2, [2.6, 0.6, 0.9], PAINT.wood, "Workbench", 55 * D));
  add(mesh("trash_can_round", ground, 5.7, -10.4, 0));
  add(mesh("steel_shelves", ground, 7.0, -8.9, Math.PI / 2));
  add(mesh("cardboard_box", ground, 8.6, -7.8, 0));
  add(mesh("table", ground, 8.4, -9.65, 0));
  add(mesh("drawer_cabinet", ground, 8.9, -11.15, Math.PI));

  // the stairs: a long straight flight up the west side to floor 2, a 90° turn stairs in the north-west corner
  add(makeItem("stairs", {
    ...defaultStairs(),
    steps: 24,
    stepHeight: UPPER_Z / 24,
    stepDepth: 0.23,
    width: 1.5,
    railing: "left",
  }, {
    // climbing south from y -5.75 (1.3 m clear of the small room's wall) to y -11.27
    name: "South stairs",
    floor: ground,
    position: [0.45, -5.75, 0],
    rotation: yaw(-Math.PI / 2),
  }));
  // north along the west wall to a landing (y 9.1..10.1, 2.35 m up), then east overhead, arriving at x 3.3;
  // its foot starts 1.3 m north of the lab wall so there is room to walk onto it
  add(makeItem("stairs", {
    ...defaultStairs(),
    style: "turn",
    turnDirection: "right",
    openRisers: true,
    steps: 24,
    stepHeight: UPPER_Z / 24,
    stepDepth: 0.22,
    width: 1.0,
    railing: "both",
  }, {
    name: "Corner stairs",
    floor: ground,
    position: [0.23, 6.45, 0],
    rotation: yaw(Math.PI / 2),
  }));
  // a pair of closet doors under the south stairs' tall end, in the south room's west wall (y -10.6..-9.0)
  const doorX = 1.45;
  add(box(ground, doorX, -9.8, [0.15, 1.6, 2.2], PAINT.slate, "Under-stairs door frame"));
  add(makeItem("primitive", { shape: "box", color: WALL_PAINT }, {
    name: "Under-stairs door lintel",
    floor: ground,
    position: [doorX, -9.8, 2.2],
    scale: [0.15, 1.6, 0.8],
  }));
  for (const y of [-10.19, -9.41]) {
    add(box(ground, doorX + 0.085, y, [0.02, 0.76, 2.12], PAINT.wood, "Under-stairs door"));
  }
  for (const y of [-9.88, -9.72]) {
    add(makeItem("primitive", { shape: "box", color: PAINT.steel }, {
      name: "Door handle",
      floor: ground,
      position: [doorX + 0.11, y, 1.0],
      scale: [0.04, 0.03, 0.2],
    }));
  }
  // where they come up through floor 2
  add(makeItem("hole", { sizeX: 1.6, sizeY: 3.0, depth: UPPER_SLAB }, {
    name: "South stairwell",
    floor: up,
    position: [0.45, -9.77, 0],
  }));
  add(makeItem("hole", { sizeX: 2.8, sizeY: 1.2, depth: UPPER_SLAB }, {
    name: "Corner stairwell",
    floor: up,
    position: [2.0, 9.59, 0],
  }));

  // ── floor 2 furniture ──
  add(mesh("table", up, 2.0, 15.3, 0, 0, "kitchen island"));
  add(mesh("monobloc_chair", up, 1.1, 14.25, 0));
  add(mesh("monobloc_chair", up, 2.7, 14.25, 0));
  for (const y of [14.4, 15.6, 16.8]) {
    add(mesh("drawer_cabinet", up, 4.4, y, -Math.PI / 2, 0, "counter"));
  }
  add(mesh("fridge", up, 0.15, 16.8, -Math.PI / 2));
  add(mesh("bookcase_closed", up, 2.3, 11.5, 0));
  station(up, 6.3, 16.6, Math.PI);
  station(up, 9.0, 16.6, Math.PI);
  add(mesh("sofa", up, 6.45, 8.9, 0));
  add(mesh("sofa", up, 8.7, 8.9, 0));
  add(mesh("table", up, 7.5, 11.5, 0));
  for (const x of [6.8, 8.2]) {
    add(mesh("office_chair", up, x, 12.35, Math.PI));
    add(mesh("office_chair", up, x, 10.65, 0));
  }
  // the big hall: storage and a couch along its west wall
  for (const [x, y] of [[0.3, 6.8], [0.3, 6.0], [1.1, 6.8]]) {
    add(mesh("cardboard_box", up, x, y, 0));
  }
  add(mesh("sofa", up, 0.15, 4.2, -Math.PI / 2));
  add(mesh("wooden_crate", up, 0.4, 2.9, Math.PI / 2));
  add(mesh("desk", up, 0.55, 1.65, Math.PI / 2));
  add(mesh("cardboard_box", up, 2.2, -1.45, 0));
  add(mesh("desk", up, 6.15, 6.55, 75 * D, 0, "bench"));
  add(mesh("houseplant_tall", up, 9.3, 4.2, 0));
  // the south rooms: a meeting table, a round table, shelving
  add(mesh("table", up, 2.6, -6.1, Math.PI / 2, 0, "meeting table"));
  for (const y of [-6.7, -5.5]) {
    add(mesh("office_chair", up, 1.75, y, -Math.PI / 2));
    add(mesh("office_chair", up, 3.55, y, Math.PI / 2));
  }
  add(mesh("trash_can_round", up, 3.4, -4.5, 0));
  add(makeItem("primitive", { shape: "cylinder", color: PAINT.wood }, {
    name: "Round table",
    floor: up,
    position: [2.6, -10.3, 0],
    scale: [0.9, 0.9, 0.74],
  }));
  add(mesh("steel_shelves", up, 9.4, -5.0, Math.PI / 2));
  add(mesh("steel_shelves", up, 9.4, -9.0, Math.PI / 2));
  add(mesh("drawer_cabinet", up, 7.8, -12.1, 0));

  // ceiling lights over the hall
  for (const [x, y] of [[14, 10], [22, 10], [14, -6], [22, -6], [18, 2], [26, 2]]) {
    add(makeItem("light", { ...defaultLight(), intensity: 0.6, range: 10 }, {
      name: "Ceiling light",
      floor: ground,
      position: [x, y, 5.5],
    }));
  }

  // recessed can lights in floor 1's rooms, flush with the underside of floor 2's slab
  for (
    const [x, y] of [
      [4.7, 10],
      [8.6, 10],
      [8.6, 8], // meeting room
      [6.6, 7.9], // phone pod
      [2.2, 2.6],
      [6.8, 2.6],
      [3.5, -0.8],
      [7.5, -1.5], // lab
      [0.7, -3.2], // small room
      [3.9, -9],
      [8, -8.9],
      [8, -11.5], // south rooms
    ]
  ) {
    add(
      makeItem("light", {
        ...defaultLight(),
        type: "spot",
        angle: 60,
        intensity: 0.5,
        range: 6,
        fixture: "can",
      }, {
        name: "Can light",
        floor: ground,
        position: [x, y, UPPER_Z - UPPER_SLAB - 0.07],
      }),
    );
  }

  // ── people walking around: kinematic movers (they push the robot, nothing pushes them) ──
  const person = (
    name: string,
    floor: string,
    path: [number, number][],
    color: typeof PAINT.blue,
    speed: number,
    mode: "loop" | "pingpong",
  ) => ({
    ...makeItem("primitive", { shape: "person", color }, {
      name,
      floor,
      position: [path[0][0], path[0][1], 0],
      scale: [0.45, 0.28, 1.72],
    }),
    mover: {
      waypoints: path.map(([x, y]) => [x, y, 0] as [number, number, number]),
      speed,
      mode,
      heading: "path" as const,
    },
  });
  add(
    person(
      "Walker A",
      ground,
      [[20.5, -8], [23.5, -8], [23.5, 10], [20.5, 10]],
      PAINT.blue,
      1.1,
      "loop",
    ),
  );
  add(person("Walker B", ground, [[12, -6], [19, -6]], PAINT.red, 0.9, "pingpong"));
  add(person("Walker C", ground, [[12.5, 12.25], [22, 12.25]], PAINT.green, 1.0, "pingpong"));
  add(
    person(
      "Walker D",
      up,
      [[6.5, -1.2], [6.5, 5.6], [3.0, 5.6], [3.0, -1.2]],
      PAINT.orange,
      0.8,
      "loop",
    ),
  );
  project.items = items;
  project.activeFloor = ground;
  project.spawns = [
    { name: "hall", floor: ground, position: [20, 4, 0], yaw: Math.PI },
    { name: "entrance", floor: ground, position: [1.2, 15.5, 0], yaw: 0 },
    { name: "upstairs", floor: up, position: [3, 3, 0], yaw: 0 },
  ];
  project.views = [
    { key: "overview", name: "Overview", eye: [38, -26, 30], target: [13, 2.5, 0], fov: 50 },
    { key: "top_down", name: "Top down", eye: [14.6, 2.5, 60], target: [14.6, 2.51, 0], fov: 40 },
    { key: "desks", name: "Desk islands", eye: [20, -6, 4], target: [13, 2, 0.5], fov: 60 },
  ];
  return project;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
