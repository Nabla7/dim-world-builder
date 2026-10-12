// The outdoors, for the editor's view only (never exported, never picked, never in physics or lidar):
// - grass: instanced blades on hills, a dark-root-to-light-tip gradient, per-blade color and height, normals pointing
//   up like the terrain's (the soft, stylized look), swaying in a gentle wind that neighbouring blades share
// - a sky dome: zenith-to-horizon gradient, a sun disc with glow, a few soft clouds; also the scene's environment light
// After the instanced-grass breakdowns at threejsresources.com/guides/grass and smythdesign.com/blog/stylized-grass-webgl,
// and Ghost of Tsushima's grass talk (normals toward the terrain's, clumped color variation).

import * as THREE from "three";

/** seconds, shared by every grass material; the view advances it each frame while grass is on screen */
export const windTime = { value: 0 };

/** the sun's direction (toward the sun), shared by the sky, the sun light and the shading */
export const SUN_DIRECTION = new THREE.Vector3(-0.45, -0.6, 0.66).normalize();
export const SKY = {
  zenith: new THREE.Color(0.24, 0.47, 0.82),
  horizon: new THREE.Color(0.72, 0.82, 0.92),
  ground: new THREE.Color(0.5, 0.52, 0.5),
  sun: new THREE.Color(1.0, 0.93, 0.8),
};

/** blades per square meter, and a cap on all of a hill's blades so a huge hill stays cheap */
const DENSITY = 160;
const MAX_BLADES = 40000;

function hash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** one blade, 1 tall along +z: three tapered segments, slightly curved, its root dark and its tip light */
function bladeGeometry(): THREE.BufferGeometry {
  const levels = [0, 0.35, 0.7, 1];
  const halfWidth = [0.5, 0.42, 0.25, 0];
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    const z = levels[i];
    const lean = 0.18 * z * z; // a gentle curve forward
    // ambient occlusion at the root, a sunlit, slightly yellow tip
    const shade = 0.58 + 0.47 * z;
    const warm = 1 - 0.14 * z * z;
    for (const side of i === levels.length - 1 ? [0] : [-1, 1]) {
      positions.push(side * halfWidth[i], lean, z);
      colors.push(shade, shade, shade * warm);
    }
  }
  // 0,1 | 2,3 | 4,5 | 6 (tip)
  const index = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  // every normal up: the blade shades like the ground it grows from, so a meadow reads soft, not noisy
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(Array.from({ length: positions.length / 3 }, () => [0, 0, 1]).flat(), 3),
  );
  geometry.setIndex(index);
  return geometry;
}

let sharedBlade: THREE.BufferGeometry | null = null;

function grassMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWindTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          // sway grows toward the tip; neighbours share a slow wave and a faster flutter (world-space, so it's coherent)
          float bend = position.z * position.z;
          vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float wave = sin(uWindTime * 1.1 + root.x * 0.32 + root.y * 0.21);
          float flutter = sin(uWindTime * 3.1 + root.x * 1.7 - root.y * 1.3) * 0.35;
          vec3 wind = vec3(0.09 * (wave + flutter) + 0.05, 0.05 * (wave - flutter), -0.02 * abs(wave)) * bend;
          transformed += inverse(mat3(modelMatrix * instanceMatrix)) * wind;
        }`,
      );
  };
  return material;
}

/**
 * Grass over a height field (as the editor draws it): `heightAt` gives the drawn surface's height at (x, y) in the
 * field's own frame, `size` its half extents, `color` its base green. Not pickable, casts no shadow.
 */
export function grassOn(
  size: [number, number],
  heightAt: (x: number, y: number) => number,
  color: THREE.Color,
): THREE.InstancedMesh {
  const [sx, sy] = size;
  const area = 4 * sx * sy;
  const count = Math.min(MAX_BLADES, Math.round(area * DENSITY));
  sharedBlade ??= bladeGeometry();
  const mesh = new THREE.InstancedMesh(sharedBlade, grassMaterial(), count);
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = (hash(i * 0.731, 17.3) * 2 - 1) * sx;
    const y = (hash(i * 0.519, 91.7) * 2 - 1) * sy;
    // clumps: a slow field decides height and hue, so the meadow has patches, not salt-and-pepper
    const clump = hash(Math.floor(x * 1.3), Math.floor(y * 1.3));
    // shorter toward the field's edges, so it ends in a soft fringe rather than a carpet's cut
    const edge = Math.min(sx - Math.abs(x), sy - Math.abs(y));
    const fringe = THREE.MathUtils.smoothstep(edge, 0, 0.9);
    const height = (0.14 + 0.14 * clump + 0.07 * hash(i, 3.1)) * (0.25 + 0.75 * fringe);
    const width = 0.05 + 0.025 * hash(i, 7.7);
    rotation.setFromAxisAngle(axis, hash(i, 5.3) * Math.PI * 2);
    matrix.compose(new THREE.Vector3(x, y, heightAt(x, y) - 0.01), rotation, new THREE.Vector3(width, width, height));
    mesh.setMatrixAt(i, matrix);
    tint.setHSL(
      hsl.h + (clump - 0.5) * 0.035 + (hash(i, 1.9) - 0.5) * 0.012,
      Math.min(1, hsl.s * (1.08 + (clump - 0.5) * 0.15)),
      Math.min(0.85, hsl.l * (1.12 + (clump - 0.5) * 0.12 + (hash(i, 2.7) - 0.5) * 0.08)),
      THREE.SRGBColorSpace,
    );
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // the blades span the whole hill; the base mesh's bounds don't
  mesh.raycast = () => {}; // never picked: clicks go to the hill under it
  mesh.userData.grass = true;
  mesh.userData.noPick = true;
  return mesh;
}

/** a sky dome around the camera: gradient, sun disc and glow, a few soft clouds */
export function skyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uGround: { value: SKY.ground },
      uSun: { value: SKY.sun },
      uSunDirection: { value: SUN_DIRECTION },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww; // on the far plane, behind everything
      }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uGround, uSun, uSunDirection;
      varying vec3 vDirection;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDirection);
        float up = d.z;
        vec3 color = up > 0.0
          ? mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.55))
          : mix(uHorizon, uGround, clamp(-up * 6.0, 0.0, 1.0));
        float facing = max(dot(d, uSunDirection), 0.0);
        color += uSun * (pow(facing, 64.0) * 0.35 + pow(facing, 8.0) * 0.08); // glow around the sun
        color = mix(color, vec3(1.0, 0.98, 0.92) * 1.6, smoothstep(0.9993, 0.9996, facing)); // the disc
        if (up > 0.02) {
          vec2 plane = d.xy / (up + 0.12) * 1.6; // clouds on a far ceiling: smaller toward the horizon
          float cover = smoothstep(0.52, 0.78, fbm(plane + vec2(3.7, 1.3)));
          float shade = 0.82 + 0.18 * fbm(plane * 2.0 + 7.0);
          color = mix(color, vec3(1.0) * shade, cover * 0.85 * smoothstep(0.02, 0.25, up));
        }
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.raycast = () => {};
  dome.userData.noPick = true;
  return dome;
}

/** how far the camera is from what it orbits; the grid fades out a few of these away */
export const gridFocus = { value: 20 };

/** fades the editor's grid out with distance (its far lines alias into rings); patches it once */
export function fadeGrid(grid: THREE.Object3D) {
  const material = (grid as THREE.LineSegments).material as THREE.Material;
  if (material.userData.faded) return;
  material.userData.faded = true;
  material.transparent = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFocus = gridFocus;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vViewDistance;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvViewDistance = length(mvPosition.xyz);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vViewDistance;\nuniform float uFocus;")
      .replace(
        "#include <fog_fragment>",
        "gl_FragColor.a *= 1.0 - smoothstep(uFocus * 0.9, uFocus * 1.8, vViewDistance);\n#include <fog_fragment>",
      );
  };
  material.needsUpdate = true;
}
