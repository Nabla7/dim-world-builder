import { CloudQuality } from '../cloud_quality.ts';
import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { SelectProps } from '../../components/controls.tsx';
import { EditablePointLook } from '../look_editor.tsx';
import { Store } from '../store.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
/**
 * "latest": only the newest scan, moved by TF every frame; "accumulate": scans stay where they were seen;
 * `maxHz` / `quality` pin the subscription (else this viewer's preset); `frame` overrides the data's frame_id
 */
export interface CloudSettings {
    look: EditablePointLook;
    mode: "latest" | "accumulate";
    windowSeconds: number;
    maxPoints: number;
    maxHz?: number;
    quality?: number;
    frame?: string;
}
/** A cloud's points: xyz triples (in `frame`) and optional 0..255 intensity. */
export interface CloudPoints {
    positions: Float32Array;
    intensity?: ArrayLike<number>;
    frame?: string;
}
/** A decoded sensor_msgs.PointCloud2 (the fields this reads). */
export interface PointCloud2 {
    header?: {
        frame_id?: string;
    };
    fields?: {
        name: string;
        offset: number;
        datatype: number;
    }[];
    width?: number;
    height?: number;
    point_step?: number;
    is_bigendian?: boolean;
    data?: Uint8Array;
}
export declare const CLOUD_DEFAULTS: CloudSettings;
/** A map-like cloud by name (drawn with bigger points). */
export declare const isMapTopic: (topic: Topic | null | undefined) => boolean;
/**
 * sensor_msgs.PointCloud2 (decoded) → `{ positions: Float32Array, intensity?: Uint8Array, frame }`: reads the x/y/z
 * float32 fields (and intensity, scaled to 0..255) at their offsets; NaN points are skipped.
 */
export declare function pointCloud2ToPositions(cloud: PointCloud2): CloudPoints & {
    frame: string;
};
export declare class CloudLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<CloudSettings>;
    topic: Topic | null;
    context: LayerContext;
    /** `topic` null: data comes through setData */
    constructor(context: LayerContext, topic: Topic | null, settings: Store<CloudSettings>);
    /** The cloud's frame (an app-given frame wins over the data's). */
    setFrame(frame: string, override?: boolean): void;
    /** Props data: `{ positions | points, intensity?, frame?, timestamp? }` or a decoded PointCloud2 (any shape). */
    setData(data: any): void;
    /** One scan: xyz triples (in the cloud's frame) and optional 0..255 intensity. */
    onCloud(positions: ArrayLike<number>, intensity: ArrayLike<number> | undefined, timestamp: number | undefined): void;
    /** The data jumped (a replay's seek): an accumulated map starts over. */
    reset(): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
export interface CloudQualitySelectProps extends Omit<SelectProps<CloudQuality>, "value" | "options" | "onChange"> {
    topicKey: string;
}
/** This viewer's bandwidth preset for a cloud topic (shared by every place that shows it). */
export declare function CloudQualitySelect({ topicKey, ...rest }: CloudQualitySelectProps): import('react').JSX.Element;
/** A point-cloud layer's settings: its look, keep mode and window, and this viewer's bandwidth preset. */
export declare function CloudSettingsEditor({ settings, topic }: LayerSettingsProps<CloudSettings>): import('react').JSX.Element;
