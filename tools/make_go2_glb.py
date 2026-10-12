"""Bake the Go2 (MuJoCo Menagerie, BSD-3) into a rigged GLB for the viewer: one node per body, rig.json for its joints.

    python tools/make_go2_glb.py <path to go2.xml> assets/robots/go2

Run with any Python that has mujoco, numpy and trimesh (e.g. a dimos venv with data/go2_menagerie).
"""

import json
from pathlib import Path
import sys

import mujoco
import numpy as np
import trimesh


def main() -> None:
    xml, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    model = mujoco.MjModel.from_xml_path(str(xml))
    scene = trimesh.Scene()
    names = {}
    for body in range(1, model.nbody):
        name = model.body(body).name
        names[body] = name
        parent = int(model.body_parentid[body])
        matrix = np.eye(4)
        w, x, y, z = model.body_quat[body]
        matrix[:3, :3] = trimesh.transformations.quaternion_matrix([w, x, y, z])[:3, :3]
        matrix[:3, 3] = model.body_pos[body] if parent else [0, 0, 0]
        scene.graph.update(frame_to=name, frame_from=names.get(parent, scene.graph.base_frame), matrix=matrix)
    for geom in range(model.ngeom):
        if model.geom_type[geom] != mujoco.mjtGeom.mjGEOM_MESH or model.geom_group[geom] != 2:
            continue
        mesh_id = model.geom_dataid[geom]
        start, count = model.mesh_vertadr[mesh_id], model.mesh_vertnum[mesh_id]
        face_start, face_count = model.mesh_faceadr[mesh_id], model.mesh_facenum[mesh_id]
        vertices = model.mesh_vert[start : start + count]
        faces = model.mesh_face[face_start : face_start + face_count]
        rgba = model.geom_rgba[geom]
        if model.geom_matid[geom] >= 0:
            rgba = model.mat_rgba[model.geom_matid[geom]]
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
        mesh.visual = trimesh.visual.ColorVisuals(mesh, face_colors=(np.clip(rgba, 0, 1) * 255).astype(np.uint8))
        local = np.eye(4)
        w, x, y, z = model.geom_quat[geom]
        local[:3, :3] = trimesh.transformations.quaternion_matrix([w, x, y, z])[:3, :3]
        local[:3, 3] = model.geom_pos[geom]
        scene.add_geometry(mesh, node_name=f"g{geom}", parent_node_name=names[int(model.geom_bodyid[geom])], transform=local)
    (out / "go2.glb").write_bytes(scene.export(file_type="glb"))
    joints = []
    for joint in range(model.njnt):
        if model.jnt_type[joint] != mujoco.mjtJoint.mjJNT_HINGE:
            continue
        body = int(model.jnt_bodyid[joint])
        w, x, y, z = model.body_quat[body]
        joints.append({
            "name": model.joint(joint).name,
            "body": names[body],
            "axis": model.jnt_axis[joint].tolist(),
            "bodyQuat": [float(x), float(y), float(z), float(w)],
        })
    (out / "rig.json").write_text(json.dumps({"root": names[1], "joints": joints}, indent=2))
    print(out / "go2.glb", len(joints), "joints")


if __name__ == "__main__":
    main()
