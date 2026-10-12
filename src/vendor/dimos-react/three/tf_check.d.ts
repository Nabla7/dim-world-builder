import { TfSnapshot } from './tf.ts';
export type TfIssueKind = "cycle" | "twoParents" | "separateTrees" | "fixedFrame" | "unplaced" | "stale";
export interface TfIssue {
    kind: TfIssueKind;
    summary: string;
    detail: string;
    frames: string[];
}
export interface CheckTfInput {
    snapshot: TfSnapshot;
    fixedFrame: string;
    layers?: {
        name: string;
        frame: string;
    }[];
    placed: (frame: string) => boolean;
}
/** A dynamic transform this much older than its newest sibling has stopped (static ones are exempt). */
export declare const TF_STALE_MS = 2000;
/**
 * @param input `layers`: the drawn layers' data frames; `placed(frame)`: whether it can be placed in the fixed frame
 *   (tf.lookup(frame, fixedFrame) !== null)
 */
export declare function checkTf({ snapshot, fixedFrame, layers, placed }: CheckTfInput): TfIssue[];
/** The issues in `next` that were also in `previous`: a problem must last two checks to be shown. */
export declare function confirmedIssues(previous: TfIssue[], next: TfIssue[]): TfIssue[];
