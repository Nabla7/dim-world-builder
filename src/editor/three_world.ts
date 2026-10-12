// World bodies -> three.js objects (Z up, like the viewer and MuJoCo). The same shapes the exporter writes.

import * as THREE from "three";
import { grassOn } from "./nature.ts";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Body, Shape, WorldLight } from "../world/geometry.ts";
import type { MeshAsset } from "../world/types.ts";

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

/** an image under files/ (AprilTags), loaded once, sharp pixels */
function texture(path: string, onLoaded: () => void): THREE.Texture {
  let t = textures.get(path);
  if (!t) {
    t = textureLoader.load(`files/${path}`, onLoaded);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(path, t);
  }
  return t;
}
const objLoader = new OBJLoader();
const glbCache = new Map<string, Promise<THREE.Object3D>>();
const objCache = new Map<string, Promise<THREE.Object3D>>();

/** a library asset or cooked import's visual.glb, loaded once; callers get a clone */
function loadGlb(url: string): Promise<THREE.Object3D> {
  let promise = glbCache.get(url);
  if (!promise) {
    promise = gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
    glbCache.set(url, promise);
  }
  return promise.then((scene) => scene.clone(true));
}

function loadObj(url: string): Promise<THREE.Object3D> {
  let promise = objCache.get(url);
  if (!promise) {
    promise = objLoader.loadAsync(url);
    objCache.set(url, promise);
  }
  return promise.then((group) => group.clone(true));
}

export interface WorldStyle {
  /** the overlay color for collision-only geometry */
  collisionColor: THREE.Color;
  showCollision: boolean;
  /** instanced grass blades on hills (visual only) */
  grass?: boolean;
}

function material(shape: Shape): THREE.MeshStandardMaterial {
  const [r, g, b, a] = shape.rgba;
  if (shape.type === "hfield") {
    // its colors are per facet (lowPolyGround)
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
    roughness: 0.85,
    metalness: 0.02,
    transparent: a < 1,
    opacity: a,
    flatShading: shape.type === "mesh",
  });
}

function geometry(shape: Shape): THREE.BufferGeometry | null {
  switch (shape.type) {
    case "box":
      return new THREE.BoxGeometry(shape.size[0] * 2, shape.size[1] * 2, shape.size[2] * 2);
    case "cylinder": {
      const geo = new THREE.CylinderGeometry(shape.size[0], shape.size[0], shape.size[1] * 2, 32);
      geo.rotateX(Math.PI / 2);
      return geo;
    }
    case "sphere":
      return new THREE.SphereGeometry(shape.size[0], 32, 16);
    case "ellipsoid": {
      const geo = new THREE.SphereGeometry(1, 32, 16);
      geo.scale(shape.size[0], shape.size[1], shape.size[2]);
      return geo;
    }
    case "mesh": {
      if (!shape.mesh) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(shape.mesh.vertices, 3));
      geo.setIndex(shape.mesh.faces);
      const flat = geo.toNonIndexed();
      flat.computeVertexNormals();
      return flat;
    }
    case "hfield":
      return lowPolyGround(shape);
  }
}

/** display triangles about this wide (m): the height field's own samples are finer, for physics */
const GROUND_FACET = 0.35;

/** a stable 0..1 per point, for color jitter that doesn't flicker between rebuilds */
function hash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** the samples a low-poly hill keeps (rows and columns of the field) and where each sits */
function lowPolyGrid(shape: Shape) {
  const h = shape.hfield!;
  const [sx, sy, top] = h.size;
  const step = Math.max(1, Math.round(GROUND_FACET / ((2 * sx) / (h.ncol - 1))));
  const pick = (n: number) => {
    const out: number[] = [];
    for (let i = 0; i < n - 1; i += step) out.push(i);
    out.push(n - 1);
    return out;
  };
  const rows = pick(h.nrow);
  const cols = pick(h.ncol);
  // row 0 is +y and column 0 is -x, like MuJoCo's hfield data
  const point = (row: number, col: number): [number, number, number] => [
    -sx + (col / (h.ncol - 1)) * 2 * sx,
    sy - (row / (h.nrow - 1)) * 2 * sy,
    h.elevation[row * h.ncol + col] * top,
  ];
  return { rows, cols, point, top };
}

/** the drawn (low-poly) surface's height at (x, y) in the field's frame: grass roots sit exactly on the facets */
export function lowPolyHeightAt(shape: Shape): (x: number, y: number) => number {
  const { rows, cols, point } = lowPolyGrid(shape);
  const xs = cols.map((c) => point(0, c)[0]);
  const ys = rows.map((r) => point(r, 0)[1]); // descending: row 0 is +y
  const find = (values: number[], v: number, descending: boolean) => {
    for (let i = 0; i + 1 < values.length; i++) {
      const [a, b] = descending ? [values[i + 1], values[i]] : [values[i], values[i + 1]];
      if (v >= a && v <= b) return i;
    }
    return Math.max(0, values.length - 2);
  };
  const plane = (a: number[], b: number[], c: number[], x: number, y: number) => {
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
    const wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
    return {
      z: wa * a[2] + wb * b[2] + (1 - wa - wb) * c[2],
      inside: wa >= -1e-6 && wb >= -1e-6 && wa + wb <= 1 + 1e-6,
    };
  };
  return (x, y) => {
    const c = find(xs, x, false);
    const r = find(ys, y, true);
    const p00 = point(rows[r], cols[c]);
    const p01 = point(rows[r], cols[c + 1]);
    const p10 = point(rows[r + 1], cols[c]);
    const p11 = point(rows[r + 1], cols[c + 1]);
    // the same two triangles lowPolyGround draws for this cell
    const [first, second] = (r + c) % 2 === 0
      ? [[p00, p10, p11], [p00, p11, p01]]
      : [[p00, p10, p01], [p01, p10, p11]];
    const one = plane(first[0], first[1], first[2], x, y);
    return one.inside ? one.z : plane(second[0], second[1], second[2], x, y).z;
  };
}

/**
 * A height field drawn low-poly: every few samples (GROUND_FACET apart, always the edges), flat-shaded triangles, each
 * its own shade of the field's color (lighter on crests). The samples it keeps sit at their exact heights; physics and
 * lidar use the full field.
 */
function lowPolyGround(shape: Shape): THREE.BufferGeometry {
  const { rows, cols, point, top } = lowPolyGrid(shape);
  const base = new THREE.Color().setRGB(
    shape.rgba[0],
    shape.rgba[1],
    shape.rgba[2],
    THREE.SRGBColorSpace,
  );
  const hsl = base.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const positions: number[] = [];
  const colors: number[] = [];
  const shade = new THREE.Color();
  const triangle = (a: number[], b: number[], c: number[]) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    const jitter = hash(cx, cy) - 0.5;
    const crest = top > 0 ? cz / top : 0;
    shade.setHSL(
      hsl.h + (hash(cy, cx) - 0.5) * 0.04,
      Math.min(1, hsl.s * (1.05 + jitter * 0.2)),
      Math.min(0.9, Math.max(0.05, hsl.l * (0.92 + jitter * 0.16 + crest * 0.18))),
      THREE.SRGBColorSpace,
    );
    for (const v of [a, b, c]) {
      positions.push(v[0], v[1], v[2]);
      colors.push(shade.r, shade.g, shade.b);
    }
  };
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let c = 0; c + 1 < cols.length; c++) {
      const p00 = point(rows[r], cols[c]);
      const p01 = point(rows[r], cols[c + 1]);
      const p10 = point(rows[r + 1], cols[c]);
      const p11 = point(rows[r + 1], cols[c + 1]);
      // alternate the diagonal, so the facets don't all lean one way; counter-clockwise from above
      if ((r + c) % 2 === 0) {
        triangle(p00, p10, p11);
        triangle(p00, p11, p01);
      } else {
        triangle(p00, p10, p01);
        triangle(p01, p10, p11);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

const livelyCache = new Map<THREE.Material, THREE.Material>();

/** foliage darker underneath and lighter on top (a cheap stand-in for light through leaves), once per geometry */
function shadeCanopy(geometry: THREE.BufferGeometry) {
  if (geometry.getAttribute("color")) return;
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const span = Math.max(1e-6, max.z - min.z);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const shade = 0.7 + 0.45 * ((position.getZ(i) - min.z) / span);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * A library model's material, faceted and a little livelier: foliage (green) more saturated and a touch lighter, so
 * low-poly canopies read as leaves rather than dark blobs. Shared per source material.
 */
function livelier<M extends THREE.Material | THREE.Material[]>(material: M): M {
  if (Array.isArray(material)) return material.map((m) => livelier(m)) as M;
  const source = material as THREE.Material;
  let made = livelyCache.get(source);
  if (!made) {
    made = source.clone();
    const standard = made as THREE.MeshStandardMaterial;
    if (standard.color) {
      // the flat-color kits (Kenney, Quaternius, poly.pizza) wrote sRGB values as glTF's linear factors, so they render
      // pale; textured models (Poly Haven) are right as they are
      if (!standard.map) standard.color.convertSRGBToLinear();
      standard.flatShading = true;
      standard.roughness = Math.max(standard.roughness ?? 1, 0.8);
      const hsl = standard.color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
      const green = hsl.h > 0.17 && hsl.h < 0.45 && hsl.s > 0.12;
      if (green) {
        standard.color.setHSL(
          hsl.h,
          Math.min(1, hsl.s * 1.3),
          Math.min(0.75, hsl.l * 1.12),
          THREE.SRGBColorSpace,
        );
        standard.vertexColors = true;
        standard.userData.foliage = true;
        // light through the leaves: a little of their own color, so the shaded side isn't a dark hole
        standard.emissive = standard.color.clone().multiplyScalar(0.18);
        standard.roughness = 0.9;
      }
    }
    livelyCache.set(source, made);
  }
  return made as M;
}

function place(object: THREE.Object3D, shape: Shape) {
  object.position.set(...shape.pos);
  object.quaternion.set(...shape.quat);
}

/** one body: its shapes, posed in the world, tagged with its item id for picking */
export function bodyObject(
  body: Body,
  assets: Record<string, MeshAsset>,
  style: WorldStyle,
  onLoaded: () => void,
): THREE.Group {
  const group = new THREE.Group();
  group.name = body.name;
  group.userData.itemId = body.itemId;
  group.position.set(...body.pos);
  group.quaternion.set(...body.quat);
  const loadedVisuals = new Set<string>();
  for (const shape of body.shapes) {
    if (shape.role === "collision" && !style.showCollision) continue;
    if (shape.meshFile) {
      const asset = assets[shape.meshFile.asset];
      if (!asset) continue;
      const holder = new THREE.Group();
      holder.scale.set(...shape.meshFile.scale);
      place(holder, shape);
      group.add(holder);
      if (shape.role === "collision") {
        loadObj(`${asset.base}/${shape.meshFile.file}`).then((hull) => {
          hull.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshBasicMaterial({
                color: style.collisionColor,
                wireframe: true,
                transparent: true,
                opacity: 0.8,
              });
            }
          });
          holder.add(hull);
          if (group.userData.ghosted) ghost(hull, true);
          onLoaded();
        }).catch(() => {});
      } else if (!loadedVisuals.has(asset.id)) {
        // one visual.glb carries every visual material of the asset
        loadedVisuals.add(asset.id);
        loadGlb(`${asset.base}/visual.glb`).then((visual) => {
          visual.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.material = livelier(child.material);
              if ((child.material as THREE.Material).userData.foliage) shadeCanopy(child.geometry);
            }
          });
          holder.add(visual);
          // it arrives after ghost() ran on the body
          if (group.userData.ghosted) ghost(visual, true);
          onLoaded();
        }).catch(() => {});
      }
      continue;
    }
    if (shape.texture && shape.mesh?.texcoords) {
      // the image on the mesh's front: its first four vertices and texcoords
      const m = shape.mesh;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(m.vertices.slice(0, 12), 3));
      // three's v runs up the image, MuJoCo's down
      geo.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          m.texcoords!.slice(0, 8).map((v, i) => (i % 2 ? 1 - v : v)),
          2,
        ),
      );
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      const plane = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ map: texture(shape.texture, onLoaded), roughness: 0.9 }),
      );
      place(plane, shape);
      group.add(plane);
      continue;
    }
    const geo = geometry(shape);
    if (!geo) continue;
    if (shape.role === "editor") {
      const handle = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: style.collisionColor,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        }),
      );
      place(handle, shape);
      group.add(handle);
      continue;
    }
    const mesh = shape.role === "collision"
      ? new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: style.collisionColor,
          wireframe: true,
          transparent: true,
          opacity: 0.8,
        }),
      )
      : new THREE.Mesh(geo, material(shape));
    if (body.kind === "slab") {
      // the slab's top is the ground at z = 0, where the viewer's grid lies: push the slab back so the grid shows
      const m = mesh.material as THREE.Material;
      m.polygonOffset = true;
      m.polygonOffsetFactor = 2;
      m.polygonOffsetUnits = 2;
    }
    mesh.castShadow = shape.role !== "collision";
    mesh.receiveShadow = true;
    place(mesh, shape);
    group.add(mesh);
    if (style.grass && shape.type === "hfield" && shape.role !== "collision") {
      const [r, g, b] = shape.rgba;
      const blades = grassOn(
        [shape.hfield!.size[0], shape.hfield!.size[1]],
        lowPolyHeightAt(shape),
        new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
      );
      place(blades, shape);
      group.add(blades);
    }
  }
  for (const light of body.lights ?? []) group.add(threeLight(light));
  return group;
}

/** the editor's stand-in for an exported MuJoCo light, shining down the body's -z */
function threeLight(light: WorldLight): THREE.Object3D {
  const color = new THREE.Color(
    ...light.rgb.map((c) => Math.min(1, c)) as [number, number, number],
  );
  const strength = Math.max(...light.rgb) * 3;
  const made = light.type === "sun"
    ? new THREE.DirectionalLight(color, strength)
    : light.type === "spot"
    ? new THREE.SpotLight(
      color,
      strength * 8,
      light.range * 2,
      (light.angle * Math.PI) / 180,
      0.3,
      1,
    )
    : new THREE.PointLight(color, strength * 8, light.range * 2, 1);
  made.castShadow = light.shadows;
  if (made instanceof THREE.DirectionalLight || made instanceof THREE.SpotLight) {
    made.target.position.set(0, 0, -1);
    made.add(made.target);
  }
  return made;
}

/** dims a body that sits on another floor than the one being edited */
export function ghost(object: THREE.Object3D, ghosted: boolean) {
  object.userData.ghosted = ghosted;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // instances of one asset share materials, so a ghost swaps in its own copy rather than dimming the shared one
      const base = child.userData.baseMaterial ?? child.material;
      child.userData.baseMaterial = base;
      child.material = ghosted
        ? (Array.isArray(base) ? base.map(ghostMaterial) : ghostMaterial(base))
        : base;
    }
  });
}

const ghostCache = new WeakMap<THREE.Material, THREE.Material>();

function ghostMaterial(base: THREE.Material): THREE.Material {
  let made = ghostCache.get(base);
  if (!made) {
    made = base.clone();
    made.transparent = true;
    made.opacity = 0.18 * base.opacity;
    made.depthWrite = false;
    ghostCache.set(base, made);
  }
  return made;
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => m.dispose());
    }
  });
}
