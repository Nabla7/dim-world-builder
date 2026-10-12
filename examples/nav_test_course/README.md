# nav_test_course

A world made with [dim-world-builder](https://github.com/jeff-hykin/dim-world-builder): 11 items on
2 floor(s). Open `world.project.json` in the app to change it.

Run a simulated Go2 in it (dimos sim2; the Go2 FREE policy installs with
`python -m dimos.control.go2_freewalk.models --install`):

```sh
dimos --simulation mujoco --transport zenoh --scene-package $PWD run unitree-go2-freewalk
```

From Python (with this folder's parent on `sys.path`):

```python
import nav_test_course
nav_test_course.SCENE_XML          # the MJCF
nav_test_course.SPAWNS             # named spawn poses ("default" is where robots start)
nav_test_course.check()            # compiles the MJCF with MuJoCo
blueprint = nav_test_course.blueprint()   # unitree-go2-freewalk in this world
```
