"""Compare fit_shapes.py's shapes with the scene they were scanned from (simulate_scan.py --truth-out).

    uv run compare_truth.py out/office_555_scan.ply out/office_555_truth.json out/office_555.shapes.json

A truth box counts as recovered when at least half of its surface that the scan saw is within the tolerance of a
fitted shape. Surface the scan never saw (the far side of an outer wall, a slab's underside) isn't counted.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from fit_shapes import load_points
from shapes import Shape, nearest_surface_distance


def truth_shapes(truth: dict) -> list[Shape]:
    shapes = []
    for box in truth["boxes"]:
        rotation = np.array(box["rotation"])
        if abs(rotation[2, 2]) < 0.999:
            continue  # tilted: not upright, skip
        half = np.array(box["half_size"])
        yaw = float(np.arctan2(rotation[1, 0], rotation[0, 0]))
        size = 2 * half
        horizontal = sorted(size[:2])
        if size[2] >= 1.5 and horizontal[0] <= 0.35 and horizontal[1] >= 0.5:
            role = "wall"
        elif size[2] <= 0.4 and horizontal[0] >= 1.0 and ("slab" in box["body"] or box["name"] == "floor"):
            role = "slab"
        else:
            role = "other"
        shapes.append(Shape("box", role, np.array(box["center"]), size, yaw, {"name": box["name"], "body": box["body"]}))
    return shapes


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("cloud", type=Path)
    parser.add_argument("truth", type=Path)
    parser.add_argument("shapes", type=Path)
    parser.add_argument("--tolerance", type=float, default=0.10)
    parser.add_argument("--out", type=Path, help="write the summary here as JSON")
    args = parser.parse_args()

    points = load_points(args.cloud)
    tree = cKDTree(points)
    truth = truth_shapes(json.loads(args.truth.read_text()))
    fitted = [Shape.from_json(s) for s in json.loads(args.shapes.read_text())["shapes"]]
    fitted_walls = [s for s in fitted if s.role == "wall"]

    summary: dict = {"tolerance": args.tolerance}
    for role in ("wall", "slab", "other"):
        group = [s for s in truth if s.role == role]
        recovered = recovered_by_walls = seen = 0
        seen_area = covered_area = 0.0
        for shape in group:
            samples = shape.surface_samples(0.05)
            observed, _ = tree.query(samples, distance_upper_bound=0.05)
            samples = samples[np.isfinite(observed)]
            if len(samples) < 10:
                continue
            seen += 1
            near_any = nearest_surface_distance(samples, fitted, args.tolerance) < args.tolerance
            seen_area += len(samples)
            covered_area += near_any.sum()
            recovered += near_any.mean() >= 0.5
            if role == "wall":
                near_wall = nearest_surface_distance(samples, fitted_walls, args.tolerance) < args.tolerance
                recovered_by_walls += near_wall.mean() >= 0.5
        summary[role] = {
            "boxes": len(group), "seen_by_scan": seen, "recovered": int(recovered),
            "seen_surface_covered": round(covered_area / seen_area, 4) if seen_area else None,
        }
        if role == "wall":
            summary[role]["recovered_by_wall_shapes"] = int(recovered_by_walls)
            summary[role]["fitted_wall_shapes"] = len(fitted_walls)
    print(json.dumps(summary, indent=1))
    if args.out:
        args.out.write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
