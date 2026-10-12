import { Store } from '../store.ts';
import { LayerContext, LayerSettingsProps } from './registry.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
export interface TfSettings {
    axesSize: number;
    names: boolean;
    links: boolean;
    maxNames?: number;
    named?: string[];
    maxFrames?: number;
}
export declare const TF_DEFAULTS: Required<TfSettings>;
export declare class TfFramesLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<TfSettings>;
    context: LayerContext;
    constructor(context: LayerContext, settings: Store<TfSettings>);
    update(frame: FrameInfo): void;
    dispose(): void;
}
export type TfSettingsEditorProps = LayerSettingsProps<TfSettings>;
export declare function TfSettingsEditor({ settings }: TfSettingsEditorProps): import('react').JSX.Element;
