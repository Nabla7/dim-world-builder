import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Store } from './store.ts';
import * as THREE from "three";
export interface RenderStats {
    fps: number;
    frameMs: number;
    latencyP50: number | null;
    latencyP95: number | null;
    arrivalToFrameMs: number | null;
    drawCalls: number;
    points: number;
}
/** `now`: performance.now() of the frame; `dataNow`: the data clock (a replay's playhead, else performance.now()) */
export interface FrameInfo {
    now: number;
    dataNow: number;
    fixedFrame: string;
    camera: THREE.PerspectiveCamera;
}
export interface ViewerOptions {
    clock?: () => number;
    grid?: boolean;
    antialias?: boolean;
    near?: number;
    far?: number;
    fov?: number;
    gridSize?: number;
    gridDivisions?: number;
    freeOrbit?: boolean;
}
export interface PickResult {
    point: THREE.Vector3;
    on: "points" | "mesh" | "ground";
    object?: THREE.Object3D;
}
/**
 * `direction` as a unit vector no further than `maxPolar` from +z (the orbit's limit): one below it keeps its heading
 * and sits on the limit (straight down: from the front, -y). Null for a zero or non-finite direction.
 */
export declare function limitPolar(direction: THREE.Vector3, maxPolar: number): THREE.Vector3 | null;
export declare class Viewer {
    #private;
    renderer: THREE.WebGLRenderer;
    labels: CSS2DRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    stats: Store<RenderStats>;
    /** world units → pixels at 1 m depth; point shaders size by it */
    pixelsPerMeter: {
        value: number;
    };
    /** view size in CSS pixels; thick-line materials share it */
    resolution: THREE.Vector2;
    fixedFrame: string;
    /** where the camera follows (a point in the fixed frame); the React layer sets it each frame from followFrame */
    followTarget: THREE.Vector3 | null;
    /** a hidden view (display: none, a collapsed pane) draws nothing; what changed meanwhile is drawn once unpaused */
    paused: boolean;
    /** following stopped because the user panned away; `resumeFollow()` ends it */
    followPaused: Store<{
        paused: boolean;
    }>;
    /**
     * The clock things age by (ms): point-cloud windows, marker lifetimes, rates. performance.now() live; a replay's
     * playhead (Scene3D sets it from a replay source), so a paused replay doesn't age.
     */
    dataClock: () => number;
    /**
     * @param host the element the canvas fills (give it a size; it is watched for resizes)
     * @param options `clock`: the clock message
     *   timestamps are in (ms, for latency; default Date.now). `near` / `far` / `fov`: the camera (defaults 0.05 m,
     *   10 km, 60°; a small model like a URDF wants near ≈ 0.001). `gridSize` (m) / `gridDivisions`: the ground grid
     *   (default 200 m in 1 m cells). `freeOrbit`: the camera may orbit below the ground (default: it stays above).
     */
    constructor(host: HTMLElement, { clock, grid, antialias, near, far, fov, gridSize, gridDivisions, freeOrbit, }?: ViewerOptions);
    /** Re-reads the theme: grid, fog and splat background (the background itself is CSS behind the canvas). */
    setTheme(): void;
    /** Shows or hides the ground grid. */
    setGrid(visible: boolean): void;
    /**
     * The view as an image, now: runs the frame listeners, renders and reads the canvas in the same task (no
     * preserveDrawingBuffer needed). Returns a data URL (`type` default image/png).
     */
    capture(type?: string): string;
    /**
     * Draws `object` (and everything under it, children added later too) over the rest of the scene: in a second pass
     * after the depth buffer is cleared, so clouds and voxels never hide it (it still depth-tests against itself and
     * other on-top objects). Off (the default for every object): drawn in the scene, hidden by whatever is in front.
     */
    setOnTop(object: THREE.Object3D, on: boolean): void;
    /** Draw on the next frame. */
    requestRender(): void;
    /** Layers call this when a message changed what's drawn; the next frame draws it and times it. */
    noteData(timestampMs?: number): void;
    /** `listener()` when the data jumped (a replay's seek): layers drop what they gathered over time. */
    onReset(listener: () => void): () => void;
    /** Tells every layer the data jumped (Scene3D calls it on the source's seek). */
    reset(): void;
    /**
     * `listener(frame)` every animation frame, before rendering. Returns unsubscribe.
     */
    onFrame(listener: (frame: FrameInfo) => void): () => void;
    /**
     * The point in the scene (the fixed frame) under a screen point (client px): the nearest drawn cloud point within
     * a few pixels of the ray or the nearest mesh hit, else where the ray meets the ground (z = 0). Null on a miss.
     */
    pick(clientX: number, clientY: number): PickResult | null;
    /** Looks at `target` from the current direction, `distance` away (from straight above: the default 3/4 view). */
    frame(target: THREE.Vector3, distance: number): void;
    /** Frames everything drawn (dataBounds); false when nothing is drawn. */
    frameAll(): boolean;
    /**
     * Straight down on the area around `center` (the drawn data within 15 m of it, 12-30 m across), or without one on
     * everything drawn (or the origin).
     */
    topDownAround(center?: THREE.Vector3 | null): void;
    /** Straight down onto `target` from high enough that `extent` meters fit the shorter side of the view. */
    topDown(target: THREE.Vector3, extent: number): void;
    /**
     * Orbits around the current target to look from `direction` (target → camera; need not be unit), keeping the
     * distance: a view cube's Top / Front / corner views. Glides there (`ms`, default 450; instant with
     * `animate: false` or prefers-reduced-motion). Without freeOrbit, directions below the horizon stop at it.
     */
    viewFrom(direction: THREE.Vector3, { animate, ms }?: {
        animate?: boolean;
        ms?: number;
    }): void;
    /** Stops following until `resumeFollow()`: the camera stays where it is. */
    pauseFollow(): void;
    /** Follows again: the followed point glides back to the middle, angle and zoom kept. */
    resumeFollow(): void;
    /**
     * Where the drawn data is (point clouds and meshes, not the grid or helpers): the 2nd-98th percentile box of a
     * sample of their points. Null when nothing is drawn.
     */
    dataBounds(): THREE.Box3 | null;
    /** Stops the loop and frees the GPU context and DOM. */
    dispose(): void;
}
