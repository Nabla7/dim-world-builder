import { HTMLAttributes, ReactNode } from 'react';
import { SettingField } from '../settings.ts';
export interface SettingInputProps {
    field: SettingField;
    value: unknown;
    /** the parsed value, once it parses (numbers, JSON); typed text that doesn't shows what it needs instead */
    onChange: (value: unknown) => void;
}
/**
 * The input a setting's kind takes: a Toggle (bool), a Select (enum; "(none)" too when nullable), or a box that
 * reports on Enter / blur and parses by kind (integer, number, JSON; empty = null when nullable). A secret is a
 * password box with show / hide that selects the gateway's "•••" placeholder on focus.
 */
export declare function SettingInput({ field, value, onChange }: SettingInputProps): import('react').JSX.Element;
export interface SettingChoiceProps {
    /** what each choice is called */
    labels: string[];
    /** the chosen one's index; -1 for none */
    value: number;
    onChange: (index: number) => void;
    label: string;
}
/** One of a few named choices: a Segmented control for up to four, a Select past that. */
export declare function SettingChoice({ labels, value, onChange, label }: SettingChoiceProps): import('react').JSX.Element;
export interface SettingRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    label: ReactNode;
    /** the control: a SettingInput, a SettingChoice, … */
    children: ReactNode;
    /** set away from its default: marked "saved", with a reset */
    saved?: boolean;
    onReset?: () => void;
    /** what reset goes back to (its tooltip) */
    resetTo?: unknown;
    /** a "How do I find this?" link */
    docs?: string;
    /** the row's tooltip */
    description?: string | null;
    /** the control on a line of its own, under the name */
    wide?: boolean;
}
/** A setting: its name (and "saved"), its control and a reset, and a docs link under them. */
export declare function SettingRow({ label, children, saved, onReset, resetTo, docs, description, wide, className, ...rest }: SettingRowProps): import('react').JSX.Element;
export interface SettingGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    title: ReactNode;
    /** how many are saved (hidden at 0) */
    count?: number;
    /** an accent bar on its header (e.g. a module's own settings) */
    accent?: boolean;
}
/** A bordered group of SettingRows under a header, with how many of them are saved. */
export declare function SettingGroup({ title, count, accent, className, children, ...rest }: SettingGroupProps): import('react').JSX.Element;
export interface SettingSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    title: ReactNode;
    /** beside the title, e.g. what it applies to */
    note?: ReactNode;
    /** a line of help under the title */
    hint?: ReactNode;
    /** framed in the accent: the settings to decide first */
    highlight?: boolean;
}
/** A titled section of a settings form. */
export declare function SettingSection({ title, note, hint, highlight, className, children, ...rest }: SettingSectionProps): import('react').JSX.Element;
