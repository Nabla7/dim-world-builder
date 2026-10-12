// A big seeded playground for navigation testing, made only with the editor's own tools: a two-floor building with
// switchback stairs, furnished rooms with doors, windows, a crawl hatch and AprilTags, a long corridor with a cart
// riding through it, a spiral stair tower, a bumpy hill, pits, clutter fields, and a nav test around it all.

import {
  defaultHill,
  defaultRoom,
  defaultStairs,
  emptyProject,
  makeItem,
  PAINT,
  seeded,
  yaw,
} from "./defaults.ts";
import { openingPreset } from "./geometry.ts";
import { scatterClutter } from "./scatter.ts";
import type { Item, MeshAsset, Project, Quat, Vec3 } from "./types.ts";

export function playground(library: MeshAsset[], seed = 7): Project {
  const random = seeded(seed);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const project = emptyProject(`playground_${seed}`);
  const ground = project.floors[0].id;
  project.floors.push({ id: "upper", name: "Upper floor", elevation: 3 });
  const items: Item[] = [];
  const add = (...more: Item[]) => items.push(...more);
  const byCategory = (...categories: string[]) =>
    library.filter((a) => categories.includes(a.category));
  const furniture = byCategory("furniture", "office", "appliances", "kitchen", "decor");
  const plants = byCategory("plants", "nature");
  const storage = byCategory("storage", "clutter");
  const mesh = (asset: MeshAsset, floor: string, position: Vec3, angle = 0) =>
    makeItem("mesh", { source: "library", asset: asset.id }, {
      name: asset.name,
      floor,
      position,
      rotation: yaw(angle),
    });
  /** a few library things inside a room's footprint, away from its walls */
  const furnish = (
    center: [number, number],
    width: number,
    depth: number,
    floor: string,
    count: number,
  ) => {
    for (let i = 0; i < count && furniture.length; i++) {
      const x = center[0] + (random() - 0.5) * (width - 2.2);
      const y = center[1] + (random() - 0.5) * (depth - 2.2);
      add(
        mesh(
          pick(furniture),
          floor,
          [round(x), round(y), 0],
          Math.round(random() * 4) * (Math.PI / 2),
        ),
      );
    }
  };
  /** tag36h11 tags on a room's inner walls, facing in, 1.3 m up */
  let tagId = 0;
  const tags = (
    center: [number, number],
    width: number,
    depth: number,
    t: number,
    floor: string,
  ) => {
    const inner = (v: number) => v / 2 - t / 2 - 0.001;
    const placements: [Vec3, number][] = [
      [[center[0] - inner(width), center[1] + depth / 4, 1.3], 0],
      [[center[0] + inner(width), center[1] - depth / 4, 1.3], Math.PI],
      [[center[0], center[1] + inner(depth), 1.3], -Math.PI / 2],
    ];
    for (const [position, angle] of placements) {
      const id = tagId++;
      add(makeItem("apriltag", { family: "tag36h11", id, size: 0.1 }, {
        name: `Tag ${id}`,
        floor,
        position,
        rotation: yaw(angle),
      }));
    }
  };

  // ── building A: a lab downstairs, an office upstairs, switchback stairs up its east side ──
  const lab = { ...defaultRoom(), width: 10, depth: 8, height: 2.8, ceiling: true };
  lab.doors = [
    { ...openingPreset("double", "south"), offset: -1.5 },
    { ...openingPreset("window", "north"), offset: -2.5 },
    { ...openingPreset("window", "north"), offset: 2.5 },
    { ...openingPreset("door", "east"), offset: 2.5 },
  ];
  add(makeItem("room", lab, { name: "Lab", floor: ground, position: [0, 0, 0] }));
  furnish([0, 0], lab.width, lab.depth, ground, 7);
  tags([0, 0], lab.width, lab.depth, lab.wallThickness, ground);
  const office = {
    ...defaultRoom(),
    width: 10,
    depth: 8,
    height: 2.6,
    floor: true,
    ceiling: false,
  };
  office.doors = [{ ...openingPreset("door", "east"), offset: 2.3 }, {
    ...openingPreset("window", "south"),
  }];
  add(makeItem("room", office, { name: "Office", floor: "upper", position: [0, 0, 0] }));
  furnish([0, 0], office.width, office.depth, "upper", 5);
  // straight stairs up the east side to a landing at the office's east door (3 m up)
  add(makeItem("stairs", {
    ...defaultStairs(),
    steps: 18,
    stepHeight: 3 / 18,
    stepDepth: 0.28,
    width: 1.1,
    railing: "right",
    railingStyle: "posts",
  }, { name: "East stairs", floor: ground, position: [6.1, -3.8, 0], rotation: yaw(Math.PI / 2) }));
  add(makeItem("primitive", { shape: "box", color: PAINT.concrete }, {
    name: "Landing",
    floor: ground,
    position: [6.1, 2.3, 0],
    scale: [1.2, 2.2, 3],
  }));
  // a freestanding switchback, for climbing tests
  add(makeItem("stairs", {
    ...defaultStairs(),
    style: "switchback",
    steps: 12,
    stepHeight: 0.17,
    width: 1.1,
    railing: "both",
    railingStyle: "cables",
  }, { name: "Switchback", floor: ground, position: [13, -13, 0] }));

  // ── room B: a storeroom with a crawl hatch ──
  const store = { ...defaultRoom(), width: 6, depth: 6, height: 2.6 };
  store.doors = [openingPreset("door", "west"), {
    ...openingPreset("crawl", "south"),
    offset: 1.5,
  }];
  add(makeItem("room", store, { name: "Storeroom", floor: ground, position: [14, 0, 0] }));
  for (let i = 0; i < 5 && storage.length; i++) {
    add(
      mesh(pick(storage), ground, [
        round(14 + (random() - 0.5) * 3.5),
        round((random() - 0.5) * 3.5),
        0,
      ]),
    );
  }
  tags([14, 0], store.width, store.depth, store.wallThickness, ground);

  // ── a long corridor with a cart riding through it ──
  const corridor = { ...defaultRoom(), width: 16, depth: 3, height: 2.6, ceiling: true };
  corridor.doors = [
    { ...openingPreset("arch", "west"), width: 2.2 },
    { ...openingPreset("arch", "east"), width: 2.2 },
    { ...openingPreset("door", "south"), offset: -4 },
  ];
  add(makeItem("room", corridor, { name: "Corridor", floor: ground, position: [4, 12, 0] }));
  add({
    ...makeItem("primitive", { shape: "box", color: PAINT.orange }, {
      name: "Cart",
      floor: ground,
      position: [-2.5, 12, 0],
      scale: [0.8, 0.6, 0.7],
    }),
    mover: {
      waypoints: [[-2.5, 12, 0], [10.5, 12, 0]],
      speed: 0.6,
      mode: "pingpong",
      heading: "fixed",
    },
  });
  tags([4, 12], corridor.width, corridor.depth, corridor.wallThickness, ground);

  // ── a box that circles building A outside ──
  add({
    ...makeItem("primitive", { shape: "cylinder", color: PAINT.red }, {
      name: "Patrol drum",
      floor: ground,
      position: [-7, -7, 0],
      scale: [0.6, 0.6, 0.9],
    }),
    mover: {
      waypoints: [[-7, -7, 0], [9, -7, 0], [9, 6.5, 0], [-7, 6.5, 0]],
      speed: 0.5,
      mode: "loop",
      heading: "path",
    },
  });

  // ── outdoors: a spiral stair tower, a hill, pits, clutter, plants ──
  add(makeItem("stairs", {
    ...defaultStairs(),
    style: "spiral",
    steps: 16,
    stepHeight: 0.18,
    width: 1.0,
    spiralTurn: 450,
    railing: "both",
  }, { name: "Spiral tower", floor: ground, position: [-12, 10, 0] }));
  add(makeItem("hill", {
    ...defaultHill(),
    sizeX: 14,
    sizeY: 12,
    amplitude: 0.7,
    frequency: 3,
    bumps: 0.12,
    bumpSize: 0.55,
    resolution: 192,
    seed,
  }, {
    name: "Hill",
    floor: ground,
    position: [-16, -12, 0],
  }));
  add(
    makeItem("hole", { sizeX: 2.5, sizeY: 1.5, depth: 0.6 }, {
      name: "Pit",
      floor: ground,
      position: [8, -11, 0],
    }),
  );
  add(
    makeItem("hole", { sizeX: 1.2, sizeY: 1.2, depth: 1.5 }, {
      name: "Shaft",
      floor: ground,
      position: [4, -12, 0],
    }),
  );
  add(...scatterClutter(ground, [-6, -14, 0], seed + 1, 18, 3.5));
  add(...scatterClutter(ground, [16, 10, 0], seed + 2, 14, 3));
  for (let i = 0; i < 10 && plants.length; i++) {
    const angle = random() * Math.PI * 2;
    const r = 19 + random() * 4;
    add(mesh(pick(plants), ground, [round(Math.cos(angle) * r), round(Math.sin(angle) * r), 0]));
  }
  add(
    makeItem("stairs", {
      ...defaultStairs(),
      steps: 5,
      stepHeight: 0.17,
      openRisers: true,
      railing: "left",
    }, {
      name: "Loading steps",
      floor: ground,
      position: [17.5, -6, 0],
      rotation: yaw(Math.PI),
    }),
  );

  project.items = items;
  project.spawns = [
    { name: "start", floor: ground, position: [-12, -2, 0], yaw: 0 },
    { name: "courtyard", floor: ground, position: [6, 6.5, 0], yaw: Math.PI },
    { name: "office", floor: "upper", position: [0, 0, 0], yaw: 0 },
  ];
  project.nav = {
    startSpawn: "start",
    floor: ground,
    mappingPath: [[-12, -2, 0], [-8, -6, 0], [-1.5, -5.5, 0], [-1.5, -4.2, 0], [9, -7, 0], [
      9,
      6.5,
      0,
    ], [-6, 7, 0]],
    goals: [
      {
        id: "lab",
        name: "Inside the lab",
        floor: ground,
        position: [-1.5, 1.5, 0],
        tolerance: 0.6,
        timeout: 180,
      },
      {
        id: "store",
        name: "Inside the storeroom",
        floor: ground,
        position: [14, 0, 0],
        tolerance: 0.6,
        timeout: 180,
      },
      {
        id: "corridor",
        name: "Corridor end",
        floor: ground,
        position: [10, 12, 0],
        tolerance: 0.6,
        timeout: 180,
      },
    ],
  };
  return project;
}

const round = (v: number) => Math.round(v * 100) / 100;
export type { Quat };
