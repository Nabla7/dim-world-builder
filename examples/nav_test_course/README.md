# nav_test_course

A [dim-world-builder](https://github.com/jeff-hykin/dim-world-builder) world: 11 items,
2 floor(s). `scene.json` is sim2's scene; its `extensions.dim_world_builder` holds the views, the nav
test and the editor's project.

```sh
uv pip install -e .                                          # into dimos's venv
dtk run nav-test-course.go2 --simulation mujoco --transport zenoh   # a Go2 here, plus SceneData
python -m nav_test_course.world                                      # compile and summarize
```

```python
from nav_test_course import world
world.render_view("overview")   # RGB image from a saved view
```
