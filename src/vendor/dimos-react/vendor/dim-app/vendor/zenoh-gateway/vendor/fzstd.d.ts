/**
 * Decompresses Zstandard data
 * @param dat The input data
 * @param buf The output buffer. If unspecified, the function will allocate
 *            exactly enough memory to fit the decompressed data. If your
 *            data has multiple frames and you know the output size, specifying
 *            it will yield better performance.
 * @returns The decompressed data
 */
export function decompress(dat: any, buf: any): any;
export namespace ZstdErrorCode {
    let InvalidData: number;
    let WindowSizeTooLarge: number;
    let InvalidBlockType: number;
    let FSEAccuracyTooHigh: number;
    let DistanceTooFarBack: number;
    let UnexpectedEOF: number;
}
/**
 * Decompressor for Zstandard streamed data
 */
export class Decompress {
    /**
     * Creates a Zstandard decompressor
     * @param ondata The handler for stream data
     */
    constructor(ondata: any);
    s: any;
    c: any[];
    l: number;
    z: number;
    /**
     * Handler called whenever data is decompressed
     */
    ondata: any;
    /**
     * Pushes data to be decompressed
     * @param chunk The chunk of data to push
     * @param final Whether or not this is the last chunk in the stream
     */
    push(chunk: any, final: any): any;
}
