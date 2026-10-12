/** a jump this far (meters), or a gap this long (seconds), is a new place: no gliding there */
export declare const SNAP_METERS = 2;
export declare class SmoothFollow {
    #private;
    /**
     * Where the camera should look this frame, given the target's latest position and the frame time.
     */
    step(target: [number, number, number], dtSeconds: number): [number, number, number];
    reset(): void;
}
export type PanVerdict = {
    action: "undo";
} | {
    action: "pause";
    restore: [number, number, number];
};
/**
 * Tells a deliberate pan from the slip of a pinch or an orbit: while following, a gesture's pan is undone ("undo")
 * until it adds up past a threshold; then following stops and the whole pan is kept ("pause", with the earlier,
 * undone part to put back so the view lands where the drag put it).
 */
export declare class PanGate {
    #private;
    /** a new drag or pinch began */
    start(): void;
    /**
     * @param pan how far this frame's controls moved the target
     * @param distance camera to target
     */
    step(pan: [number, number, number], distance: number): PanVerdict;
}
/** how quickly a resumed follow brings the target back to the middle (seconds, its time constant) */
export declare const CATCH_UP_SECONDS = 0.15;
