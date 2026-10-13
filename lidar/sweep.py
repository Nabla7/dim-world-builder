import sys
from pathlib import Path
from fit_shapes import *
raw = load_points(Path('/Users/jeffhykin/repos/dimos/data/big_office.ply'))
pts, _ = downsample_with_normals(raw, 0.05)
for mu, mc in [(25, 15), (10, 8), (5, 5)]:
    st = Settings(min_unique_points=mu, min_clutter_points=mc)
    shapes, info = fit(raw, st, log=lambda *a: None)
    m = report(pts, shapes, info["storeys"], (0.1,))
    print(mu, mc, m["0.10"], m["shape_count"], flush=True)
