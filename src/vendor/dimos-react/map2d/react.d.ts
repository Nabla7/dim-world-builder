import { CSSProperties, ReactNode } from 'react';
import { Topic } from '../data.ts';
import { TfTree } from '../three/tf.ts';
import { Map2DRenderer, Map2DFollowState, Map2DPick, Map2DStatus } from './renderer.ts';
import { MapView } from './math.ts';
export interface Map2DProps {
    tf: TfTree;
    /** the base map (OccupancyGrid, or a PointCloud2 drawn as a height heatmap) */
    topic?: Topic | null;
    /** a costmap over it */
    overlay?: Topic | null;
    /** a nav_msgs.Path topic key */
    path?: string | null;
    /** the TF frame it follows (a pan stops following) */
    followFrame?: string;
    /** where the robot arrow and trail go (default `followFrame`) */
    robotFrame?: string;
    /** default: the TF tree's world-ish root */
    fixedFrame?: string;
    /** where to start (a remembered `onView`) */
    view?: MapView | null;
    onView?: (view: MapView) => void;
    onFollow?: (follow: Map2DFollowState) => void;
    onStatus?: (status: Map2DStatus) => void;
    onPick?: (pick: Map2DPick) => void;
    onMap?: (renderer: Map2DRenderer | null) => void;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
}
export declare function Map2D({ tf, topic, overlay, path, followFrame, robotFrame, fixedFrame, view, onView, onFollow, onStatus, onPick, onMap, className, style, children, }: Map2DProps): import('react').JSX.Element;
