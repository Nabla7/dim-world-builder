export interface Box {
    id: string;
    w: number;
    h: number;
}
export interface Link {
    from: string;
    to: string;
}
export interface Point {
    x: number;
    y: number;
}
export interface Placement {
    positions: Map<string, Point>;
    /** An edge's bends (by its index in the edges list), for the layered layouts. */
    routes: Map<number, Point[]>;
    vertical?: boolean;
}
export type LayoutId = "hierarchy" | "vertical" | "force" | "radial" | "circular";
export declare const LAYOUTS: {
    id: LayoutId;
    label: string;
}[];
export declare function layout(id: LayoutId, nodes: Box[], edges: Link[]): Placement;
/** Sugiyama-style: break cycles, assign layers, order each layer to cut crossings, then place without overlap. */
export declare function layered(nodes: Box[], edges: Link[]): Placement;
/** The closest centres to `wanted` that keep `ids` in order, NODE_GAP apart (pool-adjacent-violators). */
export declare function placeInOrder(ids: string[], wanted: number[], heights: number[]): number[];
/** Pushes overlapping boxes apart along their shallower overlap, in place. */
export declare function separate(nodes: Box[], positions: Map<string, Point>): Map<string, Point>;
export declare function overlaps(nodes: Box[], positions: Map<string, Point>): boolean;
