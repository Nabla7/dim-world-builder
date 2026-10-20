import { CSSProperties, ReactNode, Ref } from 'react';
import { Box, LayoutId, Link, Placement } from './layout.ts';
import { Placed } from './paths.ts';
export interface GraphViewHandle {
    zoom(factor: number, cx?: number, cy?: number): void;
    /** Fit the whole graph in view (and follow resizes again until the user moves it). */
    fit(): void;
    /** Scroll a node into view, animated, if it isn't already. */
    reveal(id: string): void;
}
export interface GraphViewProps<N extends Box, E extends Link> {
    nodes: N[];
    edges: E[];
    layout?: LayoutId;
    /** A node's contents, drawn in its own coordinates: (0, 0) is its top left. */
    renderNode: (node: N & Placed) => ReactNode;
    nodeClassName?: (node: N) => string | undefined;
    nodeTitle?: (node: N) => string | undefined;
    nodeStyle?: (node: N) => CSSProperties | undefined;
    /** Nodes that take keyboard focus (Enter clicks them). */
    focusable?: (node: N) => boolean;
    edgeClassName?: (edge: E, index: number) => string | undefined;
    edgeStyle?: (edge: E, index: number) => CSSProperties | undefined;
    onNodeClick?: (node: N) => void;
    onBackgroundClick?: () => void;
    onHover?: (node: N | null) => void;
    /** Called after every layout, e.g. to check for overlaps. */
    onLayout?: (placement: Placement) => void;
    /** Room edges leave at a node's sides (e.g. for port markers you draw). */
    port?: number;
    /** Space kept around the graph when fitting. */
    fitPadding?: {
        x: number;
        top: number;
        bottom: number;
    };
    /** The smallest zoom a fit may pick, per layout (a wide hierarchy scrolls rather than shrinking to nothing). */
    fitMinScale?: Partial<Record<LayoutId, number>>;
    /** The background grid's cell at zoom 1 (the container's background is scaled and moved with the view). */
    gridSize?: number;
    /** A node to light up with its neighbours and the edges between them (class "lit"); the rest dim. */
    focus?: string | null;
    className?: string;
    style?: CSSProperties;
    "aria-label"?: string;
    children?: ReactNode;
}
/**
 * A pannable, zoomable view of a laid-out graph on a dotted grid; a ref gives zoom, fit and reveal. Edges and nodes
 * take the classes "edge" / "node" (plus yours); `focus` lights a node's neighbourhood.
 */
export declare const GraphView: <N extends Box, E extends Link>(props: GraphViewProps<N, E> & {
    ref?: Ref<GraphViewHandle>;
}) => ReactNode;
