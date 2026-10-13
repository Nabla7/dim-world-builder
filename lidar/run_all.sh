#!/bin/sh
# run_all.sh: every test run (two fake scans with known answers, one real dimos map), logs in out/
set -e
cd "$(dirname "$0")"
data=~/repos/dimos/data
[ -f out/office_555_scan.ply ] || uv run simulate_scan.py $data/mujoco_office_555/scene_office_555.xml \
    --out out/office_555_scan.ply --truth-out out/office_555_truth.json --floors 0,4.7 --spacing 1.5
[ -f out/nav_course_scan.ply ] || uv run simulate_scan.py ../examples/nav_test_course/scene.xml \
    --out out/nav_course_scan.ply --truth-out out/nav_course_truth.json --spacing 1.0 --outdoors
for name in office_555 nav_course; do
    uv run fit_shapes.py out/${name}_scan.ply --out out/$name > out/$name.log 2>&1
    uv run compare_truth.py out/${name}_scan.ply out/${name}_truth.json out/$name.shapes.json \
        --out out/$name.truth_compare.json >> out/$name.log 2>&1
done
uv run fit_shapes.py out/office_555_scan.ply --out out/office_555_80 --target 0.8 > out/office_555_80.log 2>&1
uv run fit_shapes.py $data/big_office.ply --out out/big_office > out/big_office.log 2>&1
uv run fit_shapes.py $data/big_office.ply --out out/big_office_80 --target 0.8 > out/big_office_80.log 2>&1
for log in out/office_555.log out/nav_course.log out/office_555_80.log out/big_office.log out/big_office_80.log; do
    echo "== $log"; grep -E "ramps|walls$|storeys|within|shapes:|recovered|seconds" $log || true
done
