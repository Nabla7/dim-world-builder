import { Store } from '../store.ts';
import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { FrameInfo } from '../viewer.ts';
import { poseMatrix } from './pose.tsx';
import * as THREE from "three";
export interface GridSettings {
    opacity: number;
    style: "costmap" | "map";
    lift: number;
}
/** A decoded nav_msgs.OccupancyGrid (the fields the layer reads); `data` is int8 cells, -1 = unknown. */
export interface OccupancyGridMessage {
    header?: {
        frame_id?: string;
    };
    info?: {
        width: number;
        height: number;
        resolution: number;
        origin?: Parameters<typeof poseMatrix>[0];
    };
    data?: ArrayBufferView & ArrayLike<number>;
}
export declare class GridLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<GridSettings>;
    context: LayerContext;
    constructor(context: LayerContext, topic: Topic, settings: Store<GridSettings>);
    update(frame: FrameInfo): void;
    dispose(): void;
}
export type GridSettingsEditorProps = LayerSettingsProps<GridSettings>;
export declare function GridSettingsEditor({ settings }: GridSettingsEditorProps): import('react').JSX.Element;
