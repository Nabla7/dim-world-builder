"""Find items whose collision shapes interpenetrate: python check_clips.py <scene.xml> [tolerance_m] -> JSON on stdout.

MuJoCo skips contacts between bodies welded to the world (every static item), so each item body gets a free joint
(movers lose mocap, at their start pose) and one mj_forward with gravity off reports every contact, with its depth,
between the items' real collision geometry: primitives and convex hulls. Contacts with the ground plane, the floor slabs
and hills (bodies of kind "slab" / "hill" in scene.json) aren't clips; neither is anything shallower than the tolerance.
"""

import json
from pathlib import Path
import sys

import mujoco

# what things stand on, not things that can clip: floor slabs, and hills (items sit at floor height, so their base dips
# into rising terrain, like a planted tree)
SUPPORT_KINDS = {"slab", "hill"}


def check(scene_xml: Path, tolerance: float = 0.02) -> dict[str, object]:
    entities = json.loads(scene_xml.with_name("scene.json").read_text()).get("entities", {})
    spec = mujoco.MjSpec.from_file(str(scene_xml))
    spec.option.gravity = [0, 0, 0]
    for body in spec.worldbody.bodies:
        if entities.get(body.name, {}).get("kind") in SUPPORT_KINDS:
            continue
        body.mocap = False
        # a stand-in inertia: only contacts are read, nothing is simulated (some bodies are visual-only and massless)
        body.explicitinertial = True
        body.mass = 1.0
        body.inertia = [1.0, 1.0, 1.0]
        body.add_freejoint()
    model = spec.compile()
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)

    pairs: dict[tuple[str, str], dict[str, object]] = {}
    for contact in data.contact[: data.ncon]:
        if contact.dist > -tolerance:
            continue
        bodies = []
        for geom in (contact.geom1, contact.geom2):
            body = model.body(int(model.geom_bodyid[geom]))
            bodies.append(body.name)
        a, b = sorted(bodies)
        # the world body holds the ground plane
        if "world" in (a, b) or not a or not b or a == b:
            continue
        if any(entities.get(name, {}).get("kind") in SUPPORT_KINDS for name in (a, b)):
            continue
        depth = round(-float(contact.dist), 3)
        known = pairs.get((a, b))
        if known is None or depth > known["depth_m"]:  # type: ignore[operator]
            pairs[(a, b)] = {
                "a": {
                    "key": a,
                    "name": entities.get(a, {}).get("label", a),
                    "kind": entities.get(a, {}).get("kind"),
                },
                "b": {
                    "key": b,
                    "name": entities.get(b, {}).get("label", b),
                    "kind": entities.get(b, {}).get("kind"),
                },
                "depth_m": depth,
                "at": [round(float(v), 3) for v in contact.pos],
            }
    clips = sorted(pairs.values(), key=lambda clip: -float(clip["depth_m"]))  # type: ignore[arg-type]
    warnings = [
        f"{clip['a']['name']} ({clip['a']['key']}) clips into {clip['b']['name']} ({clip['b']['key']}) "  # type: ignore[index]
        f"by {round(float(clip['depth_m']) * 100)} cm at {clip['at']}"  # type: ignore[arg-type]
        for clip in clips
    ]
    return {"tolerance_m": tolerance, "clips": clips, "warnings": warnings}


def main() -> None:
    scene = Path(sys.argv[1])
    tolerance = float(sys.argv[2]) if len(sys.argv) > 2 else 0.02
    print(json.dumps(check(scene, tolerance)))


if __name__ == "__main__":
    main()
