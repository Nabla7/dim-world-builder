# clutter_yard

A [dim-world-builder](https://github.com/jeff-hykin/dim-world-builder) world: 23 items,
1 floor(s). `scene.json` is sim2's scene; its `extensions.dim_world_builder` holds the views and the editor's
project; `nav_eval.json` holds navigation tests (`verify/nav_eval.py` runs them).

```sh
uv pip install -e .                                          # into dimos's venv
dtk run clutter-yard.go2 --simulation mujoco --transport zenoh   # a Go2 here, plus SceneData
python -m clutter_yard.world                                      # compile and summarize
```

```python
from clutter_yard import world
world.render_view("overview")   # RGB image from a saved view
```
