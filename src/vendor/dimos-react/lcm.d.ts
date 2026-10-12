/** One field of an LCM struct: `dims` are fixed lengths (numbers) or the names of the fields holding the lengths. */
export interface LcmField {
    name: string;
    type: string;
    dims: (number | string)[];
}
/** The dimos_lcm schemas: type name (e.g. "nav_msgs.Odometry") → its fields in wire order. */
export declare const schemas: Record<string, LcmField[]>;
/** A decoded LCM struct: field name → value (numbers, strings, booleans, arrays, typed arrays, nested structs). */
export type LcmStruct = Record<string, any>;
/** Decodes a dimos payload (fingerprint + struct) of `type`, e.g. "nav_msgs.Odometry"; a different type's bytes throw. */
export declare function decode(type: string, bytes: Uint8Array): LcmStruct;
/** Reads just the header's frame_id off a stamped message without decoding the rest (clouds, images). */
export declare function headerFrameId(type: string, bytes: Uint8Array): string | null;
/** The 8 bytes every top-level LCM message of `type` starts with. */
export declare function fingerprint(type: string): Uint8Array;
/** Encodes `value` as a dimos payload of `type` (missing fields are zero). */
export declare function encode(type: string, value: LcmStruct): Uint8Array;
