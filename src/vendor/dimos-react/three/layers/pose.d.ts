import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { Store } from '../store.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
/**
 * `trailLength`: most trail segments kept; `jumpMeters`: a longer step is a teleport (no segment); `onTop`: drawn
 * over everything; `route`: the whole recorded route, faint (when the source knows it); `color`: CSS or a token
 */
export interface PoseSettings {
    trail: boolean;
    trailLength: number;
    jumpMeters: number;
    color: string;
    width: number;
    axesSize: number;
    route: boolean;
}
/** A geometry_msgs Pose (`{ position, orientation }`, any field may be missing) or a `{ x, y, z, yaw }` shorthand. */
export interface PoseLike {
    position?: {
        x?: number;
        y?: number;
        z?: number;
    };
    orientation?: {
        x?: number;
        y?: number;
        z?: number;
        w?: number;
    };
    x?: number;
    y?: number;
    z?: number;
    yaw?: number;
    isMatrix4?: undefined;
}
export declare const POSE_DEFAULTS: PoseSettings;
/** A geometry_msgs Pose ({ position, orientation }), a `{ x, y, z, yaw }` shorthand or a Matrix4, as a Matrix4. */
export declare function poseMatrix(pose: PoseLike | THREE.Matrix4 | null | undefined, out?: THREE.Matrix4): THREE.Matrix4;
/** The pose inside a decoded message (any shape): Odometry / PoseWithCovarianceStamped (.pose.pose), PoseStamped (.pose), Pose. */
export declare function poseOf(message: any): PoseLike | THREE.Matrix4 | null | undefined;
export declare class PoseLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<PoseSettings>;
    topic: Topic | null;
    context: LayerContext;
    /** `topic` null: poses come through setData */
    constructor(context: LayerContext, topic: Topic | null, settings: Store<PoseSettings>);
    /** The data jumped (a seek): the trail becomes the recorded route up to the playhead (or starts over). */
    reset(): void;
    /** Props data: `{ pose, frame?, timestamp? }` (pose: geometry_msgs Pose, `{ x, y, yaw }` or a Matrix4). */
    setData(data: {
        pose?: PoseLike | THREE.Matrix4;
        frame?: string;
        timestamp?: number;
    } | null | undefined): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
export interface ColorSettingProps {
    /** CSS or a token like var(--primary) */
    value: string;
    onChange?: (color: string) => void;
}
/** A color setting: a swatch for hex colors (a token like var(--primary) shows as its current color). */
export declare function ColorSetting({ value, onChange }: ColorSettingProps): import('react').JSX.Element;
export declare function PoseSettingsEditor({ settings }: LayerSettingsProps<PoseSettings>): import('react').JSX.Element;
