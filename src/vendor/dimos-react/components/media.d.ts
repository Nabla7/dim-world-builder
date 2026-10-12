import { ComponentProps, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Menu } from './nav.tsx';
export declare const DEPTH_COLORMAPS: string[];
/** Raw depth units → meters: 32FC1 is meters, 16UC1 (and mono16) millimetres. */
export declare const depthScale: (encoding: string) => number;
/** raw pixels: an image or a depth image */
export interface RawFrame {
    kind: "image" | "depth";
    width: number;
    height: number;
    encoding: string;
    /** bytes per row (0 / missing: packed) */
    step?: number;
    data: Uint8Array;
    frame?: string;
}
/** a jpeg / png / webp image */
export interface EncodedFrame {
    kind: "encoded";
    format: string;
    data: Uint8Array<ArrayBuffer>;
    frame?: string;
}
export type NormalizedFrame = RawFrame | EncodedFrame;
/** what an ImageView reports about what it shows */
export interface ImageInfo {
    width: number;
    height: number;
    fps: number;
    /** "full", or the gateway's quality score for a degraded frame */
    quality: string | number;
    depth: boolean;
    range: [number, number] | null;
}
/**
 * A frame (whatever form it arrives in) → `{ kind: "image" | "depth", width, height, encoding, data }`, or an
 * `{ kind: "encoded", format, data }` for jpeg/png/webp. Takes a pre-decoded frame (a replay's), a decoded
 * sensor_msgs.Image or sensor_msgs.CompressedImage.
 */
export declare function normalizeFrame(value: any): NormalizedFrame | null;
/** Raw pixels → RGBA ImageData (null for an encoding it can't read). */
export declare function rawToImageData(frame: RawFrame): ImageData | null;
/**
 * A depth frame → colormapped ImageData (near = the ramp's end, far = its start; no return = transparent), and the
 * range it used: `near`/`far` in meters, or null for automatic (2nd–98th percentile, eased by `previous`).
 */
export declare function colorizeDepth(frame: RawFrame, { colormap, near, far, previous, }?: {
    colormap?: string;
    near?: number | null;
    far?: number | null;
    previous?: [number, number] | null;
}): {
    image: ImageData;
    range: [number, number];
};
/** vision_msgs.Detection2DArray / Detection2D / BoundingBox2DArray drawn over an image (pixel coordinates). */
export declare function drawDetections2D(context: CanvasRenderingContext2D, message: any): void;
/** Message types an ImageView can draw over its image. */
export declare const IMAGE_OVERLAY_TYPES: string[];
export interface ImageViewProps extends HTMLAttributes<HTMLDivElement> {
    topic?: string | null;
    /** a frame to show instead of a topic's (any form normalizeFrame takes) */
    frame?: unknown;
    /** the subscription encoding a source may deliver frames in (e.g. a replay's "dimos_lcm_image") */
    encoding?: string;
    maxHz?: number;
    /** force depth (default: by encoding) */
    depth?: boolean;
    colormap?: string;
    near?: number | null;
    far?: number | null;
    fit?: "contain" | "cover";
    overlayTopic?: string | null;
    onInfo?: (info: ImageInfo) => void;
    className?: string;
    style?: CSSProperties;
    /** laid over the image */
    children?: ReactNode;
}
/**
 * A camera / image view: the latest frame of an image topic (sensor_msgs.Image, CompressedImage, or a source's
 * pre-decoded frames), or `frame` as a prop. Depth images (16UC1 / 32FC1) are drawn through a colormap.
 */
export declare function ImageView({ topic, frame, encoding, maxHz, depth, colormap, near, far, fit, overlayTopic, onInfo, className, style, children, ...rest }: ImageViewProps): import('react').JSX.Element;
/** 83.4 → "1:23.4"; over an hour "1:02:03". */
export declare function playbackClock(seconds: number): string;
/** One lane's ticks: exact `times`, or `counts` per slice of the shown window (denser = stronger). */
/** a lane's ticks: exact message `times`, or `counts` per slice of the shown window */
export interface LaneTickData {
    times?: number[];
    counts?: number[];
}
/** the shown window of a recording's time axis (s) */
export interface PlaybackView {
    from: number;
    to: number;
}
/** a PlaybackBar row: one stream */
export interface PlaybackLane {
    id: string;
    label: ReactNode;
    title?: string;
    meta?: ReactNode;
    count?: ReactNode;
    leading?: ReactNode;
    menu?: ComponentProps<typeof Menu>["items"];
    active?: boolean;
    busy?: boolean;
    ticks?: LaneTickData | null;
}
/** PlaybackBar's props; times in seconds */
export interface PlaybackBarProps extends HTMLAttributes<HTMLElement> {
    start: number;
    end: number;
    value: number;
    playing?: boolean;
    onPlayPause?: (playing: boolean) => void;
    onSeek?: (t: number) => void;
    onScrubStart?: () => void;
    onScrubEnd?: () => void;
    scrubbing?: boolean;
    speed?: number;
    speeds?: number[];
    onSpeedChange?: (speed: number) => void;
    loop?: boolean;
    onLoopChange?: (loop: boolean) => void;
    format?: (t: number) => string;
    lanes?: PlaybackLane[];
    lanesLabel?: string;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    view?: PlaybackView;
    onViewChange?: (view: PlaybackView) => void;
    /** space plays / pauses, ← / → step 1 s (shift 10 s), Home / End, page-wide (not while typing) */
    keyboard?: boolean;
    /** extra elements after the built-in ones */
    controls?: ReactNode;
    className?: string;
    style?: CSSProperties;
}
/**
 * A recording player's bar: play / pause, the time, speed, loop, a scrubber that zooms (ctrl/⌘ + wheel; any wheel
 * over the lanes) and pans (horizontal scroll), and, expanded, a lane per stream with a tick per message on the same
 * axis. Dragging anywhere on the axis scrubs: `onScrubStart`, `onSeek(t)` per move, `onScrubEnd`.
 */
export declare function PlaybackBar({ start, end, value, playing, onPlayPause, onSeek, onScrubStart, onScrubEnd, scrubbing, speed, speeds, onSpeedChange, loop, onLoopChange, format, lanes, lanesLabel, expanded, onExpandedChange, view: givenView, onViewChange, keyboard, controls, className, style, ...rest }: PlaybackBarProps): import('react').JSX.Element;
