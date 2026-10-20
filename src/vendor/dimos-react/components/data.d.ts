import { HTMLAttributes, Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref, SVGAttributes } from 'react';
export interface TableColumn<Row> {
    /** the row field it shows (and its React key) */
    key: string;
    label?: ReactNode;
    /** the cell (default: the field as text) */
    render?: (row: Row, index: number) => ReactNode;
    /** sortable; a function sorts by it instead of by the value */
    sort?: boolean | ((a: Row, b: Row) => number);
    align?: "left" | "right" | "center";
    width?: string | number;
    /** what to sort by (default: the field) */
    value?: (row: Row) => unknown;
}
export interface TableSort {
    key: string;
    dir: "asc" | "desc";
}
export interface TableProps<Row> extends HTMLAttributes<HTMLDivElement> {
    columns: TableColumn<Row>[];
    rows: Row[];
    /** a field name, or `(row, index) => key` (default: row.id, row.key, the index) */
    rowKey?: string | ((row: Row, index: number) => Key);
    sort?: TableSort | null;
    onSortChange?: (sort: TableSort | null) => void;
    defaultSort?: TableSort | null;
    onRowClick?: (row: Row, index: number) => void;
    /** the selected row's key */
    selected?: Key | null;
    empty?: ReactNode;
    sticky?: boolean;
    compact?: boolean;
    maxHeight?: string | number;
    /** false: the rows arrive already sorted (by a backend); the headers still show and change `sort` */
    sortRows?: boolean;
}
/**
 * A sortable table. `sortRows: false`: the rows arrive already sorted (by a backend); the headers still show and change
 * `sort`.
 */
export declare function Table<Row>({ columns, rows, rowKey, sort, onSortChange, defaultSort, onRowClick, selected, empty, sticky, compact, maxHeight, sortRows, className, style, ...rest }: TableProps<Row>): import('react').JSX.Element;
export interface TreeNode {
    id: string;
    label?: ReactNode;
    children?: this[];
    icon?: string;
    badge?: ReactNode;
}
export interface TreeProps<Node extends TreeNode> extends Omit<HTMLAttributes<HTMLUListElement>, "onSelect"> {
    nodes: Node[];
    /** the open nodes' ids (controlled, with onExpandedChange) */
    expanded?: string[];
    defaultExpanded?: string[] | "all";
    onExpandedChange?: (ids: string[]) => void;
    selected?: string | null;
    onSelect?: (id: string, node: Node) => void;
    renderLabel?: (node: Node) => ReactNode;
}
/** A collapsible tree (TF frames, recording summaries, URDF links). */
export declare function Tree<Node extends TreeNode>({ nodes, expanded, defaultExpanded, onExpandedChange, selected, onSelect, renderLabel, className, ...rest }: TreeProps<Node>): import('react').JSX.Element;
export interface KeyValueRowProps extends HTMLAttributes<HTMLDivElement> {
    label?: ReactNode;
    /** the value in the monospace face (default true) */
    mono?: boolean;
}
/** One label / value row (`children` is the value). */
export declare function KeyValueRow({ label, children, mono, className, ...rest }: KeyValueRowProps): import('react').JSX.Element;
export interface KeyValueProps extends HTMLAttributes<HTMLDivElement> {
    /** [label, value] rows */
    items?: (readonly [ReactNode, ReactNode])[];
    mono?: boolean;
}
/** Label / value readout rows. */
export declare function KeyValue({ items, children, mono, className, ...rest }: KeyValueProps): import('react').JSX.Element;
export interface StatProps extends HTMLAttributes<HTMLDivElement> {
    label: ReactNode;
    value: ReactNode;
    unit?: ReactNode;
    /** a change: a number shows +/- colored, a string as is */
    delta?: number | string;
    tone?: "ok" | "warn" | "danger" | "info";
    hint?: ReactNode;
}
/** A big number: label, value, unit, a change, a tone. */
export declare function Stat({ label, value, unit, delta, tone, hint, className, ...rest }: StatProps): import('react').JSX.Element;
export interface ListProps extends HTMLAttributes<HTMLDivElement> {
    /** lines between rows (default true) */
    divided?: boolean;
}
/** A vertical list of ListRows. */
export declare function List({ children, className, divided, ...rest }: ListProps): import('react').JSX.Element;
export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onClick"> {
    /** an Icon name, or an element */
    icon?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    /** on the right */
    meta?: ReactNode;
    actions?: ReactNode;
    selected?: boolean;
    /** a click, or Enter / Space on the focused row */
    onClick?: (event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>) => void;
    /** show a drag grip (an object = props for it, e.g. from useDrag) */
    handle?: boolean | HTMLAttributes<HTMLSpanElement>;
    disabled?: boolean;
    ref?: Ref<HTMLDivElement>;
}
/** A list row: icon, title, subtitle, meta on the right, actions. `handle`: a drag grip. */
export declare function ListRow({ icon, title, subtitle, meta, actions, selected, onClick, handle, disabled, className, ...rest }: ListRowProps): import('react').JSX.Element;
/** A log line's time: epoch ms, a date string or a Date. */
export type LogTime = number | string | Date;
export interface LogLine {
    text: string;
    level?: "debug" | "info" | "warn" | "error";
    ts?: LogTime;
}
export interface LogViewProps extends HTMLAttributes<HTMLDivElement> {
    lines: (string | LogLine)[];
    /** shows only lines containing it (case-insensitive) */
    filter?: string;
    maxLines?: number;
    follow?: boolean;
    height?: string | number;
    showTime?: boolean;
    wrap?: boolean;
}
/** A console: follows the tail (auto scroll) until you scroll up, then offers "jump to end". */
export declare function LogView({ lines, filter, maxLines, follow, height, showTime, wrap, className, style, ...rest }: LogViewProps): import('react').JSX.Element;
export type TokenKind = "kw" | "str" | "num" | "com" | "func" | "plain";
/** Splits one line of code into [kind, text] tokens (kw, str, num, com, func, plain). */
export declare function tokenizeLine(line: string, language?: string): [TokenKind, string][];
export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    code: string;
    /** js, ts, py, sh, json, … (default js) */
    language?: string;
    lineNumbers?: boolean;
    /** a copy button (default true) */
    copy?: boolean;
    /** the header's text (default: the language) */
    title?: ReactNode;
    /** false: no header (no language, no copy button) */
    header?: boolean;
    maxHeight?: string | number;
    /** a line (1-based) to mark and scroll to */
    highlightLine?: number;
    /** fills its parent (a flex column) and scrolls inside, without a border */
    fill?: boolean;
}
/**
 * Code with light highlighting (the theme's --code-* colors), line numbers and a copy button. `highlightLine` marks a
 * line and scrolls it into view; `fill` makes it fill its parent.
 */
export declare function CodeBlock({ code, language, lineNumbers, copy, title, header, maxHeight, highlightLine, fill, className, style, ...rest }: CodeBlockProps): import('react').JSX.Element;
export interface AttitudeIndicatorProps extends HTMLAttributes<HTMLDivElement> {
    roll?: number | null;
    pitch?: number | null;
    yaw?: number | null;
    /** px */
    height?: number;
    /** px of shift per degree of pitch (default 1.4) */
    pitchScale?: number;
}
/**
 * An attitude indicator (artificial horizon): the horizon rolls and shifts with the body's roll and pitch, yaw is
 * printed below. Angles in radians; null shows a level, dimmed horizon.
 */
export declare function AttitudeIndicator({ roll, pitch, yaw, height, pitchScale, className, ...rest }: AttitudeIndicatorProps): import('react').JSX.Element;
export interface SparklineProps extends Omit<SVGAttributes<SVGSVGElement>, "values" | "width" | "height" | "color" | "fill" | "min" | "max" | "strokeWidth"> {
    values: number[];
    /** px */
    width?: number;
    /** px */
    height?: number;
    /** a CSS color, default var(--primary) */
    color?: string;
    /** shade under the line (default true) */
    fill?: boolean;
    min?: number;
    max?: number;
    strokeWidth?: number;
    /** an accessible name (an untitled sparkline is aria-hidden) */
    title?: string;
}
/** A tiny line chart (rates, latency, battery). `color`: a CSS color, default var(--primary). */
export declare function Sparkline({ values, width, height, color, fill, min, max, strokeWidth, className, title, ...rest }: SparklineProps): import('react').JSX.Element;
/** Seconds → "m:ss" (or "h:mm:ss"). */
export declare function formatDuration(seconds: number): string;
export interface TimelineMarker {
    t: number;
    label?: string;
    tone?: "ok" | "warn" | "danger" | "info";
}
export interface TimelineProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    start?: number;
    end: number;
    value: number;
    onChange?: (t: number) => void;
    playing?: boolean;
    /** adds a play/pause button (Space too) */
    onPlayPause?: (playing: boolean) => void;
    markers?: TimelineMarker[];
    format?: (t: number) => string;
    /** snaps to multiples of it; the arrow keys' nudge (default 1% of the span) */
    step?: number;
    disabled?: boolean;
}
/**
 * A recording player's scrubber: play/pause, the position, markers. Times in seconds (any unit works with your own
 * `format`).
 */
export declare function Timeline({ start, end, value, onChange, playing, onPlayPause, markers, format, step, disabled, className, style, ...rest }: TimelineProps): import('react').JSX.Element;
export interface MediaFrameProps extends HTMLAttributes<HTMLDivElement> {
    /** plays in a muted inline <video> (null: a video with nothing yet) */
    stream?: MediaStream | null;
    /** an image, when there's no `stream` */
    src?: string | null;
    alt?: string;
    fit?: "contain" | "cover";
    height?: string | number;
    /** covers it until there is something to show */
    placeholder?: ReactNode;
    /** the <video> (with `stream`) or the <img> */
    ref?: Ref<HTMLVideoElement | HTMLImageElement>;
}
/**
 * A video stream or an image in a themed frame. `stream` (a MediaStream, e.g. a zenoh-gateway camera track) plays in a
 * muted inline <video>; without `stream`, `src` shows as an image. `placeholder` covers it until there is something to
 * show. `ref` reaches the <video>/<img> (for captureFrame).
 */
export declare function MediaFrame({ stream, src, alt, fit, height, placeholder, ref, className, style, ...rest }: MediaFrameProps): import('react').JSX.Element;
/** The frame a <video> is showing, as a data URL (null before its first frame). */
export declare function captureFrame(video: HTMLVideoElement | null | undefined, type?: string): string | null;
