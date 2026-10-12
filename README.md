# World Builder (dim-world-builder)

A [dimOS Desktop](https://github.com/jeff-hykin/dimos-desktop-mirror) app for building 3D worlds for simulated robots,
and exporting them as a folder dimos's MuJoCo simulator (sim2) loads, so you can test navigation on them.

- **Shapes and clutter**: boxes, cylinders, balls, cones, ramps, beanbags, bowling pins, hollow pipes, soccer balls,
  step stools, a ladder lying flat, buckets, walls; a seeded **Scatter clutter**.
- **Builders**: rooms (size, wall thickness, doors on any wall, ceiling, floor slab), staircases (step height, depth,
  width, count; solid or **open risers** with gaps between thin treads), bumpy hills (fractal noise: height, roughness,
  bumpiness, detail, seed, edge fade).
- **Library**: 22 CC0 models (desks, chairs, sofa, shelves, bed, fridge, barrel, crates, doorway, fence, plants, cone,
  dumpster…), each cooked into convex collision pieces. See [ASSETS.md](ASSETS.md).
- **Import a GLB** (.glb/.gltf/.obj): the app's own Python ([cooker/](cooker), uv-locked: trimesh + CoACD) turns it
  Z-up, sits it on the floor, splits its look by color, decomposes it into convex pieces, checks it in MuJoCo, and adds
  it to the palette.
- **Edit**: move / rotate / scale gizmos (W / E / R, snapping), numeric inspector, duplicate, undo/redo, autosave.
- **Floors**: stack floors at any elevation; you edit one at a time, the others are drawn faded.
- **Moving objects**: any item can follow a looping (or back-and-forth) path you click onto the floor, at a set speed.
  In the simulation it is a kinematic body: it shoves the robot, is never pushed back, and the lidar sees it.
- **Viewer mode**: a lit, shadowed render of the world with the robot, moving objects and lidar live from a running
  dimos blueprint.

## Export

**Export** writes `<parent>/<name>/` (default parent `~/dimos_worlds`):

| file | what |
| --- | --- |
| `scene.xml` | MJCF: every item as a static body (movers as mocap bodies), heightfields, meshes, lights |
| `scene.json` | `dimos.scene.v1`: every item as a named entity (so contacts name it), spawn poses |
| `movers.json` | `dimos.movers.v1`: each moving object's waypoints, speed, mode |
| `meshes/` | the visual and convex collision OBJs of library/imported models |
| `__init__.py` | `import <name>`: `SCENE_DIR`, `SCENE_XML`, `SPAWNS`, `ENTITIES`, `MOVERS`, `check()`, `blueprint()` |
| `world.project.json` | the editor's project (re-open it in the app) |
| `visual.glb` | the world as one GLB (Z up), for other viewers |

Collision-only geometry is in MuJoCo group 3, which `scene.json` hides from cameras and lidar: the lidar sees the true
shape, the robot collides with its convex decomposition.

## Run a robot in an exported world

dimos branch `jeff/feat/sim2_world_builder` (Pim's sim2 + the Go2 FREE policy, plus: scripted movers, mover TF, the
Go2 lidar wired to its nav stack, and macOS fixes):

```sh
python -m dimos.control.go2_freewalk.models --install   # once: the Go2 policy (private, via gh)
dimos --simulation mujoco --transport zenoh --scene-package ~/dimos_worlds/<name> run unitree-go2-freewalk
```

From Python: `import <name>; <name>.check()` compiles it; `<name>.blueprint()` returns `unitree-go2-freewalk` set to
this world.

`verify/drive_go2.py` drives a Go2 through [examples/nav_test_course](examples/nav_test_course) and fails unless walls
and objects stop it, the moving cart shoves it, the stairs block (or are climbed), the lidar sees all of them, and the
nav stack routes it through a door:

```sh
python verify/drive_go2.py examples/nav_test_course --video drive.mp4
```

## Install

Desktop → App Store → **Install From URL** → `github.com/jeff-hykin/dim-world-builder`, or
`dimos-desktop install github.com/jeff-hykin/dim-world-builder`.

## Develop

React + Vite page, Deno server, [dimos-react](https://github.com/jeff-hykin/dimos-react) (vendored with its three.js
view) for the UI and theme.

```sh
deno install
deno run -A backend/main.ts --port 8797 &      # the server
API_PORT=8797 deno task dev                     # the page, http://127.0.0.1:5173 (next to a running Desktop)
deno task check                                 # types
dimos-desktop app check .                       # dimos.yaml declares every call
nix build .#dimosApp                            # what Desktop builds
```

`#example` / `#clutter` in the page URL open the example worlds. `window.dimWorldBuilder` exposes screen positions
for scripted demos ([tools/videos](tools/videos)).
