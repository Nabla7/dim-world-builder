import { TfTree } from './tf.ts';
import { FrameInfo, Viewer } from './viewer.ts';
import * as THREE from "three";
export declare class FrameHighlighter {
    #private;
    root: THREE.Group<THREE.Object3DEventMap>;
    frame: string | null;
    placed: boolean;
    onPlaced: ((placed: boolean) => void) | undefined;
    tf: TfTree;
    viewer: Viewer;
    constructor(viewer: Viewer, tf: TfTree, onPlaced?: (placed: boolean) => void);
    set(frame: string | null): void;
    update(frameInfo: FrameInfo): void;
    dispose(): void;
}
