"""Fake a robot's lidar map of a MuJoCo scene: a Mid-360-like scan from many spots, merged and voxelized like a SLAM map.

    uv run simulate_scan.py ~/repos/dimos/data/mujoco_office_555/scene_office_555.xml --out office_555_scan.ply

The scene's geoms are the ground truth that fit_shapes.py's output is compared against (see --truth-out).
"""

import argparse
import json
from pathlib import Path

import mujoco
import numpy as np
import open3d as o3d

# a Livox Mid-360: all the way around, -7..52 degrees up, mounted about 0.35 m up on a Go2
AZIMUTHS = 720
ELEVATIONS = np.radians(np.linspace(-7, 52, 40))
SENSOR_HEIGHT = 0.35
MAX_RANGE = 40.0
# collision geometry only (group 0: boxes, 3: convex hulls); group 1 is visual-only meshes
GEOM_GROUPS = np.array([1, 0, 0, 1, 0, 0], dtype=np.uint8)


def ray_directions() -> np.ndarray:
    az = np.linspace(0, 2 * np.pi, AZIMUTHS, endpoint=False)
    az_grid, el_grid = np.meshgrid(az, ELEVATIONS)
    return np.stack(
        [np.cos(el_grid) * np.cos(az_grid), np.cos(el_grid) * np.sin(az_grid), np.sin(el_grid)], axis=-1
    ).reshape(-1, 3)


def cast(model, data, origin: np.ndarray, directions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    count = len(directions)
    geom_ids = np.zeros(count, dtype=np.int32)
    distances = np.zeros(count, dtype=np.float64)
    mujoco.mj_multiRay(
        model, data, origin.astype(np.float64), directions.reshape(-1).astype(np.float64), GEOM_GROUPS, True, -1,
        geom_ids, distances, None, count, MAX_RANGE,
    )
    return geom_ids, distances


def scan_spots(model, data, floor_heights: list[float], spacing: float, outdoors: bool) -> list[np.ndarray]:
    """grid spots a robot could stand on: floor right below, a roof above, nothing within 0.3 m around"""
    low, high = data.geom_xpos.min(0), data.geom_xpos.max(0)
    spots = []
    down = np.array([[0, 0, -1.0]])
    up = np.array([[0, 0, 1.0]])
    around = np.array([[np.cos(a), np.sin(a), 0] for a in np.linspace(0, 2 * np.pi, 16, endpoint=False)])
    for floor_z in floor_heights:
        for x in np.arange(low[0], high[0], spacing):
            for y in np.arange(low[1], high[1], spacing):
                origin = np.array([x, y, floor_z + SENSOR_HEIGHT])
                _, below = cast(model, data, origin, down)
                _, above = cast(model, data, origin, up)
                _, sideways = cast(model, data, origin, around)
                standing = abs(below[0] - SENSOR_HEIGHT) < 0.05
                indoors = outdoors or above[0] > 0
                clear = np.all((sideways < 0) | (sideways > 0.3))
                if standing and indoors and clear:
                    spots.append(origin)
    return spots


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--out", type=Path, required=True, help="the merged map, .ply")
    parser.add_argument("--truth-out", type=Path, help="the scene's box geoms as JSON, for comparing")
    parser.add_argument("--floors", default="0", help="comma-separated floor heights to drive on, meters")
    parser.add_argument("--spacing", type=float, default=2.0, help="meters between scan spots")
    parser.add_argument("--noise", type=float, default=0.015, help="range noise (std dev), meters")
    parser.add_argument("--voxel", type=float, default=0.05, help="map voxel size, meters (dimos maps use 0.05)")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--outdoors", action="store_true", help="scan spots needn't have a roof over them")
    args = parser.parse_args()

    model = mujoco.MjModel.from_xml_path(str(args.scene))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    rng = np.random.default_rng(args.seed)
    directions = ray_directions()
    spots = scan_spots(model, data, [float(v) for v in args.floors.split(",")], args.spacing, args.outdoors)
    print(f"{len(spots)} scan spots")

    clouds = []
    for origin in spots:
        geom_ids, distances = cast(model, data, origin, directions)
        hit = geom_ids >= 0
        ranges = distances[hit] + rng.normal(0, args.noise, hit.sum())
        clouds.append(origin + directions[hit] * ranges[:, None])
    points = np.concatenate(clouds)
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points)).voxel_down_sample(args.voxel)
    o3d.io.write_point_cloud(str(args.out), cloud)
    print(f"{len(points)} hits -> {len(cloud.points)} map points -> {args.out}")

    if args.truth_out:
        boxes = []
        for geom in range(model.ngeom):
            if model.geom_type[geom] != mujoco.mjtGeom.mjGEOM_BOX or not GEOM_GROUPS[model.geom_group[geom]]:
                continue
            name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, geom) or ""
            body = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, model.geom_bodyid[geom]) or ""
            boxes.append({
                "name": name, "body": body,
                "center": data.geom_xpos[geom].tolist(),
                "rotation": data.geom_xmat[geom].reshape(3, 3).tolist(),
                "half_size": model.geom_size[geom].tolist(),
            })
        args.truth_out.write_text(json.dumps({"spots": [s.tolist() for s in spots], "boxes": boxes}))
        print(f"{len(boxes)} truth boxes -> {args.truth_out}")


if __name__ == "__main__":
    main()
