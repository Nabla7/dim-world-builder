"""SceneData: a dimos module that describes this world to frontends.

It publishes a small `scene_info` (std_msgs.String, JSON dimos.scene_info.v1: the scene id) every second so frontends
can discover it. Publish anything on `scene_data_request` (a std_msgs.String; its text is echoed back as `request`) and it answers on
`scene_data` with one std_msgs.String holding JSON (format dimos.scene_data.v1): every body's world pose, its geoms
(primitives, meshes, height fields), lights, cameras (the world's remembered views), and the mesh / height-field /
texture data they use, read from the compiled
scene.xml beside this file. Collision-only geoms (scene.json's hidden_geom_groups) are left out. Bodies that move (the
scripted movers) carry `mocap: true`; their live poses are on the TF tree under the body's name.

Arrays are base64 little-endian: float32 for vertices, normals, texcoords and heights, uint32 for faces, uint8 RGB(A)
for texture pixels. Quaternions are [x, y, z, w].
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
import threading
from typing import Any

import mujoco
import numpy as np

from dimos.core.core import rpc
from dimos.core.module import Module
from dimos.core.stream import In, Out
from dimos.msgs.std_msgs.String import String

SCENE_DIR = Path(__file__).resolve().parent
FORMAT = "dimos.scene_data.v1"

_GEOM_TYPES = {
    0: "plane",
    1: "hfield",
    2: "sphere",
    3: "capsule",
    4: "ellipsoid",
    5: "cylinder",
    6: "box",
    7: "mesh",
}


def _b64(array: Any, dtype: str) -> str:
    return base64.b64encode(np.ascontiguousarray(array, dtype=dtype).tobytes()).decode("ascii")


def _xyzw(wxyz: Any) -> list[float]:
    return [float(wxyz[1]), float(wxyz[2]), float(wxyz[3]), float(wxyz[0])]


def _floats(values: Any) -> list[float]:
    return [round(float(v), 6) for v in values]


def scene_data(scene_dir: Path = SCENE_DIR) -> dict[str, Any]:
    """The dimos.scene_data.v1 description of the scene in `scene_dir` (scene.xml, scene.json)."""
    model = mujoco.MjModel.from_xml_path(str(scene_dir / "scene.xml"))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    scene_json_path = scene_dir / "scene.json"
    scene_json = json.loads(scene_json_path.read_text()) if scene_json_path.exists() else {}
    hidden = set(scene_json.get("hidden_geom_groups", []))
    entities = scene_json.get("entities", {})

    def name(kind: int, i: int, unnamed: str) -> str:
        found: str | None = mujoco.mj_id2name(model, kind, i)
        return found or f"{unnamed}_{i}"

    meshes: dict[str, Any] = {}
    hfields: dict[str, Any] = {}
    textures: dict[str, Any] = {}

    def mesh(i: int) -> str:
        key = name(mujoco.mjtObj.mjOBJ_MESH, i, "mesh")
        if key not in meshes:
            v0, vn = model.mesh_vertadr[i], model.mesh_vertnum[i]
            f0, fn = model.mesh_faceadr[i], model.mesh_facenum[i]
            entry = {
                "vertices": _b64(model.mesh_vert[v0 : v0 + vn], "<f4"),
                "faces": _b64(model.mesh_face[f0 : f0 + fn], "<u4"),
            }
            t0, tn = model.mesh_texcoordadr[i], model.mesh_texcoordnum[i]
            if t0 >= 0 and tn > 0:
                # texcoords are indexed per face corner (mesh_facetexcoord), not per vertex
                entry["texcoords"] = _b64(model.mesh_texcoord[t0 : t0 + tn], "<f4")
                entry["face_texcoords"] = _b64(model.mesh_facetexcoord[f0 : f0 + fn], "<u4")
            meshes[key] = entry
        return key

    def hfield(i: int) -> str:
        key = name(mujoco.mjtObj.mjOBJ_HFIELD, i, "hfield")  # type: ignore[attr-defined]
        if key not in hfields:
            nrow, ncol = int(model.hfield_nrow[i]), int(model.hfield_ncol[i])
            start = model.hfield_adr[i]
            hfields[key] = {
                "nrow": nrow,
                "ncol": ncol,
                # [x half-size, y half-size, top, bottom thickness]; heights are 0..1 of top, row 0 at -y
                "size": _floats(model.hfield_size[i]),
                "heights": _b64(model.hfield_data[start : start + nrow * ncol], "<f4"),
            }
        return key

    def texture(i: int) -> str:
        key = name(mujoco.mjtObj.mjOBJ_TEXTURE, i, "texture")  # type: ignore[attr-defined]
        if key not in textures:
            width, height, channels = (
                int(model.tex_width[i]),
                int(model.tex_height[i]),
                int(model.tex_nchannel[i]),
            )
            start = model.tex_adr[i]
            textures[key] = {
                "width": width,
                "height": height,
                "channels": channels,
                "pixels": _b64(model.tex_data[start : start + width * height * channels], "u1"),
            }
        return key

    bodies: list[dict[str, Any]] = []
    for b in range(model.nbody):
        geoms = []
        for g in range(model.body_geomadr[b], model.body_geomadr[b] + model.body_geomnum[b]):
            if model.geom_group[g] in hidden or model.geom_rgba[g][3] == 0:
                continue
            kind = _GEOM_TYPES.get(int(model.geom_type[g]))
            if kind is None:
                continue
            geom: dict[str, Any] = {
                "name": name(mujoco.mjtObj.mjOBJ_GEOM, g, "geom"),
                "type": kind,
                # MuJoCo's size: sphere [r], capsule/cylinder [r, half-length], box/ellipsoid half-extents
                "size": _floats(model.geom_size[g]),
                "pos": _floats(model.geom_pos[g]),
                "quat": _xyzw(model.geom_quat[g]),
                "rgba": _floats(model.geom_rgba[g]),
                "collides": bool(model.geom_contype[g] or model.geom_conaffinity[g]),
            }
            material = model.geom_matid[g]
            if material >= 0:
                geom["rgba"] = (
                    _floats(model.mat_rgba[material])
                    if model.geom_rgba[g][3] == 1
                    else geom["rgba"]
                )
                tex = model.mat_texid[material][mujoco.mjtTextureRole.mjTEXROLE_RGB]  # type: ignore[attr-defined]
                if tex >= 0 and kind != "plane":
                    geom["texture"] = texture(tex)
            if kind == "mesh":
                geom["mesh"] = mesh(model.geom_dataid[g])
            elif kind == "hfield":
                geom["hfield"] = hfield(model.geom_dataid[g])
            geoms.append(geom)
        lights = [
            {
                "name": name(mujoco.mjtObj.mjOBJ_LIGHT, li, "light"),  # type: ignore[attr-defined]
                "pos": _floats(model.light_pos[li]),
                "dir": _floats(model.light_dir[li]),
                "diffuse": _floats(model.light_diffuse[li]),
                "directional": bool(
                    model.light_type[li] == mujoco.mjtLightType.mjLIGHT_DIRECTIONAL  # type: ignore[attr-defined]
                ),
                "castshadow": bool(model.light_castshadow[li]),
                "cutoff": float(model.light_cutoff[li]),
                "attenuation": _floats(model.light_attenuation[li]),
            }
            for li in range(model.nlight)
            if model.light_bodyid[li] == b
        ]
        if not geoms and not lights:
            continue
        body_name = name(mujoco.mjtObj.mjOBJ_BODY, b, "body")
        entity = entities.get(body_name, {})
        bodies.append(
            {
                "name": body_name,
                "label": entity.get("label", body_name),
                "kind": entity.get("kind"),
                "pos": _floats(data.xpos[b]),
                "quat": _xyzw(data.xquat[b]),
                "mocap": bool(model.body_mocapid[b] >= 0),
                "geoms": geoms,
                "lights": lights,
            }
        )
    # fixed cameras (the world's remembered views) and any others in the model, posed in the world
    cameras = []
    for c in range(model.ncam):
        quat = np.zeros(4)
        mujoco.mju_mat2Quat(quat, data.cam_xmat[c])  # type: ignore[attr-defined]
        cameras.append(
            {
                "name": name(mujoco.mjtObj.mjOBJ_CAMERA, c, "camera"),
                "body": name(mujoco.mjtObj.mjOBJ_BODY, int(model.cam_bodyid[c]), "body"),
                "pos": _floats(data.cam_xpos[c]),
                # MuJoCo cameras look down their -z with +y up
                "quat": _xyzw(quat),
                "fovy": float(model.cam_fovy[c]),
            }
        )
    headlight = model.vis.headlight
    return {
        "format": FORMAT,
        "id": scene_json.get("id", scene_dir.name),
        "frame": "world",
        "bodies": bodies,
        "meshes": meshes,
        "hfields": hfields,
        "textures": textures,
        "cameras": cameras,
        "ambient": _floats(np.asarray(headlight.ambient)),
        "spawns": scene_json.get("spawns", {}),
    }


class SceneData(Module):
    """Answers each message on scene_data_request with this world's description on scene_data, and says it's here with a
    tiny scene_info message every second (frontends find topics by seeing them publish; scene_data only does on request)."""

    scene_data_request: In[String]
    scene_data: Out[String]
    scene_info: Out[String]

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._encoded: str | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()

    @rpc
    def start(self) -> None:
        super().start()
        self.scene_data_request.subscribe(self._on_request)
        self._stop.clear()
        threading.Thread(target=self._announce, name="scene-info", daemon=True).start()

    @rpc
    def stop(self) -> None:
        self._stop.set()
        super().stop()

    def _announce(self) -> None:
        scene_json = SCENE_DIR / "scene.json"
        scene_id = (
            json.loads(scene_json.read_text()).get("id", SCENE_DIR.name)
            if scene_json.exists()
            else SCENE_DIR.name
        )
        info = json.dumps(
            {
                "format": "dimos.scene_info.v1",
                "id": scene_id,
                "request": "/scene_data_request",
                "data": "/scene_data",
            }
        )
        while not self._stop.wait(1.0):
            self.scene_info.publish(String(info))

    def _on_request(self, request: String) -> None:
        with self._lock:
            if self._encoded is None:
                # cached without the echo, which is spliced in per request
                self._encoded = json.dumps(scene_data(), separators=(",", ":"))
            encoded = self._encoded
        echo = json.dumps(getattr(request, "data", "") or "")
        self.scene_data.publish(String(f'{{"request":{echo},{encoded[1:]}'))
