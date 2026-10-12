import { rgba, LayerContext, Topic } from './registry.ts';
import { FrameInfo } from '../viewer.ts';
import { poseMatrix } from './pose.tsx';
import * as THREE from "three";
export declare const MARKER_TYPE: {
    ARROW: number;
    CUBE: number;
    SPHERE: number;
    CYLINDER: number;
    LINE_STRIP: number;
    LINE_LIST: number;
    CUBE_LIST: number;
    SPHERE_LIST: number;
    POINTS: number;
    TEXT: number;
    MESH: number;
    TRIANGLES: number;
};
type PointMessage = {
    x: number;
    y: number;
    z: number;
};
type ColorMessage = Parameters<typeof rgba>[0];
/** A decoded visualization_msgs.Marker (the fields the layer reads). */
export interface MarkerMessage {
    header?: {
        frame_id?: string;
    };
    ns?: string;
    id?: number;
    type?: number;
    action?: number;
    pose?: Parameters<typeof poseMatrix>[0];
    scale?: {
        x?: number;
        y?: number;
        z?: number;
    };
    color?: ColorMessage;
    lifetime?: {
        sec?: number;
        nsec?: number;
    };
    points?: PointMessage[];
    colors?: ColorMessage[];
    text?: string;
}
/** A decoded Marker or MarkerArray. */
export interface MarkerMessages extends MarkerMessage {
    markers?: MarkerMessage[];
}
export declare class MarkerLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    context: LayerContext;
    constructor(context: LayerContext, topic: Topic);
    /** The data jumped (a replay's seek): what was kept belongs to another time. */
    reset(): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
export {};
