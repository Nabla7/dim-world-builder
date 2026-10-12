import { LayerManager } from './layers/manager.ts';
import { TfTree } from './tf.ts';
import { TfIssue } from './tf_check.ts';
export interface UseLayerManagerOptions {
    persist?: ConstructorParameters<typeof LayerManager>[0]["persist"];
    storagePrefix?: string;
    filter?: string;
    intervalMs?: number;
}
/** A LayerManager for the data source in effect, watching its topics while mounted. */
export declare function useLayerManager({ persist, storagePrefix, filter, intervalMs, }?: UseLayerManagerOptions): LayerManager;
/**
 * Every drawable topic, grouped by layer type: a switch (on = subscribed), live info or the problem, and the layer's
 * settings behind a disclosure; then the topics nothing draws.
 */
export declare function LayersPanel({ manager, emptyText, className }: LayersPanelProps): import('react').JSX.Element;
export interface LayersPanelProps {
    manager: LayerManager;
    emptyText?: string;
    className?: string;
}
export interface TfPanelProps {
    tf: TfTree;
    fixedFrame?: string;
    activeFixedFrame?: string;
    onFixedFrame?: (frame: string) => void;
    issues?: TfIssue[];
    robotFrame?: string;
    robotFound?: boolean;
    hovered?: string | null;
    hoveredPlaced?: boolean;
    onHover?: (frame: string | null) => void;
    className?: string;
}
/**
 * The TF tree as an indented list (age per edge, stale and flagged frames marked), what's wrong with it, and which
 * frame the view is fixed to (`fixedFrame` = the choice, "" = auto; `activeFixedFrame` = the one in use).
 */
export declare function TfPanel({ tf, fixedFrame, activeFixedFrame, onFixedFrame, issues, robotFrame, robotFound, hovered, hoveredPlaced, onHover, className, }: TfPanelProps): import('react').JSX.Element;
export interface TfFootnoteProps {
    issues: TfIssue[];
    onOpen?: () => void;
    className?: string;
}
/**
 * A quiet one-line note over the view's corner when the TF tree is broken; nothing when it's fine. `onOpen`: e.g.
 * open the TF panel, where the frames involved are marked.
 */
export declare function TfFootnote({ issues, onOpen, className }: TfFootnoteProps): import('react').JSX.Element | null;
