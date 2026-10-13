"""An interactive HTML page: the map's points (red where no shape explains them) over the fitted shapes."""

import base64
import json
from pathlib import Path

import numpy as np

from shapes import Shape, nearest_surface_distance
from world_builder import COLORS

PAGE = """<title>__TITLE__</title>
<style>
:root { --bg:#eef0f2; --panel:#ffffffe8; --text:#1b2027; --muted:#5d6672; --line:#d3d8de; --point:#2b3440; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme:dark; --bg:#14171b; --panel:#1e2228e8; --text:#e7eaee; --muted:#98a1ab; --line:#323840; --point:#b9c2cc; } }
:root[data-theme="dark"] { color-scheme:dark; --bg:#14171b; --panel:#1e2228e8; --text:#e7eaee; --muted:#98a1ab; --line:#323840; --point:#b9c2cc; }
html,body { margin:0; height:100%; background:var(--bg); color:var(--text); font:13px/1.4 system-ui,sans-serif; overflow:hidden; }
#view { position:fixed; inset:0; }
#panel { position:fixed; top:calc(12px + env(safe-area-inset-top, 0px)); left:12px; max-width:min(330px, calc(100vw - 32px)); background:var(--panel);
  border:1px solid var(--line); border-radius:10px; padding:10px 12px; backdrop-filter:blur(6px); }
#panel h1 { font-size:14px; margin:0 0 6px; }
#panel .metric { font-variant-numeric:tabular-nums; }
#panel label { display:flex; gap:6px; align-items:center; margin:3px 0; }
#panel input[type=range] { flex:1; }
.swatch { width:10px; height:10px; border-radius:2px; display:inline-block; }
.muted { color:var(--muted); }
details summary { cursor:pointer; margin-top:6px; }
</style>
<div id="view"></div>
<div id="panel">
  <h1>__TITLE__</h1>
  <div class="metric" id="metrics"></div>
  <details open><summary>Show</summary>
    <label><input type="checkbox" id="showPoints" checked> map points <span class="muted">(<span style="color:#e0453a">red</span> = no shape within __TOL__ m)</span></label>
    <label><input type="checkbox" id="onlyMissed"> only unexplained points</label>
    <div id="roles"></div>
    <label>shape opacity <input type="range" id="opacity" min="0" max="1" step="0.05" value="0.55"></label>
    <label>cut above <input type="range" id="cut" min="0" max="1" step="0.005" value="1"><span id="cutValue" class="muted"></span></label>
  </details>
  <div class="muted">drag: orbit &middot; right-drag: pan &middot; scroll: zoom</div>
</div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
const DATA = __DATA__
const colors = DATA.colors
const decode = (b64, Type) => new Type(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer)
const positions = decode(DATA.points, Float32Array)
const missed = decode(DATA.missed, Uint8Array)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.localClippingEnabled = true
document.getElementById("view").appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000)
camera.up.set(0, 0, 1)
const controls = new OrbitControls(camera, renderer.domElement)
scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 2.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.4)
sun.position.set(0.4, -0.6, 1)
scene.add(sun)

const [lo, hi] = DATA.bounds
const center = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2)
const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], 1)
camera.position.set(center.x - span * 0.55, center.y - span * 0.75, center.z + span * 0.7)
controls.target.copy(center)
const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), hi[2] + 1)

function pointCloud(onlyMissed) {
  const keep = []
  for (let i = 0; i < missed.length; i++) { if (!onlyMissed || missed[i]) { keep.push(i) } }
  const pos = new Float32Array(keep.length * 3)
  const col = new Float32Array(keep.length * 3)
  const ok = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--point").trim()), bad = new THREE.Color(0xe0453a)
  keep.forEach((i, j) => {
    pos.set(positions.subarray(i * 3, i * 3 + 3), j * 3)
    const c = missed[i] ? bad : ok
    col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3))
  return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, clippingPlanes: [clip] }))
}
let points = pointCloud(false)
scene.add(points)

const unit = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24).rotateX(Math.PI / 2),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
  ramp: (() => { const g = new THREE.BufferGeometry(); const v = [-.5,-.5,-.5, .5,-.5,-.5, .5,.5,-.5, -.5,.5,-.5, .5,-.5,.5, .5,.5,.5]; g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3)); g.setIndex([0,2,1, 0,3,2, 1,2,5, 1,5,4, 0,1,4, 3,5,2, 0,4,5, 0,5,3]); const n = g.toNonIndexed(); n.computeVertexNormals(); return n })(),
}
const groups = {}
const materials = []
for (const role of Object.keys(colors)) {
  const shapes = DATA.shapes.filter((s) => s.role === role)
  if (!shapes.length) { continue }
  const group = new THREE.Group()
  for (const kind of Object.keys(unit)) {
    const list = shapes.filter((s) => s.kind === kind)
    if (!list.length) { continue }
    const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(...colors[role]), transparent: true, opacity: 0.55, depthWrite: false, clippingPlanes: [clip], side: THREE.DoubleSide })
    materials.push(material)
    const mesh = new THREE.InstancedMesh(unit[kind], material, list.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1)
    list.forEach((s, i) => {
      q.setFromAxisAngle(axis, s.yaw)
      m.compose(new THREE.Vector3(...s.center), q, new THREE.Vector3(...s.size))
      mesh.setMatrixAt(i, m)
    })
    group.add(mesh)
  }
  scene.add(group)
  groups[role] = group
  const label = document.createElement("label")
  const [r, g, b] = colors[role].map((v) => Math.round(v * 255))
  label.innerHTML = `<input type="checkbox" checked> <span class="swatch" style="background:rgb(${r},${g},${b})"></span> ${role} <span class="muted">(${shapes.length})</span>`
  label.querySelector("input").onchange = (e) => { group.visible = e.target.checked }
  document.getElementById("roles").appendChild(label)
}

const m = DATA.metrics
document.getElementById("metrics").innerHTML = Object.entries(m).filter(([, v]) => v && v.coverage !== undefined)
  .map(([tol, v]) => `within ${tol} m: <b>${(v.coverage * 100).toFixed(1)}%</b> of points explained (${(v.coverage_above_floor * 100).toFixed(1)}% above the floor), ${(v.support * 100).toFixed(1)}% of shape surface backed`).join("<br>")
  + `<br>${m.shape_count} shapes &middot; ${m.points.toLocaleString()} points (showing ${missed.length.toLocaleString()})`

document.getElementById("showPoints").onchange = (e) => { points.visible = e.target.checked }
document.getElementById("onlyMissed").onchange = (e) => {
  scene.remove(points); points.geometry.dispose(); points = pointCloud(e.target.checked)
  points.visible = document.getElementById("showPoints").checked; scene.add(points)
}
document.getElementById("opacity").oninput = (e) => { for (const mat of materials) { mat.opacity = +e.target.value; mat.depthWrite = +e.target.value > 0.95 } }
const cutValue = document.getElementById("cutValue")
document.getElementById("cut").oninput = (e) => {
  const z = lo[2] + (hi[2] + 0.01 - lo[2]) * +e.target.value
  clip.constant = z
  cutValue.textContent = `${z.toFixed(2)} m`
}

// ?points=0, ?missed=1, ?view=top, ?cut=<z> and ?zoom=<x> set the page up (for screenshots and links)
const params = new URLSearchParams(location.search)
if (params.get("points") === "0") { document.getElementById("showPoints").click() }
if (params.get("missed") === "1") { document.getElementById("onlyMissed").click() }
if (params.has("cut")) {
  const cut = document.getElementById("cut")
  cut.value = (+params.get("cut") - lo[2]) / (hi[2] + 0.01 - lo[2])
  cut.dispatchEvent(new Event("input"))
}
if (params.get("view") === "top") { camera.position.set(center.x, center.y - 0.001, center.z + span * 1.25) }
if (params.has("zoom")) { camera.position.lerp(controls.target, 1 - 1 / +params.get("zoom")) }
scene.background = new THREE.Color(getComputedStyle(document.body).backgroundColor)

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }
addEventListener("resize", resize)
resize()
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
</script>
"""


def write_viewer(path: Path, title: str, points: np.ndarray, shapes: list[Shape], metrics: dict, tolerance: float,
                 max_points: int) -> None:
    if len(points) > max_points:
        points = points[np.random.default_rng(0).choice(len(points), max_points, replace=False)]
    missed = nearest_surface_distance(points, shapes, tolerance) >= tolerance
    data = {
        "points": base64.b64encode(points.astype(np.float32).tobytes()).decode(),
        "missed": base64.b64encode(missed.astype(np.uint8).tobytes()).decode(),
        # framed on the bulk of the map: stray returns through a window shouldn't shrink it to a dot
        "bounds": [np.percentile(points, 1, axis=0).tolist(), np.percentile(points, 99, axis=0).tolist()],
        "shapes": [s.to_json() for s in shapes],
        "colors": COLORS,
        "metrics": metrics,
    }
    html = PAGE.replace("__TITLE__", title).replace("__TOL__", f"{tolerance:g}").replace("__DATA__", json.dumps(data))
    path.write_text(html)
