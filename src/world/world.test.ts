import { describe, expect, it } from "vitest";
import {
  aprilTagShapes,
  buildWorld,
  floorSlab,
  hillHeights,
  hillShapes,
  openingPreset,
  roomShapes,
  stairsShapes,
} from "./geometry.ts";
import { toScene } from "./mjcf.ts";
import { defaultHill, defaultLight, defaultRoom, defaultStairs, emptyProject, makeItem } from "./defaults.ts";
import { testCourse } from "./examples.ts";
import { keyedProject } from "./keys.ts";
import { barCenters, grateShapes } from "./geometry.ts";
import { defaultGrate } from "./defaults.ts";
import { cameraLookAt } from "./geometry.ts";

describe("rooms", () => {
  it("leaves a gap the door's width in its wall", () => {
    const room = {
      ...defaultRoom(),
      width: 6,
      depth: 4,
      doors: [{ wall: "south" as const, offset: 0, width: 1.2, height: 2 }],
    };
    const south = roomShapes(room).filter((s) => Math.abs(s.pos[1] + 2) < 1e-6);
    // two full-height pieces beside the door and a lintel over it
    expect(south).toHaveLength(3);
    const full = south.filter((s) => s.pos[2] === room.height / 2);
    const gap = Math.min(...full.map((s) => Math.abs(s.pos[0]) - s.size[0]));
    expect(gap * 2).toBeCloseTo(1.2, 5);
  });
  it("adds a ceiling only when asked", () => {
    const top = (ceiling: boolean) =>
      roomShapes({ ...defaultRoom(), ceiling }).filter((s) => s.pos[2] > defaultRoom().height);
    expect(top(true)).toHaveLength(1);
    expect(top(false)).toHaveLength(0);
  });
});

describe("stairs", () => {
  it("rises step height per step, solid by default", () => {
    const stairs = stairsShapes({ ...defaultStairs(), steps: 4, stepHeight: 0.2 });
    const tops = stairs.map((s) => s.pos[2] + s.size[2]);
    expect(tops.map((t) => Number(t.toFixed(6)))).toEqual([0.2, 0.4, 0.6, 0.8]);
  });
  it("open risers: thin treads with gaps under them, plus two stringers", () => {
    const stairs = stairsShapes({
      ...defaultStairs(),
      steps: 4,
      stepHeight: 0.2,
      openRisers: true,
      treadThickness: 0.04,
    });
    const treads = stairs.filter((s) => s.quat[3] === 1);
    expect(treads).toHaveLength(4);
    treads.forEach((t) => expect(t.size[2] * 2).toBeCloseTo(0.04, 6));
    expect(stairs.length - treads.length).toBe(2);
  });
});

describe("hills", () => {
  it("spans exactly 0..amplitude and meets the ground at the edges", () => {
    const hill = { ...defaultHill(), amplitude: 0.8, bumps: 0, resolution: 32, edgeFade: true };
    const { n, heights } = hillHeights(hill);
    expect(Math.max(...heights)).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(Math.max(...heights)).toBeGreaterThan(0.3);
    expect(heights[0]).toBeCloseTo(0);
    expect(heights[n * n - 1]).toBeCloseTo(0);
  });
  it("writes MuJoCo's row order (first row is +y)", () => {
    const hill = { ...defaultHill(), resolution: 16, edgeFade: false };
    const { n, heights } = hillHeights(hill);
    const shape = hillShapes(hill)[0];
    const top = shape.hfield!.size[2];
    // last computed row (+y) is the first written row
    expect(shape.hfield!.elevation[0] * top).toBeCloseTo(heights[(n - 1) * n], 5);
  });
  it("adds small bumps a robot feels, still walkable", () => {
    const smooth = { ...defaultHill(), bumps: 0 };
    const bumpy = defaultHill();
    const a = hillHeights(smooth);
    const b = hillHeights(bumpy);
    const cell = bumpy.sizeX / (b.n - 1);
    let biggest = 0;
    let steepest = 0;
    for (let i = 0; i < b.heights.length; i++) {
      biggest = Math.max(biggest, b.heights[i] - a.heights[i]);
      if (i % b.n < b.n - 1) {
        steepest = Math.max(steepest, Math.abs(b.heights[i + 1] - b.heights[i]) / cell);
      }
    }
    expect(biggest).toBeGreaterThan(0.05);
    expect(biggest).toBeLessThanOrEqual(bumpy.bumps! + 1e-6);
    // slope in degrees, cell to cell
    expect((Math.atan(steepest) * 180) / Math.PI).toBeLessThan(35);
  });
  it("is the same for the same seed", () => {
    expect(hillHeights(defaultHill()).heights).toEqual(hillHeights(defaultHill()).heights);
  });
});

describe("export", () => {
  it("names every body as a scene entity, hides collision-only geometry, and lists movers", () => {
    const world = buildWorld(testCourse(), {});
    const scene = toScene(world, "course");
    const json = scene.sceneJson as {
      entities: Record<string, unknown>;
      spawns: Record<string, unknown>;
      hidden_geom_groups: number[];
      movers: unknown[];
    };
    expect(Object.keys(json.entities)).toHaveLength(world.bodies.length);
    expect(json.spawns.default).toBeDefined();
    expect(json.hidden_geom_groups).toEqual([3]);
    expect(json.movers).toHaveLength(1);
    expect(scene.xml).toContain('mocap="true"');
    expect(scene.xml).toContain("<hfield name=");
    expect(scene.xml).toContain('type="skybox"');
  });
});

describe("openings, holes, stairs styles, tags", () => {
  it("a window keeps wall under its sill and over its top", () => {
    const room = {
      ...defaultRoom(),
      width: 6,
      depth: 4,
      height: 2.8,
      doors: [openingPreset("window", "south")],
    };
    const south = roomShapes(room).filter((s) => Math.abs(s.pos[1] + 2) < 1e-6);
    const under = south.filter((s) =>
      s.pos[2] - s.size[2] < 1e-6 && s.pos[2] + s.size[2] <= 0.9 + 1e-6
    );
    expect(under).toHaveLength(1);
    expect(south.some((s) => Math.abs(s.pos[2] - s.size[2] - 2.0) < 1e-6)).toBe(true);
  });
  it("a hole cuts its floor's slab, a pit keeps a bottom", () => {
    const floor = {
      id: "g",
      name: "g",
      elevation: 0,
      slab: { thickness: 1, sizeX: 10, sizeY: 10, center: [0, 0] as [number, number] },
    };
    const hole = (depth: number) =>
      makeItem("hole", { sizeX: 2, sizeY: 2, depth }, { name: "h", floor: "g" });
    const covered = (depth: number) => {
      const slab = floorSlab(floor, [hole(depth)], 0)!;
      // the column of slab over the hole's center: its top
      const over = slab.shapes.filter((s) =>
        Math.abs(s.pos[0]) < s.size[0] && Math.abs(s.pos[1]) < s.size[1]
      );
      return over.map((s) => s.pos[2] + s.size[2]);
    };
    expect(covered(0.4).map((v) => Number(v.toFixed(6)))).toEqual([-0.4]);
    expect(covered(2)).toEqual([]);
  });
  it("spiral stairs: one tread per step around a post", () => {
    const spiral = stairsShapes({ ...defaultStairs(), style: "spiral", steps: 12 });
    expect(spiral.filter((s) => s.type === "box")).toHaveLength(12);
  });
  it("switchback stairs: both flights and a landing reach the full rise", () => {
    const s = stairsShapes({ ...defaultStairs(), style: "switchback", steps: 10, stepHeight: 0.2 });
    expect(Math.max(...s.map((b) => b.pos[2] + b.size[2]))).toBeCloseTo(2.0, 5);
  });
  it("an AprilTag is printed 10/8 its black square, with texcoords for its image", () => {
    const [tag] = aprilTagShapes({ family: "tag36h11", id: 7, size: 0.1 });
    expect(tag.size[1] * 2).toBeCloseTo(0.125, 6);
    expect(tag.texture).toBe("apriltags/tag36h11_00007.png");
    expect(tag.mesh?.texcoords).toHaveLength(16);
  });
});

it("a light item exports as a MuJoCo light on its body, with no geoms", () => {
  const project = emptyProject("lit")
  project.items = [
    makeItem("light", { ...defaultLight(), type: "spot", shadows: true }, {
      name: "Lamp",
      floor: project.floors[0].id,
      position: [1, 2, 2.5],
    }),
  ]
  const { xml } = toScene(buildWorld(project, {}), "lit")
  const lamp = xml.match(/<body name="lamp[^"]*"[\s\S]*?<\/body>/)![0]
  expect(lamp).toMatch(/<light [^>]*cutoff="40"[^>]*\/>/)
  expect(lamp).toMatch(/castshadow="true"/)
  expect(lamp).not.toMatch(/<geom/)
})

describe("remembered views", () => {
  it("export as fixed MuJoCo cameras named by key, looking at their target", () => {
    const project = emptyProject("views");
    project.views = [{ key: "front", name: "Front", eye: [0, -5, 2], target: [0, 0, 2], fov: 45 }];
    const { xml, viewsJson } = toScene(buildWorld(project, {}), "views");
    // looking down +y: right is +x, up is +z
    expect(xml).toContain('<camera name="front" pos="0 -5 2" xyaxes="1 0 0 0 0 1" fovy="45"/>');
    expect((viewsJson as { views: { camera: string }[] }).views.map((v) => v.camera)).toEqual(["front"]);
  });
  it("looks straight down without a degenerate frame", () => {
    const axes = cameraLookAt([0, 0, 10], [0, 0, 0]);
    expect(axes.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(axes[0], axes[1], axes[2])).toBeCloseTo(1);
  });
  it("get unique readable keys", () => {
    const project = emptyProject("views");
    project.views = [
      { key: "", name: "Kitchen view", eye: [0, 0, 1], target: [1, 0, 1], fov: 50 },
      { key: "", name: "Kitchen view", eye: [0, 0, 1], target: [1, 0, 1], fov: 50 },
      { key: "", name: "2nd floor", eye: [0, 0, 1], target: [1, 0, 1], fov: 50 },
    ];
    expect(keyedProject(project).views!.map((v) => v.key)).toEqual(["kitchen_view", "kitchen_view_2", "view_2nd_floor"]);
  });
});

describe("drain grates", () => {
  const openings = (centers: number[], span: number, width: number) => {
    const edges = [-span / 2, ...centers.flatMap((c) => [c - width / 2, c + width / 2]), span / 2];
    return Array.from({ length: edges.length / 2 }, (_, i) => edges[2 * i + 1] - edges[2 * i]);
  };
  it("spaces bars evenly, every opening (edges too) at least the gap", () => {
    const centers = barCenters(1.0, 0.03, 0.04);
    expect(centers.length).toBe(13); // floor((1.0 - 0.04) / (0.03 + 0.04))
    const gaps = openings(centers, 1.0, 0.03);
    gaps.forEach((g) => expect(g).toBeGreaterThanOrEqual(0.04 - 1e-9));
    gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0], 9));
    expect(centers[0]).toBeCloseTo(-centers[centers.length - 1], 9);
  });
  it("has no bars when none fit", () => {
    expect(barCenters(0.05, 0.03, 0.04)).toEqual([]);
  });
  it("makes slats one way and a grid both ways, tops flush with the floor, as collision boxes", () => {
    const hole = { sizeX: 0.6, sizeY: 1.2, depth: 0.5, grate: { ...defaultGrate(), direction: "y" as const } };
    const slats = grateShapes(hole);
    expect(slats.length).toBe(barCenters(0.6, 0.03, 0.04).length);
    slats.forEach((bar) => {
      expect(bar.role).toBe("both");
      expect(bar.size[1] * 2).toBeCloseTo(1.2); // running along y, the hole's full length
      expect(bar.pos[2] + bar.size[2]).toBeCloseTo(0); // top at the floor
    });
    const grid = grateShapes({ ...hole, grate: { ...hole.grate, pattern: "grid" } });
    expect(grid.length).toBe(barCenters(0.6, 0.03, 0.04).length + barCenters(1.2, 0.03, 0.04).length);
  });
  it("never goes deeper than the hole", () => {
    const [bar] = grateShapes({ sizeX: 1, sizeY: 1, depth: 0.02, grate: { ...defaultGrate(), barDepth: 0.1 } });
    expect(bar.size[2] * 2).toBeCloseTo(0.02);
  });
});

describe("hill look in the export", () => {
  it("gives a hill the speckled grass material, keeping its heights", () => {
    const project = emptyProject("grass");
    project.items = [makeItem("hill", defaultHill(), { name: "Hill", floor: project.floors[0].id, position: [0, 0, 0] })];
    const world = buildWorld(project, {});
    const { xml } = toScene(world, "grass");
    expect(xml).toMatch(/<texture name="grass_0" type="2d" builtin="flat"[^>]*mark="random"/);
    expect(xml).toMatch(/type="hfield" hfield="[^"]+" material="grass_0"/);
    const shape = world.bodies.flatMap((b) => b.shapes).find((s) => s.type === "hfield")!;
    expect(xml).toContain(`elevation="${shape.hfield!.elevation.map((v) => String(Math.round(v * 1e6) / 1e6)).join(" ")}"`);
  });
});
