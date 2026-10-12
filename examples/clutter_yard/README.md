# clutter_yard

A world made with [dim-world-builder](https://github.com/jeff-hykin/dim-world-builder): 25 items on
1 floor(s). Open `world.json` in the app to change it.

Run a simulated Go2 in it (dimos sim2; the Go2 FREE policy installs with
`python -m dimos.control.go2_freewalk.models --install`):

```sh
dimos --simulation mujoco --transport zenoh --scene-package $PWD run unitree-go2-freewalk
```

From Python (with this folder's parent on `sys.path`):

```python
import clutter_yard
clutter_yard.SCENE_XML          # the MJCF
clutter_yard.SPAWNS             # named spawn poses ("default" is where robots start)
clutter_yard.check()            # compiles the MJCF with MuJoCo
blueprint = clutter_yard.blueprint()   # unitree-go2-freewalk in this world
```
