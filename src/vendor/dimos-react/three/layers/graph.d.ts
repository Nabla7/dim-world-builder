import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { Store } from '../store.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
export interface GraphSettings {
    width: number;
    nodes: boolean;
    nodeSize: number;
    gradient: string;
}
export declare class GraphLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<GraphSettings>;
    context: LayerContext;
    /** `topic` null (a <Layer> given `data`): nothing to draw, this type has no setData */
    constructor(context: LayerContext, topic: Topic | null, settings: Store<GraphSettings>);
    update(frame: FrameInfo): void;
    dispose(): void;
}
export declare function GraphSettingsEditor({ settings }: LayerSettingsProps<GraphSettings>): import('react').JSX.Element;
