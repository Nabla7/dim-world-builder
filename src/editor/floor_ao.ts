// Baked floor ambient occlusion: the sky light a floor gets is blocked under and around what stands on it (under a
// desk is darker than open floor, even inside the sun's shadow). Baked once per world change, not per frame.

import * as THREE from "three";

/** meters per texel of the baked map */
const TEXEL = 0.08;
/** the highest occluder that counts, above its floor */
const REACH = 2.5;
/** blur radius in texels: the soft spread of the occlusion around an item (~25 cm, applied twice) */
const BLUR = 3;
/** how dark a fully covered spot gets (fraction of the sky light kept) */
const KEEP = 0.12;

export interface FloorAO {
  /** the occlusion map (1 = open sky) */
  map: { value: THREE.Texture };
  /** x0, y0, sizeX, sizeY of the map in world meters */
  bounds: { value: THREE.Vector4 };
}

const open = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
open.needsUpdate = true;

/** back to open sky (fancy rendering's floor occlusion off) */
export function clearFloorAO(into: FloorAO) {
  if (into.map.value !== open) into.map.value.dispose();
  into.map.value = open;
}

/** the uniforms a floor's slab material reads; open sky until a bake fills them */
export function floorAO(): FloorAO {
  return { map: { value: open }, bounds: { value: new THREE.Vector4(0, 0, 1, 1) } };
}

// the lowest occluder over each texel, as a height above the floor in 0..1 of REACH (MIN blending keeps the lowest)
const heightMaterial = new THREE.ShaderMaterial({
  uniforms: { uFloorZ: { value: 0 } },
  vertexShader: `
    #include <common>
    varying float vHeight;
    uniform float uFloorZ;
    void main() {
      #include <begin_vertex>
      vec4 world = modelMatrix * vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        world = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #endif
      vHeight = (world.z - uFloorZ) / ${REACH.toFixed(2)};
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: `
    varying float vHeight;
    void main() {
      if (vHeight > 1.0) discard;
      gl_FragColor = vec4(clamp(vHeight, 0.0, 1.0), 0.0, 0.0, 1.0);
    }`,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.MinEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
});

/**
 * Bakes one floor's occlusion: a top-down render of `occluders` (only what stands on this floor) into a height map,
 * turned into coverage (lower occluders block more of the sky), then blurred so it spreads softly around each item.
 */
export function bakeFloorAO(
  renderer: THREE.WebGLRenderer,
  occluders: THREE.Object3D,
  floorZ: number,
  rect: { x0: number; y0: number; sizeX: number; sizeY: number },
  into: FloorAO,
): void {
  const width = Math.min(1024, Math.max(8, Math.round(rect.sizeX / TEXEL)));
  const height = Math.min(1024, Math.max(8, Math.round(rect.sizeY / TEXEL)));
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
  const camera = new THREE.OrthographicCamera(0, rect.sizeX, rect.sizeY, 0, 0.01, REACH + 0.2);
  // looking straight down; image x = world x, image y = world y
  camera.position.set(rect.x0, rect.y0, floorZ + REACH + 0.1);
  camera.up.set(0, 1, 0);
  camera.lookAt(rect.x0, rect.y0, floorZ - 1);
  camera.updateMatrixWorld();

  const scene = new THREE.Scene();
  scene.overrideMaterial = heightMaterial;
  heightMaterial.uniforms.uFloorZ.value = floorZ;
  const parent = occluders.parent;
  scene.add(occluders);
  const before = {
    target: renderer.getRenderTarget(),
    color: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    shadows: renderer.shadowMap.autoUpdate,
  };
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0xff0000, 1);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  renderer.setRenderTarget(before.target);
  renderer.setClearColor(before.color, before.alpha);
  renderer.autoClear = before.autoClear;
  renderer.shadowMap.autoUpdate = before.shadows;
  parent?.add(occluders);
  target.dispose();

  // coverage: 1 under a low occluder, less under a high one (a desk top blocks less sky than a box on the floor)
  let cover: Float32Array = new Float32Array(width * height);
  for (let i = 0; i < cover.length; i++) {
    const h = pixels[i * 4] / 255;
    cover[i] = h >= 1 ? 0 : 1 - 0.4 * h;
  }
  cover = blur(blur(cover, width, height), width, height);
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < cover.length; i++) {
    const keep = Math.round(255 * (1 - (1 - KEEP) * Math.min(1, cover[i])));
    out.set([keep, keep, keep, 255], i * 4);
  }
  const map = new THREE.DataTexture(out, width, height);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  if (into.map.value !== open) into.map.value.dispose();
  into.map.value = map;
  into.bounds.value.set(rect.x0, rect.y0, rect.sizeX, rect.sizeY);
}

/** a separable box blur of BLUR texels each way (twice gives a soft, near-gaussian falloff) */
function blur(source: Float32Array, width: number, height: number): Float32Array {
  const across = new Float32Array(source.length);
  const span = 2 * BLUR + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -BLUR; x <= BLUR; x++) {
      sum += source[y * width + Math.min(width - 1, Math.max(0, x))];
    }
    for (let x = 0; x < width; x++) {
      across[y * width + x] = sum / span;
      const add = Math.min(width - 1, x + BLUR + 1), drop = Math.max(0, x - BLUR);
      sum += source[y * width + add] - source[y * width + drop];
    }
  }
  const down = new Float32Array(source.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -BLUR; y <= BLUR; y++) {
      sum += across[Math.min(height - 1, Math.max(0, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      down[y * width + x] = sum / span;
      const add = Math.min(height - 1, y + BLUR + 1), drop = Math.max(0, y - BLUR);
      sum += across[add * width + x] - across[drop * width + x];
    }
  }
  return down;
}
