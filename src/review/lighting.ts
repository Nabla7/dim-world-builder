import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import type { Bundle } from "./types.ts";

/** Three positive HDR channels need no alpha. Packed float halves GPU storage. */
function compactRadiance(texture: THREE.DataTexture) {
  const source = texture.image.data;
  if (!(source instanceof Uint16Array)) throw new Error("Expected half-float lighting pixels");
  const packed = new Uint32Array(source.length / 4);
  for (let i = 0, j = 0; i < source.length; i += 4, j++) {
    const r = source[i], g = source[i + 1], b = source[i + 2];
    if ((r & 0x7c00) === 0x7c00 || (g & 0x7c00) === 0x7c00 || (b & 0x7c00) === 0x7c00) {
      throw new Error("Nonfinite lighting pixel");
    }
    // Half and R11G11B10 share a five-bit exponent. Drop sign and round each
    // mantissa to nearest-even (6/6/5 bits), preserving the linear HDR range.
    const red = r & 0x8000 ? 0 : Math.min(0x7bf, (r + 7 + ((r >> 4) & 1)) >> 4);
    const green = g & 0x8000 ? 0 : Math.min(0x7bf, (g + 7 + ((g >> 4) & 1)) >> 4);
    const blue = b & 0x8000 ? 0 : Math.min(0x3df, (b + 15 + ((b >> 5) & 1)) >> 5);
    packed[j] = red | (green << 11) | (blue << 22);
  }
  texture.image.data = packed;
  texture.format = THREE.RGBFormat;
  texture.type = THREE.UnsignedInt101111Type;
  texture.internalFormat = "R11F_G11F_B10F";
  texture.needsUpdate = true;
}

/** Static Cycles illumination stays linear; Blender's display transform is applied once. */
export async function reviewLighting(bundle: Bundle, renderer: THREE.WebGLRenderer) {
  const lighting = bundle.lighting;
  if (!lighting) return null;
  if (lighting.source_sha256 !== bundle.source_sha256) {
    throw new Error("The lighting bake belongs to a different Blender source.");
  }
  const atlases: THREE.DataTexture[] = [];
  const loader = new EXRLoader().setDataType(THREE.HalfFloatType);
  // Bound transient decoder memory instead of inflating every atlas simultaneously.
  for (let i = 0; i < lighting.atlases.length; i += 3) {
    const loaded = await Promise.all(
      lighting.atlases.slice(i, i + 3).map(async (record) => {
        const texture = await loader.loadAsync(`files/review/${record.file}`);
        if (renderer.extensions.has("EXT_color_buffer_float")) compactRadiance(texture);
        texture.channel = 1;
        // EXRLoader returns bottom-up pixels; glTF stores V in the opposite convention.
        texture.repeat.y = -1;
        texture.offset.y = 1;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 4;
        return texture;
      }),
    );
    atlases.push(...loaded);
  }
  const display = await new THREE.TextureLoader().loadAsync(
    `files/review/${lighting.display.file}`,
  );
  display.colorSpace = THREE.NoColorSpace;
  display.generateMipmaps = false;
  display.minFilter = THREE.LinearFilter;
  display.magFilter = THREE.LinearFilter;
  const transform = `
uniform sampler2D reviewDisplay;
uniform vec3 reviewDisplayShape;
vec3 CustomToneMapping(vec3 color) {
  float size = reviewDisplayShape.x;
  vec3 p = clamp((log2(max(color,vec3(exp2(reviewDisplayShape.y)))) - reviewDisplayShape.y)
    / (reviewDisplayShape.z - reviewDisplayShape.y),0.0,1.0) * (size-1.0);
  float b = floor(p.b);
  vec2 uv = vec2((p.r + b * size + 0.5)/(size*size), (p.g+0.5)/size);
  vec3 a = texture2D(reviewDisplay, uv).rgb;
  uv.x = (p.r + min(b+1.0,size-1.0)*size + 0.5)/(size*size);
  vec3 c = mix(a,texture2D(reviewDisplay,uv).rgb,fract(p.b));
  // The LUT contains Blender's sRGB display values; the renderer encodes output later.
  return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));
}`;
  const chunks = THREE.ShaderChunk;
  if (!chunks.tonemapping_pars_fragment.includes("uniform sampler2D reviewDisplay;")) {
    chunks.tonemapping_pars_fragment = chunks.tonemapping_pars_fragment.replace(
      "vec3 CustomToneMapping( vec3 color ) { return color; }",
      transform,
    );
  }
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1; // Exposure/look are already represented in the sampled transform.
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  return {
    material(base: THREE.MeshStandardMaterial, atlas: number | undefined) {
      const key = `${base.name}/${atlas ?? "unbaked"}`;
      const cached = materials.get(key);
      if (cached) return cached;
      const material = base.clone();
      material.name = key;
      if (atlas !== undefined) {
        if (!atlases[atlas]) throw new Error(`Missing lighting atlas ${atlas}`);
        material.lightMap = atlases[atlas];
        // Cycles diffuse pass excludes albedo and contains outgoing Lambertian radiance.
        material.lightMapIntensity = Math.PI;
      }
      material.onBeforeCompile = (shader, renderer) => {
        base.onBeforeCompile(shader, renderer);
        shader.uniforms.reviewDisplay = { value: display };
        shader.uniforms.reviewDisplayShape = {
          value: new THREE.Vector3(
            lighting.display.size,
            lighting.display.minEv,
            lighting.display.maxEv,
          ),
        };
        if (atlas !== undefined) {
          const maps = THREE.ShaderChunk.lights_fragment_maps
            .replace("irradiance += lightMapIrradiance;", "irradiance = lightMapIrradiance;")
            .replace(
              "iblIrradiance += getIBLIrradiance( geometryNormal );",
              "iblIrradiance = vec3(0.0);",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <lights_fragment_maps>", maps)
            .replace(
              "#include <lights_fragment_end>",
              `#include <lights_fragment_end>
              reflectedLight.directDiffuse=vec3(0.0);
              reflectedLight.directSpecular=vec3(0.0);`,
            );
        }
      };
      material.customProgramCacheKey = () =>
        `${base.customProgramCacheKey()}/cycles/${atlas !== undefined}`;
      materials.set(key, material);
      return material;
    },
    dispose() {
      atlases.forEach((texture) => texture.dispose());
      display.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}
