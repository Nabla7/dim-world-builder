import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { reviewMaterials } from "./materials.ts";
import { reviewLighting } from "./lighting.ts";
import type { Bundle, CameraState, ObjectRecord, SourceView, Stats, Vec3 } from "./types.ts";

interface Range {
  end: number;
  id: string;
}
export interface Pick {
  object: ObjectRecord;
  point: Vec3;
}
export class ReviewViewer {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, 16 / 9, .03, 250);
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
  private meshes: THREE.Mesh[] = [];
  private ranges = new Map<THREE.Object3D, Range[]>();
  private records: Map<string, ObjectRecord>;
  private keys = new Set<string>();
  private disposed = false;
  private frame = 0;
  private observer: ResizeObserver;
  private highlight: THREE.Box3Helper;
  private locked: SourceView | null = null;
  private last = performance.now();
  private statsAt = this.last;
  private frames = 0;
  private loadSeconds = 0;
  private lighting: Awaited<ReturnType<typeof reviewLighting>> = null;
  private sourceMaterials: Awaited<ReturnType<typeof reviewMaterials>> | null = null;
  get ready() {
    return this.loadSeconds > 0;
  }
  private pointer: [number, number] | null = null;
  onPick?: (pick: Pick) => void;
  onMove?: () => void;
  onStats?: (stats: Stats) => void;
  constructor(public host: HTMLElement, public bundle: Bundle) {
    this.records = new Map(bundle.objects.map((o) => [o.id, o]));
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.localClippingEnabled = true;
    this.renderer.clippingPlanes = [this.clip];
    host.append(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(25, -25, 22);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(10, 2, 3);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI - .01;
    this.controls.minDistance = .01;
    this.controls.maxDistance = 100;
    this.controls.addEventListener("change", this.controlsChanged);
    this.controls.addEventListener("end", this.moved);
    this.scene.background = new THREE.Color("#c8d0d5"); // Scene lighting, not a UI theme.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, .04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environmentIntensity = .55;
    this.scene.add(new THREE.HemisphereLight(0xf0f4ff, 0x656359, 2.4));
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.8);
    sun.position.set(-12, 10, 25);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd5e8ff, 1.1);
    fill.position.set(30, -10, 10);
    this.scene.add(fill);
    this.highlight = new THREE.Box3Helper(new THREE.Box3(), 0xf9bc53);
    this.highlight.visible = false;
    (this.highlight.material as THREE.LineBasicMaterial).depthTest = false;
    this.highlight.renderOrder = 100;
    this.scene.add(this.highlight);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    host.tabIndex = 0;
    host.addEventListener("keydown", this.keydown);
    host.addEventListener("keyup", this.keyup);
    host.addEventListener("blur", this.clearKeys);
    window.addEventListener("blur", this.clearKeys);
    host.addEventListener("pointerdown", this.down);
    host.addEventListener("pointerup", this.up);
    this.resize();
    this.animate();
  }
  async load(progress: (s: string) => void) {
    const start = performance.now();
    progress("Loading the whole building and recorded materials…");
    const [gltf, sourceMaterials, lighting] = await Promise.all([
      new GLTFLoader().loadAsync(`files/review/${this.bundle.geometry}`),
      reviewMaterials(this.bundle),
      reviewLighting(this.bundle, this.renderer),
    ]);
    const materials = sourceMaterials.materials;
    this.sourceMaterials = sourceMaterials;
    this.lighting = lighting;
    if (this.disposed) {
      sourceMaterials.dispose();
      lighting?.dispose();
      return;
    }
    progress("Preparing selectable geometry…");
    gltf.scene.rotation.x = Math.PI / 2; // glTF Y-up -> original metric project Z-up, exactly once.
    gltf.scene.updateMatrixWorld(true);
    const groups = new Map<
      string,
      {
        material: THREE.Material;
        geometries: THREE.BufferGeometry[];
        ranges: Range[];
        count: number;
      }
    >();
    const oldMaterials = new Set<THREE.Material>();
    const oldGeometries = new Set<THREE.BufferGeometry>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let source: THREE.Object3D | null = o;
      while (source && !source.userData.review_id) source = source.parent;
      const id = source?.userData.review_id as string | undefined;
      if (!id || !this.records.has(id)) return;
      const original = Array.isArray(o.material) ? o.material[0] : o.material;
      oldMaterials.add(original);
      oldGeometries.add(o.geometry);
      const base = materials.get(original.name) ?? original.clone() as THREE.MeshStandardMaterial;
      const atlas = this.bundle.lighting?.objects[id];
      const material = lighting?.material(base, atlas) ?? base;
      let g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (g.index) {
        const flat = g.toNonIndexed();
        g.dispose();
        g = flat;
      }
      for (const key of Object.keys(g.attributes)) {
        if (!["position", "normal", "uv", "uv1"].includes(key)) g.deleteAttribute(key);
      }
      if (!g.getAttribute("normal")) g.computeVertexNormals();
      if (!g.getAttribute("uv")) {
        g.setAttribute(
          "uv",
          new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2),
        );
      }
      if (atlas !== undefined && !g.getAttribute("uv1")) {
        throw new Error(`Missing lighting UVs on ${id}`);
      }
      // All members of a batch must have matching attribute layouts.
      if (this.bundle.lighting && !g.getAttribute("uv1")) {
        g.setAttribute("uv1", g.getAttribute("uv").clone());
      }
      // Keep batches bounded spatially for frustum culling; retain triangle->source IDs.
      const record = this.records.get(id)!;
      const cell = `${Math.floor((record.min[0] + record.max[0]) / 12)},${
        Math.floor((record.min[1] + record.max[1]) / 12)
      },${Math.floor(record.min[2] / 4)}`;
      const key = `${material.name}/${cell}`;
      let group = groups.get(key);
      if (!group) {
        group = { material, geometries: [], ranges: [], count: 0 };
        groups.set(key, group);
      }
      group.count += g.getAttribute("position").count / 3;
      group.ranges.push({ end: group.count, id });
      group.geometries.push(g);
    });
    for (const group of groups.values()) {
      const geometry = mergeGeometries(group.geometries, false);
      if (!geometry) throw new Error("Could not batch source geometry.");
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const mesh = new THREE.Mesh(geometry, group.material);
      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.ranges.set(mesh, group.ranges);
      group.geometries.forEach((g) => g.dispose());
    }
    oldGeometries.forEach((g) => g.dispose());
    oldMaterials.forEach((m) => m.dispose());
    await this.renderer.compileAsync(this.scene, this.camera);
    this.loadSeconds = (performance.now() - start) / 1000;
    progress("");
  }
  private keydown = (e: KeyboardEvent) => {
    if (e.target !== this.host || e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyQ",
        "KeyE",
        "ShiftLeft",
        "ShiftRight",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    ) {
      e.preventDefault();
      this.unlock();
      this.keys.add(e.code);
    }
  };
  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.onMove?.();
  };
  private clearKeys = () => {
    this.keys.clear();
  };
  private down = (e: PointerEvent) => {
    if (e.target !== this.renderer.domElement) return;
    this.host.focus({ preventScroll: true });
    this.pointer = [e.clientX, e.clientY];
  };
  private up = (e: PointerEvent) => {
    if (
      e.button !== 0 || !this.pointer ||
      Math.hypot(e.clientX - this.pointer[0], e.clientY - this.pointer[1]) > 5
    ) return;
    this.pointer = null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (e.clientX - rect.left) / rect.width * 2 - 1,
        1 - (e.clientY - rect.top) / rect.height * 2,
      ),
      this.camera,
    );
    const hit = ray.intersectObjects(this.meshes, false).find((h) =>
      h.point.z <= this.clip.constant + .001
    );
    if (!hit || hit.faceIndex == null) return;
    const range = this.ranges.get(hit.object)?.find((r) => hit.faceIndex! < r.end);
    if (!range) return;
    const object = this.records.get(range.id)!;
    this.select(object.id);
    this.onPick?.({ object, point: hit.point.toArray() as Vec3 });
  };
  select(id: string | null) {
    const object = id ? this.records.get(id) : null;
    this.highlight.visible = !!object;
    if (object) {
      this.highlight.box.set(new THREE.Vector3(...object.min), new THREE.Vector3(...object.max));
    }
  }
  private moved = () => this.onMove?.();
  private controlsChanged = () => {
    if (!this.locked) return;
    const position = new THREE.Vector3(...this.locked.location);
    const forward = new THREE.Vector3(...this.locked.forward);
    if (
      this.camera.position.distanceTo(position) > 1e-5 ||
      this.camera.getWorldDirection(new THREE.Vector3()).dot(forward) < .9999999
    ) this.unlock();
  };
  private unlock = () => {
    if (this.locked) {
      this.locked = null;
      this.camera.up.set(0, 0, 1);
      this.camera.fov = 65;
      this.resize();
      this.onMove?.();
    }
  };
  setMode(mode: "walk" | "orbit") {
    this.controls.mouseButtons.LEFT = mode === "walk" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = mode === "walk" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    if (mode === "walk") {
      const forward = this.camera.getWorldDirection(new THREE.Vector3());
      this.controls.target.copy(this.camera.position).addScaledVector(forward, .08);
    }
  }
  source(view: SourceView) {
    this.keys.clear();
    this.locked = null;
    this.controls.enableDamping = false;
    this.controls.update(); // Drain a previous gesture before assigning the recorded pose.
    const matrix = new THREE.Matrix4().set(
      ...view.optical_to_project.flat() as Parameters<THREE.Matrix4["set"]>,
    );
    matrix.multiply(new THREE.Matrix4().makeScale(1, -1, -1));
    this.camera.position.setFromMatrixPosition(matrix);
    this.camera.quaternion.setFromRotationMatrix(matrix);
    this.camera.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.controls.target.copy(this.camera.position).addScaledVector(
      new THREE.Vector3(...view.forward),
      .08,
    );
    this.controls.update();
    this.controls.enableDamping = true;
    this.locked = view;
    this.clip.constant = 100;
    this.resize();
    this.onMove?.();
  }
  isMatched() {
    return this.locked !== null;
  }
  state(): CameraState {
    return {
      position: this.camera.position.toArray() as Vec3,
      quaternion: this.camera.quaternion.toArray(),
      target: this.controls.target.toArray() as Vec3,
      fov: this.camera.fov,
      aspect: this.camera.aspect,
    };
  }
  restore(state: CameraState, source: SourceView | null, cutHeight: number) {
    if (source) this.source(source);
    else {
      this.locked = null;
      this.camera.position.fromArray(state.position);
      this.camera.quaternion.fromArray(state.quaternion);
      this.camera.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.fov = state.fov;
      this.controls.target.fromArray(state.target);
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = true;
      this.resize();
    }
    this.clip.constant = cutHeight;
    this.onMove?.();
  }
  overview(level: "all" | "ground" | "upper") {
    this.locked = null;
    this.camera.up.set(0, 0, 1);
    this.camera.fov = 50;
    this.camera.position.set(34, -30, 36);
    this.controls.target.set(12, 2, 2.4);
    this.clip.constant = level === "ground" ? 3.2 : level === "upper" ? 6.2 : 8.1;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.resize();
    this.onMove?.();
  }
  cut(height: number) {
    this.clip.constant = height;
    this.onMove?.();
  }
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/jpeg", .82);
  }
  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.locked) {
      const { width: w, height: h, k } = this.bundle.evidence.calibration;
      // Calibrated asymmetric pinhole; preserve full image with letterboxing in the UI.
      const near = this.camera.near, far = this.camera.far;
      this.camera.projectionMatrix.makePerspective(
        -k[2] / k[0] * near,
        (w - k[2]) / k[0] * near,
        k[5] / k[4] * near,
        -(h - k[5]) / k[4] * near,
        near,
        far,
      );
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }
  }
  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, .05);
    this.last = now;
    if (this.keys.size) {
      const forward = this.camera.getWorldDirection(new THREE.Vector3());
      forward.z = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 0, 1))
        .normalize();
      const delta = new THREE.Vector3();
      const has = (...keys: string[]) => keys.some((k) => this.keys.has(k));
      delta.addScaledVector(
        forward,
        Number(has("KeyW", "ArrowUp")) - Number(has("KeyS", "ArrowDown")),
      );
      delta.addScaledVector(
        right,
        Number(has("KeyD", "ArrowRight")) - Number(has("KeyA", "ArrowLeft")),
      );
      delta.z += Number(has("KeyE")) - Number(has("KeyQ"));
      delta.normalize().multiplyScalar(dt * (has("ShiftLeft", "ShiftRight") ? 5 : 1.8));
      this.camera.position.add(delta);
      this.controls.target.add(delta);
    }
    if (!this.locked) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.statsAt > 1000) {
      this.onStats?.({
        fps: Math.round(this.frames * 1000 / (now - this.statsAt)),
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        objects: this.records.size,
        loadSeconds: this.loadSeconds,
      });
      this.frames = 0;
      this.statsAt = now;
    }
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.host.removeEventListener("keydown", this.keydown);
    this.host.removeEventListener("keyup", this.keyup);
    this.host.removeEventListener("blur", this.clearKeys);
    window.removeEventListener("blur", this.clearKeys);
    this.host.removeEventListener("pointerdown", this.down);
    this.host.removeEventListener("pointerup", this.up);
    const materials = new Set<THREE.Material>();
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach((x) => materials.add(x));
      else materials.add(m.material);
    });
    materials.forEach((m) => m.dispose());
    this.lighting?.dispose();
    this.sourceMaterials?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
