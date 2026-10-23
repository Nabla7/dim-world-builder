import * as THREE from "three";
import type { Bundle, ColorExpr } from "./types.ts";

const number = (n: number) => Number(n).toFixed(8);
// Blender's box projection chooses/blends faces using the original object-space normal.
// Weight regions and orientation follow Cycles kernel/svm/image.h (Apache-2.0):
// https://github.com/blender/blender/blob/v5.1.1/intern/cycles/kernel/svm/image.h
const boxProjection = `
vec4 reviewBoxSample(sampler2D image, vec2 uv, float extension) {
  vec4 c = texture2D(image, extension > 0.0 ? clamp(uv,0.0,1.0) : uv);
  if (extension > 1.0) c *= step(0.0,uv.x)*step(0.0,uv.y)*step(uv.x,1.0)*step(uv.y,1.0);
  return c;
}
vec4 reviewBox(sampler2D image, vec3 co, vec3 normal, float blend, float extension) {
  vec3 n = abs(normal); n /= max(n.x+n.y+n.z,1e-8);
  vec3 w = vec3(0.0);
  float limit = (1.0+blend)*0.5;
  if (n.x > limit*(n.x+n.y) && n.x > limit*(n.x+n.z)) w.x=1.0;
  else if (n.y > limit*(n.y+n.x) && n.y > limit*(n.y+n.z)) w.y=1.0;
  else if (n.z > limit*(n.z+n.x) && n.z > limit*(n.z+n.y)) w.z=1.0;
  else if (blend <= 0.0) w.x=1.0;
  else if (n.z < (1.0-limit)*(n.x+n.y)) {
    w.x=clamp((n.x/(n.x+n.y)-(1.0-blend)*0.5)/blend,0.0,1.0); w.y=1.0-w.x;
  } else if (n.x < (1.0-limit)*(n.y+n.z)) {
    w.y=clamp((n.y/(n.y+n.z)-(1.0-blend)*0.5)/blend,0.0,1.0); w.z=1.0-w.y;
  } else if (n.y < (1.0-limit)*(n.x+n.z)) {
    w.x=clamp((n.x/(n.x+n.z)-(1.0-blend)*0.5)/blend,0.0,1.0); w.z=1.0-w.x;
  } else w=((2.0-limit)*n+limit-1.0)/(2.0*limit-1.0);
  return w.x*reviewBoxSample(image,vec2(normal.x<0.0 ? 1.0-co.y : co.y,co.z),extension)
       + w.y*reviewBoxSample(image,vec2(normal.y>0.0 ? 1.0-co.x : co.x,co.z),extension)
       + w.z*reviewBoxSample(image,vec2(normal.z>0.0 ? 1.0-co.y : co.y,co.x),extension);
}
`;
/** Reproduce the source's image/alpha mixes and world-space UV mappings. */
export async function reviewMaterials(bundle: Bundle) {
  const loader = new THREE.TextureLoader();
  const textures = new Map<string, THREE.Texture>();
  await Promise.all(
    Object.entries(bundle.images).map(async ([key, info]) => {
      const texture = await loader.loadAsync(`files/review/${info.file}`);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      textures.set(key, texture);
    }),
  );
  const result = new Map<string, THREE.MeshStandardMaterial>();
  for (const [name, record] of Object.entries(bundle.materials)) {
    const sourceColor = record["Base Color"];
    if (sourceColor.kind === "constant" && record.Alpha.kind === "constant") {
      const rgb = typeof sourceColor.value === "number"
        ? [sourceColor.value, sourceColor.value, sourceColor.value]
        : sourceColor.value;
      const alpha = typeof record.Alpha.value === "number"
        ? record.Alpha.value
        : record.Alpha.value[0];
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]),
        roughness: record.roughness,
        metalness: record.metallic,
        side: THREE.DoubleSide,
        opacity: record.glass ? .22 : alpha,
        transparent: !!record.glass || alpha < .99,
      });
      material.name = name;
      result.set(name, material);
      continue;
    }
    const uniforms: Record<string, { value: THREE.Texture }> = {};
    let usesBox = false;
    const expr = (e: ColorExpr): string => {
      if (e.kind === "constant") {
        const v = typeof e.value === "number" ? [e.value, e.value, e.value, e.value] : e.value;
        return `vec4(${[v[0], v[1], v[2], v[3] ?? 1].map(number).join(",")})`;
      }
      if (e.kind === "mix") {
        return `mix(${expr(e.a)},${expr(e.b)},clamp((${expr(e.factor)}).r,0.0,1.0))`;
      }
      const key = `review_${e.image}`;
      uniforms[key] = { value: textures.get(e.image)! };
      let uv = "vec2(vReviewUv.x,1.0-vReviewUv.y)";
      let coordinates = `vec3(${uv},0.0)`;
      if (e.coordinates.kind === "world") {
        const m = e.coordinates.matrix;
        coordinates = `vec3(${
          m.map((row) => `dot(vec4(vReviewPosition,1.0),vec4(${row.map(number)}))`).join(",")
        })`;
        uv = `(${coordinates}).xy`;
      }
      const at = e.extension === "REPEAT" ? uv : `clamp(${uv},vec2(0.0),vec2(1.0))`;
      let sample = `texture2D(${key},${at})`;
      if (e.extension === "CLIP") {
        sample =
          `(${sample}*step(0.0,(${uv}).x)*step(0.0,(${uv}).y)*step((${uv}).x,1.0)*step((${uv}).y,1.0))`;
      }
      if (e.projection === "BOX") {
        usesBox = true;
        const extension = e.extension === "REPEAT" ? 0 : e.extension === "CLIP" ? 2 : 1;
        sample = `reviewBox(${key},${coordinates},vReviewObjectNormal,${
          number(e.projection_blend ?? 0)
        },${number(extension)})`;
      }
      return e.alpha ? `vec4((${sample}).a)` : sample;
    };
    const base = expr(record["Base Color"]);
    const alpha = expr(record.Alpha);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: record.roughness,
      metalness: record.metallic,
      side: THREE.DoubleSide,
      transparent: record.glass ?? false,
      opacity: record.glass ? .22 : 1,
      alphaTest: record.transparent && !record.glass ? 0.02 : 0,
    });
    // Alpha-tested printed labels keep hollow silhouettes without transparent-sort artifacts.
    if (record.transparent && !record.glass) material.alphaTest = .02;
    material.name = name;
    Object.assign(material, { defines: { USE_UV: "" } });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      const varying = "varying vec3 vReviewPosition; varying vec2 vReviewUv;\n" +
        (usesBox ? "varying vec3 vReviewObjectNormal;\n" : "");
      shader.vertexShader = varying + (usesBox ? "attribute vec3 reviewObjectNormal;\n" : "") +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvReviewPosition=(modelMatrix*vec4(transformed,1.0)).xyz;vReviewUv=uv;" +
            (usesBox ? "vReviewObjectNormal=reviewObjectNormal;" : ""),
        );
      shader.fragmentShader = varying + Object.keys(uniforms).map((k) =>
        `uniform sampler2D ${k};`
      ).join("\n") + "\n" + (usesBox ? boxProjection : "") + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `diffuseColor.rgb *= (${base}).rgb; diffuseColor.a *= (${alpha}).r;`,
      );
    };
    material.customProgramCacheKey = () => name;
    result.set(name, material);
  }
  return {
    materials: result,
    dispose() {
      result.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
    },
  };
}
