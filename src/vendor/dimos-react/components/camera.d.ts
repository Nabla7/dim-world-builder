import { ReactNode } from 'react';
import { DepthImage, DepthLook } from '../camera/depth_types.ts';
import { DataSource, Subscription, Topic } from '../data.ts';
import { Store } from '../three/store.ts';
/**
 * No preset sets maxHz: zenoh-gateway >= 0.5.1 encodes at min(maxHz, the source's rate), and each wants the camera's
 * own rate. playoutDelay is the browser side: how long the receiver may hold frames to play them out evenly.
 */
export interface VideoOptions {
    maxResolution?: [number, number];
    /** 0 drops frames before detail, 1 keeps the rate */
    qualityToHzTradeoff?: number;
    minResolutionScale?: number;
    /** bits per second */
    maxBitrate?: number;
    minQuality?: number;
    /** [min, max] ms the browser may hold frames to play them out evenly */
    playoutDelay?: [number, number];
}
/** a latency ↔ quality preset: gateway subscription options */
export interface VideoPreset {
    id: string;
    label: string;
    about: string;
    options: VideoOptions;
}
export declare const VIDEO_PRESETS: VideoPreset[];
/** A preset by id (old names map to the nearest one; unknown → Balanced). */
export declare const videoPreset: (id: string | null | undefined) => VideoPreset;
/** What `Subscription.update` needs to go from one preset to another: the new values, null for what only `from` set. */
export declare function videoPresetChanges(from: VideoPreset, to: VideoPreset): Record<string, unknown>;
/** Whether options keep the browser in low-latency rendering (playoutDelay min 0, max <= 500 ms; default [0, 0]). */
export declare function lowLatencyRendering(options: VideoOptions): boolean;
/**
 * Whether a change can't be made in place: back to low-latency rendering from a buffered playout. Firefox freezes a
 * receiver for good once its render time drops back to 0, so that takes a fresh subscription (a new receiver).
 */
export declare const needsNewReceiver: (from: VideoOptions, to: VideoOptions) => boolean;
export declare const isImageTopic: (topic: Pick<Topic, "type">) => boolean;
export declare const isDepthTopic: (topic: Pick<Topic, "name">) => boolean;
/** The camera to show first: `preferred` topic names in order, else the first color image, else any image. */
export declare function pickCamera<T extends Topic>(preferred: readonly string[] | null | undefined, topics: readonly T[], exclude?: ReadonlySet<string>): T | null;
/**
 * Panels (`{ key, picked? }`) pointed at what the bus has: a panel's picked topic when it's back, else a panel whose
 * topic isn't on the bus moves to a default camera no other panel shows. Null when nothing changes.
 */
export declare function retargetCameras<P extends {
    key: string;
    picked?: string | null;
}>(panels: readonly P[], topics: readonly Topic[], preferred?: readonly string[] | null): P[] | null;
export interface CameraTab<T extends Topic = Topic> {
    topic: T;
    label: string;
    depth: boolean;
}
/** Every image topic as a tab (`{ topic, label, depth }`), color first then depth, labeled by what tells them apart. */
export declare function cameraTabs<T extends Topic>(topics: readonly T[]): CameraTab<T>[];
/** The CameraInfo topic for an image topic: `overrides[name]`, else the one sharing the longest leading part of the name. */
export declare function cameraInfoFor<T extends Topic>(image: Pick<Topic, "name">, topics: readonly T[], overrides?: Record<string, string>): T | null;
/** a color stream's latest state: a live track (`stream`) or a replay's decoded frame (`image`) */
export interface VideoState {
    stream: MediaStream | null;
    image: ImageBitmap | ImageData | null;
    width: number;
    height: number;
    fps: number;
}
/** one topic's shared subscription (CameraStreams.acquire) */
export interface CameraStreamHandle {
    users: number;
    /** ends the subscription (a source's Subscription once open) */
    stop: (() => void) & Partial<Pick<Subscription, "update">>;
    video: Store<VideoState>;
    depth: Store<{
        image: DepthImage | null;
    }>;
    quality: Store<{
        quality: string;
    }>;
    element: HTMLVideoElement | null;
    ticket: number;
    newest: number;
}
/**
 * The page's camera subscriptions over a data source, shared and counted: `acquire(topic)` → `{ video, depth, quality }`
 * stores (video: `{ stream, width, height, fps }`, depth: `{ image }`), `release(topic)`, `setQuality(topic, id)`
 * (this viewer's preset per topic, in localStorage under `storageKey`), `element(handle)` (a playing <video> for
 * textures). A source that delivers images itself (a replay) sends `{ width, height, encoding, data }` (depth),
 * `{ bitmap | image, width, height }` (color), a frame (`{ kind, width, height, encoding, data }`, jpeg/png/webp or raw
 * pixels), a decoded sensor_msgs.Image / CompressedImage, or the LCM bytes of one: frames are decoded here (newest wins)
 * into `video.image` (an ImageBitmap or ImageData).
 */
export declare class CameraStreams {
    #private;
    storageKey: string;
    source: DataSource;
    constructor(source: DataSource, { storageKey }?: {
        storageKey?: string;
    });
    qualityOf(key: string): string;
    acquire(topic: Topic): CameraStreamHandle;
    /**
     * Another preset for a color topic: saved for this viewer, and the running subscription takes it in place; a
     * gateway that refuses, or a change back to low-latency rendering, gets a fresh subscription instead.
     */
    setQuality(topic: Topic, quality: string): void;
    /** A muted, playing <video> of the stream (not in the document), e.g. for a three.js VideoTexture. */
    element(handle: CameraStreamHandle): HTMLVideoElement;
    release(topic: Topic): void;
}
/** The shared CameraStreams of a data source (what useCameraStreams gives without a provider; the 3D view's too). */
export declare function cameraStreamsFor(source: DataSource): CameraStreams;
export interface CameraStreamsProviderProps {
    streams: CameraStreams;
    children?: ReactNode;
}
/** Makes `streams` (a CameraStreams, e.g. with the app's own storageKey) the one every CameraView below uses. */
export declare function CameraStreamsProvider({ streams, children }: CameraStreamsProviderProps): import('react').JSX.Element;
/** The page's CameraStreams for the current data source (the nearest CameraStreamsProvider's, else one per source). */
export declare function useCameraStreams(): CameraStreams;
/** A topic's stream handle while mounted (null topic: none). */
export declare function useCameraStream(topic: Topic | null | undefined): CameraStreamHandle | null;
/** A color topic's preset as the shared stream has it, and a setter (saved for this viewer). */
export declare function useVideoQuality(topic: Topic | null | undefined): [string, (next: string) => void];
/** what a CameraView reports about its picture */
export interface CameraViewInfo {
    width: number;
    height: number;
    fps: number;
    range: [number, number] | null;
}
export interface CameraViewProps {
    topic: Topic | null;
    /** a 2D detection topic drawn over it */
    overlay?: Pick<Topic, "key" | "type"> | null;
    /** crops to cover instead of letterboxing */
    fill?: boolean;
    /** null near/far = automatic */
    depthLook?: Partial<DepthLook>;
    onInfo?: (info: CameraViewInfo) => void;
    className?: string;
    children?: ReactNode;
}
/**
 * A camera topic's live picture filling its positioned parent. On Desktop's zenoh-gateway a color topic is the
 * gateway's video track (this viewer's latency ↔ quality preset, `useVideoQuality`); a depth topic, or any topic from
 * another source (a replay delivering frames), is drawn by ImageView (depth through a colormap). `overlay`: a 2D
 * detection topic drawn over it; `fill` crops to cover instead of letterboxing; `depthLook` `{ colormap, near, far }`
 * (null near/far = automatic); `onInfo({ width, height, fps, range })`.
 */
export declare function CameraView({ topic, overlay, fill, depthLook, onInfo, className, children, }: CameraViewProps): import('react').JSX.Element;
export interface CameraTabsProps<T extends Topic = Topic> {
    topics: T[];
    /** the shown topic key */
    value: string;
    onChange: (topic: T) => void;
    /** a label for a picked topic that isn't on the bus */
    gone?: string | null;
    className?: string;
}
/**
 * Tabs for the image topics on the bus (a panel header's camera picker). `value`: the shown topic key; `gone`: a
 * label for a picked topic that isn't on the bus.
 */
export declare function CameraTabs<T extends Topic>({ topics, value, onChange, gone, className }: CameraTabsProps<T>): import('react').JSX.Element;
