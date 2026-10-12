#!/usr/bin/env python3
"""Cook a .glb/.gltf/.obj model into a dim-world-builder mesh asset folder.

Output (all in one Z-up frame, meters, footprint centered at x=y=0, lowest point at z=0):
    meta.json       MeshAsset (src/world/types.ts) plus "frame": "z-up"
    visual.glb      for the web page; NOT rotated to three.js Y-up, the page rotates it
    visual_<k>.obj  one per color group, MuJoCo visual geoms colored by meta.visuals[k].rgba
    hull_<k>.obj    convex pieces (CoACD), MuJoCo collision geoms
    thumb.png       (--thumb) 256x256 transparent 3/4 view rendered by MuJoCo

Progress goes to stdout as JSON lines: {"stage": "...", "progress": 0..1, ...}.
Exit codes: 0 ok, 1 error, 2 quality check failed.

    uv run --project cooker python cooker/cook.py chair.glb assets/library/chair --id chair --name Chair \
        --category furniture --target-height 0.9 --validate --thumb
"""

import argparse
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image
import trimesh


def emit(stage, progress, **extra):
    print(json.dumps({"stage": stage, "progress": round(float(progress), 3), **extra}), flush=True)


class QualityError(Exception):
    pass


# ---------------------------------------------------------------- loading


def load_meshes(path):
    """Flatten a scene into (mesh, material) pairs with every node transform applied."""
    scene = trimesh.load(str(path), force="scene", process=False)
    meshes = []
    for node in scene.graph.nodes_geometry:
        transform, geometry_name = scene.graph[node]
        geometry = scene.geometry[geometry_name]
        if not isinstance(geometry, trimesh.Trimesh) or len(geometry.faces) == 0:
            continue
        mesh = geometry.copy()
        mesh.apply_transform(transform)
        meshes.append(mesh)
    if not meshes:
        raise ValueError(f"no triangle meshes in {path}")
    return meshes


def bounds_of(meshes):
    stacked = np.vstack([m.bounds for m in meshes])
    return np.array([stacked.min(axis=0), stacked.max(axis=0)])


def place(meshes, up, scale, target_height):
    """Rotate to Z-up, scale, then put the footprint center at the origin and the lowest point at z=0."""
    transform = np.eye(4)
    if up == "y":
        transform = trimesh.transformations.rotation_matrix(
            math.pi / 2, [1, 0, 0]
        )  # (x, y, z) -> (x, -z, y)
    for mesh in meshes:
        mesh.apply_transform(transform)
    factor = scale
    if target_height:
        lo, hi = bounds_of(meshes)
        height = (hi - lo)[2]
        if height <= 0:
            raise ValueError("model has zero height, cannot apply --target-height")
        factor = target_height / height
    for mesh in meshes:
        mesh.apply_scale(factor)
    lo, hi = bounds_of(meshes)
    shift = np.array([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    for mesh in meshes:
        mesh.apply_translation(shift)
    return factor


# ---------------------------------------------------------------- colors


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=float), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def material_of(mesh):
    return getattr(mesh.visual, "material", None)


def base_color_factor(material):
    """glTF baseColorFactor is linear; MuJoCo rgba is displayed as-is, so convert to sRGB."""
    if material is None:
        return np.array([0.7, 0.7, 0.7, 1.0])
    factor = getattr(material, "baseColorFactor", None)
    if factor is not None:
        f = np.asarray(factor, dtype=float)
        f = f / 255.0 if f.max() > 1.0 else f
        return np.concatenate([linear_to_srgb(f[:3]), [f[3] if len(f) > 3 else 1.0]])
    diffuse = getattr(material, "diffuse", None)  # SimpleMaterial (OBJ/MTL), already sRGB bytes
    if diffuse is not None:
        d = np.asarray(diffuse, dtype=float) / 255.0
        return np.concatenate([d[:3], [d[3] if len(d) > 3 else 1.0]])
    return np.array([0.7, 0.7, 0.7, 1.0])


def texture_image(material):
    if material is None:
        return None
    for key in ("baseColorTexture", "image"):
        image = getattr(material, key, None)
        if image is not None:
            return image
    return None


def face_colors(mesh):
    """Per-face sRGB rgba in 0..1: texture sampled at each face's UV centroid times the base color."""
    material = material_of(mesh)
    base = base_color_factor(material)
    colors = np.tile(base, (len(mesh.faces), 1))
    image = texture_image(material)
    uv = getattr(mesh.visual, "uv", None)
    if image is None or uv is None or len(uv) != len(mesh.vertices):
        return colors
    rgba = np.asarray(image.convert("RGBA"), dtype=float) / 255.0
    height, width = rgba.shape[:2]
    centroid = uv[mesh.faces].mean(axis=1)
    centroid = centroid - np.floor(centroid)  # glTF default wrap mode is REPEAT
    px = np.clip((centroid[:, 0] * width).astype(int), 0, width - 1)
    py = np.clip(((1 - centroid[:, 1]) * height).astype(int), 0, height - 1)
    sampled = rgba[py, px]
    colors[:, :3] = base[:3] * sampled[:, :3]
    colors[:, 3] = base[3] * sampled[:, 3]
    return colors


def color_groups(meshes, max_colors, merge_distance=0.06):
    """Split all faces into at most max_colors groups of similar color. Returns [(mesh, rgba)]."""
    from scipy.cluster.vq import kmeans2

    parts = []  # (mesh, per-face colors, per-face areas)
    for mesh in meshes:
        parts.append((mesh, face_colors(mesh), mesh.area_faces))
    colors = np.vstack([p[1] for p in parts])
    areas = np.concatenate([p[2] for p in parts])
    unique = np.unique(np.round(colors, 3), axis=0)
    if len(unique) <= max_colors:
        centers = unique
    else:
        rng = np.random.default_rng(0)
        # weight the clustering by area by sampling faces proportional to it
        sample = rng.choice(len(colors), size=min(20000, len(colors) * 4), p=areas / areas.sum())
        centers, _ = kmeans2(colors[sample], max_colors, seed=0, minit="++")
    # merge centers that are visually the same
    merged = []
    for c in centers:
        if all(np.linalg.norm(c[:3] - m[:3]) > merge_distance for m in merged):
            merged.append(c)
    centers = np.array(merged)
    groups = []
    for _ in range(len(centers)):
        groups.append({"meshes": [], "color_sum": np.zeros(4), "area": 0.0})
    for mesh, cols, area in parts:
        label = np.argmin(((cols[:, None, :3] - centers[None, :, :3]) ** 2).sum(axis=2), axis=1)
        for k in np.unique(label):
            mask = label == k
            sub = mesh.submesh([np.nonzero(mask)[0]], append=True, repair=False)
            groups[k]["meshes"].append(sub)
            groups[k]["color_sum"] += (cols[mask] * area[mask, None]).sum(axis=0)
            groups[k]["area"] += area[mask].sum()
    # MuJoCo rejects meshes with < 4 vertices or zero volume (a color patch that is one flat face):
    # fold those into the closest-colored solid group
    sizes = [sum(len(m.vertices) for m in g["meshes"]) for g in groups]
    flat = [bool(g["meshes"]) and is_flat(g["meshes"]) for g in groups]
    for k, group in enumerate(groups):
        if 0 < sizes[k] < 4 or flat[k]:
            color = group["color_sum"] / max(group["area"], 1e-12)
            others = [j for j in range(len(groups)) if j != k and sizes[j] >= 4 and not flat[j]]
            if others:
                j = min(
                    others,
                    key=lambda j: np.linalg.norm(
                        groups[j]["color_sum"][:3] / max(groups[j]["area"], 1e-12) - color[:3]
                    ),
                )
                groups[j]["meshes"] += group["meshes"]
                group["meshes"] = []
    result = []
    for group in groups:
        if not group["meshes"]:
            continue
        rgba = group["color_sum"] / max(group["area"], 1e-12)
        merged_mesh = trimesh.util.concatenate([plain(m) for m in group["meshes"]])
        result.append((merged_mesh, rgba))
    result.sort(key=lambda r: -r[0].area)
    return result


def is_flat(meshes, tolerance=1e-5):
    """True when all vertices lie on one plane (MuJoCo: "mesh volume is too small")."""
    points = np.vstack([m.vertices for m in meshes])
    if len(points) < 4:
        return True
    centered = points - points.mean(axis=0)
    thickness = np.linalg.svd(centered, compute_uv=False)[-1] / math.sqrt(len(points))
    return thickness < tolerance


def plain(mesh):
    """Geometry only (keeps the source normals so hard edges stay hard)."""
    out = trimesh.Trimesh(vertices=mesh.vertices.copy(), faces=mesh.faces.copy(), process=False)
    out.vertex_normals = mesh.vertex_normals.copy()
    return out


# ---------------------------------------------------------------- writers


def write_obj(path, mesh, normals=True):
    v = mesh.vertices
    lines = [f"# {path.name}\n"]
    lines.extend(f"v {x:.5g} {y:.5g} {z:.5g}\n" for x, y, z in v)
    if normals:
        n = mesh.vertex_normals
        lines.extend(f"vn {x:.4g} {y:.4g} {z:.4g}\n" for x, y, z in n)
        lines.extend(f"f {a}//{a} {b}//{b} {c}//{c}\n" for a, b, c in mesh.faces + 1)
    else:
        lines.extend(f"f {a} {b} {c}\n" for a, b, c in mesh.faces + 1)
    path.write_text("".join(lines))


def decimate(mesh, max_faces):
    if len(mesh.faces) <= max_faces:
        return mesh
    welded = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces, process=True)
    out = welded.simplify_quadric_decimation(face_count=max_faces)
    return trimesh.Trimesh(vertices=out.vertices, faces=out.faces, process=False)


def shrink_material(mesh, texture_size):
    """Keep only the base color (factor + downsized texture) so visual.glb stays small."""
    material = material_of(mesh)
    if material is None or not hasattr(mesh.visual, "uv"):
        return
    image = texture_image(material)
    if image is not None and max(image.size) > texture_size:
        image = image.copy()
        image.thumbnail((texture_size, texture_size), Image.LANCZOS)
    pbr = trimesh.visual.material.PBRMaterial(
        name=getattr(material, "name", None),
        baseColorFactor=getattr(material, "baseColorFactor", None),
        baseColorTexture=image
        if isinstance(material, trimesh.visual.material.PBRMaterial)
        else None,
        metallicFactor=0.0,
        roughnessFactor=0.8,
        doubleSided=getattr(material, "doubleSided", False),
    )
    if not isinstance(material, trimesh.visual.material.PBRMaterial):
        pbr = material.to_pbr()
        pbr.metallicFactor = 0.0
        if image is not None:
            pbr.baseColorTexture = image
    mesh.visual.material = pbr


def write_glb(path, meshes, texture_size, max_faces):
    scene = trimesh.Scene()
    total = sum(len(m.faces) for m in meshes)
    for i, mesh in enumerate(meshes):
        mesh = mesh.copy()
        shrink_material(mesh, texture_size)
        textured = hasattr(mesh.visual, "uv") and mesh.visual.uv is not None
        if not textured and total > max_faces:
            # untextured parts can be decimated without losing anything; keep the base color
            keep = max(64, int(max_faces * len(mesh.faces) / total))
            if len(mesh.faces) > keep:
                material = material_of(mesh)
                mesh = decimate(mesh, keep)
                if material is not None:
                    mesh.visual = trimesh.visual.TextureVisuals(material=material)
        scene.add_geometry(mesh, geom_name=f"part_{i}")
    path.write_bytes(scene.export(file_type="glb"))


# ---------------------------------------------------------------- collision


def decompose(meshes, threshold, max_hulls, resolution, preprocess_resolution):
    combined = trimesh.util.concatenate([plain(m) for m in meshes])
    combined = trimesh.Trimesh(vertices=combined.vertices, faces=combined.faces, process=True)
    combined.merge_vertices()
    try:
        import coacd

        coacd.set_log_level("error")
        parts = coacd.run_coacd(
            coacd.Mesh(combined.vertices, combined.faces),
            threshold=threshold,
            max_convex_hull=max_hulls,
            preprocess_mode="auto",
            preprocess_resolution=preprocess_resolution,
            resolution=resolution,
            mcts_nodes=20,
            mcts_iterations=100,
            mcts_max_depth=2,
            merge=True,
            seed=0,
        )
        hulls = [trimesh.Trimesh(vertices=v, faces=f, process=True).convex_hull for v, f in parts]
        method = "coacd"
    except (
        Exception
    ) as error:  # coacd crashes on some inputs; a single hull still collides sensibly
        emit("decompose", 0.9, warning=f"coacd failed ({error}); using one convex hull")
        hulls = [combined.convex_hull]
        method = "convex_hull"
    return combined, hulls, method


def check_hulls(hulls, source_bounds, tolerance=0.2):
    """Return (kept hulls, dropped count); raise QualityError when the collision shape is not trustworthy."""
    if not hulls:
        raise QualityError("decomposition produced no hulls")
    for i, h in enumerate(hulls):
        if len(h.vertices) < 4 or len(h.faces) < 4 or abs(h.volume) <= 1e-12 or is_flat([h], 1e-6):
            raise QualityError(
                f"hull {i} is degenerate (verts={len(h.vertices)} volume={h.volume:.3g})"
            )
    total = sum(abs(h.volume) for h in hulls)
    kept = [
        h for h in hulls if abs(h.volume) >= 1e-6 * total
    ]  # drop negligible slivers, not worth a geom
    dropped = len(hulls) - len(kept)
    lo = np.min([h.bounds[0] for h in kept], axis=0)
    hi = np.max([h.bounds[1] for h in kept], axis=0)
    src_lo, src_hi = source_bounds
    src_extent = src_hi - src_lo
    floor = 0.02 * src_extent.max()  # a flat axis (rug, sign) gets a small absolute allowance
    for axis, name in enumerate("xyz"):
        overhang = max(hi[axis] - src_hi[axis], 0) + max(src_lo[axis] - lo[axis], 0)
        allowed = tolerance * max(src_extent[axis], floor)
        if overhang > allowed:
            raise QualityError(
                f"hull union exceeds the source bbox on {name} by {overhang:.4f} m "
                f"(> {tolerance:.0%} of {src_extent[axis]:.4f} m)"
            )
    return kept, dropped


# ---------------------------------------------------------------- MuJoCo


def mjcf(out_dir, meta, with_floor=False):
    assets, geoms = [], []
    for i, v in enumerate(meta["visuals"]):
        assets.append(f'<mesh name="v{i}" file="{v["file"]}"/>')
        rgba = " ".join(f"{c:.4g}" for c in v["rgba"])
        # same attributes the exporter (src/world/mjcf.ts) gives visual geoms: no contact, no mass
        geoms.append(
            f'<geom type="mesh" mesh="v{i}" rgba="{rgba}" contype="0" conaffinity="0" mass="0" group="1" material="m"/>'
        )
    for i, h in enumerate(meta["hulls"]):
        assets.append(f'<mesh name="h{i}" file="{h}"/>')
        geoms.append(f'<geom type="mesh" mesh="h{i}" group="3" rgba="0.9 0.3 0.9 0.4"/>')
    floor = '<geom name="floor" type="plane" size="5 5 0.1" group="2"/>' if with_floor else ""
    return f"""<mujoco model="{meta["id"]}">
  <compiler meshdir="{out_dir}"/>
  <visual><global offwidth="1024" offheight="1024"/><quality shadowsize="0"/></visual>
  <asset>
    <material name="m" specular="0.15" shininess="0.2"/>
    {chr(10).join("    " + a for a in assets)}
  </asset>
  <worldbody>
    <light directional="true" pos="0 0 5" dir="-0.3 0.5 -1" diffuse="0.55 0.55 0.55" castshadow="false"/>
    <light directional="true" pos="0 0 5" dir="0.6 -0.4 -0.6" diffuse="0.25 0.25 0.25" castshadow="false"/>
    {floor}
    <body name="asset" pos="0 0 {0.02 if with_floor else 0}">
      <freejoint/>
      {chr(10).join("      " + g for g in geoms)}
    </body>
  </worldbody>
</mujoco>"""


def validate(out_dir, meta):
    import mujoco

    model = mujoco.MjModel.from_xml_string(mjcf(Path(out_dir).resolve(), meta, with_floor=True))
    data = mujoco.MjData(model)
    for _ in range(200):
        mujoco.mj_step(model, data)
    z = float(data.qpos[2])
    if not np.isfinite(data.qpos).all():
        raise QualityError("simulation went non-finite with the cooked hulls")
    return {"nmesh": int(model.nmesh), "ngeom": int(model.ngeom), "settled_z": round(z, 4)}


def render_thumb(out_dir, meta, size=256):
    """Transparent 3/4 view. On macOS this must run in the main thread of a normal python process."""
    import mujoco

    model = mujoco.MjModel.from_xml_string(mjcf(Path(out_dir).resolve(), meta))
    model.vis.headlight.ambient[:] = 0.35
    model.vis.headlight.diffuse[:] = 0.45
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    scale = 2
    render_size = size * scale
    renderer = mujoco.Renderer(model, render_size, render_size)
    sx, sy, sz = meta["size"]
    camera = mujoco.MjvCamera()
    camera.lookat[:] = [0, 0, sz / 2]
    camera.azimuth = (
        60  # glTF front (+Z) lands on -Y after the Z-up turn: view from front-left, above
    )
    camera.elevation = -25
    radius = 0.5 * math.sqrt(sx * sx + sy * sy + sz * sz)
    fovy = math.radians(model.vis.global_.fovy)
    camera.distance = 1.08 * radius / math.sin(fovy / 2)
    options = mujoco.MjvOption()
    options.geomgroup[:] = [0, 1, 0, 0, 0, 0]
    renderer.update_scene(data, camera=camera, scene_option=options)
    rgb = renderer.render().copy()
    renderer.enable_segmentation_rendering()
    renderer.update_scene(data, camera=camera, scene_option=options)
    segmentation = renderer.render()
    renderer.disable_segmentation_rendering()
    renderer.close()
    alpha = np.where(segmentation[:, :, 0] >= 0, 255, 0).astype(np.uint8)
    image = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    image = image.resize((size, size), Image.LANCZOS)
    image.save(Path(out_dir) / "thumb.png", optimize=True)


# ---------------------------------------------------------------- main


def round_list(values, digits=4):
    return [round(float(v), digits) for v in values]


def cook(args):
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in list(out_dir.glob("visual_*.obj")) + list(out_dir.glob("hull_*.obj")):
        stale.unlink()

    emit("load", 0.02, input=str(args.input))
    meshes = load_meshes(args.input)
    up = args.up or "y"
    factor = place(meshes, up, args.scale, args.target_height)
    lo, hi = bounds_of(meshes)
    size = hi - lo
    faces = sum(len(m.faces) for m in meshes)
    emit(
        "transform",
        0.1,
        parts=len(meshes),
        faces=faces,
        scale=round(factor, 6),
        size=round_list(size),
    )

    groups = color_groups(meshes, args.max_colors)
    visuals = []
    budget = args.max_faces
    for k, (mesh, rgba) in enumerate(groups):
        share = max(200, int(budget * len(mesh.faces) / faces))
        reduced = decimate(mesh, share)
        name = f"visual_{k}.obj"
        write_obj(out_dir / name, reduced, normals=reduced is mesh)
        visuals.append({"file": name, "rgba": round_list(np.clip(rgba, 0, 1), 3)})
        emit("visual", 0.1 + 0.15 * (k + 1) / len(groups), file=name, faces=len(reduced.faces))

    write_glb(out_dir / "visual.glb", meshes, args.texture_size, args.max_faces * 2)
    emit("glb", 0.3, bytes=(out_dir / "visual.glb").stat().st_size)

    emit("decompose", 0.32, threshold=args.threshold, max_hulls=args.max_hulls)
    _, hulls, method = decompose(
        meshes, args.threshold, args.max_hulls, args.resolution, args.preprocess_resolution
    )
    emit("decompose", 0.85, method=method, hulls=len(hulls))

    hulls, dropped = check_hulls(hulls, (lo, hi))
    # CoACD's manifold remesh inflates by a few mm; clamp to the source bbox so the asset still rests at z=0
    clamped = [trimesh.Trimesh(vertices=np.clip(h.vertices, lo, hi), faces=h.faces) for h in hulls]
    hulls = [
        h.convex_hull for h in clamped if not is_flat([h], 1e-5)
    ]  # a sliver that lay wholly outside goes flat
    hulls, _ = check_hulls(hulls, (lo, hi))
    hull_files = []
    for k, hull in enumerate(hulls):
        name = f"hull_{k}.obj"
        write_obj(out_dir / name, hull, normals=False)
        hull_files.append(name)
    emit("hulls", 0.9, hulls=len(hull_files), dropped_slivers=dropped)

    meta = {
        "id": args.id,
        "name": args.name,
        "category": args.category,
        "size": round_list(size),
        "base": "",
        "visuals": visuals,
        "hulls": hull_files,
        "license": args.license,
        "source": args.source,
        "frame": "z-up",
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    emit("meta", 0.92)

    if args.validate:
        result = validate(out_dir, meta)
        emit("validate", 0.96, **result)
    if args.thumb:
        render_thumb(out_dir, meta)
        emit("thumb", 0.99)
    emit(
        "done",
        1.0,
        out_dir=str(out_dir),
        size=meta["size"],
        visuals=len(visuals),
        hulls=len(hull_files),
    )


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("input", help=".glb, .gltf or .obj")
    parser.add_argument("out_dir")
    parser.add_argument("--id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--category", default="misc")
    parser.add_argument(
        "--up", choices=["y", "z"], help="source up axis (default y, the glTF convention)"
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="uniform scale to meters (ignored with --target-height)",
    )
    parser.add_argument(
        "--target-height", type=float, help="scale so the model is this tall in meters"
    )
    parser.add_argument("--max-hulls", type=int, default=24)
    parser.add_argument("--threshold", type=float, default=0.05, help="CoACD concavity threshold")
    parser.add_argument("--resolution", type=int, default=2000, help="CoACD sampling resolution")
    parser.add_argument("--preprocess-resolution", type=int, default=40)
    parser.add_argument("--max-colors", type=int, default=6, help="max visual_<k>.obj color groups")
    parser.add_argument(
        "--max-faces", type=int, default=12000, help="face budget across visual OBJs"
    )
    parser.add_argument(
        "--texture-size", type=int, default=512, help="max base color texture size in visual.glb"
    )
    parser.add_argument("--license", default="CC0-1.0")
    parser.add_argument("--source", default="")
    parser.add_argument(
        "--validate", action="store_true", help="load every OBJ into MuJoCo and step it"
    )
    parser.add_argument(
        "--thumb", action="store_true", help="render thumb.png with mujoco.Renderer"
    )
    args = parser.parse_args()
    try:
        cook(args)
    except QualityError as error:
        emit("error", 1.0, quality=True, message=str(error))
        sys.exit(2)
    except Exception as error:
        emit("error", 1.0, message=f"{type(error).__name__}: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
