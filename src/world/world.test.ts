import { describe, expect, it } from "vitest";
import { buildWorld, hillHeights, hillShapes, roomShapes, stairsShapes } from "./geometry.ts";
import { toScene } from "./mjcf.ts";
import { defaultHill, defaultRoom, defaultStairs } from "./defaults.ts";
import { testCourse } from "./examples.ts";

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
    const hill = { ...defaultHill(), amplitude: 0.8, resolution: 32, edgeFade: true };
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
    };
    expect(Object.keys(json.entities)).toHaveLength(world.bodies.length);
    expect(json.spawns.default).toBeDefined();
    expect(json.hidden_geom_groups).toEqual([3]);
    expect((scene.moversJson as { movers: unknown[] }).movers).toHaveLength(1);
    expect(scene.xml).toContain('mocap="true"');
    expect(scene.xml).toContain("<hfield name=");
  });
});
