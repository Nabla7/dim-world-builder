// The 3D view: the world (as the exporter will write it), the transform gizmo, mover paths, and in viewer mode the
// live robot and movers from a running blueprint.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  PointCloud,
  RobotModel,
  Scene3D,
  SceneControls,
  TfFeed,
  useLayer,
  useTf,
  useViewer,
} from "../three_view.ts";
import { buildWorld, type World } from "../world/geometry.ts";
import type { Item, MeshAsset, Project, Quat, Vec3 } from "../world/types.ts";
import { bodyObject, disposeObject, ghost } from "./three_world.ts";
import { getState, select, setDrawingPath, updateItem, useEditor } from "./store.ts";
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
      lookAt(target: [number, number, number], from: [number, number, number]) {
        viewer.camera.position.set(...from);
        viewer.controls.target.set(...target);
        viewer.controls.update();
        viewer.requestRender();
      },
      state: () => getState(),
    },
  });
}

/** sun + sky light with soft shadows, so the world reads as solid shapes, not flat colors */
function Lighting() {
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
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    ground.receiveShadow = true;
    ground.position.z = -0.001;
    ground.userData.ground = true;
    root.add(sky, sun, sun.target, ground);
    return { root, dispose: () => disposeObject(root) };
  }, []);
  return null;
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
  const framedName = useRef<string | null>(null);
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
    // a different world was opened: frame all of it
    if (framedName.current !== project.name && world.bodies.length) {
      framedName.current = project.name;
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
  return (
    <Picker
      objects={() => (layer.current as unknown as { state: WorldLayerState } | null)?.state.objects}
    />
  );
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
function applyScale(item: Item, s: Vec3): Item {
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
  const controlsRef = useRef<TransformControls | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const controls = new TransformControls(viewer.camera, viewer.renderer.domElement);
    controls.setSpace("local");
    const helper = controls.getHelper();
    viewer.scene.add(helper);
    viewer.setOnTop(helper, true);
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
          position: [object.position.x, object.position.y, object.position.z - lift].map((v) =>
            Math.round(v * 1000) / 1000
          ) as Vec3,
          rotation: object.quaternion.toArray() as Quat,
        };
        if (scaled) next = applyScale(next, scale);
        return next;
      });
    });
    controlsRef.current = controls;
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
    controls.setTranslationSnap(snap ? SNAP.translate : null);
    controls.setRotationSnap(snap ? SNAP.rotate : null);
    controls.setScaleSnap(snap ? SNAP.scale : null);
    // the world layer rebuilds its objects on every project change: find the selected one afresh
    const target = selected
      ? viewer.scene.getObjectByName("world")?.children.find((o) => o.userData.itemId === selected)
      : undefined;
    if (target) controls.attach(target);
    else controls.detach();
    viewer.requestRender();
  }, [viewer, selected, gizmo, snap, project]);
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

/** viewer mode: the robot and its lidar, live from the running blueprint */
function LiveRobot() {
  const showLidar = useEditor((s) => s.showCollision);
  return (
    <>
      <TfFeed />
      <RobotModel kind="dog" frame="go2/base" />
      {showLidar && (
        <PointCloud topic="dimos/pointcloud/sensor_msgs.PointCloud2" style="voxel" size={0.04} />
      )}
    </>
  );
}

export type { Project };
