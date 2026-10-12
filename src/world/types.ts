// The editor's document: what the person authored. Pure data (JSON), shared by the page and the server.
// World frame: meters, Z up (MuJoCo / ROS). Rotations are unit quaternions [x, y, z, w].

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Rgb = [number, number, number];

export interface Floor {
  id: string;
  name: string;
  /** height of this floor's ground above the world ground */
  elevation: number;
}

export interface DoorOpening {
  wall: "north" | "south" | "east" | "west";
  /** along the wall from its center, meters */
  offset: number;
  width: number;
  height: number;
}

export interface RoomParams {
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  floor: boolean;
  ceiling: boolean;
  doors: DoorOpening[];
  color: Rgb;
}

export interface StairsParams {
  steps: number;
  stepHeight: number;
  stepDepth: number;
  width: number;
  color: Rgb;
}

export interface HillParams {
  sizeX: number;
  sizeY: number;
  /** tallest bump, meters */
  amplitude: number;
  /** how much the finer octaves add, 0..1 */
  roughness: number;
  /** bumps per 10 m at the coarsest octave */
  frequency: number;
  octaves: number;
  seed: number;
  /** grid points per side */
  resolution: number;
  /** fade to zero height at the edges so the hill meets the ground */
  edgeFade: boolean;
  color: Rgb;
}

export interface PrimitiveParams {
  shape: "box" | "cylinder" | "sphere" | "cone" | "ramp" | "beanbag";
  color: Rgb;
}

export interface MeshParams {
  /** library asset id, or a cooked import id */
  source: "library" | "import";
  asset: string;
}

export interface MoverPath {
  /** world-frame points (z included); the item rides from one to the next */
  waypoints: Vec3[];
  speed: number;
  mode: "loop" | "pingpong";
  heading: "path" | "fixed";
}

interface ItemBase {
  id: string;
  name: string;
  floor: string;
  /** relative to the floor's elevation */
  position: Vec3;
  rotation: Quat;
  /** full extents for primitives, a multiplier for meshes; ignored by generators (they have params) */
  scale: Vec3;
  mover?: MoverPath;
}

export type Item =
  | (ItemBase & { kind: "primitive"; params: PrimitiveParams })
  | (ItemBase & { kind: "mesh"; params: MeshParams })
  | (ItemBase & { kind: "room"; params: RoomParams })
  | (ItemBase & { kind: "stairs"; params: StairsParams })
  | (ItemBase & { kind: "hill"; params: HillParams });

export type ItemKind = Item["kind"];

export interface Spawn {
  name: string;
  floor: string;
  position: Vec3;
  yaw: number;
}

export interface Project {
  format: "dim-world-builder.project.v1";
  name: string;
  floors: Floor[];
  items: Item[];
  spawns: Spawn[];
  /** the floor the editor adds to */
  activeFloor: string;
}

/** A mesh the page and the exporter both know: a library asset or a cooked import. */
export interface MeshAsset {
  id: string;
  name: string;
  category: string;
  /** natural size in meters (bounding box), before the item's scale */
  size: Vec3;
  /** where its files live, relative to the app: visual.glb, meta.json, visual_*.obj, hull_*.obj */
  base: string;
  visuals: { file: string; rgba: [number, number, number, number] }[];
  hulls: string[];
  license?: string;
  source?: string;
}
