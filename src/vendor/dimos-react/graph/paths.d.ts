import { Box, Point } from './layout.ts';
export type Placed = Box & Point;
/** From the right (bottom, when vertical) of `from` to the left (top) of `to`, along the bends a layered layout gave. */
export declare function flowPath(from: Placed, to: Placed, bends: Point[], vertical: boolean, port?: number): string;
/** A straight line between the two boxes' borders. */
export declare function straightPath(from: Placed, to: Placed): string;
/** The width `text` takes in a CSS `font`, for sizing boxes before they render. */
export declare function textWidth(text: string, font: string): number;
