import { Topic } from '../data.ts';
/** Where the map is looking: the world point at the canvas center and the zoom (meters per CSS pixel). */
export interface MapView {
    centerX: number;
    centerY: number;
    metersPerPixel: number;
}
/** a point on the floor, in the fixed frame (meters) */
export interface FloorPoint {
    x: number;
    y: number;
}
/** a pose seen from above: its position on the floor and its heading (radians, counter-clockwise from +x) */
export interface FloorPose extends FloorPoint {
    yaw: number;
}
/** a world box: minX, minY, maxX, maxY */
export type MapBox = [number, number, number, number];
/** a color as 0..255 bytes: r, g, b, a */
export type Rgba = readonly number[];
/** RGBA bytes, 4 per pixel */
export type RgbaPixels = Uint8ClampedArray<ArrayBuffer>;
export declare const MIN_METERS_PER_PIXEL = 0.002;
export declare const MAX_METERS_PER_PIXEL = 2;
export declare function worldToScreen(view: MapView, width: number, height: number, x: number, y: number): [number, number];
export declare function screenToWorld(view: MapView, width: number, height: number, sx: number, sy: number): [number, number];
/** Zooms by `factor` (>1 = in) keeping the world point under (sx, sy) where it is. */
export declare function zoomAt(view: MapView, width: number, height: number, sx: number, sy: number, factor: number): MapView;
/** Moves the view so the content follows a drag of (dx, dy) CSS pixels. */
export declare function pan(view: MapView, dx: number, dy: number): MapView;
/** the TF frame the map follows unless the viewer picks another */
export declare const DEFAULT_FOLLOW_FRAME = "base_link";
/** how far (CSS px) a pinch's middle drifts before the pinch counts as a pan, not just a zoom */
export declare const PINCH_PAN_SLOP_PX = 12;
/** A wheel event as a zoom (a mouse wheel, a trackpad pinch, a vertical scroll) or a pan (sideways, or with shift). */
export declare function wheelGesture(event: Pick<WheelEvent, "ctrlKey" | "shiftKey" | "deltaX" | "deltaY">): "zoom" | "pan";
/**
 * Whether the view follows a TF frame. Following is the default (and is never remembered: a reload follows again);
 * any pan (drag, sideways wheel, a pinch whose middle moves) suspends it, a zoom alone keeps it (about the frame), and
 * re-centering resumes it. A frame not in the TF tree yet ("waiting") leaves the view where it is.
 */
export declare class MapFollow {
    #private;
    frame: string;
    following: boolean;
    constructor(frame?: string);
    /** a drag, a wheel pan or a fit: true when that stopped following */
    pan(): boolean;
    /** true when that resumed following */
    recenter(): boolean;
    pinchStart(): void;
    /** a pinch step whose middle moved (dx, dy): false while it's still only a zoom (following and within the slop) */
    pinchPans(dx: number, dy: number): boolean;
    /** the view, centered on the target while following; unchanged without a target (waiting for its frame) */
    view(view: MapView, target: FloorPoint | null): MapView;
    /** where a zoom at (sx, sy) is anchored: the target while following one (so it stays centered) */
    zoomAnchor(view: MapView, width: number, height: number, sx: number, sy: number, target: FloorPoint | null): [number, number];
}
export interface FollowFrameOption {
    frame: string;
    /** not in the TF tree yet */
    waiting: boolean;
}
/** The frames to offer for following: the TF tree's, with the chosen one first marked waiting when it's not there yet. */
export declare function followFrameOptions(frames: string[], chosen: string): FollowFrameOption[];
/** a fit never zooms in closer than this many meters across (a lone point or an empty map is not a reason to) */
export declare const MIN_FIT_SPAN = 4;
/** A view that's usable: finite and within the zoom limits. */
export declare const isValidView: (view: MapView | null | undefined) => view is MapView;
/** The view that shows a world box (minX, minY, maxX, maxY) with a margin; null when the box isn't finite. */
export declare function fitView(box: MapBox, width: number, height: number): MapView | null;
/** A 4×4 column-major matrix (THREE.Matrix4.elements) seen from above: its position on the floor and its heading. */
export declare function floorPose(elements: ArrayLike<number>): FloorPose;
/** The scale bar's length: the largest 1/2/5 × 10^n meters that fits in `maxMeters`. */
export declare function niceLength(maxMeters: number): number;
export declare const formatMeters: (meters: number) => string;
/** the colors of a grid's cells: free (0), a cost from low (1) to high (99), lethal (100+) and unknown (-1) */
export interface GridPalette {
    free: Rgba;
    low: Rgba;
    high: Rgba;
    lethal: Rgba;
    unknown: Rgba;
}
/** cell value (-1..100, as the byte it arrives as) → rgba */
export declare function gridLut(palette: GridPalette): RgbaPixels;
/** An OccupancyGrid's cells as RGBA, row 0 first (row 0 is the grid's lowest y). Reuses `out` when it's the right size. */
export declare function gridPixels(data: ArrayLike<number>, width: number, height: number, lut: Uint8ClampedArray, out?: RgbaPixels | null): RgbaPixels;
/** 256 heat colors, cold (0) to hot (255), as RGBA bytes. */
export declare function heatLut(stops?: readonly Rgba[]): RgbaPixels;
/** a point cloud projected from above: `width`×`height` RGBA pixels of `cell` meters, row 0 at `originY` (the lowest y) */
export interface CloudImage {
    pixels: RgbaPixels;
    width: number;
    height: number;
    originX: number;
    originY: number;
    cell: number;
}
/**
 * A point cloud seen from above, as a heatmap: each point placed by `elements` (cloud frame → fixed frame, column-major
 * 4×4) and binned into `cell`-meter pixels (coarser when the cloud is too big for MAX_CLOUD_PIXELS); a pixel takes
 * the heat of its highest point between the floor (cold) and the tallest (hot), so walls stand out from the floor.
 */
export declare function projectCloud(positions: ArrayLike<number>, elements: ArrayLike<number>, lut: Uint8ClampedArray, cell?: number): CloudImage | null;
/** Where the robot has been: a polyline on the floor, broken (NaN) at a jump, at most `capacity` points. */
export declare class Trail {
    #private;
    minStep: number;
    jump: number;
    capacity: number;
    /** x, y pairs; a NaN pair breaks the line */
    points: number[];
    constructor(minStep?: number, jump?: number, capacity?: number);
    /** Adds a pose; true when the trail changed. */
    push(x: number, y: number): boolean;
    clear(): void;
}
export declare const isGridTopic: (topic: Pick<Topic, "type">) => boolean;
export declare const isCloudTopic: (topic: Pick<Topic, "type">) => boolean;
/** The topics the panel can draw as its base, best first: point clouds (as a top-down heatmap), then occupancy grids. */
export declare function mapCandidates<T extends Topic>(topics: T[]): T[];
/** The picked topic when it's on the bus, else the best candidate ("" picks automatically). */
export declare function chooseMapTopic<T extends Topic>(topics: T[], picked: string): T | null;
/** The occupancy grids (costmaps) the panel can lay over its base, best first. */
export declare const overlayCandidates: <T extends Topic>(topics: T[]) => T[];
/** The overlay grid: the picked one when it's on the bus and isn't the base; "" (the default) is none. */
export declare function chooseOverlay<T extends Topic>(topics: T[], picked: string, base: Topic | null | undefined): T | null;
