// Writes a project as a directory dimos can load: `--scene-package <dir>` for sim2, `import <name>` for Python.
//   <dir>/scene.xml  scene.json  movers.json  __init__.py  README.md  world.project.json  meshes/<asset>/*  [visual.glb]

import { buildWorld } from "../src/world/geometry.ts";
import { toScene } from "../src/world/mjcf.ts";
import { keyedProject } from "../src/world/keys.ts";
import type { MeshAsset, Project } from "../src/world/types.ts";

/** a Python package name: lower snake case, not starting with a digit */
export function packageName(name: string): string {
  const snake = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(snake) ? snake : `world_${snake || "untitled"}`;
}

export interface ExportResult {
  dir: string;
  name: string;
  files: string[];
  bodies: number;
  movers: number;
}

export async function exportProject(
  unkeyed: Project,
  assets: Record<string, MeshAsset>,
  /** asset id -> the folder holding its files on this machine */
  assetDirs: Record<string, string>,
  parentDir: string,
  options: { visualGlb?: Uint8Array } = {},
): Promise<ExportResult> {
  const assetsRoot = new URL("../assets", import.meta.url).pathname;
  // every item exports under its readable id ("bed_2")
  const project = keyedProject(unkeyed);
  const name = packageName(project.name);
  const dir = `${parentDir.replace(/\/+$/, "")}/${name}`;
  const world = buildWorld(project, assets);
  const scene = toScene(world, name);
  await Deno.mkdir(`${dir}/meshes`, { recursive: true });
  const files: string[] = [];
  const write = async (path: string, text: string) => {
    await Deno.writeTextFile(`${dir}/${path}`, text);
    files.push(path);
  };
  await write("scene.xml", scene.xml);
  await write("scene.json", JSON.stringify(scene.sceneJson, null, 2) + "\n");
  await write("movers.json", JSON.stringify(scene.moversJson, null, 2) + "\n");
  await write("views.json", JSON.stringify(scene.viewsJson, null, 2) + "\n");
  await write("world.project.json", JSON.stringify(project, null, 2) + "\n");
  await write("nav_eval.json", JSON.stringify(navEval(project), null, 2) + "\n");
  await write("__init__.py", pythonPackage(name, project));
  await write(
    "__main__.py",
    `"""python -m ${name}: compile the world with MuJoCo and summarize it."""\nfrom . import main\n\nmain()\n`,
  );
  await write("README.md", readme(name, project));
  await write("pyproject.toml", pyproject(name));
  // the SceneData module (scene_data_request -> scene_data), the same file in every export
  await write("scene_data.py", await Deno.readTextFile(new URL("./python/scene_data.py", import.meta.url)));
  for (const [asset, meshFiles] of scene.meshFiles) {
    const source = assetDirs[asset];
    if (!source) throw new Error(`no files for mesh asset ${asset}`);
    await Deno.mkdir(`${dir}/meshes/${asset}`, { recursive: true });
    for (const file of meshFiles) {
      await copyWritable(`${source}/${file}`, `${dir}/meshes/${asset}/${file}`);
      files.push(`meshes/${asset}/${file}`);
    }
  }
  if (scene.textureFiles.size) await Deno.mkdir(`${dir}/textures`, { recursive: true });
  for (const texture of scene.textureFiles) {
    const name = texture.split("/").pop()!;
    await copyWritable(`${assetsRoot}/${texture}`, `${dir}/textures/${name}`);
    files.push(`textures/${name}`);
  }
  if (options.visualGlb) {
    await Deno.writeFile(`${dir}/visual.glb`, options.visualGlb);
    files.push("visual.glb");
  }
  return { dir, name, files, bodies: world.bodies.length, movers: world.movers.length };
}

/** dimos.nav_eval.v1: the drawn navigation test in world coordinates (floor elevations applied) */
export function navEval(project: Project) {
  const lift = (floor: string) => project.floors.find((f) => f.id === floor)?.elevation ?? 0;
  const spawnKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const nav = project.nav;
  return {
    format: "dimos.nav_eval.v1",
    start_spawn: nav ? spawnKey(nav.startSpawn) : "default",
    mapping_path: nav ? nav.mappingPath.map((p) => [p[0], p[1], p[2] + lift(nav.floor)]) : [],
    goals: (nav?.goals ?? []).map((g) => ({
      name: g.name,
      position: [g.position[0], g.position[1], g.position[2] + lift(g.floor)],
      tolerance: g.tolerance,
      timeout: g.timeout,
    })),
  };
}

function readme(name: string, project: Project): string {
  return `# ${name}

A world made with [dim-world-builder](https://github.com/jeff-hykin/dim-world-builder): ${project.items.length} items on
${project.floors.length} floor(s). Open \`world.project.json\` in the app to change it.

Run a simulated Go2 in it (dimos sim2; the Go2 FREE policy installs with
\`python -m dimos.control.go2_freewalk.models --install\`):

\`\`\`sh
dimos --simulation mujoco --transport zenoh --scene-package $PWD run unitree-go2-freewalk
\`\`\`

From Python (with this folder's parent on \`sys.path\`):

\`\`\`python
import ${name}
${name}.SCENE_XML          # the MJCF
${name}.SPAWNS             # named spawn poses ("default" is where robots start)
${name}.check()            # compiles the MJCF with MuJoCo
blueprint = ${name}.blueprint()   # unitree-go2-freewalk in this world
\`\`\`
`;
}

function pythonPackage(name: string, project: Project): string {
  return `"""${name}: a dim-world-builder world for dimos sim2 (MuJoCo).

Files beside this one: scene.xml (MJCF), scene.json (dimos.scene.v1: entities, spawns), movers.json
(dimos.movers.v1: scripted obstacles), views.json (remembered camera views; render_view() looks from one), meshes/,
world.project.json (the editor's project) and scene_data.py (the
SceneData module: publish on scene_data_request, get the world's bodies, meshes and lights on scene_data).
${project.items.length} items, ${project.floors.length} floor(s).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any

SCENE_DIR = Path(__file__).resolve().parent
SCENE_XML = SCENE_DIR / "scene.xml"
SCENE_JSON = SCENE_DIR / "scene.json"
MOVERS_JSON = SCENE_DIR / "movers.json"
PROJECT_JSON = SCENE_DIR / "world.project.json"

_scene = json.loads(SCENE_JSON.read_text())
SPAWNS: dict[str, dict[str, Any]] = _scene.get("spawns", {})
ENTITIES: dict[str, dict[str, Any]] = _scene.get("entities", {})
MOVERS: list[dict[str, Any]] = json.loads(MOVERS_JSON.read_text()).get("movers", [])
VIEWS_JSON = SCENE_DIR / "views.json"
# remembered camera views: each is a fixed <camera> in scene.xml named by its "camera" id
VIEWS: list[dict[str, Any]] = json.loads(VIEWS_JSON.read_text()).get("views", []) if VIEWS_JSON.exists() else []


def check() -> Any:
    """Compile scene.xml with MuJoCo; returns the MjModel."""
    import mujoco

    return mujoco.MjModel.from_xml_path(str(SCENE_XML))


def blueprint(robot: str = "unitree-go2-freewalk", scene_data: bool = True) -> Any:
    """A dimos blueprint for \`robot\` in this world (sets the global scene package first), plus the SceneData module
    (scene_data_request -> scene_data) so frontends can draw the world."""
    from dimos.core.global_config import global_config

    global_config.update(simulation="mujoco", scene_package=str(SCENE_DIR))
    from dimos.robot.get_all_blueprints import get_blueprint_by_name

    robot_blueprint = get_blueprint_by_name(robot)
    if not scene_data:
        return robot_blueprint
    # module workers import SceneData by this package's name, so they need its parent on their path
    parent = str(SCENE_DIR.parent)
    paths = [p for p in os.environ.get("PYTHONPATH", "").split(os.pathsep) if p]
    if parent not in paths:
        os.environ["PYTHONPATH"] = os.pathsep.join([parent, *paths])
    if parent not in sys.path:
        sys.path.insert(0, parent)
    from dimos.core.coordination.blueprints import autoconnect

    from .scene_data import SceneData

    return autoconnect(robot_blueprint, SceneData.blueprint())


def render_view(name: str, width: int = 640, height: int = 480, model: Any = None, data: Any = None) -> Any:
    """An RGB image (height x width x 3 uint8) from the remembered view \`name\` (see VIEWS).

    Without \`model\`/\`data\` it renders this world as exported; pass a running simulation's MjModel and MjData (whose
    scene includes this world's cameras) to see the live state, e.g. to check whether a task was done.
    """
    import mujoco

    if model is None:
        model = check()
    if data is None:
        data = mujoco.MjData(model)
        mujoco.mj_forward(model, data)
    camera = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, name)
    if camera < 0:
        known = [view["camera"] for view in VIEWS]
        raise KeyError(f"no camera {name!r} in the model (this world's views: {known})")
    width = min(width, int(model.vis.global_.offwidth))
    height = min(height, int(model.vis.global_.offheight))
    with mujoco.Renderer(model, height, width) as renderer:
        renderer.update_scene(data, camera=camera)
        return renderer.render()


def __getattr__(attribute: str) -> Any:
    # the go2 entry point (dimos run <world>.go2) is built on first use, not on import
    if attribute == "go2":
        return blueprint("unitree-go2-freewalk")
    raise AttributeError(attribute)


def main() -> None:
    model = check()
    print(
        f"{SCENE_XML}: {model.nbody} bodies, {model.ngeom} geoms, {len(MOVERS)} movers, spawns {sorted(SPAWNS)}, "
        f"views {[view['camera'] for view in VIEWS]}"
    )
`;
}

/** a copy the next export can overwrite: sources in the Nix store are read-only, and a copy keeps that mode */
async function copyWritable(from: string, to: string) {
  await Deno.remove(to).catch(() => {});
  await Deno.copyFile(from, to);
  await Deno.chmod(to, 0o644);
}

/** makes the folder a pip package that registers dimos blueprints: \`dimos run <name>.go2\` and \`<name>.scene-data\` */
function pyproject(name: string): string {
  return `# pip install -e this folder (into dimos's venv) and dimos finds its blueprints:
#   dimos run ${name.replace(/_/g, "-")}.go2          a Go2 in this world, plus the SceneData module
#   dimos run <blueprint> ${name.replace(/_/g, "-")}.scene-data --scene-package <this folder>   SceneData beside any sim2 blueprint
[project]
name = "${name}"
version = "0.1.0"
description = "A dim-world-builder world for dimos sim2"
requires-python = ">=3.10"

[project.entry-points."dimos.blueprints"]
go2 = "${name}:go2"
scene-data = "${name}.scene_data:SceneData"

[build-system]
requires = ["setuptools>=64"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["${name}"]
package-dir = { "${name}" = "." }

[tool.setuptools.package-data]
"*" = ["*", "**/*"]
`;
}
