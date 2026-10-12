import { DataSource, Topic } from '../data.ts';
import { poseMatrix } from '../three/layers/pose.tsx';
import { TfTree } from '../three/tf.ts';
import { MapView } from './math.ts';
/** A decoded OccupancyGrid, as the map keeps it. */
interface GridData {
    width: number;
    height: number;
    resolution: number;
    /** the grid's (0,0) corner in `frame` (a geometry_msgs Pose) */
    origin: Parameters<typeof poseMatrix>[0];
    data: ArrayLike<number>;
    frame: string;
}
/** One topic's last data, kept per map context. */
export interface RetainedMapData {
    grid?: GridData;
    gridInfo?: string;
    cloudFrame?: string;
    cloudPositions?: ArrayLike<number>;
    cloudMatrix?: number[];
    cloudInfo?: string;
}
/** What the renderer reads through: the data source, the TF tree, the frames to use, the data kept across remounts. */
export interface Map2DContext {
    source: DataSource;
    tf: TfTree;
    /** each topic's last data (by topic key) */
    retained: Map<string, RetainedMapData>;
    fixedFrame: () => string;
    robotFrame: () => string;
}
export interface Map2DFollowState {
    following: boolean;
    /** the followed frame isn't in the TF tree yet */
    waiting: boolean;
}
export interface Map2DStatus {
    info: string;
    problem: string;
}
/** a click that didn't move the map: where it landed in the fixed frame */
export interface Map2DPick {
    x: number;
    y: number;
    frame: string;
    event: PointerEvent;
}
/** What the renderer reports. */
export interface Map2DEvents {
    /** the view settled (debounced): remember it to start there next time */
    onView: (view: MapView) => void;
    onFollow: (follow: Map2DFollowState) => void;
    onStatus: (status: Map2DStatus) => void;
    onPick?: (pick: Map2DPick) => void;
}
/** Draws the map onto its canvas (no React): subscriptions, view, interaction. */
export declare class Map2DRenderer {
    #private;
    map: Map2DContext;
    canvas: HTMLCanvasElement;
    events: Map2DEvents;
    constructor(map: Map2DContext, canvas: HTMLCanvasElement, view: MapView | null | undefined, followFrame: string, events: Map2DEvents);
    /** Draws a nav_msgs.Path topic over the map (null: none). */
    setPath(topicKey: string | null | undefined): void;
    dispose(): void;
    /** follows another TF frame (and resumes following: picking one means "show me that") */
    setFollowFrame(frame: string): void;
    /** resumes following and centers on the frame now (the zoom stays) */
    recenter(): void;
    /** the base map and the costmap over it (null: none); a source that didn't change keeps its data */
    setTopics(base: Topic | null | undefined, overlay: Topic | null | undefined): void;
    /** Shows all of the map (and stops following); with nothing to fit, centers on the robot. A no-op when it can't tell. */
    fit(): void;
    requestDraw(): void;
}
export {};
