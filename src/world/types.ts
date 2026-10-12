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
  /**
   * a solid slab under this floor (its top at the floor's elevation) that holes cut into; the ground floor has a
   * thick one by default so a hole can be a pit
   */
  slab?: { thickness: number; sizeX: number; sizeY: number; center: [number, number] };
}

export type OpeningKind = "door" | "double" | "window" | "crawl" | "arch";

/** a gap cut through a room's wall: a door (from the floor), a window (from a sill), a crawl-space hatch... */
export interface DoorOpening {
  wall: "north" | "south" | "east" | "west";
  /** along the wall from its center, meters */
  offset: number;
  width: number;
  /** top of the opening above the floor */
  height: number;
  /** bottom of the opening above the floor (a window's sill); 0 for doors */
  bottom?: number;
  kind?: OpeningKind;
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
  /** thin treads with open gaps between them (no risers, like a ship's ladder) instead of solid blocks */
  openRisers?: boolean;
  treadThickness?: number;
  /** straight; switchback: two flights back and forth with a landing; spiral: around a center post */
  style?: "straight" | "switchback" | "spiral";
  /** spiral: degrees turned over the whole climb */
  spiralTurn?: number;
  /** spiral: the center post's radius */
  spiralCore?: number;
  railing?: "none" | "left" | "right" | "both";
  railingStyle?: "posts" | "panel" | "cables";
  color: Rgb;
}

export interface HoleParams {
  sizeX: number;
  sizeY: number;
  /** how far down it goes; at least the slab's thickness cuts all the way through */
  depth: number;
}

/** a light for the simulation's cameras (and the editor's view): lidar doesn't see light */
export interface LightParams {
  type: "point" | "spot" | "sun";
  color: Rgb;
  /** 0..2, 1 is a bright room light */
  intensity: number;
  /** point/spot: meters until it has faded to about a fifth */
  range: number;
  /** spot: half-angle of the cone, degrees */
  angle: number;
  shadows: boolean;
}

export interface AprilTagParams {
  family: "tag36h11";
  id: number;
  /** the black square's edge, meters (what detectors take as tag_size) */
  size: number;
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
  shape:
    | "box"
    | "cylinder"
    | "sphere"
    | "cone"
    | "ramp"
    | "beanbag"
    | "bowling_pin"
    | "pipe"
    | "soccer_ball"
    | "step_stool"
    | "ladder"
    | "bucket";
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
  /** the readable, unique id ("bed_2"): the entity name in the exported scene; see world/keys.ts */
  key?: string;
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
  | (ItemBase & { kind: "hill"; params: HillParams })
  | (ItemBase & { kind: "hole"; params: HoleParams })
  | (ItemBase & { kind: "apriltag"; params: AprilTagParams })
  | (ItemBase & { kind: "light"; params: LightParams });

export type ItemKind = Item["kind"];

export interface Spawn {
  name: string;
  floor: string;
  position: Vec3;
  yaw: number;
}

/** a place the navigation stack is asked to reach */
export interface NavGoal {
  id: string;
  name: string;
  floor: string;
  position: Vec3;
  /** reached when the robot's base is within this many meters (in x, y) */
  tolerance: number;
  /** seconds before the goal counts as failed */
  timeout: number;
}

/**
 * A navigation test: first the robot is driven along `mappingPath` (so the stack builds its map), then each goal is
 * sent to the nav stack in turn. Robot- and stack-agnostic: the runner speaks plain Twist / odometry / PoseStamped.
 */
export interface NavPlan {
  /** the spawn the robot starts at */
  startSpawn: string;
  floor: string;
  /** floor-relative points the robot is driven through before any goal */
  mappingPath: Vec3[];
  goals: NavGoal[];
}

export interface Project {
  format: "dim-world-builder.project.v1";
  name: string;
  floors: Floor[];
  items: Item[];
  spawns: Spawn[];
  /** the floor the editor adds to */
  activeFloor: string;
  /** the navigation test, if one is drawn */
  nav?: NavPlan;
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
