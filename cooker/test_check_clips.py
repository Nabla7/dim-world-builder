"""check_clips on two tiny worlds: two boxes pushed into each other clip, a box resting on another doesn't.

uv run --project cooker python cooker/test_check_clips.py
"""

import json
from pathlib import Path
import tempfile

from check_clips import check

SCENE = """<mujoco>
  <worldbody>
    <geom name="ground" type="plane" size="0 0 0.05"/>
    <body name="slab" pos="0 0 -0.5"><geom type="box" size="5 5 0.5"/></body>
    <body name="crate_1" pos="0 0 0.5"><geom type="box" size="0.5 0.5 0.5"/></body>
    <body name="crate_2" pos="{x} 0 {z}"><geom type="box" size="0.5 0.5 0.5"/></body>
  </worldbody>
</mujoco>
"""
ENTITIES = {
    "slab": {"body": "slab", "label": "Ground", "kind": "slab"},
    "crate_1": {"body": "crate_1", "label": "Crate", "kind": "box"},
    "crate_2": {"body": "crate_2", "label": "Crate", "kind": "box"},
}


def clips_for(x: float, z: float) -> list[dict[str, object]]:
    with tempfile.TemporaryDirectory() as folder:
        scene = Path(folder) / "scene.xml"
        scene.write_text(SCENE.format(x=x, z=z))
        scene.with_name("scene.json").write_text(json.dumps({"entities": ENTITIES}))
        return check(scene)["clips"]  # type: ignore[return-value]


def main() -> None:
    overlapping = clips_for(0.8, 0.5)
    assert len(overlapping) == 1, overlapping
    assert abs(float(overlapping[0]["depth_m"]) - 0.2) < 0.01, overlapping  # type: ignore[arg-type]
    assert clips_for(0.0, 1.5) == [], "a crate resting on another is not a clip"
    assert clips_for(2.0, 0.5) == [], "crates apart, both on the slab, are not clips"
    print("check_clips: ok")


if __name__ == "__main__":
    main()
