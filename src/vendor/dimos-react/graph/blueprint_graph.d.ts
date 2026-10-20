import { CSSProperties, ReactNode } from 'react';
import { GraphViewHandle } from './graph_view.tsx';
import { LayoutId } from './layout.ts';
/** A module's stream, as the gateway describes it. */
export interface BlueprintStream {
    name: string;
    type: string;
    /** "in", "out" (anything else reads and writes) */
    direction: string;
    /** the name it's wired under in the blueprint (a remapped stream) */
    wire?: string | null;
    /** the topic it's pinned to */
    topic?: string | null;
}
/** A module of a blueprint, as GET blueprints/{name} lists it (other fields are ignored). */
export interface BlueprintModule {
    name: string;
    /** the dotted class path */
    class: string;
    streams: BlueprintStream[];
}
/** A topic heard on the bus that no module of the blueprint wires. */
export interface ExtraTopic {
    topic: string;
    type: string;
}
/** What's lit: a module, or a topic. */
export type BlueprintSpot = {
    module: string;
} | {
    topic: string;
} | null;
/** The topic a stream lands on: its pinned topic, else its wired name, else its own name (no leading slash). */
export declare const topicOf: (stream: BlueprintStream) => string;
/** A module's class name (the last part of its dotted path), or its name. */
export declare const moduleClassName: (module: BlueprintModule) => string;
export interface BlueprintModuleNode {
    id: string;
    kind: "module";
    name: string;
    label: string;
    tagW: number;
    w: number;
    h: number;
}
export interface BlueprintTopicNode {
    id: string;
    kind: "topic";
    topic: string;
    type: string;
    /** heard on the bus, not wired by the blueprint */
    extra: boolean;
    /** only written, or only read, here */
    loose: boolean;
    w: number;
    h: number;
}
export type BlueprintNode = BlueprintModuleNode | BlueprintTopicNode;
export interface BlueprintEdge {
    from: string;
    to: string;
    topic: string;
}
/** Text width in px for a CSS font; a rough per-character width where there's no canvas (tests, server rendering). */
export type MeasureText = (text: string, font: string) => number;
/** Modules become module nodes, each topic a topic node; an edge runs module → topic it writes, topic → module reading it. */
export declare function buildBlueprintGraph(modules: BlueprintModule[], extras?: ExtraTopic[], measure?: MeasureText): {
    nodes: BlueprintNode[];
    edges: BlueprintEdge[];
};
/** Two fingers over `element` zoom only the graph, never the page (even with Android's "force enable zoom"). */
export declare function useNoPagePinch(element: HTMLElement | null): void;
/** "native": the Fullscreen API has the element; "overlay": it fills the window (no Fullscreen API, or it refused). */
export type FullscreenMode = "native" | "overlay" | null;
/**
 * Fullscreen for an element: the Fullscreen API where there is one, else (or when it refuses, e.g. in an iframe
 * without allow="fullscreen") a full-window overlay the caller styles. Esc leaves either.
 */
export declare function useFullscreen(element: HTMLElement | null): {
    mode: FullscreenMode;
    enter: () => void;
    exit: () => void;
    toggle: () => void;
};
export interface BlueprintGraphProps {
    modules: BlueprintModule[];
    /** topics heard on the bus that the blueprint doesn't wire, drawn dashed */
    extras?: ExtraTopic[];
    /** the layout (uncontrolled: starts at "hierarchy" and the controls change it) */
    layout?: LayoutId;
    onLayoutChange?: (layout: LayoutId) => void;
    /** what's lit (uncontrolled: whatever's hovered) */
    spot?: BlueprintSpot;
    /** Hz per topic while the blueprint runs: live topics show their rate and their edges flow */
    rates?: Map<string, number> | null;
    onModule?: (name: string) => void;
    onTopic?: (topic: string | null) => void;
    onHover?: (spot: BlueprintSpot) => void;
    /** the smallest zoom a fit may pick, per layout (GraphView's; `{}` always fits the whole graph, for a small box) */
    fitMinScale?: Partial<Record<LayoutId, number>>;
    /** the zoom buttons and layout picker (default on) */
    controls?: boolean;
    /** the fullscreen toggle, top right (default on) */
    fullscreen?: boolean;
    /** shown when there are no modules */
    empty?: ReactNode;
    className?: string;
    style?: CSSProperties;
    "aria-label"?: string;
    /** laid over the graph (a heading, a legend) */
    children?: ReactNode;
}
/**
 * A blueprint's module graph: modules (a bar, "MOD" and the class name) and the topics between them (tinted by message
 * type), pannable and zoomable (drag, wheel, pinch; two fingers never zoom the page), with a fullscreen button. A ref
 * gives GraphView's zoom, fit and reveal (a module's id is `m:<name>`, a topic's `t:<topic>`).
 */
export declare const BlueprintGraph: import('react').ForwardRefExoticComponent<BlueprintGraphProps & import('react').RefAttributes<GraphViewHandle>>;
