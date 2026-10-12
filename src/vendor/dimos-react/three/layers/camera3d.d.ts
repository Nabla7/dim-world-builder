import { Store } from '../store.ts';
import { DepthLook } from '../../camera/depth.ts';
import { LayerContext, LayerSettingsProps, Topic } from './registry.ts';
import { FrameInfo } from '../viewer.ts';
import * as THREE from "three";
/**
 * `distance`: meters from the camera to the picture; `convention` "optical": z forward, x right, y down (ROS
 * *_optical_frame), "body": x forward, y left, z up
 */
export interface Camera3dSettings {
    distance: number;
    opacity: number;
    image: boolean;
    frustum: boolean;
    convention: "auto" | "optical" | "body";
    depth: DepthLook;
}
export declare const DEFAULT_DEPTH_LOOK: DepthLook;
export declare class Camera3dLayer {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    settings: Store<Camera3dSettings>;
    topic: Topic;
    context: LayerContext;
    constructor(context: LayerContext, topic: Topic, settings: Store<Camera3dSettings>);
    update(frame: FrameInfo): void;
    dispose(): void;
}
export type Camera3dSettingsEditorProps = LayerSettingsProps<Camera3dSettings>;
export declare function Camera3dSettingsEditor({ settings, topic }: Camera3dSettingsEditorProps): import('react').JSX.Element;
