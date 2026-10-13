# Lidar map → World Builder shapes

`lidar/fit_shapes.py` turns a robot's lidar map (a point cloud, Z up) into a World Builder project made only of
primitives: floor and ceiling slabs, walls (thin boxes), table tops, ramps (wedges), and boxes, cylinders and spheres
for the clutter. The editor can then open, fix and export the map like any other world.

```sh
cd lidar
uv run fit_shapes.py ~/repos/dimos/data/big_office.ply --out out/big_office            # every shape it can justify
uv run fit_shapes.py ~/repos/dimos/data/big_office.ply --out out/big_office_80 --target 0.8   # the fewest shapes that explain 80%
```

It writes `<out>.project.json` (World Builder: copy it into the app's `projects/` folder, or
`deno run -A ../tools/dwb.ts save-project --project @<out>.project.json`), `<out>.shapes.json` and `<out>.html` (the
map's points over the shapes; red points are ones no shape explains). It prints how good the fit is:

- **coverage**: the share of map points within the tolerance (10 cm by default, 5 cm also shown) of some shape's
  surface. *Above the floor* repeats it without the floor's own points, since the floor alone is most of a map.
- **support**: the share of the shapes' surface area with a map point within the tolerance. It can't reach 100%: the
  far side of an outer wall and the underside of a slab are never scanned.

## How it works

1. **Clean up**: a 5 cm voxel grid, and a normal per point.
2. **Floors and ceilings** (as in Cloud2BIM): peaks in the heights of the points whose normals point up or down.
   Each level's points are rasterized at 20 cm, small holes and whatever furniture hid are filled, and the mask is cut
   into rectangles, biggest first → thin slabs. Each slab is a floor or a ceiling: a slab with another level 12–60 cm
   above it is the underside of a floor-to-floor slab (a ceiling). Otherwise a ceiling is high up, with walls under it
   and nothing over it. Small high slabs are table tops and shelves. The big floor levels are the storeys.
3. **Wall directions** (a Manhattan-world assumption, relaxed): a histogram of the walls' normals' yaw, taken mod
   180°. Every peak at least 30% as tall as the biggest one is a direction, and the main one's right angle is always
   added. Angled wings get their own direction; nothing assumes only two.
4. **Walls** (the 1D sweep floorplan methods use, run on wall-facing points instead of a density image): for each
   direction, peaks in the points' offset along it (2 cm bins) are wall planes. Each plane's points are rasterized in
   the wall's own plane (10 cm), gaps narrower than a door are closed, and the mask is cut into rectangles → boxes. A
   parallel plane 5–30 cm away is the wall's other face, which sets its thickness. When only one face was scanned, the
   wall is 10 cm thick and goes toward the side with no floor points: you can't scan the floor behind a wall. Pieces in
   one plane that touch end to end, or are stacked, are joined.
5. **Ramps**: RANSAC planes (Open3D `segment_plane`) tilted 5–35° among the points nothing explains yet → wedges
   rising along the slope.
6. **Clutter**: DBSCAN clusters of whatever is still unexplained. Each cluster gets the best of a box (yawed to the
   smallest rectangle around it), a vertical cylinder (least-squares circle) and a sphere (least-squares sphere),
   scored by the share of its points within the tolerance, with a small penalty for the rarer shapes. A cluster no
   shape fits is split across its longest side and tried again, up to 5 levels deep. Boxes that nearly reach a floor
   reach it.
7. **Pruning** (minimum description length, roughly): a shape must explain at least 25 points that no other shape
   explains. Clutter goes first, then table tops, then walls and floors. With `--target`, it keeps dropping the least
   useful shape while coverage stays at or above the target.

Everything is upright (turned about Z only), because that's what World Builder's primitives are.

## Existing approaches, and what was taken from them

| approach | what it is | used? |
|---|---|---|
| [Efficient RANSAC](https://doi.org/10.1111/j.1467-8659.2007.01016.x) (Schnabel et al. 2007), [CGAL Shape Detection](https://doc.cgal.org/latest/Shape_detection/index.html) | RANSAC for planes, spheres, cylinders, cones and tori together, with octree-local sampling | the idea of fitting several primitive types and keeping the best; per cluster, not over the whole map (too slow, and indoor maps are mostly planes) |
| Region growing (CGAL, PCL) | grows planes over the k-nearest-neighbour graph using normal and distance limits | no: drift bends walls, so it splits them; the histogram sweep is steadier |
| [Open3D `segment_plane` / `detect_planar_patches`](https://www.open3d.org/docs/release/tutorial/geometry/pointcloud.html) ([Araújo & Oliveira 2020](https://www.inf.ufrgs.br/~oliveira/pubs_files/RE/Araujo_Oliveira_plane_detection_low_res.pdf)) | RANSAC planes, and robust oriented planar patches | `segment_plane` for ramps |
| [pyRANSAC-3D](https://github.com/leomariga/pyRANSAC-3D) | small numpy RANSAC fitters (plane, cuboid, cylinder, sphere) | no: least-squares fits on already-clustered points do the same job here |
| [GlobFit](https://doi.org/10.1145/1964921.1964947) (Li et al. 2011) | snaps primitives to shared relations (parallel, orthogonal, coaxial) | in spirit: walls snap to a few shared directions, and coplanar pieces are joined |
| [PolyFit](https://doc.cgal.org/latest/Polygonal_surface_reconstruction/index.html) (Nan & Wonka 2017) | intersects planes into candidate faces, then chooses a watertight subset with integer programming | no: it's for single objects and doesn't scale to a building |
| [Kinetic Shape Reconstruction](https://doc.cgal.org/latest/Kinetic_surface_reconstruction/index.html) (Bauchet & Lafarge 2020) | grows planes into a partition of space, then labels cells inside or outside | no: its output is a polygon mesh, not editable primitives. Worth trying for a watertight shell later |
| [Ochmann et al. 2019](https://arxiv.org/abs/1907.00631), [Mura et al. 2016](https://doi.org/10.1111/cgf.13014) | walls as volumes with real thickness, rooms kept apart | the two-faces-make-a-wall's-thickness rule |
| [Floor-SP](https://github.com/woodfrog/floor-sp), [FloorNet](https://arxiv.org/abs/1804.00090), [RoomFormer](https://arxiv.org/abs/2211.11409) | learned top-down floorplans (room polygons) from a density image | no (they need a GPU and were trained on RGB-D data); the top-down rasterizing is the same idea |
| [ipa_room_segmentation](https://github.com/ipa320/ipa_coverage_planning), [Bobkov et al.](https://github.com/DBobkov/room-segmentation) | room segmentation of 2D occupancy grids, and of 3D clouds | not yet: rooms would let walls become World Builder `room` items |
| [Cloud2BIM](https://github.com/VaclavNezerka/Cloud2BIM) ([paper](https://arxiv.org/abs/2503.11498), 2025) | slabs from z histograms, walls from 2D density images, openings, export to IFC | the closest match: the slab step follows it |
| Hough / LSD on an occupancy image | line segments from a top-down image, which become walls | the same job is done in the wall's own plane instead, so doors and windows show up as holes |
| [SPFN](https://arxiv.org/abs/1811.07490), [ParSeNet](https://arxiv.org/abs/2003.12181), [HPNet](https://arxiv.org/abs/2105.10620), [CPFN](https://arxiv.org/abs/2109.00113), [Point2Primitive](https://arxiv.org/abs/2505.02043) | learned primitive segmentation and fitting | no: they were trained on single CAD parts and don't carry over to noisy whole-building scans |

## Testing against a known answer

`simulate_scan.py` fakes a Livox Mid-360 (360° around, −7° to 52° up, 1.5 cm range noise) on a Go2, driven on a
1.5 m grid over a MuJoCo scene's floors. It voxelizes the merged scan the way a dimos map is, and writes the scene's
boxes as ground truth. `compare_truth.py` counts a truth box as recovered when at least half of the part of it the
scan saw is within the tolerance of a fitted shape.

```sh
uv run simulate_scan.py ~/repos/dimos/data/mujoco_office_555/scene_office_555.xml --out out/office_555_scan.ply \
    --truth-out out/office_555_truth.json --floors 0,4.7 --spacing 1.5
uv run fit_shapes.py out/office_555_scan.ply --out out/office_555
uv run compare_truth.py out/office_555_scan.ply out/office_555_truth.json out/office_555.shapes.json
```
