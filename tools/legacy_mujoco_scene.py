"""An exported world as a scene for dimos's older MuJoCo sim (dimos/simulation/mujoco, `dimos --simulation`).

That sim inserts the robot into a scene XML and loads every file from one flat {basename: bytes} map, and it spawns
the robot at the origin. So this writes <out>/scene_<name>.xml plus <out>/meshes and <out>/textures with unique
basenames, drops moving (mocap) bodies, and shifts the world so its default spawn is at the origin.

    python tools/legacy_mujoco_scene.py ~/dimos_worlds/office_555 <dimos>/data/mujoco_office_555 office_555
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET


def convert(world: Path, out: Path, name: str) -> Path:
    root = ET.parse(world / "scene.xml").getroot()
    spawn = json.loads((world / "scene.json").read_text()).get("spawns", {}).get("default", {})
    sx, sy = (spawn.get("position") or [0, 0, 0])[:2]
    (out / "meshes").mkdir(parents=True, exist_ok=True)
    (out / "textures").mkdir(parents=True, exist_ok=True)

    compiler = root.find("compiler")
    if compiler is not None:
        compiler.set("meshdir", "meshes")
        compiler.set("texturedir", "textures")
    # the contact settings were the sim2 Go2 policy's; the older sim's robots keep their own
    for option in root.findall("option"):
        root.remove(option)
    asset = root.find("asset")
    for mesh in asset.findall("mesh") if asset is not None else []:
        file = mesh.get("file")
        if file:
            flat = f"{name}_{file.replace('/', '_')}"
            shutil.copyfile(world / "meshes" / file, out / "meshes" / flat)
            mesh.set("file", flat)
    for texture in asset.findall("texture") if asset is not None else []:
        file = texture.get("file")
        if file:
            flat = f"{name}_{file}"
            shutil.copyfile(world / "textures" / file, out / "textures" / flat)
            texture.set("file", flat)

    worldbody = root.find("worldbody")
    if worldbody is None:
        raise ValueError(f"{world / 'scene.xml'} has no <worldbody>")
    children = [child for child in list(worldbody) if child.get("mocap") != "true"]
    for child in list(worldbody):
        worldbody.remove(child)
    # the robot starts at the origin: move the world so the scene's default spawn lands there
    frame = ET.SubElement(worldbody, "frame", pos=f"{-sx:g} {-sy:g} 0")
    frame.extend(children)

    xml = out / f"scene_{name}.xml"
    ET.indent(root)
    xml.write_text(ET.tostring(root, encoding="unicode") + "\n")
    return xml


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("world", type=Path, help="an exported world folder")
    parser.add_argument("out", type=Path, help="the data folder to write")
    parser.add_argument("name", help="the scene name: scene_<name>.xml")
    args = parser.parse_args()
    print(convert(args.world.expanduser(), args.out.expanduser(), args.name))


if __name__ == "__main__":
    main()
