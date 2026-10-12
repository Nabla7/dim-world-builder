"""Render one camera of a MuJoCo scene to a PNG: python render_view.py <scene.xml> <camera> <width> <height> <out.png>."""

import sys

import mujoco
from PIL import Image


def main() -> None:
    scene, camera, width, height, out = (
        sys.argv[1],
        sys.argv[2],
        int(sys.argv[3]),
        int(sys.argv[4]),
        sys.argv[5],
    )
    model = mujoco.MjModel.from_xml_path(scene)
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    camera_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, camera)
    if camera_id < 0:
        sys.exit(f"no camera {camera!r} in {scene}")
    width = min(width, int(model.vis.global_.offwidth))
    height = min(height, int(model.vis.global_.offheight))
    with mujoco.Renderer(model, height, width) as renderer:
        renderer.update_scene(data, camera=camera_id)
        Image.fromarray(renderer.render()).save(out)


if __name__ == "__main__":
    main()
