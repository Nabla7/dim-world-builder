// The 3D view: the world (as the exporter will write it), the transform gizmo, mover paths, and in viewer mode the
// live robot and movers from a running blueprint.

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  PointCloud,
  Scene3D,
  SceneControls,
  TfFeed,
  useLayer,
  useTf,
  useViewer,
} from "../three_view.ts";
import { useSubscription } from "../ui.ts";
import { buildWorld, type World } from "../world/geometry.ts";
import type { Item, MeshAsset, Project, Quat, Vec3 } from "../world/types.ts";
import { bodyObject, disposeObject, ghost } from "./three_world.ts";
import { addNavPoint, getState, select, setDrawingPath, updateItem, useEditor } from "./store.ts";
import { themeColor } from "./theme_color.ts";
import { view } from "./palette.ts";

const SNAP = { translate: 0.1, rotate: Math.PI / 12, scale: 0.05 };

export function Viewport({ assets }: { assets: Record<string, MeshAsset> }) {
  const mode = useEditor((s) => s.mode);
  return (
    <Scene3D
      fixedFrame="world"
      style={{ position: "absolute", inset: 0 }}
      cameraPosition={[-9, -12, 10]}
      cameraTarget={[2, 0, 0]}
      gridSize={120}
      onViewer={(viewer) => {
        const track = () => {
          const t = viewer.controls.target;
          view.center = [t.x, t.y, 0];
        };
        viewer.controls.addEventListener("change", track);
        track();
        exposeForAutomation(viewer);
      }}
    >
      <Lighting />
      <WorldLayer assets={assets} />
      {mode === "edit" && <Gizmo />}
      {mode === "edit" && <MoverPaths />}
      <NavOverlay />
      {mode === "view" && <LiveRobot />}
      <SceneControls />
    </Scene3D>
  );
}

/**
 * `window.dimWorldBuilder`: where things are on screen, for scripted demos and UI tests (page coordinates), and a way
 * to aim the camera. Read-only for the project: edits still go through the UI.
 */
function exposeForAutomation(viewer: {
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3; update(): void };
  renderer: THREE.WebGLRenderer;
  requestRender(): void;
}) {
  const toScreen = (point: THREE.Vector3): [number, number] => {
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    viewer.camera.updateMatrixWorld();
    const ndc = point.clone().project(viewer.camera);
    return [rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height];
  };
  Object.assign(globalThis, {
    dimWorldBuilder: {
      /** an item's origin (its base) on screen */
      itemOnScreen(id: string): [number, number] | null {
        const object = view.worldRoot?.children.find((o) => o.userData.itemId === id);
        return object ? toScreen(object.getWorldPosition(new THREE.Vector3())) : null;
      },
      worldToScreen: (x: number, y: number, z: number) => toScreen(new THREE.Vector3(x, y, z)),
      /**
       * A point on the gizmo of the selected item, in the gizmo's own units (its arrows/rings reach 0.5), e.g.
       * [0.3, 0, 0] on the X arrow, [0.15, 0.15, 0] on the XY plane handle, [0.35, 0.35, 0] on the Z ring.
       * Uses TransformControls' own on-screen sizing: distance * min(1.9 tan(fov/2), 7) / 4.
       */
      gizmoOnScreen(id: string, local: [number, number, number]): [number, number] | null {
        const object = view.worldRoot?.children.find((o) => o.userData.itemId === id);
        if (!object) return null;
        viewer.camera.updateMatrixWorld();
        const origin = object.getWorldPosition(new THREE.Vector3());
        const factor = origin.distanceTo(viewer.camera.position) *
          Math.min(1.9 * Math.tan((Math.PI * viewer.camera.fov) / 360) / viewer.camera.zoom, 7) / 4;
        const offset = new THREE.Vector3(...local).applyQuaternion(
          object.getWorldQuaternion(new THREE.Quaternion()),
        )
          .multiplyScalar(factor);
        return toScreen(origin.add(offset));
      },
      lookAt(target: [number, number, number], from: [number, number, number]) {
        const place = () => {
          viewer.camera.position.set(...from);
          viewer.controls.target.set(...target);
          viewer.controls.update();
          viewer.requestRender();
        };
        // again after the scene's own camera easing settles
        place();
        setTimeout(place, 400);
      },
      state: () => getState(),
    },
  });
}

/** sun + sky light with soft shadows, so the world reads as solid shapes, not flat colors */
function Lighting() {
  const mode = useEditor((s) => s.mode);
  useLayer(({ viewer }) => {
    const root = new THREE.Group();
    viewer.renderer.shadowMap.enabled = true;
    viewer.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewer.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    viewer.renderer.toneMappingExposure = 0.9;
    // physical light (white sun, cool sky, warm bounce): the world's look, not the page's skin
    const sky = new THREE.HemisphereLight(
      new THREE.Color(0.85, 0.9, 1),
      new THREE.Color(0.45, 0.42, 0.38),
      0.9,
    );
    sky.up.set(0, 0, 1);
    sky.position.set(0, 0, 50);
    const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.97, 0.92), 1.6);
    sun.position.set(-18, -24, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const extent = 40;
    Object.assign(sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
      far: 150,
    });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    // editing: only shadows over the grid; viewing: a concrete ground with a soft checker, like the simulation's
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      mode === "view"
        ? new THREE.MeshStandardMaterial({ map: checker(), roughness: 0.95 })
        : new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    ground.receiveShadow = true;
    ground.position.z = -0.001;
    ground.userData.ground = true;
    root.add(sky, sun, sun.target, ground);
    return { root, dispose: () => disposeObject(root) };
  }, [mode]);
  return null;
}

/** a 1 m checker for the viewer's ground, drawn once (two grays of the world's concrete) */
function checker(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const tone = (v: number) => new THREE.Color(v, v * 1.02, v * 1.05).getStyle();
  ctx.fillStyle = tone(0.34);
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = tone(0.3);
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillRect(32, 32, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(200, 200);
  texture.magFilter = THREE.NearestFilter;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface WorldLayerState {
  root: THREE.Group;
  objects: Map<string, THREE.Group>;
}

/** every item as three.js objects, rebuilt when the project changes; ghosts the floors not being edited */
function WorldLayer({ assets }: { assets: Record<string, MeshAsset> }) {
  const project = useEditor((s) => s.project);
  const showCollision = useEditor((s) => s.showCollision);
  const mode = useEditor((s) => s.mode);
  const world = useMemo(() => buildWorld(project, assets), [project, assets]);
  const worldRef = useRef<World>(world);
  // stable, so the picker's pointer listeners aren't re-added (and a click's pointerdown forgotten) on every render
  const pickable = useCallback(
    () => (layer.current as unknown as { state: WorldLayerState } | null)?.state.objects,
    [],
  );
  const framed = useRef(-1);
  const opened = useEditor((s) => s.opened);
  worldRef.current = world;
  const tf = useTf();
  const layer = useLayer(({ viewer }) => {
    const root = new THREE.Group();
    root.name = "world";
    view.worldRoot = root;
    const state: WorldLayerState = { root, objects: new Map() };
    return {
      root,
      state,
      viewer,
      update: () => {
        // viewer mode: movers ride their live TF (world -> <body>) from the running simulation
        if (getState().mode !== "view" || !tf) return;
        for (const body of worldRef.current.bodies) {
          if (!body.mocap) continue;
          const object = state.objects.get(body.itemId);
          const pose = tf.lookup(body.name, "world");
          if (object && pose) {
            pose.decompose(object.position, object.quaternion, new THREE.Vector3());
          }
        }
      },
      dispose: () => disposeObject(root),
    };
  }, [tf]);
  useEffect(() => {
    const live = layer.current as unknown as
      | {
        state: WorldLayerState;
        viewer: {
          requestRender(): void;
          camera: THREE.PerspectiveCamera;
          controls: { target: THREE.Vector3; update(): void };
        };
      }
      | null;
    if (!live) return;
    const { root, objects } = live.state;
    for (const object of objects.values()) {
      root.remove(object);
      disposeObject(object);
    }
    objects.clear();
    const style = { collisionColor: themeColor("var(--danger)"), showCollision };
    for (const body of world.bodies) {
      const object = bodyObject(body, assets, style, () => live.viewer.requestRender());
      const editable = mode === "view" || body.floor === project.activeFloor;
      ghost(object, !editable);
      object.userData.pickable = editable && mode === "edit";
      objects.set(body.itemId, object);
      root.add(object);
    }
    // a different world was opened: frame all of it (once; an empty world is never framed later)
    const justOpened = framed.current !== opened;
    framed.current = opened;
    if (justOpened && world.bodies.length) {
      const bounds = new THREE.Box3().setFromObject(root);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = Math.max(4, bounds.getSize(new THREE.Vector3()).length());
      const frame = () => {
        live.viewer.controls.target.set(center.x, center.y, 0);
        live.viewer.camera.position.set(center.x - size * 0.45, center.y - size * 0.6, size * 0.55);
        live.viewer.controls.update();
        live.viewer.requestRender();
      };
      // after the scene's own first camera placement
      frame();
      setTimeout(frame, 400);
    }
    live.viewer.requestRender();
  }, [world, assets, showCollision, mode, project.activeFloor, layer]);
  return <Picker objects={pickable} />;
}

/** a click (not a drag) selects the item under it, or adds a mover waypoint while drawing a path */
function Picker({ objects }: { objects: () => Map<string, THREE.Group> | undefined }) {
  const viewer = useViewer();
  useEffect(() => {
    if (!viewer) return;
    const canvas = viewer.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      down = null;
      if ((viewer as unknown as { gizmoDragging?: boolean }).gizmoDragging) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, viewer.camera);
      const state = getState();
      if (state.navTool) {
        const floor = state.project.floors.find((f) => f.id === state.project.activeFloor);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(floor?.elevation ?? 0));
        const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        if (hit) addNavPoint([Math.round(hit.x * 10) / 10, Math.round(hit.y * 10) / 10, 0]);
        return;
      }
      if (state.drawingPath) {
        const floor = state.project.floors.find((f) => f.id === state.project.activeFloor);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(floor?.elevation ?? 0));
        const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        if (hit) addWaypoint(state.drawingPath, [hit.x, hit.y, 0]);
        return;
      }
      const pickable = [...(objects()?.values() ?? [])].filter((o) => o.userData.pickable);
      const hit = raycaster.intersectObjects(pickable, true)[0];
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && !node.userData.itemId) node = node.parent;
      select(node ? (node.userData.itemId as string) : null);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [viewer, objects]);
  return null;
}

function addWaypoint(id: string, point: Vec3) {
  updateItem(id, (item) => {
    const mover = item.mover ??
      { waypoints: [], speed: 0.5, mode: "loop" as const, heading: "path" as const };
    const snapped = point.map((v) => Math.round(v * 10) / 10) as Vec3;
    return { ...item, mover: { ...mover, waypoints: [...mover.waypoints, snapped] } };
  });
}

/** the generators take a gizmo scale as new dimensions; primitives and meshes keep it as their scale */
function applyScale(item: Item, raw: Vec3): Item {
  // a wild drag can ask for any factor: keep each within 1/10..10x per drag
  const s = raw.map((v) => Math.min(10, Math.max(0.1, Math.abs(v)))) as Vec3;
  switch (item.kind) {
    case "room":
      return {
        ...item,
        params: {
          ...item.params,
          width: round(item.params.width * s[0]),
          depth: round(item.params.depth * s[1]),
          height: round(item.params.height * s[2]),
        },
      };
    case "stairs":
      return {
        ...item,
        params: {
          ...item.params,
          stepDepth: round(item.params.stepDepth * s[0], 0.01),
          width: round(item.params.width * s[1]),
          stepHeight: round(item.params.stepHeight * s[2], 0.01),
        },
      };
    case "hill":
      return {
        ...item,
        params: {
          ...item.params,
          sizeX: round(item.params.sizeX * s[0]),
          sizeY: round(item.params.sizeY * s[1]),
          amplitude: round(item.params.amplitude * s[2], 0.01),
        },
      };
    default:
      return { ...item, scale: item.scale.map((v, i) => round(v * s[i], 0.01)) as Vec3 };
  }
}

const round = (v: number, step = 0.05) => Math.max(step, Math.round(v / step) * step);

/** translate / rotate / scale handles on the selected item; commits once per drag (one undo step) */
function Gizmo() {
  const viewer = useViewer();
  const selected = useEditor((s) => s.selected);
  const gizmo = useEditor((s) => s.gizmo);
  const snap = useEditor((s) => s.snap);
  const project = useEditor((s) => s.project);
  // while clicking out a path, the gizmo would swallow clicks that land on it
  const drawing = useEditor((s) => Boolean(s.drawingPath || s.navTool));
  const controlsRef = useRef<TransformControls | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const controls = new TransformControls(viewer.camera, viewer.renderer.domElement);
    controls.setSpace("local");
    const helper = controls.getHelper();
    viewer.scene.add(helper);
    viewer.setOnTop(helper, true);
    // drawing on top moves the helper to its own layer; let the gizmo's own picking ray see every layer
    controls.getRaycaster().layers.enableAll();
    controls.addEventListener("change", () => viewer.requestRender());
    controls.addEventListener("dragging-changed", (event) => {
      const dragging = Boolean((event as unknown as { value: boolean }).value);
      viewer.controls.enabled = !dragging;
      (viewer as unknown as { gizmoDragging?: boolean }).gizmoDragging = dragging;
      if (dragging) return;
      // drag ended: write the object's pose back to its item
      const object = controls.object;
      const id = object?.userData.itemId as string | undefined;
      const item = getState().project.items.find((i) => i.id === id);
      if (!object || !item) return;
      const floor = getState().project.floors.find((f) => f.id === item.floor);
      const lift = floor?.elevation ?? 0;
      const scale: Vec3 = [object.scale.x, object.scale.y, object.scale.z];
      const scaled = scale.some((v) => Math.abs(v - 1) > 1e-4);
      updateItem(item.id, (current) => {
        let next: Item = {
          ...current,
          // never below the floor it stands on
          position: [object.position.x, object.position.y, Math.max(0, object.position.z - lift)]
            .map((v) => Math.round(v * 1000) / 1000) as Vec3,
          rotation: object.quaternion.toArray() as Quat,
        };
        if (scaled) next = applyScale(next, scale);
        return next;
      });
    });
    controlsRef.current = controls;
    (globalThis as unknown as { dimWorldBuilderGizmo?: TransformControls }).dimWorldBuilderGizmo =
      controls;
    return () => {
      controls.detach();
      viewer.scene.remove(helper);
      controls.dispose();
      viewer.controls.enabled = true;
    };
  }, [viewer]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !viewer) return;
    controls.setMode(gizmo);
    // things in a world turn about the vertical: rotate is the yaw ring (exact roll/pitch stay in the inspector)
    controls.showX = gizmo !== "rotate";
    controls.showY = gizmo !== "rotate";
    controls.setTranslationSnap(snap ? SNAP.translate : null);
    controls.setRotationSnap(snap ? SNAP.rotate : null);
    controls.setScaleSnap(snap ? SNAP.scale : null);
    // the world layer rebuilds its objects on every project change: find the selected one afresh
    const target = selected
      ? viewer.scene.getObjectByName("world")?.children.find((o) => o.userData.itemId === selected)
      : undefined;
    if (target && !drawing) controls.attach(target);
    else controls.detach();
    viewer.requestRender();
  }, [viewer, selected, gizmo, snap, project, drawing]);
  return null;
}

/** the selected item's mover path: a line through its waypoints (closed for a loop) and a dot on each */
function MoverPaths() {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selected);
  const drawing = useEditor((s) => s.drawingPath);
  useLayer(() => {
    const item = project.items.find((i) => i.id === selected);
    const mover = item?.mover;
    if (!item || !mover || mover.waypoints.length === 0) return null;
    const lift = project.floors.find((f) => f.id === item.floor)?.elevation ?? 0;
    const points = mover.waypoints.map((w) => new THREE.Vector3(w[0], w[1], w[2] + lift + 0.05));
    if (mover.mode === "loop" && points.length > 2) points.push(points[0].clone());
    const root = new THREE.Group();
    const color = themeColor(drawing ? "var(--warn)" : "var(--primary)");
    root.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color }),
      ),
    );
    for (const p of points) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 8),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(p);
      root.add(dot);
    }
    return { root, dispose: () => disposeObject(root) };
  }, [project, selected, drawing]);
  useEffect(() => () => setDrawingPath(null), []);
  return null;
}

/** the nav test (mapping path, goals) and the spawn points, drawn over the world */
function NavOverlay() {
  const project = useEditor((s) => s.project);
  const tool = useEditor((s) => s.navTool);
  useLayer(() => {
    const root = new THREE.Group();
    const lift = (floor: string) => project.floors.find((f) => f.id === floor)?.elevation ?? 0;
    const spawnColor = themeColor("var(--info)");
    for (const spawn of project.spawns) {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(Math.cos(spawn.yaw), Math.sin(spawn.yaw), 0),
        new THREE.Vector3(
          spawn.position[0],
          spawn.position[1],
          spawn.position[2] + lift(spawn.floor) + 0.05,
        ),
        0.7,
        spawnColor,
        0.25,
        0.18,
      );
      root.add(arrow);
    }
    const nav = project.nav;
    if (nav) {
      const pathColor = themeColor(tool === "path" ? "var(--warn)" : "var(--primary)");
      const points = nav.mappingPath.map((p) =>
        new THREE.Vector3(p[0], p[1], p[2] + lift(nav.floor) + 0.04)
      );
      if (points.length > 1) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineDashedMaterial({ color: pathColor, dashSize: 0.25, gapSize: 0.15 }),
        );
        line.computeLineDistances();
        root.add(line);
      }
      for (const p of points) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 12, 6),
          new THREE.MeshBasicMaterial({ color: pathColor }),
        );
        dot.position.copy(p);
        root.add(dot);
      }
      const goalColor = themeColor("var(--ok)");
      for (const goal of nav.goals) {
        const base = new THREE.Vector3(
          goal.position[0],
          goal.position[1],
          goal.position[2] + lift(goal.floor),
        );
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(goal.tolerance * 0.92, goal.tolerance, 48),
          new THREE.MeshBasicMaterial({ color: goalColor, side: THREE.DoubleSide }),
        );
        ring.position.copy(base).setZ(base.z + 0.03);
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 1, 8).rotateX(Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: goalColor }),
        );
        pole.position.copy(base).setZ(base.z + 0.5);
        const flag = new THREE.Mesh(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0.35, 0, 0.88),
            new THREE.Vector3(0, 0, 0.76),
          ]),
          new THREE.MeshBasicMaterial({ color: goalColor, side: THREE.DoubleSide }),
        );
        flag.position.copy(base);
        root.add(ring, pole, flag);
      }
    }
    return { root, dispose: () => disposeObject(root) };
  }, [project, tool]);
  return null;
}

/** viewer mode: the robot and its lidar, live from the running blueprint */
function LiveRobot() {
  const showLidar = useEditor((s) => s.showCollision);
  return (
    <>
      <TfFeed />
      <Go2Model />
      {showLidar && (
        <PointCloud topic="dimos/pointcloud/sensor_msgs.PointCloud2" style="voxel" size={0.04} />
      )}
    </>
  );
}

interface Rig {
  root: string;
  joints: { name: string; body: string; axis: Vec3; bodyQuat: Quat }[];
}

/**
 * The Go2 (Menagerie's meshes, baked by tools/make_go2_glb.py), posed by TF (world -> go2/base) and its legs by the
 * connection's motor_states joint angles.
 */
function Go2Model() {
  const tf = useTf();
  const angles = useRef(new Map<string, number>());
  useSubscription(
    "dimos/motor_states/sensor_msgs.JointState",
    (msg: { name: string[]; position: number[] }) => {
      msg.name.forEach((name, i) =>
        angles.current.set(name.replace(/^go2\//, ""), msg.position[i])
      );
    },
    { maxHz: 30 },
  );
  useLayer(({ viewer }) => {
    const root = new THREE.Group();
    root.visible = false;
    let rig: Rig | null = null;
    const nodes = new Map<string, THREE.Object3D>();
    Promise.all([
      new GLTFLoader().loadAsync("files/robots/go2/go2.glb"),
      fetch("files/robots/go2/rig.json").then((r) => r.json() as Promise<Rig>),
    ]).then(([gltf, loadedRig]) => {
      rig = loadedRig;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const material = child.material as THREE.MeshStandardMaterial;
          material.roughness = 0.55;
        }
      });
      for (const joint of rig.joints) {
        const node = gltf.scene.getObjectByName(joint.body);
        if (node) nodes.set(joint.name, node);
      }
      root.add(gltf.scene);
      viewer.requestRender();
    }).catch(() => {});
    const axis = new THREE.Vector3();
    const spin = new THREE.Quaternion();
    return {
      root,
      update: () => {
        const pose = tf?.lookup("go2/base", "world");
        root.visible = Boolean(pose && rig);
        if (!pose || !rig) return;
        pose.decompose(root.position, root.quaternion, new THREE.Vector3());
        for (const joint of rig.joints) {
          const node = nodes.get(joint.name);
          const angle = angles.current.get(joint.name);
          if (!node || angle === undefined) continue;
          axis.set(...joint.axis);
          node.quaternion.set(...joint.bodyQuat).multiply(spin.setFromAxisAngle(axis, angle));
        }
      },
      dispose: () => disposeObject(root),
    };
  }, [tf]);
  return null;
}

export type { Project };
