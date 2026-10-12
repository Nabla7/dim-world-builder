import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { Store } from '../store.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
export interface ArrowSettings {
    length: number;
    color: string;
    width?: number;
}
export declare class PoseArrayLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<ArrowSettings>;
    context: LayerContext;
    /** `topic` null: data comes through setData */
    constructor(context: LayerContext, topic: Topic | null, settings: Store<ArrowSettings>);
    /** Props data: `{ poses, frame?, timestamp? }` or the poses themselves (any shape). */
    setData(data: any): void;
    update(frame: FrameInfo): void;
    dispose(): void;
}
export declare function ArrowSettingsEditor({ settings }: LayerSettingsProps<ArrowSettings>): import('react').JSX.Element;
