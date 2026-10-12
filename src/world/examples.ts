// A showcase world that is also the robot test course: one lane per collision check, each with its own spawn.
//   wall lane  (y = 0):   a room's solid west wall 2.5 m ahead
//   box lane   (y = -6):  a static crate 2 m ahead
//   mover lane (y = -12): a cart crossing the lane on a loop
//   stairs lane(y = 6):   stairs starting 1.5 m ahead
// plus a bumpy hill, a second floor, cones, a beanbag and a ramp.

import {
  defaultHill,
  defaultRoom,
  defaultStairs,
  emptyProject,
  makeItem,
  PAINT,
  yaw,
} from "./defaults.ts";
import type { Project } from "./types.ts";

export function testCourse(): Project {
  const project = emptyProject("nav_test_course");
  const ground = project.floors[0].id;
  project.floors.push({ id: "upper", name: "Upper floor", elevation: 3 });
  project.spawns = [
    { name: "wall_lane", floor: ground, position: [0, 0, 0], yaw: 0 },
    { name: "box_lane", floor: ground, position: [0, -6, 0], yaw: 0 },
    { name: "mover_lane", floor: ground, position: [0, -12, 0], yaw: 0 },
    { name: "stairs_lane", floor: ground, position: [0, 6, 0], yaw: 0 },
    { name: "upstairs", floor: "upper", position: [5.5, 0, 0], yaw: 0 },
  ];
  project.items.push(
    makeItem("room", {
      ...defaultRoom(),
      width: 6,
      depth: 5,
      floor: false,
      ceiling: true,
      doors: [{ wall: "south", offset: 0, width: 1.6, height: 2.1 }],
    }, {
      name: "Lab room",
      floor: ground,
      position: [5.5, 0, 0],
    }),
    makeItem("room", {
      ...defaultRoom(),
      width: 6,
      depth: 5,
      floor: true,
      ceiling: false,
      doors: [{ wall: "east", offset: 0, width: 1, height: 2.1 }],
    }, { name: "Upper room", floor: "upper", position: [5.5, 0, 0] }),
    makeItem("primitive", { shape: "box", color: PAINT.wood }, {
      name: "Crate",
      floor: ground,
      position: [2.3, -6, 0],
      scale: [0.6, 0.8, 0.6],
    }),
    {
      ...makeItem("primitive", { shape: "box", color: PAINT.orange }, {
        name: "Cart",
        floor: ground,
        position: [1.4, -14, 0],
        scale: [0.6, 0.6, 0.5],
      }),
      mover: {
        waypoints: [[1.4, -14, 0], [1.4, -10, 0]],
        speed: 0.4,
        mode: "pingpong",
        heading: "fixed",
      },
    },
    makeItem("stairs", { ...defaultStairs(), steps: 6, stepHeight: 0.17, width: 1.4 }, {
      name: "Stairs",
      floor: ground,
      position: [1.5, 6, 0],
    }),
    makeItem("hill", { ...defaultHill(), amplitude: 0.35 }, {
      name: "Hill",
      floor: ground,
      position: [-10, 0, 0],
    }),
    makeItem("primitive", { shape: "cone", color: PAINT.orange }, {
      name: "Cone A",
      floor: ground,
      position: [-2, 2, 0],
      scale: [0.35, 0.35, 0.5],
    }),
    makeItem("primitive", { shape: "cone", color: PAINT.orange }, {
      name: "Cone B",
      floor: ground,
      position: [-2, -2, 0],
      scale: [0.35, 0.35, 0.5],
    }),
    makeItem("primitive", { shape: "beanbag", color: PAINT.red }, {
      name: "Beanbag",
      floor: ground,
      position: [3.6, 1.6, 0],
      scale: [0.9, 0.9, 0.6],
    }),
    makeItem("primitive", { shape: "ramp", color: PAINT.slate }, {
      name: "Ramp",
      floor: ground,
      position: [-4, -8, 0],
      rotation: yaw(Math.PI / 2),
      scale: [2, 1.2, 0.25],
    }),
    makeItem("primitive", { shape: "cylinder", color: PAINT.blue }, {
      name: "Pillar",
      floor: ground,
      position: [7.6, 1.4, 0],
      scale: [0.4, 0.4, 2.8],
    }),
  );
  return project;
}
