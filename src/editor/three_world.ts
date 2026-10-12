// World bodies -> three.js objects (Z up, like the viewer and MuJoCo). The same shapes the exporter writes.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Body, Shape } from "../world/geometry.ts";
import type { MeshAsset } from "../world/types.ts";

const gltfLoader = new GLTFLoader();
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
}

function material(shape: Shape): THREE.MeshStandardMaterial {
  const [r, g, b, a] = shape.rgba;
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
    case "hfield": {
      const h = shape.hfield!;
      const geo = new THREE.PlaneGeometry(h.size[0] * 2, h.size[1] * 2, h.ncol - 1, h.nrow - 1);
      const position = geo.getAttribute("position");
      // PlaneGeometry's first row is +y, like MuJoCo's hfield data
      for (let i = 0; i < position.count; i++) {
        position.setZ(i, h.elevation[i] * h.size[2]);
      }
      geo.computeVertexNormals();
      return geo;
    }
  }
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
            }
          });
          holder.add(visual);
          onLoaded();
        }).catch(() => {});
      }
      continue;
    }
    const geo = geometry(shape);
    if (!geo) continue;
    const mesh = shape.role === "collision"
      ? new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: style.collisionColor, wireframe: true, transparent: true, opacity: 0.8 }),
      )
      : new THREE.Mesh(geo, material(shape));
    mesh.castShadow = shape.role !== "collision";
    mesh.receiveShadow = true;
    place(mesh, shape);
    group.add(mesh);
  }
  return group;
}

/** dims a body that sits on another floor than the one being edited */
export function ghost(object: THREE.Object3D, ghosted: boolean) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) {
        if (m.userData.baseOpacity === undefined) {
          m.userData.baseOpacity = m.opacity;
          m.userData.baseTransparent = m.transparent;
        }
        m.transparent = ghosted || m.userData.baseTransparent;
        m.opacity = ghosted ? 0.18 : m.userData.baseOpacity;
        m.depthWrite = !ghosted;
        m.needsUpdate = true;
      }
    }
  });
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
