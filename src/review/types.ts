export type Vec3 = [number, number, number];
export interface ObjectRecord {
  id: string;
  collection: string;
  min: Vec3;
  max: Vec3;
}
export type ColorExpr =
  | { kind: "constant"; value: number | number[] }
  | {
    kind: "image";
    image: string;
    alpha: boolean;
    extension: string;
    coordinates: { kind: "uv" } | { kind: "world"; matrix: number[][] };
  }
  | { kind: "mix"; factor: ColorExpr; a: ColorExpr; b: ColorExpr };
export interface MaterialRecord {
  "Base Color": ColorExpr;
  Alpha: ColorExpr;
  roughness: number;
  metallic: number;
  transparent: boolean;
  glass?: boolean;
}
export interface SourceView {
  second: number;
  location: Vec3;
  forward: Vec3;
  optical_to_project: number[][];
  image: string;
  thumbnail: string;
  render: string | null;
  label: string | null;
  reviewed: boolean;
  level: "ground" | "upper";
}
export interface Bundle {
  id: string;
  title: string;
  revision: string;
  source_blend: string;
  source_sha256: string;
  units: "metres";
  up: "Z";
  geometry: string;
  objects: ObjectRecord[];
  materials: Record<string, MaterialRecord>;
  images: Record<string, { file: string; source: string; size: number[] }>;
  warnings: string[];
  limitations: string[];
  evidence: {
    calibration: { width: number; height: number; k: number[] };
    views: SourceView[];
    render_source_sha256?: string;
  };
}
export interface CameraState {
  position: Vec3;
  quaternion: [number, number, number, number];
  target: Vec3;
  fov: number;
  aspect: number;
}
export interface Focus {
  revision: string;
  camera: CameraState;
  sourceSecond: number | null;
  objectId: string | null;
  point: Vec3 | null;
  cutHeight: number;
  mode: string;
}
export interface Stroke {
  points: [number, number][];
}
export interface ReviewNote extends Focus {
  id: string;
  number?: number;
  text: string;
  createdAt: string;
  status: "open" | "resolved";
  strokes: Stroke[];
  screenshot?: string;
  attachment?: string;
}
export interface ViewCommand {
  id: string;
  reload?: boolean;
  sourceSecond?: number;
  objectId?: string;
  noteId?: string;
  level?: "all" | "ground" | "upper";
  applied?: boolean;
}
export interface ReviewRevision {
  revision: string;
  directory: string;
}
export interface Stats {
  fps: number;
  calls: number;
  triangles: number;
  objects: number;
  loadSeconds: number;
}
