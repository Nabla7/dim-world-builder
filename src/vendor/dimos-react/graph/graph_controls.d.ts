import { RefObject } from 'react';
import { GraphViewHandle } from './graph_view.tsx';
import { LayoutId } from './layout.ts';
export interface GraphControlsProps {
    /** the GraphView's ref */
    graph: RefObject<GraphViewHandle | null>;
    layout: LayoutId;
    onLayoutChange: (layout: LayoutId) => void;
}
/** Zoom in / out / fit and the layout picker, as children of a GraphView. */
export declare function GraphControls({ graph, layout, onLayoutChange }: GraphControlsProps): import('react').JSX.Element;
