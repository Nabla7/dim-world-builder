"""Fit a lidar map with upright primitives and write a World Builder project.

    uv run fit_shapes.py map.ply --out out/my_map

writes my_map.project.json (open it in World Builder), my_map.shapes.json and my_map.html (the map's points over the
shapes), and prints how well the shapes explain the map. Z must be up (as in dimos/ROS maps).

The steps (see docs/lidar_to_shapes.md for where each idea comes from):
  1. horizontal surfaces: peaks in the height of up/down-facing points, each level's points rasterized and cut into
     rectangles -> floor, ceiling and table-top slabs
  2. walls: the directions walls face (a histogram of wall normals' yaw), then for each direction peaks in the
     points' offset along it, each peak's points rasterized in the wall's plane and cut into rectangles -> wall boxes
  3. ramps: planes tilted 5..35 degrees among what's left -> wedges
  4. clutter: clusters of what's left -> the best of box / cylinder / sphere, split in two until they fit
"""

import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import open3d as o3d
from scipy import ndimage, signal
from scipy.spatial import ConvexHull

from shapes import Shape, measure, nearest_surface_distance
from world_builder import save_to_app, write_project
from viewer import write_viewer


@dataclass
class Settings:
    tolerance: float = 0.10
    """a point within this of a shape's surface counts as explained by it"""
    voxel: float = 0.05
    horizontal_cell: float = 0.2
    wall_cell: float = 0.1
    min_rectangle_area: float = 0.12
    min_wall_area: float = 0.25
    min_wall_height: float = 0.8
    door_gap: float = 0.5
    """a wall with a gap at least this wide is two walls (smaller gaps are filled)"""
    min_clutter_points: int = 15
    target: float | None = None
    """if set, drop the least useful shapes while at least this share of the points stays explained"""
    min_unique_points: int = 25
    """a shape must explain at least this many points nothing else does (25 is about 0.06 m² at 5 cm)"""


# ---------- loading ----------

def load_points(path: Path) -> np.ndarray:
    if path.suffix in (".npy",):
        return np.load(path)[:, :3].astype(np.float64)
    if path.suffix == ".npz":
        data = np.load(path)
        return data[data.files[0]][:, :3].astype(np.float64)
    cloud = o3d.io.read_point_cloud(str(path))
    if not len(cloud.points):
        raise SystemExit(f"no points in {path}")
    return np.asarray(cloud.points)


def downsample_with_normals(points: np.ndarray, voxel: float) -> tuple[np.ndarray, np.ndarray]:
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points)).voxel_down_sample(voxel)
    cloud.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=voxel * 4, max_nn=30))
    return np.asarray(cloud.points), np.asarray(cloud.normals)


# ---------- grids and rectangles ----------

def largest_rectangle(grid: np.ndarray) -> tuple[int, tuple[int, int, int, int]]:
    """the largest all-true axis-aligned rectangle: (cells, (row0, col0, row1, col1)) with row1/col1 exclusive"""
    rows, cols = grid.shape
    heights = np.zeros(cols, dtype=np.int64)
    best = (0, (0, 0, 0, 0))
    for r in range(rows):
        heights = np.where(grid[r], heights + 1, 0)
        stack: list[tuple[int, int]] = []
        for c in range(cols + 1):
            h = int(heights[c]) if c < cols else 0
            start = c
            while stack and stack[-1][1] >= h:
                s, sh = stack.pop()
                if sh * (c - s) > best[0]:
                    best = (sh * (c - s), (r - sh + 1, s, r + 1, c))
                start = s
            stack.append((start, h))
    return best


def rectangles(grid: np.ndarray, min_cells: int, min_side: int = 1) -> list[tuple[int, int, int, int]]:
    """cut a mask into rectangles, biggest first, until only pieces smaller than min_cells are left"""
    grid = grid.copy()
    found = []
    labels, count = ndimage.label(grid)
    for index, piece in enumerate(ndimage.find_objects(labels)):
        sub = labels[piece] == index + 1
        while sub.sum() >= min_cells:
            cells, (r0, c0, r1, c1) = largest_rectangle(sub)
            if cells < min_cells or min(r1 - r0, c1 - c0) < min_side:
                break
            sub[r0:r1, c0:c1] = False
            found.append((r0 + piece[0].start, c0 + piece[1].start, r1 + piece[0].start, c1 + piece[1].start))
    return found


def histogram_peaks(values: np.ndarray, bin_size: float, min_count: float, min_distance: float):
    """peaks of a smoothed histogram: (center, low edge, high edge) of each, its edges where it falls to 25%"""
    low, high = values.min() - 3 * bin_size, values.max() + 3 * bin_size
    counts, edges = np.histogram(values, bins=max(3, int((high - low) / bin_size)), range=(low, high))
    smooth = ndimage.gaussian_filter1d(counts.astype(float), 1.0)
    peaks, _ = signal.find_peaks(smooth, height=min_count, distance=max(1, int(min_distance / bin_size)))
    found = []
    for peak in peaks:
        floor_level = smooth[peak] * 0.25
        a = peak
        while a > 0 and smooth[a - 1] > floor_level and peak - a < 6:
            a -= 1
        b = peak
        while b < len(smooth) - 1 and smooth[b + 1] > floor_level and b - peak < 6:
            b += 1
        found.append(((edges[peak] + edges[peak + 1]) / 2, edges[a], edges[b + 1]))
    return found


def rotate_xy(points: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    out = points.copy()
    out[:, 0] = c * points[:, 0] + s * points[:, 1]
    out[:, 1] = -s * points[:, 0] + c * points[:, 1]
    return out


def rotate_back_xy(xy: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    return np.array([c * xy[0] - s * xy[1], s * xy[0] + c * xy[1]])


# ---------- 1. wall directions ----------

def wall_directions(normals: np.ndarray, vertical: np.ndarray) -> list[float]:
    """the yaws walls face (mod 180 degrees), strongest first"""
    yaw = np.degrees(np.arctan2(normals[vertical, 1], normals[vertical, 0])) % 180
    counts, edges = np.histogram(yaw, bins=360, range=(0, 180))
    # wrap around so a peak at 0/180 is one peak
    wrapped = np.concatenate([counts[-10:], counts, counts[:10]]).astype(float)
    smooth = ndimage.gaussian_filter1d(wrapped, 4.0)[10:-10]
    peaks, _ = signal.find_peaks(np.concatenate([smooth[-10:], smooth, smooth[:10]]), distance=10)
    peaks = sorted({int(p - 10) % 360 for p in peaks}, key=lambda p: -smooth[p])
    if not peaks:
        return []
    # a direction with a real share of the walls; noisy normals make many small bumps
    peaks = [p for p in peaks if smooth[p] >= 0.3 * smooth[peaks[0]]]
    main = peaks[0]
    # a building's main direction comes with its right angle
    square = (main + 180) % 360
    if all(min(abs(p - square), 360 - abs(p - square)) > 10 for p in peaks):
        peaks.insert(1, square)
    return [np.radians((edges[p] + edges[p + 1]) / 2) for p in peaks]


# ---------- 2. horizontal surfaces ----------

def fit_horizontal(points, normals, frame_yaw, settings: Settings) -> list[Shape]:
    up = np.abs(normals[:, 2]) > 0.85
    flat = points[up]
    if len(flat) < 50:
        return []
    cell = settings.horizontal_cell
    min_points_per_level = 4 * settings.min_rectangle_area / settings.voxel**2 * 0.25
    shapes = []
    rotated_all = rotate_xy(points, frame_yaw)
    levels = merge_levels(histogram_peaks(flat[:, 2], 0.02, min_points_per_level, 0.12), 0.15)
    lowest = min((level[0] for level in levels), default=0.0)
    for z0, z_low, z_high in levels:
        in_level = flat[(flat[:, 2] >= z_low) & (flat[:, 2] <= z_high)]
        local = rotate_xy(in_level, frame_yaw)
        origin = local[:, :2].min(axis=0)
        index = np.floor((local[:, :2] - origin) / cell).astype(int)
        shape = index.max(axis=0) + 1
        counts = np.zeros(shape, dtype=int)
        np.add.at(counts, (index[:, 0], index[:, 1]), 1)
        mask = ndimage.binary_closing(counts >= 2, iterations=1) | (counts >= 2)
        # a floor goes on under what stood on it: fill its holes
        mask = ndimage.binary_fill_holes(mask)
        min_cells = max(2, int(settings.min_rectangle_area / cell**2))
        for r0, c0, r1, c1 in rectangles(mask, min_cells):
            low = origin + np.array([r0, c0]) * cell
            high = origin + np.array([r1, c1]) * cell
            inside = (local[:, 0] >= low[0]) & (local[:, 0] < high[0]) & (local[:, 1] >= low[1]) & (local[:, 1] < high[1])
            zs = local[inside, 2] if inside.sum() > 3 else in_level[:, 2]
            top, bottom = np.percentile(zs, 90), np.percentile(zs, 10)
            # floor or ceiling: is there more stuff just above it, or just below?
            footprint = ((rotated_all[:, 0] >= low[0]) & (rotated_all[:, 0] < high[0]) & (rotated_all[:, 1] >= low[1])
                         & (rotated_all[:, 1] < high[1]))
            # a floor-to-floor slab: its top is a floor, its underside (a level 12..60 cm below) a ceiling
            near_flat = footprint & up
            slab_above = np.sum(near_flat & (points[:, 2] > top + 0.12) & (points[:, 2] < top + 0.6))
            slab_below = np.sum(near_flat & (points[:, 2] < bottom - 0.12) & (points[:, 2] > bottom - 0.6))
            enough = 0.3 * inside.sum()
            if (slab_above > enough) != (slab_below > enough) and z0 - lowest > 1.8:
                faces_up = slab_below > enough
            else:
                # otherwise a ceiling is high, and has walls and things under it but not over it
                sides = footprint & ~up
                above = np.sum(sides & (points[:, 2] > top + 0.1) & (points[:, 2] < top + 1.5))
                below = np.sum(sides & (points[:, 2] < bottom - 0.1) & (points[:, 2] > bottom - 1.5))
                faces_up = not (below > 2 * above and z0 - lowest > 1.8)
            thickness = max(top - bottom, 0.05)
            if faces_up:
                z_top, z_bottom = top, top - max(thickness, 0.1)
            else:
                z_bottom, z_top = bottom, bottom + max(thickness, 0.1)
            center_xy = rotate_back_xy((low + high) / 2, frame_yaw)
            area = float(np.prod(high - low))
            shapes.append(Shape(
                "box", "floor" if faces_up else "ceiling",
                np.array([center_xy[0], center_xy[1], (z_top + z_bottom) / 2]),
                np.array([high[0] - low[0], high[1] - low[1], z_top - z_bottom]), frame_yaw,
                {"level": round(float(z0), 3), "area": round(area, 2)},
            ))
    # a "floor" that's small and well above the floor under it is a table top, a shelf, a step
    heights = storeys(shapes)
    for shape in shapes:
        top = shape.center[2] + shape.size[2] / 2
        if shape.role == "floor" and shape.meta["area"] < 4.0 and min(abs(top - h) for h in heights) > 0.2:
            shape.role = "horizontal"
        # a ceiling is at least head height above the floor under it; lower, it's the underside of a table or shelf
        bottom = shape.center[2] - shape.size[2] / 2
        under = [h for h in heights if h <= bottom + 0.05]
        if shape.role == "ceiling" and under and bottom - max(under) < 1.8:
            shape.role = "horizontal"
    return shapes


def merge_levels(levels, gap: float):
    """one level from peaks closer than `gap` (a drifting map's floor is a thick band with several bumps)"""
    merged = []
    for z0, low, high in sorted(levels):
        if merged and low - merged[-1][2] < gap and z0 - merged[-1][0] < gap:
            last = merged[-1]
            merged[-1] = ((last[0] + z0) / 2, last[1], high)
        else:
            merged.append((z0, low, high))
    return merged


def storeys(shapes: list[Shape]) -> list[float]:
    """the floor heights: levels whose floors add up to a real share of the biggest one"""
    groups: list[list[float]] = []  # [area-weighted height sum, area]
    for shape in sorted((s for s in shapes if s.role == "floor"), key=lambda s: -s.meta["area"]):
        top = float(shape.center[2] + shape.size[2] / 2)
        area = shape.meta["area"]
        match = next((g for g in groups if abs(g[0] / g[1] - top) < 0.2), None)
        if match is None:
            groups.append([top * area, area])
        else:
            match[0] += top * area
            match[1] += area
    by_level = {round(total / area, 2): area for total, area in groups}
    if not by_level:
        return [0.0]
    biggest = max(by_level.values())
    return sorted(level for level, area in by_level.items() if area >= 0.2 * biggest)


# ---------- 3. walls ----------

def fit_walls(points, normals, directions, storey_heights, settings: Settings) -> list[Shape]:
    vertical = np.abs(normals[:, 2]) < 0.3
    horizontal_normal = normals[:, :2] / np.maximum(np.linalg.norm(normals[:, :2], axis=1, keepdims=True), 1e-9)
    flat = np.abs(normals[:, 2]) > 0.85
    taken = np.zeros(len(points), dtype=bool)
    walls = []
    top_of_map = float(np.percentile(points[:, 2], 99.5))
    cell = settings.wall_cell
    gap_cells = int(round(settings.door_gap / cell))
    for direction in directions:
        facing = np.array([np.cos(direction), np.sin(direction)])
        along = np.array([-facing[1], facing[0]])
        candidates = vertical & ~taken & (np.abs(horizontal_normal @ facing) > np.cos(np.radians(15)))
        if candidates.sum() < 50:
            continue
        offsets = points[:, :2] @ facing
        alongs = points[:, :2] @ along
        min_points = 0.5 / settings.voxel**2 * 0.3  # about half a square meter of wall
        peaks = histogram_peaks(offsets[candidates], 0.02, min_points * 0.02 / 0.5, 0.08)
        peak_centers = [p[0] for p in peaks]
        for u0, u_low, u_high in peaks:
            u_low, u_high = max(u_low, u0 - 0.12), min(u_high, u0 + 0.12)
            band = candidates & (offsets >= u_low) & (offsets <= u_high)
            if band.sum() < 20:
                continue
            v, z = alongs[band], points[band, 2]
            v0, z0 = v.min(), z.min()
            iv = np.floor((v - v0) / cell).astype(int)
            iz = np.floor((z - z0) / cell).astype(int)
            counts = np.zeros((iv.max() + 1, iz.max() + 1), dtype=int)
            np.add.at(counts, (iv, iz), 1)
            mask = counts >= 1
            # fill holes narrower than a door (occlusion, sparse returns), along the wall and up it
            mask = ndimage.binary_closing(mask, structure=np.ones((max(1, gap_cells - 1), 1)), border_value=0) | mask
            mask = ndimage.binary_closing(mask, structure=np.ones((1, 3)), border_value=0) | mask
            min_cells = max(2, int(settings.min_wall_area / cell**2))
            for a0, b0, a1, b1 in rectangles(mask, min_cells, min_side=3):
                v_low, v_high = v0 + a0 * cell, v0 + a1 * cell
                z_low, z_high = z0 + b0 * cell, z0 + b1 * cell
                # the side of a desk or a cabinet is clutter: a wall is tall (for the room it's in) or long
                under = [h for h in storey_heights if h <= z_low + 0.4] or [z_low]
                over = [h for h in storey_heights if h > z_low + 1.0] or [top_of_map]
                tall_enough = min(settings.min_wall_height, 0.6 * (min(over) - max(under)))
                if z_high - z_low < tall_enough and not (v_high - v_low >= 1.5 and z_high - z_low >= 0.4):
                    continue
                in_rect = band & (alongs >= v_low) & (alongs <= v_high) & (points[:, 2] >= z_low) & (points[:, 2] <= z_high)
                if in_rect.sum() < 8:
                    continue
                face_low, face_high = np.percentile(offsets[in_rect], [10, 90])
                # its other face, if seen: a parallel peak 5..30 cm away
                others = [c for c in peak_centers if 0.05 < abs(c - u0) <= 0.3]
                behind = 0
                for other in others:
                    near_other = (candidates & (np.abs(offsets - other) < 0.04) & (alongs >= v_low) & (alongs <= v_high)
                                  & (points[:, 2] >= z_low) & (points[:, 2] <= z_high))
                    if near_other.sum() > 0.3 * in_rect.sum():
                        behind = np.sign(other - u0)
                        face_low, face_high = min(face_low, other), max(face_high, other)
                        break
                if behind == 0:
                    # one face seen: the wall goes away from the side the floor was scanned on
                    strip = flat & (alongs >= v_low) & (alongs <= v_high)
                    plus = np.sum(strip & (offsets > u0 + 0.15) & (offsets < u0 + 0.8))
                    minus = np.sum(strip & (offsets < u0 - 0.15) & (offsets > u0 - 0.8))
                    behind = 1 if plus < minus else -1
                    if behind > 0:
                        face_high = max(face_high, face_low + 0.1)
                    else:
                        face_low = min(face_low, face_high - 0.1)
                # a wall that nearly reaches a floor reaches it
                for level in storey_heights:
                    if 0 < z_low - level < 0.4:
                        z_low = level
                center_uv = np.array([(face_low + face_high) / 2, (v_low + v_high) / 2])
                center_xy = facing * center_uv[0] + along * center_uv[1]
                walls.append(Shape(
                    "box", "wall", np.array([center_xy[0], center_xy[1], (z_low + z_high) / 2]),
                    np.array([face_high - face_low, v_high - v_low, z_high - z_low]), direction,
                    {"faces_seen": 2 if others and abs(face_high - face_low) > 0.1 else 1},
                ))
        taken |= candidates
    return merge_walls(dedupe(walls))


def merge_walls(walls: list[Shape], gap: float = 0.15) -> list[Shape]:
    """join walls that are one wall: same direction and plane, touching end to end, or stacked"""
    walls = list(walls)
    merged = True
    while merged:
        merged = False
        for i in range(len(walls)):
            for j in range(i + 1, len(walls)):
                joined = join_walls(walls[i], walls[j], gap)
                if joined is not None:
                    walls[i] = joined
                    del walls[j]
                    merged = True
                    break
            if merged:
                break
    return walls


def join_walls(a: Shape, b: Shape, gap: float) -> Shape | None:
    if abs(np.sin(a.yaw - b.yaw)) > 0.02:
        return None
    facing = np.array([np.cos(a.yaw), np.sin(a.yaw)])
    along = np.array([-facing[1], facing[0]])
    if abs(np.dot(b.center[:2] - a.center[:2], facing)) > 0.06 or abs(a.size[0] - b.size[0]) > 0.08:
        return None
    va, vb = a.center[:2] @ along, b.center[:2] @ along
    a_v = (va - a.size[1] / 2, va + a.size[1] / 2)
    b_v = (vb - b.size[1] / 2, vb + b.size[1] / 2)
    a_z = (a.center[2] - a.size[2] / 2, a.center[2] + a.size[2] / 2)
    b_z = (b.center[2] - b.size[2] / 2, b.center[2] + b.size[2] / 2)
    same_height = abs(a_z[0] - b_z[0]) < 0.25 and abs(a_z[1] - b_z[1]) < 0.25
    same_span = abs(a_v[0] - b_v[0]) < 0.25 and abs(a_v[1] - b_v[1]) < 0.25
    end_to_end = same_height and max(a_v[0], b_v[0]) - min(a_v[1], b_v[1]) < gap
    stacked = same_span and max(a_z[0], b_z[0]) - min(a_z[1], b_z[1]) < gap
    if not (end_to_end or stacked):
        return None
    v = (min(a_v[0], b_v[0]), max(a_v[1], b_v[1]))
    z = (min(a_z[0], b_z[0]), max(a_z[1], b_z[1]))
    u = (np.dot(a.center[:2], facing) + np.dot(b.center[:2], facing)) / 2
    xy = facing * u + along * (v[0] + v[1]) / 2
    return Shape("box", "wall", np.array([xy[0], xy[1], (z[0] + z[1]) / 2]),
                 np.array([max(a.size[0], b.size[0]), v[1] - v[0], z[1] - z[0]]), a.yaw, dict(a.meta))


def dedupe(shapes: list[Shape]) -> list[Shape]:
    """drop a wall that's almost all inside a bigger one (both faces of one wall find it)"""
    keep: list[Shape] = []
    for shape in sorted(shapes, key=lambda s: -np.prod(s.size)):
        corners = shape.surface_samples(max(shape.size) / 4)
        if any(np.mean(other.signed_distance(corners) < 0.03) > 0.9 for other in keep):
            continue
        keep.append(shape)
    return keep


# ---------- 4. ramps ----------

def ramp_from_plane(normal: np.ndarray, part: np.ndarray, part_normals: np.ndarray) -> Shape | None:
    normal = normal if normal[2] > 0 else -normal
    slope_degrees = float(np.degrees(np.arccos(min(1.0, normal[2]))))
    if not 4 <= slope_degrees <= 35:
        return None
    # its points must face the way the plane does (not a band of junk that happens to lie in a plane)
    agree = np.abs(part_normals @ normal) > np.cos(np.radians(6))
    if agree.mean() < 0.6:
        return None
    part = part[agree]
    labels = np.array(o3d.geometry.PointCloud(o3d.utility.Vector3dVector(part)).cluster_dbscan(eps=0.12, min_points=5))
    if labels.max() < 0:
        return None
    part = part[labels == np.bincount(labels[labels >= 0]).argmax()]
    rising = -normal[:2] / np.linalg.norm(normal[:2])
    yaw = float(np.arctan2(rising[1], rising[0]))
    local = rotate_xy(part, yaw)
    x_low, x_high = np.percentile(local[:, 0], [1, 99])
    y_low, y_high = np.percentile(local[:, 1], [1, 99])
    if len(part) < 120 or x_high - x_low < 0.8 or y_high - y_low < 0.4:
        return None
    slope = np.tan(np.radians(slope_degrees))
    # the slope's height at its low end
    z_at_low = np.median(local[:, 2] - (local[:, 0] - x_low) * slope)
    rise = (x_high - x_low) * slope
    center_xy = rotate_back_xy(np.array([(x_low + x_high) / 2, (y_low + y_high) / 2]), yaw)
    return Shape(
        "ramp", "ramp", np.array([center_xy[0], center_xy[1], z_at_low + rise / 2]),
        np.array([x_high - x_low, y_high - y_low, rise]), yaw, {"tilt_degrees": round(slope_degrees, 1)},
    )


def fit_ramps(points, normals, settings: Settings) -> list[Shape]:
    """wedges for patches tilted 4..35 degrees. Tilt comes from normals over a 30 cm neighbourhood, steadier than the
    per-point ones: a floor's noise reads as a degree or two, a ramp as its slope"""
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
    cloud.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=0.3, max_nn=120))
    tilt = np.degrees(np.arccos(np.clip(np.abs(np.asarray(cloud.normals)[:, 2]), 0, 1)))
    sloped = (tilt > 3.5) & (tilt < 40)
    if sloped.sum() < 150:
        return []
    smooth_normals = np.asarray(cloud.normals)[sloped]
    sloped_points = points[sloped]
    candidates = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(sloped_points))
    labels = np.array(candidates.cluster_dbscan(eps=0.12, min_points=8))
    ramps = []
    for label in range(labels.max() + 1):
        members = np.flatnonzero(labels == label)
        # a cluster can hold a ramp and the tilted-looking feet of walls next to it: peel off planes one by one
        for _ in range(8):
            if len(members) < 150:
                break
            patch = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(sloped_points[members]))
            plane, inliers = patch.segment_plane(0.02, 3, 200)
            plane_members = members[inliers]
            members = np.delete(members, inliers)
            if len(plane_members) < 150:
                break
            ramp = ramp_from_plane(np.array(plane[:3]), sloped_points[plane_members], smooth_normals[plane_members])
            if ramp is not None:
                ramps.append(ramp)
    return ramps


# ---------- 5. clutter ----------

def min_area_yaw(xy: np.ndarray) -> float:
    """the yaw of the smallest rectangle around these points"""
    if len(xy) < 4:
        return 0.0
    try:
        hull = xy[ConvexHull(xy).vertices]
    except Exception:
        return 0.0
    best = (np.inf, 0.0)
    for i in range(len(hull)):
        edge = hull[(i + 1) % len(hull)] - hull[i]
        angle = np.arctan2(edge[1], edge[0])
        rotated = rotate_xy(np.column_stack([hull, np.zeros(len(hull))]), angle)
        area = np.ptp(rotated[:, 0]) * np.ptp(rotated[:, 1])
        if area < best[0]:
            best = (area, angle)
    return float(best[1])


def box_around(points: np.ndarray, yaw: float, role: str) -> Shape:
    local = rotate_xy(points, yaw)
    low, high = local.min(axis=0), local.max(axis=0)
    size = np.maximum(high - low, 0.03)
    center_xy = rotate_back_xy((low[:2] + high[:2]) / 2, yaw)
    return Shape("box", role, np.array([center_xy[0], center_xy[1], (low[2] + high[2]) / 2]), size, yaw)


def cylinder_around(points: np.ndarray, role: str) -> Shape | None:
    xy = points[:, :2]
    # least-squares circle (Kasa)
    a = np.column_stack([2 * xy, np.ones(len(xy))])
    b = (xy**2).sum(axis=1)
    try:
        (cx, cy, c), *_ = np.linalg.lstsq(a, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    radius_sq = c + cx * cx + cy * cy
    if radius_sq <= 0:
        return None
    radius = float(np.sqrt(radius_sq))
    if not 0.03 <= radius <= 0.8:
        return None
    z_low, z_high = points[:, 2].min(), points[:, 2].max()
    return Shape("cylinder", role, np.array([cx, cy, (z_low + z_high) / 2]),
                 np.array([2 * radius, 2 * radius, max(z_high - z_low, 0.03)]))


def sphere_around(points: np.ndarray, role: str) -> Shape | None:
    a = np.column_stack([2 * points, np.ones(len(points))])
    b = (points**2).sum(axis=1)
    try:
        (cx, cy, cz, c), *_ = np.linalg.lstsq(a, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    radius_sq = c + cx * cx + cy * cy + cz * cz
    if radius_sq <= 0:
        return None
    radius = float(np.sqrt(radius_sq))
    if not 0.05 <= radius <= 0.8:
        return None
    return Shape("sphere", role, np.array([cx, cy, cz]), np.full(3, 2 * radius))


def fit_cluster(points: np.ndarray, storey_heights: list[float], settings: Settings, depth: int = 0) -> list[Shape]:
    if len(points) < settings.min_clutter_points:
        return []
    candidates = []
    box = box_around(points, min_area_yaw(points[:, :2]), "clutter")
    candidates.append((0.0, box))
    for maker, penalty in ((cylinder_around, 0.03), (sphere_around, 0.05)):
        shape = maker(points, "clutter")
        if shape is not None:
            candidates.append((penalty, shape))
    scored = []
    for penalty, shape in candidates:
        coverage = float(np.mean(shape.distance(points) <= settings.tolerance * 0.6))
        # a shape much bigger than its points (a sphere fit to a flat patch) isn't a fit
        bloat = np.prod(shape.size) / max(np.prod(np.ptp(points, axis=0) + 0.05), 1e-6)
        scored.append((coverage - penalty - (0.3 if bloat > 3 else 0.0), coverage, shape))
    score, coverage, best = max(scored, key=lambda s: s[0])
    if coverage < 0.85 and depth < 5 and len(points) >= 4 * settings.min_clutter_points:
        # split across its longest side and try again
        local = best.local(points) if best.kind == "box" else points - points.mean(axis=0)
        axis = int(np.argmax(np.ptp(local, axis=0)))
        cut = np.median(local[:, axis])
        halves = [points[local[:, axis] <= cut], points[local[:, axis] > cut]]
        return [s for half in halves for s in fit_cluster(half, storey_heights, settings, depth + 1)]
    best.meta["fit"] = round(coverage, 3)
    if best.kind == "box":
        # resting on a floor: reach it
        bottom = best.center[2] - best.size[2] / 2
        for level in storey_heights:
            if 0 < bottom - level < 0.25:
                top = best.center[2] + best.size[2] / 2
                best.center[2], best.size[2] = (top + level) / 2, top - level
    return [best]


def fit_clutter(points: np.ndarray, storey_heights, settings: Settings) -> list[Shape]:
    if len(points) < settings.min_clutter_points:
        return []
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
    labels = np.array(cloud.cluster_dbscan(eps=settings.voxel * 2.5, min_points=4))
    shapes = []
    for label in range(labels.max() + 1):
        shapes += fit_cluster(points[labels == label], storey_heights, settings)
    return shapes


# ---------- 6. pruning ----------

def prune(points: np.ndarray, shapes: list[Shape], tolerance: float, min_unique: int,
          target: float | None = None) -> list[Shape]:
    """drop shapes that explain fewer than min_unique points no other shape explains, worst first: clutter, then
    table tops and the like, then walls and floors, so a stray box on a wall goes and the wall stays. With a target,
    keep dropping (same order) while the share of points explained stays at or above it: the fewest shapes that
    explain that much."""
    import heapq
    from scipy.spatial import cKDTree

    tree = cKDTree(points)
    members = []
    for shape in shapes:
        near = np.asarray(tree.query_ball_point(shape.center, shape.radius + tolerance), dtype=int)
        members.append(near[shape.distance(points[near]) <= tolerance] if len(near) else near)
    counts = np.zeros(len(points), dtype=int)
    for member in members:
        counts[member] += 1
    covered = int(np.sum(counts > 0))
    alive = np.ones(len(shapes), dtype=bool)
    structure = tuple({s.role for s in shapes} - {"clutter", "horizontal"})
    for goal in ("min_unique", "target"):
        if goal == "target" and target is None:
            break
        for roles in (("clutter",), ("horizontal",), structure):
            heap = [(int(np.sum(counts[members[i]] == 1)), i) for i, s in enumerate(shapes)
                    if s.role in roles and alive[i]]
            heapq.heapify(heap)
            while heap:
                unique, i = heapq.heappop(heap)
                now = int(np.sum(counts[members[i]] == 1))
                if now > unique:
                    heapq.heappush(heap, (now, i))
                    continue
                if goal == "min_unique" and unique >= min_unique:
                    break
                if goal == "target" and (covered - unique) / len(points) < target:
                    break
                alive[i] = False
                counts[members[i]] -= 1
                covered -= unique
    return [s for s, keep in zip(shapes, alive) if keep]


# ---------- the pipeline ----------

def fit(points: np.ndarray, settings: Settings, log=print) -> tuple[list[Shape], dict]:
    started = time.time()
    points, normals = downsample_with_normals(points, settings.voxel)
    log(f"{len(points)} points after a {settings.voxel} m voxel grid")
    vertical = np.abs(normals[:, 2]) < 0.3
    directions = wall_directions(normals, vertical)
    if not directions:
        directions = [0.0]
    frame_yaw = directions[0]
    log(f"wall directions (deg): {[round(float(np.degrees(d)), 1) for d in directions]}")

    # ramps first: a gentle one is otherwise cut into slabs like steps
    ramps = fit_ramps(points, normals, settings)
    log(f"{len(ramps)} ramps")
    off_ramp = nearest_surface_distance(points, ramps, settings.tolerance) >= settings.tolerance
    horizontal = fit_horizontal(points[off_ramp], normals[off_ramp], frame_yaw, settings)
    heights = storeys(horizontal)
    log(f"{len(horizontal)} horizontal slabs; storeys at {heights}")
    walls = fit_walls(points[off_ramp], normals[off_ramp], directions, heights, settings)
    log(f"{len(walls)} walls")
    shapes = ramps + horizontal + walls

    left = nearest_surface_distance(points, shapes, settings.tolerance) >= settings.tolerance
    clutter = fit_clutter(points[left], heights, settings)
    log(f"{len(clutter)} clutter shapes from {left.sum()} leftover points")
    shapes += clutter
    before = len(shapes)
    shapes = prune(points, shapes, settings.tolerance, settings.min_unique_points, settings.target)
    log(f"pruned {before - len(shapes)} shapes that explained under {settings.min_unique_points} points of their own"
        + (f" or weren't needed to explain {settings.target:.0%}" if settings.target else ""))
    info = {"storeys": heights, "frame_yaw": frame_yaw, "seconds": round(time.time() - started, 1),
            "points": len(points)}
    return shapes, info


def above_floor(points: np.ndarray, storey_heights: list[float], margin: float = 0.15) -> np.ndarray:
    """points more than `margin` above the storey floor under them: everything but the floor itself"""
    heights = np.sort(np.asarray(storey_heights or [points[:, 2].min()]))
    index = np.clip(np.searchsorted(heights, points[:, 2] + 0.05) - 1, 0, len(heights) - 1)
    return points[:, 2] - heights[index] > margin


def report(points: np.ndarray, shapes: list[Shape], storey_heights: list[float], tolerances=(0.05, 0.10)) -> dict:
    out = {}
    lifted = above_floor(points, storey_heights)
    for tolerance in tolerances:
        result = measure(points, shapes, tolerance)
        explained = nearest_surface_distance(points[lifted], shapes, tolerance) < tolerance
        out[f"{tolerance:.2f}"] = {
            "coverage": round(result.coverage, 4),
            "coverage_above_floor": round(float(explained.mean()), 4) if len(explained) else None,
            "support": round(result.support, 4),
            "unsupported_shapes": result.unsupported_shapes,
        }
    out["points_above_floor"] = round(float(lifted.mean()), 4)
    counts: dict[str, int] = {}
    for shape in shapes:
        counts[f"{shape.role}:{shape.kind}"] = counts.get(f"{shape.role}:{shape.kind}", 0) + 1
    out["shapes"] = dict(sorted(counts.items()))
    out["shape_count"] = len(shapes)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("cloud", type=Path, help=".ply, .pcd, .xyz, .npy (N x 3+)")
    parser.add_argument("--out", type=Path, required=True, help="output path prefix")
    parser.add_argument("--name", help="the World Builder world's name (default: the output's name)")
    parser.add_argument("--tolerance", type=float, default=0.10)
    parser.add_argument("--voxel", type=float, default=0.05)
    parser.add_argument("--target", type=float, help="e.g. 0.8: the fewest shapes that still explain 80%% of the map")
    parser.add_argument("--max-viewer-points", type=int, default=250_000)
    parser.add_argument("--save-to-app", nargs="?", const="http://127.0.0.1:5555/apps/dim-world-builder",
                        help="also save the world in a running World Builder (default: through Desktop on :5555)")
    args = parser.parse_args()

    settings = Settings(tolerance=args.tolerance, voxel=args.voxel, target=args.target)
    raw = load_points(args.cloud)
    print(f"{len(raw)} points from {args.cloud}")
    shapes, info = fit(raw, settings)
    measured_points, _ = downsample_with_normals(raw, settings.voxel)
    metrics = report(measured_points, shapes, info["storeys"], tolerances=sorted({0.05, settings.tolerance}))
    metrics.update(info)
    name = args.name or args.out.name
    args.out.parent.mkdir(parents=True, exist_ok=True)
    Path(f"{args.out}.shapes.json").write_text(json.dumps({"metrics": metrics, "shapes": [s.to_json() for s in shapes]}))
    write_project(Path(f"{args.out}.project.json"), name, shapes, info["storeys"])
    write_viewer(Path(f"{args.out}.html"), f"{name} shape fit", measured_points, shapes, metrics, settings.tolerance,
                 args.max_viewer_points)
    for tolerance, values in metrics.items():
        if isinstance(values, dict) and "coverage" in values:
            print(f"within {tolerance} m: {values['coverage']:.1%} of map points explained "
                  f"({values['coverage_above_floor']:.1%} of those above the floor), "
                  f"{values['support']:.1%} of shape surface backed by points, "
                  f"{values['unsupported_shapes']} shapes with almost no points")
    print(f"{metrics['shape_count']} shapes: {metrics['shapes']}")
    print(f"wrote {args.out}.project.json, .shapes.json, .html")
    if args.save_to_app:
        print(f"saved in World Builder as {save_to_app(Path(f'{args.out}.project.json'), args.save_to_app)}")


if __name__ == "__main__":
    main()
