import { DependencyList, HTMLAttributes, MutableRefObject, ReactNode } from 'react';
import { Viewer, FrameInfo } from './viewer.ts';
import { ViewCubeCorner } from './view_cube.ts';
import { TfTree } from './tf.ts';
import { Store } from './store.ts';
import { RobotPose, LayerContext, LayerStatus, LayerType, Topic } from './layers/registry.ts';
import { CameraStreams } from '../components/camera.tsx';
import { SelectProps } from '../components/controls.tsx';
import { CheckTfInput, TfIssue } from './tf_check.ts';
import { LayerManager } from './layers/manager.ts';
import * as THREE from "three";
export { pointCloud2ToPositions } from './layers/pointcloud.tsx';
export { poseMatrix, poseOf } from './layers/pose.tsx';
export { colorFor } from './layers/path.tsx';
/** Where the robot and the followed frame were found, last frame (a Scene3D's `frameInfo` Store). */
export interface SceneFrameInfo {
    fixedFrame: string;
    robotFound: boolean;
    followFound: boolean;
    following: boolean;
}
/** A Scene3D's camera actions. */
export interface SceneActions {
    recenter(): void;
    topDown(): void;
}
/** A mounted Scene3D, as its layers see it. */
export interface Scene {
    viewer: Viewer;
    tf: TfTree;
    fixedFrame: string;
    source: LayerContext["source"];
    video: CameraStreams;
    robotPose: RobotPose;
    options: LayerContext["options"];
    topics: () => Topic[];
    frameInfo: Store<SceneFrameInfo>;
    actions: SceneActions;
}
/** What useScene gives: a mounted Scene, or (outside a Scene3D, or before its viewer mounts) no viewer yet. */
export type SceneContextValue = Scene | ({
    viewer: null;
    tf: TfTree | null;
    fixedFrame: string;
} & Partial<Omit<Scene, "viewer" | "tf" | "fixedFrame">>);
/** What a custom layer's `create` (useLayer) returns. */
export interface SceneLayer {
    root?: THREE.Object3D;
    update?(frame: FrameInfo): void;
    reset?(): void;
    dispose?(): void;
}
/**
 * The enclosing Scene3D: `{ viewer, tf, fixedFrame, source, video, robotPose, options, frameInfo, actions }` (viewer
 * is null until it has mounted). `frameInfo`: a Store of `{ fixedFrame, robotFound, followFound, following }`;
 * `actions`: `{ recenter(), topDown() }`.
 */
export declare function useScene(): SceneContextValue;
/** The enclosing Scene3D's Viewer (null until mounted). */
export declare function useViewer(): Viewer | null;
/** The enclosing Scene3D's TfTree. */
export declare function useTf(): TfTree | null;
/** The fixed frame the enclosing Scene3D draws in. */
export declare function useFixedFrame(): string;
/** The enclosing Scene3D's camera actions: `{ recenter(), topDown() }`. */
export declare function useSceneActions(): SceneActions | undefined;
/** Calls `callback(frame)` every animation frame of the enclosing scene (frame: { now, dataNow, fixedFrame, camera }). */
export declare function useSceneFrame(callback: (frame: FrameInfo) => void): void;
/** The TF tree's frame names, re-rendered (at most every `throttleMs`) when the tree changes. */
export declare function useTfFrames({ throttleMs, tf: given, }?: {
    throttleMs?: number;
    tf?: TfTree | null;
}): string[];
/**
 * Mounts a custom layer in the enclosing scene: `create({ viewer, tf, ... })` returns
 * `{ root?: THREE.Object3D, update?(frame), reset?(), dispose?() }` (or null). `root` is added to the scene and
 * removed on cleanup, `update` runs every frame, `reset` on a replay's seek. Re-created when `deps` change; returns a
 * ref to the live layer (push new data into it from your own effects instead of re-creating it).
 */
export declare function useLayer<L extends SceneLayer>(create: (scene: Scene) => L | null, deps?: DependencyList): MutableRefObject<L | null>;
/**
 * Sets `object.matrix` to T_fixed_frame and shows it; with no TF path it hides the object. Returns whether it could
 * be placed (and why not, through `onStatus`).
 */
export declare function placeInFixedFrame(viewer: Viewer, tf: TfTree, object: THREE.Object3D, frame: string, fixedFrame: string, onStatus?: (status: LayerStatus) => void): boolean;
/** A click on the scene: the point under it, what it hit, and the click. */
export interface ScenePick {
    point: THREE.Vector3;
    on: string;
    object?: THREE.Object3D;
    event: MouseEvent;
}
export interface Scene3DProps extends HTMLAttributes<HTMLDivElement> {
    fixedFrame?: string;
    followFrame?: string | null;
    follow?: boolean;
    onFollowChange?: (follow: boolean) => void;
    robotFrame?: string | null;
    viewDistance?: number;
    grid?: boolean;
    tf?: TfTree;
    clock?: () => number;
    onPick?: (pick: ScenePick) => void;
    onViewer?: (viewer: Viewer) => void;
    layerOptions?: {
        baseFrame?: string;
        cameraInfo?: Record<string, string>;
    };
    topics?: () => Topic[];
    cameraPosition?: [number, number, number];
    cameraTarget?: [number, number, number];
    near?: number;
    far?: number;
    fov?: number;
    gridSize?: number;
    gridDivisions?: number;
    freeOrbit?: boolean;
    /** a CAD view cube in a corner (default off): true = top right, or the corner */
    viewCube?: boolean | ViewCubeCorner;
}
/**
 * The 3D view. Give it a size (style/className); layers go in `children`, and any DOM children (buttons, stats) are
 * laid over it.
 *   `fixedFrame`: the frame everything is drawn in (default: the TF tree's world-ish root). `followFrame`: a TF frame
 *   the camera follows while `follow` (orbit and zoom keep following; a pan pauses it until resumed). `robotFrame`:
 *   the robot's frame (default `followFrame`): the camera frames it once when it first shows up, and without it in
 *   TF the newest pose from a Pose layer stands in for it. A replay source (memorySource({ clock })) drives the data
 *   clock (fading, staleness, lifetimes) and its seek() resets the layers. `near`, `far`, `fov`, `gridSize`,
 *   `gridDivisions`, `freeOrbit`: the Viewer's options, read once when it mounts. `viewCube`: a CAD view cube in a
 *   corner (click a face / edge / corner to look from there, drag it to orbit); default off.
 */
export declare function Scene3D({ fixedFrame, followFrame, follow, onFollowChange, robotFrame, viewDistance, grid, tf: givenTf, clock, onPick, onViewer, layerOptions, topics, className, style, children, cameraPosition, cameraTarget, near, far, fov, gridSize, gridDivisions, freeOrbit, viewCube, ...rest }: Scene3DProps): import('react').JSX.Element;
/**
 * Feeds the scene's TF tree: every tf2_msgs.TFMessage topic on the bus (or `topics`), and/or `transforms` given as
 * props. A topic named like tf_static is static (exempt from staleness). `transforms`: a decoded TFMessage, an array
 * of TransformStamped, or `[{ parent, child, translation, rotation }]`.
 */
export declare function TfFeed({ topics, transforms, staticTransforms, tf: given }: TfFeedProps): null;
export interface TfFeedProps {
    topics?: string[];
    /** decoded message data (a TFMessage or TransformStamped[]) or plain transforms: any shape of those */
    transforms?: any;
    staticTransforms?: any;
    tf?: TfTree;
}
/** Same as TfFeed (the name the component inventory uses). */
export declare const TfProvider: typeof TfFeed;
export interface LayerProps {
    type: string | LayerType;
    topic?: string | Topic | null;
    settings?: object;
    /** props data handed to the instance's setData: its shape is up to the layer type */
    data?: unknown;
    onStatus?: (status: LayerStatus) => void;
    onPose?: (matrix: THREE.Matrix4) => void;
}
/**
 * One layer of a registered type (layers/registry.js) in the scene: from a topic, or from `data` (types that take
 * props data: pointcloud, pose, path, posearray, labeled-points `[{ label, position, frame, color }]`, boxes3d
 * `[{ center, size, yaw, frame, label, color, fill }]`). `settings` override the type's defaults (live: a change restyles,
 * it doesn't re-create); every type also takes `onTop` (LayerCommonSettings: drawn over everything else).
 */
export declare function Layer({ type, topic, settings, data, onStatus, onPose }: LayerProps): null;
/**
 * Every topic a LayerManager lists, drawn by its layer type while switched on (unsubscribed while off or paused).
 * The manager (panels.js useLayerManager) is shared with a LayersPanel outside the scene.
 */
export declare function TopicLayers({ manager }: {
    manager: LayerManager;
}): null;
/**
 * The TF tree drawn: an axes gizmo per frame (theme --axis-x/y/z), its name, and a line to its parent. A big tree
 * names only `named` frames (and the fixed frame) past `maxNames`.
 */
export declare function TfFrames({ axesSize, names, links, maxNames, named, maxFrames, onTop, onStatus, }: TfFramesProps): import('react').JSX.Element;
export interface TfFramesProps {
    axesSize?: number;
    names?: boolean;
    links?: boolean;
    maxNames?: number;
    named?: string[];
    maxFrames?: number;
    /** drawn over the clouds instead of depth-tested among them (default off; live) */
    onTop?: boolean;
    onStatus?: (status: LayerStatus) => void;
}
export interface PointCloudProps {
    topic?: string;
    points?: Float32Array | number[];
    intensity?: Uint8Array;
    frame?: string;
    mode?: "latest" | "accumulate";
    windowSeconds?: number;
    maxPoints?: number;
    maxHz?: number;
    quality?: number;
    style?: "default" | "voxel" | "splat" | "disc" | "square";
    size?: number;
    colorMode?: "height" | "intensity" | "range" | "solid";
    gradient?: string;
    axis?: 0 | 1 | 2;
    period?: number;
    rangeMin?: number | null;
    rangeMax?: number | null;
    color?: string;
    opacity?: number;
    cubeShade?: string;
    /** drawn over other clouds instead of depth-tested among them (default off; live) */
    onTop?: boolean;
    onStatus?: (status: LayerStatus) => void;
}
/**
 * A point cloud: from a topic (sensor_msgs.PointCloud2 through the gateway's dimos_lcm_pointcloud2 encoding at this
 * viewer's bandwidth preset, or any source publishing `{ positions, intensity?, frame? }` or a decoded PointCloud2) or
 * from `points` props. `color`: the solid color (CSS or a token like "var(--primary)"; colorMode "solid"); `maxHz` /
 * `quality` pin the subscription instead of the viewer's preset.
 */
export declare function PointCloud({ topic, points, intensity, frame, mode, windowSeconds, maxPoints, maxHz, quality, style, size, colorMode, gradient, period, axis, rangeMin, rangeMax, color, opacity, cubeShade, onTop, onStatus, }: PointCloudProps): import('react').JSX.Element;
export interface PathProps {
    topic?: string;
    /** decoded geometry_msgs poses (PoseStamped or Pose), any of those shapes */
    poses?: any[];
    frame?: string;
    color?: string;
    width?: number;
    lift?: number;
    /** drawn over the clouds instead of depth-tested among them (default off; live) */
    onTop?: boolean;
    onStatus?: (status: LayerStatus) => void;
}
/** A path as a thick line: a nav_msgs.Path topic, or `poses` (+ `frame`) as props. `color`: CSS or token (default var(--primary)). */
export declare function Path({ topic, poses, frame, color, width, lift, onTop, onStatus, }: PathProps): import('react').JSX.Element;
export interface PoseProps {
    topic?: string;
    /** a decoded pose (Pose, PoseStamped, Odometry, ...): any of those shapes */
    pose?: any;
    frame?: string;
    axesSize?: number;
    trail?: boolean;
    trailLength?: number;
    jumpMeters?: number;
    color?: string;
    width?: number;
    /** axes, trail and route drawn over the clouds instead of depth-tested among them (default off; live) */
    onTop?: boolean;
    route?: boolean;
    onPose?: (matrix: THREE.Matrix4) => void;
    onStatus?: (status: LayerStatus) => void;
}
/**
 * A pose as axes (theme axis colors), with an optional trail of where it has been (kept in the fixed frame; a jump
 * leaves a gap) and, when the source knows it (a recording), the whole route faint ahead. From a topic
 * (nav_msgs.Odometry, geometry_msgs.PoseStamped / PoseWithCovarianceStamped) or `pose` (+ `frame`) as props.
 * `onPose`: the pose in the fixed frame.
 */
export declare function Pose({ topic, pose, frame, axesSize, trail, trailLength, jumpMeters, color, width, onTop, route, onPose, onStatus, }: PoseProps): import('react').JSX.Element;
export interface PoseArrayProps {
    topic?: string;
    /** decoded geometry_msgs poses, any of those shapes */
    poses?: any[];
    frame?: string;
    color?: string;
    length?: number;
    width?: number;
    /** drawn over the clouds instead of depth-tested among them (default off; live) */
    onTop?: boolean;
    onStatus?: (status: LayerStatus) => void;
}
/** Many poses as arrows: a geometry_msgs.PoseArray topic, or `poses` (+ `frame`) as props. */
export declare function PoseArray({ topic, poses, frame, color, length, width, onTop, onStatus, }: PoseArrayProps): import('react').JSX.Element;
export interface RobotModelProps {
    kind?: string;
    frame?: string;
    /** a decoded pose, any of the shapes poseMatrix takes */
    pose?: any;
    poseFrame?: string;
    scale?: number;
    visible?: boolean;
    colors?: {
        body?: string;
        dark?: string;
        nose?: string;
    };
}
/**
 * A stand-in robot model (ROBOT_KINDS: dog, humanoid, wheeled, drone, arrow) at a TF frame (`frame`, default the
 * scene's robotFrame, else base_link) or at `pose` (in `poseFrame`). Without its frame in TF it stands at the newest
 * pose a Pose layer reported. Colors follow the theme unless `colors` says otherwise.
 */
export declare function RobotModel({ kind, frame, pose, poseFrame, scale, visible, colors, }: RobotModelProps): null;
export interface FrameHighlightProps {
    frame: string | null;
    onPlaced?: (placed: boolean) => void;
}
/**
 * One TF frame picked out (e.g. a TF panel's hovered row): big axes drawn over everything with a halo and its name,
 * following the frame as it moves. `onPlaced(placed)` says whether it could be placed in the fixed frame.
 */
export declare function FrameHighlight({ frame, onPlaced }: FrameHighlightProps): null;
type TfLayerFrames = NonNullable<CheckTfInput["layers"]>;
export interface UseTfIssuesOptions {
    layers?: TfLayerFrames | (() => TfLayerFrames);
    tf?: TfTree | null;
    fixedFrame?: string;
    intervalMs?: number;
}
/**
 * What's wrong with the scene's TF tree (tf_check.js), checked every `intervalMs`; a problem shows once two checks in a
 * row see it. `layers`: the drawn layers' frames (a LayerManager's layerFrames()).
 */
export declare function useTfIssues({ layers, tf: given, fixedFrame: givenFixed, intervalMs, }?: UseTfIssuesOptions): TfIssue[];
export interface FramePickerProps extends Omit<Partial<SelectProps>, "value" | "onChange" | "options"> {
    value?: string | null;
    onChange: (frame: string | null) => void;
    tf?: TfTree;
    /** an extra "none" option (null) */
    noneLabel?: string | null;
    placeholder?: string;
}
/** A Select of the scene's TF frames (inside a Scene3D, or pass `tf`). `noneLabel`: an extra "none" option (null). */
export declare function FramePicker({ value, onChange, tf, noneLabel, placeholder, ...rest }: FramePickerProps): import('react').JSX.Element;
export interface SceneStatsProps {
    className?: string;
    detailed?: boolean;
    rttMs?: number | null;
}
/**
 * The scene's render numbers as a small overlay: fps · points · frame ms · latency, or with `detailed` the full set
 * (CPU per frame, latency p50/p95, arrival→frame, `rttMs` if given, points, draw calls).
 */
export declare function SceneStats({ className, detailed, rttMs }: SceneStatsProps): import('react').JSX.Element;
export interface SceneControlsProps {
    className?: string;
    children?: ReactNode;
    frameAll?: boolean;
    onFrameAll?: () => void;
    onTopDown?: () => void;
    position?: "bottom-right" | "top-right" | "top-left" | "bottom-left";
}
/**
 * Camera buttons over the scene: follow (reframes the followed frame, or follows again after a pan), top-down (on the
 * area around the robot), frame everything. `children`: extra buttons.
 * `onFrameAll` / `onTopDown` replace what those buttons do (an app's own idea of "everything"); `position`:
 * "bottom-right" (default) | "top-right" | "top-left" | "bottom-left".
 */
export declare function SceneControls({ className, children, frameAll, onFrameAll, onTopDown, position, }: SceneControlsProps): import('react').JSX.Element;
export interface KeyboardFlyProps {
    speed?: number;
    lookSpeed?: number;
    enabled?: boolean;
}
/**
 * Keyboard flying for the enclosing scene, beside the mouse orbit: W/S forward/back and A/D left/right over the ground,
 * Q/E down/up, I/K look up/down and J/L look left/right (the camera stays put, the orbit target swings around it).
 * `speed` (m/s), `lookSpeed` (rad/s). Keys typed into inputs, and chords with ⌘/Ctrl/Alt, are ignored.
 */
export declare function KeyboardFly({ speed, lookSpeed, enabled }: KeyboardFlyProps): null;
