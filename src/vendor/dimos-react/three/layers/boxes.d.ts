import { Store } from '../store.ts';
import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { FrameInfo } from '../viewer.ts';
import { poseMatrix } from './pose.tsx';
import * as THREE from "three";
export interface BoxSettings {
    width: number;
    labels: boolean;
}
type Vector3Message = {
    x?: number;
    y?: number;
    z?: number;
};
type PoseMessage = Parameters<typeof poseMatrix>[0];
interface BoundingBox3DMessage {
    center?: PoseMessage;
    size?: Vector3Message;
}
interface ObjectHypothesisMessage {
    hypothesis?: {
        class_id?: string;
        score?: number;
    };
}
interface Detection3DMessage {
    id?: string;
    bbox?: BoundingBox3DMessage;
    results?: ObjectHypothesisMessage[];
}
/** A decoded Detection3DArray, Detection3D or BoundingBox3DArray (the fields the layer reads). */
export interface Detection3DMessages extends Detection3DMessage {
    header?: {
        frame_id?: string;
    };
    detections?: Detection3DMessage[];
    boxes?: BoundingBox3DMessage[];
}
/** One box in a detection message. */
export interface DetectedBox {
    pose: PoseMessage | undefined;
    size: Vector3Message | undefined;
    label: string;
    className: string;
}
/** A box from props: `color` any CSS color or token, `fill` the opacity of a translucent fill (0 = edges only). */
export interface BoxData {
    center?: [number, number, number];
    size?: [number, number, number];
    yaw?: number;
    frame?: string;
    label?: string;
    color?: string;
    fill?: number;
}
/** The boxes in a detection message: `{ pose, size, label, className }` each. */
export declare function boxesOf(type: string, message: Detection3DMessages): DetectedBox[];
export declare class BoxLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<BoxSettings>;
    context: LayerContext;
    constructor(context: LayerContext, topic: Topic | null, settings: Store<BoxSettings>);
    /**
     * Boxes from props (no topic): `[{ center: [x, y, z], size: [x, y, z], yaw, frame, label, color, fill }]`; `color`
     * any CSS color or token, `fill` the opacity of a translucent fill (0 = edges only).
     */
    setData(data: unknown): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
export type BoxSettingsEditorProps = LayerSettingsProps<BoxSettings>;
export declare function BoxSettingsEditor({ settings }: BoxSettingsEditorProps): import('react').JSX.Element;
export {};
