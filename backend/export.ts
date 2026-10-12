// Writes a project as a directory dimos can load: `--scene-package <dir>` for sim2, `import <name>` for Python.
//   <dir>/scene.xml  scene.json  movers.json  __init__.py  README.md  world.project.json  meshes/<asset>/*  [visual.glb]

import { buildWorld } from "../src/world/geometry.ts";
import { toScene } from "../src/world/mjcf.ts";
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
  project: Project,
  assets: Record<string, MeshAsset>,
  /** asset id -> the folder holding its files on this machine */
  assetDirs: Record<string, string>,
  parentDir: string,
  options: { visualGlb?: Uint8Array } = {},
): Promise<ExportResult> {
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
  await write("world.project.json", JSON.stringify(project, null, 2) + "\n");
  await write("nav_eval.json", JSON.stringify(navEval(project), null, 2) + "\n");
  await write("__init__.py", pythonPackage(name, project));
  await write(
    "__main__.py",
    `"""python -m ${name}: compile the world with MuJoCo and summarize it."""\nfrom . import main\n\nmain()\n`,
  );
  await write("README.md", readme(name, project));
  for (const [asset, meshFiles] of scene.meshFiles) {
    const source = assetDirs[asset];
    if (!source) throw new Error(`no files for mesh asset ${asset}`);
    await Deno.mkdir(`${dir}/meshes/${asset}`, { recursive: true });
    for (const file of meshFiles) {
      await Deno.copyFile(`${source}/${file}`, `${dir}/meshes/${asset}/${file}`);
      files.push(`meshes/${asset}/${file}`);
    }
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
(dimos.movers.v1: scripted obstacles), meshes/ and world.project.json (the editor's project).
${project.items.length} items, ${project.floors.length} floor(s).
"""

from __future__ import annotations

import json
from pathlib import Path
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


def check() -> Any:
    """Compile scene.xml with MuJoCo; returns the MjModel."""
    import mujoco

    return mujoco.MjModel.from_xml_path(str(SCENE_XML))


def blueprint(robot: str = "unitree-go2-freewalk") -> Any:
    """A dimos blueprint for \`robot\` in this world (sets the global scene package first)."""
    from dimos.core.global_config import global_config

    global_config.update(simulation="mujoco", scene_package=str(SCENE_DIR))
    from dimos.robot.get_all_blueprints import get_blueprint_by_name

    return get_blueprint_by_name(robot)


def main() -> None:
    model = check()
    print(f"{SCENE_XML}: {model.nbody} bodies, {model.ngeom} geoms, {len(MOVERS)} movers, spawns {sorted(SPAWNS)}")
`;
}
