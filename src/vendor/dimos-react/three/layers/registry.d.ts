import { ComponentType } from 'react';
import { DataSource, Message, Topic } from '../../data.ts';
import { CameraStreams } from '../../components/camera.tsx';
import { Store } from '../store.ts';
import { TfTree } from '../tf.ts';
import { FrameInfo, Viewer } from '../viewer.ts';
import * as THREE from "three";
export type { Topic };
/** `info`: short live info ("84k pts · 10 Hz"); `problem`: why it isn't drawn as expected; `frame`: its data's frame_id */
export interface LayerStatus {
    info?: string;
    problem?: string | null;
    frame?: string;
}
export interface LayerContext {
    viewer: Viewer;
    tf: TfTree;
    source: DataSource;
    video: CameraStreams;
    topics: () => Topic[];
    setStatus: (status: LayerStatus) => void;
    robotPose: RobotPose;
    options: {
        baseFrame?: string;
        cameraInfo?: Record<string, string>;
    };
    /** a pose layer's pose, placed in the fixed frame (a <Layer>'s onPose) */
    onPose?: (matrix: THREE.Matrix4) => void;
}
export interface LayerInstance {
    root: THREE.Object3D;
    update?: (frame: FrameInfo) => void;
    dispose: () => void;
    reset?: () => void;
    /** props data (a <Layer data>): its shape is up to the layer type */
    setData?: (data: any) => void;
}
export interface LayerSettingsProps<S extends object> {
    settings: Store<S>;
    topic?: Topic | null;
}
/** `S`: the type's per-topic settings (any by default: a registry holds every type's). */
export interface LayerType<S extends object = any> {
    id: string;
    label: string;
    types: string[];
    defaults: S | ((topic: Topic | null) => S);
    enabledByDefault?: (topic: Topic) => boolean;
    /** `topic` null: the data comes through `setData` */
    create: (context: LayerContext, topic: Topic | null, settings: Store<S>) => LayerInstance;
    Settings?: ComponentType<LayerSettingsProps<S>>;
}
export interface OverlayType {
    id: string;
    label: string;
    types: string[];
    /** `message`: the decoded message, any shape */
    draw: (context: CanvasRenderingContext2D, message: any, image: {
        width: number;
        height: number;
    }) => void;
}
/**
 * Settings every layer type takes, beside its own. `onTop`: drawn over everything else (Viewer.setOnTop), instead of
 * depth-tested among the clouds (the default); the Layers panel shows it as each layer's "Draw on top".
 */
export interface LayerCommonSettings {
    onTop?: boolean;
}
/** Keeps `root` on top while `settings.onTop` says so; the returned function stops (and puts it back in the scene). */
export declare function followOnTop(viewer: Viewer, root: THREE.Object3D, settings: Store<LayerCommonSettings>): () => void;
/** Registers a layer type (replacing one with the same id). */
export declare function registerLayer<S extends object>(type: LayerType<S>): void;
/** The layer type drawing a message type (the latest registration wins), or undefined. */
export declare function layerTypeFor(messageType: string): LayerType | undefined;
/** A layer type by id. */
export declare const layerTypeById: (id: string) => LayerType | undefined;
export declare function allLayerTypes(): readonly LayerType[];
/** A type's default settings for a topic (a fresh copy). */
export declare function defaultSettings<S extends object>(type: LayerType<S>, topic: Topic | null): S;
/** Registers a 2D overlay drawn over camera images (e.g. Detection2DArray boxes). */
export declare function registerOverlay(type: OverlayType): void;
export declare function overlayTypeFor(messageType: string): OverlayType | undefined;
export declare function allOverlayTypes(): readonly OverlayType[];
/**
 * Sets `object.matrix` to T_fixed_frame and shows it; with no TF path it hides it and reports why. Returns whether
 * it could be placed.
 */
export declare function placeLayer(context: LayerContext, object: THREE.Object3D, frame: string, fixedFrame: string): boolean;
/**
 * Subscribes to a topic and hands each decoded message (and its timestamp) to `onMessage`; decode failures are
 * counted into the layer's status. Returns unsubscribe.
 */
export declare function subscribeDecoded(context: LayerContext, topic: Topic, options: {
    maxHz?: number;
    reliable?: boolean;
    decodeAs?: string;
}, onMessage: (decoded: any, timestamp: number | undefined, message: Message) => void): () => void;
/** std_msgs ColorRGBA (any field may be missing) */
export interface ColorRGBA {
    r?: number;
    g?: number;
    b?: number;
    a?: number;
}
/** std_msgs ColorRGBA → THREE.Color + alpha. */
export declare function rgba(color: ColorRGBA | null | undefined): {
    color: THREE.Color;
    alpha: number;
};
/**
 * The robot's latest pose in the fixed frame from any pose/odometry layer, for following it when no TF frame names
 * the robot. The first topic to report keeps it until it goes away. One per Scene3D.
 */
export declare class RobotPose {
    matrix: THREE.Matrix4 | null;
    /** who reported it: a topic key, or the layer itself when it has no topic */
    source: unknown;
    report(source: unknown, matrix: THREE.Matrix4): void;
    forget(source: unknown): void;
}
