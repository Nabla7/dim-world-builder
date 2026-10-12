interface BoundingBox2DMessage {
    center?: {
        position?: {
            x: number;
            y: number;
        };
    };
    size_x?: number;
    size_y?: number;
}
interface Detection2DMessage {
    id?: string;
    bbox?: BoundingBox2DMessage;
    results?: {
        hypothesis?: {
            class_id?: string;
            score?: number;
        };
    }[];
}
/** A decoded Detection2DArray, Detection2D or BoundingBox2DArray (the fields the overlay reads). */
export interface Detection2DMessages extends Detection2DMessage {
    detections?: Detection2DMessage[];
    boxes?: BoundingBox2DMessage[];
}
export {};
