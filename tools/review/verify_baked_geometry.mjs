/** Compare actual exported triangles, not Blender curve bounding-box estimates. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const [baselineDir, bakedDir, reportPath] = process.argv.slice(2);
if (!baselineDir || !bakedDir) {
  throw new Error("Usage: node tools/review/verify_baked_geometry.mjs BASELINE BAKED [REPORT.json]");
}
async function load(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, "scene.json"), "utf8"));
  const bytes = await readFile(resolve(directory, manifest.geometry));
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "",
  );
  gltf.scene.rotation.x = Math.PI / 2;
  gltf.scene.updateMatrixWorld(true);
  const objects = new Map();
  const point = new THREE.Vector3();
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let source = mesh;
    while (source && !source.userData.review_id) source = source.parent;
    const id = source?.userData.review_id;
    assert(id, "exported mesh retains its source ID");
    const positions = mesh.geometry.attributes.position;
    const indices = mesh.geometry.index;
    const count = indices?.count ?? positions.count;
    const xyz = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      point.toArray(xyz, i * 3);
    }
    const primitives = objects.get(id) ?? [];
    primitives.push({ xyz, material: mesh.material.name });
    objects.set(id, primitives);
    if (manifest.lighting?.objects[id] !== undefined) {
      const uv = mesh.geometry.attributes.uv1;
      assert(uv, `${id} retains the second UV set`);
      assert(Array.from(uv.array).every((v) => Number.isFinite(v) && v >= -1e-5 && v <= 1.00001),
        `${id} has finite atlas coordinates inside the texture`);
    }
  });
  return { manifest, objects };
}
const baseline = await load(baselineDir);
const baked = await load(bakedDir);
assert.equal(baked.manifest.source_sha256, baseline.manifest.source_sha256);
assert.equal(baked.manifest.id, baseline.manifest.id);
assert.equal(baked.manifest.units, baseline.manifest.units);
assert.equal(baked.manifest.up, baseline.manifest.up);
assert.deepEqual([...baked.objects.keys()].sort(), [...baseline.objects.keys()].sort());
let maxVertexDelta = 0;
let triangles = 0;
for (const [id, original] of baseline.objects) {
  const updated = baked.objects.get(id);
  assert.equal(updated.length, original.length, `${id} primitive count`);
  for (let i = 0; i < original.length; i++) {
    const a = original[i], b = updated[i];
    assert.equal(b.material, a.material, `${id} material assignment`);
    assert.equal(b.xyz.length, a.xyz.length, `${id} triangle count`);
    triangles += a.xyz.length / 9;
    for (let j = 0; j < a.xyz.length; j++) {
      const delta = Math.abs(a.xyz[j] - b.xyz[j]);
      assert(delta < 1e-5, `${id} triangle vertex ${j}: ${delta} metre difference`);
      maxVertexDelta = Math.max(maxVertexDelta, delta);
    }
  }
}
const evidence = {
  source_sha256: baked.manifest.source_sha256,
  source_objects: baked.objects.size,
  triangles,
  max_triangle_vertex_delta_metres: maxVertexDelta,
  baked_objects: Object.keys(baked.manifest.lighting.objects).length,
  atlases: baked.manifest.lighting.atlases.length,
  checks: ["source identity/frame", "all object IDs", "every ordered triangle vertex",
    "material assignments", "finite second UV coordinates"],
  limitation: "This establishes visual export geometry retention, not collision or source reconstruction accuracy.",
};
if (reportPath) await writeFile(reportPath, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
