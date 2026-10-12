// World -> the files sim2 loads: scene.xml (MJCF), scene.json (dimos.scene.v1), movers.json (dimos.movers.v1).
// Mesh assets are referenced as meshes/<asset id>/<file>; the exporter copies those files beside scene.xml.

import type { Body, Shape, World } from "./geometry.ts";
import type { Quat, Vec3 } from "./types.ts";

/** collision-only geometry lives in this group, which scene.json hides from cameras and lidar */
export const HIDDEN_GROUP = 3;

const num = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
};
const vec = (values: readonly number[]) => values.map(num).join(" ");
/** [x, y, z, w] -> MuJoCo's "w x y z" */
const wxyz = (q: Quat) => vec([q[3], q[0], q[1], q[2]]);
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function yawQuat(yaw: number): Quat {
  return [0, 0, Math.sin(yaw / 2), Math.cos(yaw / 2)];
}

export interface SceneFiles {
  xml: string;
  sceneJson: unknown;
  moversJson: unknown;
  /** asset id -> files under that asset's folder that scene.xml references */
  meshFiles: Map<string, Set<string>>;
  /** images (AprilTags) scene.xml references under textures/, as paths under the app's assets/ */
  textureFiles: Set<string>;
}

export function toScene(world: World, name: string): SceneFiles {
  const assets: string[] = [];
  const meshFiles = new Map<string, Set<string>>();
  const meshNames = new Map<string, string>();
  let counter = 0;

  function meshAsset(shape: Shape, body: Body, index: number): string {
    if (shape.mesh) {
      const meshName = `${body.name}_m${index}`;
      assets.push(
        `    <mesh name="${meshName}" vertex="${vec(shape.mesh.vertices)}" face="${
          shape.mesh.faces.join(" ")
        }"${shape.mesh.texcoords ? ` texcoord="${vec(shape.mesh.texcoords)}"` : ""}/>`,
      );
      return meshName;
    }
    const file = shape.meshFile!;
    const key = `${file.asset}/${file.file}@${vec(file.scale)}`;
    let meshName = meshNames.get(key);
    if (!meshName) {
      meshName = `asset_${counter++}`;
      meshNames.set(key, meshName);
      assets.push(
        `    <mesh name="${meshName}" file="${attr(`${file.asset}/${file.file}`)}" scale="${
          vec(file.scale)
        }"/>`,
      );
      if (!meshFiles.has(file.asset)) meshFiles.set(file.asset, new Set());
      meshFiles.get(file.asset)!.add(file.file);
    }
    return meshName;
  }

  function geom(shape: Shape, body: Body, index: number): string {
    const parts = [`name="${body.name}_g${index}"`, `type="${shape.type}"`];
    if (shape.type === "mesh") {
      parts.push(`mesh="${meshAsset(shape, body, index)}"`);
    } else if (shape.type === "hfield") {
      const h = shape.hfield!;
      const hname = `${body.name}_h${index}`;
      assets.push(
        `    <hfield name="${hname}" nrow="${h.nrow}" ncol="${h.ncol}" size="${
          vec(h.size)
        }" elevation="${vec(h.elevation)}"/>`,
      );
      parts.push(`hfield="${hname}"`);
    } else {
      parts.push(`size="${vec(shape.size)}"`);
    }
    if (shape.pos.some((v) => v !== 0)) parts.push(`pos="${vec(shape.pos)}"`);
    if (shape.quat[3] !== 1) parts.push(`quat="${wxyz(shape.quat)}"`);
    if (shape.texture) {
      parts.push(`material="${textureMaterial(shape.texture)}"`);
    } else {
      parts.push(`rgba="${vec(shape.rgba)}"`);
    }
    if (shape.role === "visual") {
      parts.push(`group="1" contype="0" conaffinity="0" mass="0"`);
    } else if (shape.role === "collision") {
      parts.push(`group="${HIDDEN_GROUP}"`);
    }
    return `      <geom ${parts.join(" ")}/>`;
  }

  const textureFiles = new Set<string>();
  const materials = new Map<string, string>();
  function textureMaterial(file: string): string {
    let material = materials.get(file);
    if (!material) {
      material = `tex_${materials.size}`;
      materials.set(file, material);
      textureFiles.add(file);
      // a 2d texture on a box shows on each face; the tag faces +x
      assets.push(
        `    <texture name="${material}" type="2d" file="${attr(file.split("/").pop()!)}"/>`,
      );
      assets.push(
        `    <material name="${material}" texture="${material}" texuniform="false" specular="0.1"/>`,
      );
    }
    return material;
  }

  const bodies = world.bodies.map((body) => {
    const geoms = body.shapes
      .filter((shape) => shape.role !== "editor")
      .map((shape, i) => geom(shape, body, i))
      .join("\n");
    const mocap = body.mocap ? ` mocap="true"` : "";
    return `    <body name="${body.name}" pos="${vec(body.pos)}" quat="${
      wxyz(body.quat)
    }"${mocap}>\n${geoms}\n    </body>`;
  });

  const xml = `<mujoco model="${attr(name)}">
  <!-- written by dim-world-builder; open the project file in the app to change it -->
  <compiler angle="radian" meshdir="meshes" texturedir="textures"/>
  <!-- the Go2 model's contact settings (elliptic cones, high impratio): its policy was trained with them -->
  <option cone="elliptic" impratio="100"/>
  <visual>
    <headlight ambient="0.35 0.35 0.35" diffuse="0.5 0.5 0.5" specular="0.1 0.1 0.1"/>
    <quality shadowsize="4096"/>
    <global offwidth="1920" offheight="1080"/>
  </visual>
  <asset>
    <texture name="ground_grid" type="2d" builtin="checker" rgb1="0.32 0.34 0.36" rgb2="0.28 0.3 0.32" width="512" height="512" mark="edge" markrgb="0.4 0.42 0.44"/>
    <material name="ground" texture="ground_grid" texrepeat="1 1" texuniform="true" reflectance="0.05"/>
${assets.join("\n")}
  </asset>
  <default>
    <geom friction="1 0.005 0.0001"/>
  </default>
  <worldbody>
    <light name="sun" directional="true" pos="0 0 20" dir="-0.3 -0.4 -1" diffuse="0.7 0.7 0.7" castshadow="true"/>
    <geom name="ground" type="plane" size="0 0 0.05" material="ground"${
    world.groundZ ? ` pos="0 0 ${num(world.groundZ)}"` : ""
  }/>
${bodies.join("\n")}
  </worldbody>
</mujoco>
`;

  const spawns: Record<string, unknown> = {};
  world.spawns.forEach((spawn, i) => {
    const pose = { position: spawn.pos, orientation: yawQuat(spawn.yaw) };
    if (i === 0) spawns.default = pose;
    spawns[spawn.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")] = pose;
  });
  if (!spawns.default) spawns.default = { position: [0, 0, 0], orientation: [0, 0, 0, 1] };

  const sceneJson = {
    format: "dimos.scene.v1",
    id: name,
    entities: Object.fromEntries(
      world.bodies.map((
        b,
      ) => [b.name, { body: b.name, label: b.label, kind: b.kind, movable: false }]),
    ),
    spawns,
    hidden_geom_groups: [HIDDEN_GROUP],
    provenance: { tool: "dim-world-builder" },
  };
  const moversJson = {
    format: "dimos.movers.v1",
    movers: world.movers.map((m) => ({
      body: m.body,
      waypoints: m.waypoints as Vec3[],
      speed: m.speed,
      mode: m.mode,
      heading: m.heading,
    })),
  };
  return { xml, sceneJson, moversJson, meshFiles, textureFiles };
}
