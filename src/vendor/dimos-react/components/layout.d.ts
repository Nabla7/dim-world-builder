import { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ElementType, HTMLAttributes, IframeHTMLAttributes, ReactNode, Ref } from 'react';
export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    ref?: Ref<HTMLElement>;
    title?: ReactNode;
    description?: ReactNode;
    /** the right side of the header */
    actions?: ReactNode;
    padded?: boolean;
    glass?: boolean;
}
/** A bordered surface. `title`, `description`, `actions` (right side of the header); `padded` (default true). */
export declare function Card({ title, description, actions, padded, glass, className, children, ...rest }: CardProps): import('react').JSX.Element;
export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    title?: ReactNode;
    icon?: string;
    actions?: ReactNode;
    collapsible?: boolean;
    /** controlled open state (with onOpenChange) */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
    /** remembers the open state (localStorage) under this key */
    persistKey?: string;
    glass?: boolean;
    bodyClassName?: string;
}
/**
 * A panel with a header that can collapse its body. `collapsible`, `open`/`onOpenChange` (controlled) or
 * `defaultOpen`; `persistKey` remembers it; `glass` for panels floating over a 3D/video view; `icon`, `actions`.
 */
export declare function Panel({ title, icon, actions, collapsible, open, onOpenChange, defaultOpen, persistKey, glass, className, bodyClassName, children, ...rest }: PanelProps): import('react').JSX.Element;
/** px from the top-left; negative = from the right/bottom */
export interface PanelPosition {
    x: number;
    y: number;
}
export interface FloatingPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    title?: ReactNode;
    icon?: string;
    actions?: ReactNode;
    onClose?: () => void;
    defaultPosition?: PanelPosition;
    /** remembers the position (localStorage) under this key */
    persistKey?: string;
    width?: CSSProperties["width"];
}
/**
 * A panel that floats over the page and can be dragged by its header (position remembered with `persistKey`).
 * `defaultPosition` { x, y } (px from the top-left; negative = from the right/bottom); `onClose` adds an ✕.
 */
export declare function FloatingPanel({ title, icon, actions, onClose, defaultPosition, persistKey, width, className, style, children, ...rest }: FloatingPanelProps): import('react').JSX.Element;
export interface SplitPaneProps extends HTMLAttributes<HTMLDivElement> {
    direction?: "row" | "column";
    /** the first pane's size: px (a number) or a CSS length like "40%"; controlled with onSizeChange */
    size?: number | string;
    /** the new size in px, while dragging */
    onSizeChange?: (size: number) => void;
    defaultSize?: number | string;
    /** px */
    min?: number;
    /** px */
    max?: number;
    persistKey?: string;
}
/**
 * Two panes with a draggable divider. `direction` "row" (side by side) | "column"; `size` of the first pane (px or
 * %, controlled with onSizeChange) or `defaultSize`; `min` / `max` px; `persistKey`.
 */
export declare function SplitPane({ direction, size, onSizeChange, defaultSize, min, max, persistKey, className, children, ...rest }: SplitPaneProps): import('react').JSX.Element;
export interface ResizeHandleProps extends HTMLAttributes<HTMLDivElement> {
    onResize: (drag: {
        dx: number;
        dy: number;
        done: boolean;
    }) => void;
    onStart?: () => void;
    corner?: "bottom-right" | "bottom-left";
    label?: string;
}
/**
 * A corner grip for resizing a panel: `onResize({ dx, dy, done })` while dragging (px from where it started) and once
 * more with `done: true` on release. `corner` "bottom-right" | "bottom-left" (the one facing into the screen).
 */
export declare function ResizeHandle({ onResize, onStart, corner, label, className, ...rest }: ResizeHandleProps): import('react').JSX.Element;
export interface TopBarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    title?: ReactNode;
    icon?: string;
    left?: ReactNode;
    right?: ReactNode;
}
/** The app's top bar: `title` (and `icon`), `left` / center `children` / `right` slots. */
export declare function TopBar({ title, icon, left, right, className, children, ...rest }: TopBarProps): import('react').JSX.Element;
export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
    floating?: boolean;
    vertical?: boolean;
}
/** A row of controls (buttons, selects, separators). `floating` gives it a glass background (over a view). */
export declare function Toolbar({ floating, vertical, className, children, ...rest }: ToolbarProps): import('react').JSX.Element;
/** A bar pinned to the bottom of its container, above Desktop's dock (status lines, playback controls). */
export declare function BottomBar({ className, children, ...rest }: HTMLAttributes<HTMLElement>): import('react').JSX.Element;
export interface SeparatorProps extends HTMLAttributes<HTMLSpanElement> {
    vertical?: boolean;
}
/** A thin divider; `vertical` inside rows/toolbars. */
export declare function Separator({ vertical, className, ...rest }: SeparatorProps): import('react').JSX.Element;
export interface ColumnProps extends HTMLAttributes<HTMLDivElement> {
    /** px, or a CSS length */
    gap?: CSSProperties["gap"];
    align?: CSSProperties["alignItems"];
    justify?: CSSProperties["justifyContent"];
    /** takes the free space in its parent Row/Column */
    grow?: boolean;
}
export interface RowProps extends ColumnProps {
    wrap?: boolean;
}
/** Flex helpers: `gap` (px), `align`, `justify`, `wrap`, `grow`. */
export declare function Row({ gap, align, justify, wrap, grow, className, style, children, ...rest }: RowProps): import('react').JSX.Element;
export declare function Column({ gap, align, justify, grow, className, style, children, ...rest }: ColumnProps): import('react').JSX.Element;
/** Takes the free space in a Row/Column. */
export declare function Spacer(): import('react').JSX.Element;
export interface HudProps extends HTMLAttributes<HTMLDivElement> {
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "center";
}
/**
 * A HUD overlay pinned to a corner of a positioned parent (a 3D view, a video): `position` "top-left" | "top-right" |
 * "bottom-left" | "bottom-right" | "top" | "bottom" | "center".
 */
export declare function Hud({ position, className, children, ...rest }: HudProps): import('react').JSX.Element;
export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
    /** 1 (page title), 2 (section head), 3 (micro-label) */
    level?: 1 | 2 | 3;
}
/** Headings and text in the theme's type: level 1 (page title), 2 (section head), 3 (micro-label). */
export declare function Heading({ level, className, children, ...rest }: HeadingProps): import('react').JSX.Element;
export declare function Label({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>): import('react').JSX.Element;
export interface TextProps extends HTMLAttributes<HTMLElement> {
    /** the element (default "span") */
    as?: ElementType;
    muted?: boolean;
    mono?: boolean;
    small?: boolean;
    tone?: "ok" | "warn" | "danger";
}
/** Text: `muted`, `mono`, `small`, `tone` ("ok" | "warn" | "danger"). */
export declare function Text({ as, muted, mono, small, tone, className, children, ...rest }: TextProps): import('react').JSX.Element;
export declare function Link({ className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>): import('react').JSX.Element;
export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
    topBar?: ReactNode;
    sidebar?: ReactNode;
    bottomBar?: ReactNode;
    insetBottom?: boolean;
}
/**
 * Full-page app frame: top bar, optional side, main area (fills the viewport). `insetBottom` ends the main area above
 * Desktop's dock (without a bottomBar; a BottomBar already does).
 */
export declare function AppShell({ topBar, sidebar, bottomBar, insetBottom, className, children, ...rest }: AppShellProps): import('react').JSX.Element;
/**
 * Another page embedded in this one (an iframe that fills its positioned parent, no border, on the page background).
 * `title` names it for screen readers; other props go to the iframe (`src`, `allow`, `sandbox`, …).
 */
export declare function Embed({ title, className, ...rest }: IframeHTMLAttributes<HTMLIFrameElement>): import('react').JSX.Element;
export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
    title?: ReactNode;
    subtitle?: ReactNode;
    /** an image, an icon element */
    media?: ReactNode;
    /** an Icon name, when there's no `media` */
    icon?: string;
    selected?: boolean;
    loading?: boolean;
    align?: "center" | "start";
}
/**
 * A big selectable card (a picker's choice: a robot, a template, a recording). A button: `onClick`, `selected`,
 * `disabled`. `media` (an image, an icon element) or `icon` (an Icon name) on top, then `title` and `subtitle`, then
 * `children`. `align` "center" (a picker's icons) | "start" (text cards: a featured item with its description). With
 * `loading` it is a placeholder (no click).
 */
export declare function Tile({ title, subtitle, media, icon, selected, loading, align, className, children, ...rest }: TileProps): import('react').JSX.Element;
export interface TileGridProps extends HTMLAttributes<HTMLDivElement> {
    /** a column's least width: px, or a CSS length */
    min?: number | string;
}
/** Tiles in a responsive grid: as many columns of at least `min` px as fit. */
export declare function TileGrid({ min, className, style, children, ...rest }: TileGridProps): import('react').JSX.Element;
