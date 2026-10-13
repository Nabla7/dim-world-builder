"""Upright primitives (box, cylinder, sphere, ramp): turned about z only. Distance from points, surface samples, and
World Builder items."""

from dataclasses import dataclass, field

import numpy as np
from scipy.spatial import cKDTree

KINDS = ("box", "cylinder", "sphere", "ramp")


@dataclass
class Shape:
    kind: str
    """box | cylinder | sphere | ramp (a wedge rising along its local +x, like World Builder's)"""
    role: str
    """floor | ceiling | horizontal | wall | ramp | clutter: what the fitter took it for"""
    center: np.ndarray
    """middle of its bounding box, world frame"""
    size: np.ndarray
    """full extents along its local x, y, z"""
    yaw: float = 0.0
    meta: dict = field(default_factory=dict)

    def local(self, points: np.ndarray) -> np.ndarray:
        c, s = np.cos(self.yaw), np.sin(self.yaw)
        d = points - self.center
        return np.stack([c * d[:, 0] + s * d[:, 1], -s * d[:, 0] + c * d[:, 1], d[:, 2]], axis=1)

    def world(self, local: np.ndarray) -> np.ndarray:
        c, s = np.cos(self.yaw), np.sin(self.yaw)
        return np.stack(
            [c * local[:, 0] - s * local[:, 1], s * local[:, 0] + c * local[:, 1], local[:, 2]], axis=1
        ) + self.center

    @property
    def radius(self) -> float:
        """a sphere around it, for finding nearby points"""
        return float(np.linalg.norm(self.size) / 2)

    def distance(self, points: np.ndarray) -> np.ndarray:
        """unsigned distance from each point to the shape's surface (exact for box/cylinder, close for the rest)"""
        return np.abs(self.signed_distance(points))

    def signed_distance(self, points: np.ndarray) -> np.ndarray:
        p = self.local(points)
        half = self.size / 2
        if self.kind == "box":
            return _box_sdf(p, half)
        if self.kind == "cylinder":
            radius = max(half[0], half[1])
            d = np.stack([np.hypot(p[:, 0], p[:, 1]) - radius, np.abs(p[:, 2]) - half[2]], axis=1)
            outside = np.linalg.norm(np.maximum(d, 0), axis=1)
            return outside + np.minimum(d.max(axis=1), 0)
        if self.kind == "sphere":
            # an ellipsoid's distance, scaled by its smallest radius (exact for a sphere)
            scaled = np.linalg.norm(p / half, axis=1)
            return (scaled - 1) * half.min()
        if self.kind == "ramp":
            # the box, cut by the slope: z (from the bottom) <= height * (x / length + 1/2)
            box = _box_sdf(p, half)
            normal = np.array([-self.size[2], 0, self.size[0]])
            normal /= np.linalg.norm(normal)
            # the slope passes through the low edge (x = -half, z = -half) and the high edge (x = +half, z = +half)
            slope = (p - np.array([-half[0], 0, -half[2]])) @ normal
            return np.maximum(box, slope)
        raise ValueError(self.kind)

    def area(self) -> float:
        sx, sy, sz = self.size
        if self.kind == "box":
            return 2 * (sx * sy + sx * sz + sy * sz)
        if self.kind == "cylinder":
            r = max(sx, sy) / 2
            return 2 * np.pi * r * sz + 2 * np.pi * r * r
        if self.kind == "sphere":
            r = np.mean(self.size) / 2
            return 4 * np.pi * r * r
        if self.kind == "ramp":
            return sx * sy + sy * sz + np.hypot(sx, sz) * sy + sx * sz
        raise ValueError(self.kind)

    def surface_samples(self, spacing: float) -> np.ndarray:
        """points on its surface, about `spacing` apart"""
        half = self.size / 2
        if self.kind in ("box", "ramp"):
            faces = []
            for axis in range(3):
                u, v = [a for a in range(3) if a != axis]
                gu = _grid(-half[u], half[u], spacing)
                gv = _grid(-half[v], half[v], spacing)
                uu, vv = np.meshgrid(gu, gv)
                for sign in (-1, 1):
                    face = np.zeros((uu.size, 3))
                    face[:, u], face[:, v], face[:, axis] = uu.ravel(), vv.ravel(), sign * half[axis]
                    faces.append(face)
            local = np.concatenate(faces)
            if self.kind == "ramp":
                # keep the box's faces under the slope, and add the slope
                height = (local[:, 0] + half[0]) / self.size[0] * self.size[2] - half[2]
                local = local[local[:, 2] <= height + 1e-6]
                gx = _grid(-half[0], half[0], spacing * self.size[0] / np.hypot(self.size[0], self.size[2]))
                gy = _grid(-half[1], half[1], spacing)
                xx, yy = np.meshgrid(gx, gy)
                slope = np.stack([xx.ravel(), yy.ravel(), (xx.ravel() + half[0]) / self.size[0] * self.size[2]
                                  - half[2]], axis=1)
                local = np.concatenate([local, slope])
            return self.world(local)
        if self.kind == "cylinder":
            r = max(half[0], half[1])
            angles = np.linspace(0, 2 * np.pi, max(8, int(2 * np.pi * r / spacing)), endpoint=False)
            zs = _grid(-half[2], half[2], spacing)
            aa, zz = np.meshgrid(angles, zs)
            side = np.stack([r * np.cos(aa.ravel()), r * np.sin(aa.ravel()), zz.ravel()], axis=1)
            g = _grid(-r, r, spacing)
            xx, yy = np.meshgrid(g, g)
            disk = np.stack([xx.ravel(), yy.ravel()], axis=1)
            disk = disk[np.hypot(disk[:, 0], disk[:, 1]) <= r]
            caps = [np.column_stack([disk, np.full(len(disk), z)]) for z in (-half[2], half[2])]
            return self.world(np.concatenate([side, *caps]))
        if self.kind == "sphere":
            count = max(20, int(self.area() / spacing**2))
            i = np.arange(count) + 0.5
            phi = np.arccos(1 - 2 * i / count)
            theta = np.pi * (1 + 5**0.5) * i
            unit = np.stack([np.cos(theta) * np.sin(phi), np.sin(theta) * np.sin(phi), np.cos(phi)], axis=1)
            return self.world(unit * half)
        raise ValueError(self.kind)

    def to_json(self) -> dict:
        return {
            "kind": self.kind, "role": self.role, "center": [round(float(v), 4) for v in self.center],
            "size": [round(float(v), 4) for v in self.size], "yaw": round(float(self.yaw), 5), **self.meta,
        }

    @staticmethod
    def from_json(data: dict) -> "Shape":
        meta = {k: v for k, v in data.items() if k not in ("kind", "role", "center", "size", "yaw")}
        return Shape(data["kind"], data["role"], np.array(data["center"]), np.array(data["size"]), data["yaw"], meta)


def _box_sdf(p: np.ndarray, half: np.ndarray) -> np.ndarray:
    q = np.abs(p) - half
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0)


def _grid(low: float, high: float, spacing: float) -> np.ndarray:
    count = max(2, int(np.ceil((high - low) / spacing)) + 1)
    return np.linspace(low, high, count)


def nearest_surface_distance(points: np.ndarray, shapes: list[Shape], cutoff: float) -> np.ndarray:
    """each point's distance to the nearest shape surface, capped at `cutoff` (anything farther reads as cutoff)"""
    best = np.full(len(points), cutoff, dtype=np.float64)
    if not len(points) or not shapes:
        return best
    tree = cKDTree(points)
    for shape in shapes:
        near = tree.query_ball_point(shape.center, shape.radius + cutoff)
        if not near:
            continue
        near = np.asarray(near)
        best[near] = np.minimum(best[near], shape.distance(points[near]))
    return best


@dataclass
class Fit:
    coverage: float
    """fraction of the map's points within the tolerance of some shape's surface"""
    support: float
    """fraction of the shapes' surface (by area) within the tolerance of some map point"""
    unsupported_shapes: int
    """shapes less than 10% of whose surface has a map point near it"""
    by_role: dict


def measure(points: np.ndarray, shapes: list[Shape], tolerance: float, spacing: float = 0.04) -> Fit:
    distances = nearest_surface_distance(points, shapes, tolerance * 4)
    tree = cKDTree(points)
    supported_area = total_area = 0.0
    unsupported = 0
    by_role: dict[str, dict] = {}
    for shape in shapes:
        samples = shape.surface_samples(spacing)
        near, _ = tree.query(samples, distance_upper_bound=tolerance)
        fraction = float(np.mean(np.isfinite(near)))
        area = shape.area()
        supported_area += fraction * area
        total_area += area
        unsupported += fraction < 0.1
        role = by_role.setdefault(shape.role, {"count": 0, "area": 0.0, "supported_area": 0.0})
        role["count"] += 1
        role["area"] += area
        role["supported_area"] += fraction * area
    return Fit(
        coverage=float(np.mean(distances <= tolerance)),
        support=supported_area / total_area if total_area else 0.0,
        unsupported_shapes=int(unsupported),
        by_role=by_role,
    )
