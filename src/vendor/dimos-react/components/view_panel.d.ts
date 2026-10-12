import { CSSProperties, HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
/** every panel's header height (px): a panel is this plus its body */
export declare const VIEW_PANEL_HEAD_PX = 33;
/** a panel's place and size (px) */
export interface PanelBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface PanelSize {
    width: number;
    height: number;
}
/** a float panel's resize handle */
export interface PanelResize {
    corner: "left" | "right";
    minimum: PanelSize;
    /** body height / width */
    aspect?: number;
    onDone: (box: PanelBox) => void;
}
/** a tiled layout's order, which a header dragged onto another tile swaps */
export interface PanelTiles {
    order: string[];
    onOrder: (order: string[]) => void;
}
export interface PanelDock {
    region: string;
    rect: PanelBox | null;
    maximized: boolean;
    onMaximize: () => void;
    tiles?: PanelTiles;
}
/**
 * Drags `element` with the pointer from `event` (a header's pointerdown), kept on screen and below `top` px;
 * `onDone(x, y)` gets where it was dropped (only if it moved).
 */
export declare function startPanelDrag(event: {
    clientX: number;
    clientY: number;
}, element: HTMLElement, onDone: (x: number, y: number) => void, { top }?: {
    top?: number;
}): void;
/**
 * Resizes `element` from a bottom corner: "left" grows it leftward (its right edge stays), "right" rightward. With
 * `aspect` (body height / width) the height follows the width. It stays in the window; `onDone(box)` gets the final
 * `{ x, y, width, height }`.
 */
export declare function startPanelResize(event: ReactPointerEvent<HTMLElement>, element: HTMLElement, { corner, minimum, aspect, onDone, headPx }: PanelResize & {
    headPx?: number;
}): void;
/**
 * A remembered panel box made safe for this window: a size that fits (at least `minimum`), a position that keeps the
 * header reachable (on screen, below `top`); anything not a finite number takes its default. x/y < 0 = "the default
 * corner" (returned as -1, -1).
 */
export declare function clampPanelBox(box: {
    [K in keyof PanelBox]?: unknown;
}, defaults: PanelBox, viewport: PanelSize, minimum: PanelSize, { top }?: {
    top?: number;
}): PanelBox;
/** The order with `a` and `b` swapped (a tiled layout's drop). */
export declare function swapTiles<T>(order: T[], a: T, b: T): T[];
export interface ViewPanelProps extends HTMLAttributes<HTMLDivElement> {
    placement: "float" | "dock" | "main";
    dock?: PanelDock | null;
    /** the header's content (title, buttons) */
    head: ReactNode;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
    bodyClassName?: string;
    bodyOnClick?: () => void;
    onHeadDoubleClick?: () => void;
    onMove?: (x: number, y: number) => void;
    /** a float panel's header never goes above this (a top bar) */
    top?: number;
    resize?: PanelResize | null;
    panelRef?: Ref<HTMLDivElement>;
    /** the header's tooltip */
    title?: string;
    /** a header with several selects wraps onto more lines, each select as wide as its text, instead of squeezing them */
    wrapHead?: boolean;
}
/** A view's panel (see the top of this file). */
export declare function ViewPanel({ placement, dock, head, children, className, style, bodyClassName, bodyOnClick, onHeadDoubleClick, onMove, top, resize, panelRef, title, wrapHead, ...rest }: ViewPanelProps): import('react').JSX.Element;
/** A short live readout in a panel header ("640×480 · 30 fps"): muted, mono, truncated. */
export declare function PanelInfo({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>): import('react').JSX.Element;
