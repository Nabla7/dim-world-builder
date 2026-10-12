import { NumberInputProps, SelectProps } from '../components/controls.tsx';
import { CubeShade, PointLook } from './point_material.ts';
/**
 * A point look as the editors see it: `style` may also be "default" (follow the page-wide default style), and the
 * fields the editor always shows are set.
 */
export interface EditablePointLook extends Omit<PointLook, "style" | "gradient" | "solid"> {
    style: string;
    gradient: string;
    solid: string;
}
export interface StylePickerProps {
    value: string;
    onChange: (style: string) => void;
    withDefault?: string;
    className?: string;
}
/**
 * A card per point style with a one-line description; `withDefault` adds a "default · <style>" card that follows
 * the page-wide default (Settings → Rendering).
 */
export declare function StylePicker({ value, onChange, withDefault, className }: StylePickerProps): import('react').JSX.Element;
/** The page-wide cube shading (the `rendering` store), as a Select. */
export declare function CubeShadePicker(props: Partial<SelectProps<CubeShade>>): import('react').JSX.Element;
/**
 * Settings → Rendering for the 3D view: the default point style and cube shading, and the splat fallback's notice
 * (with a retry).
 */
export declare function RenderingSettings(): import('react').JSX.Element;
export interface PointLookEditorProps {
    look: EditablePointLook;
    onChange: (look: EditablePointLook) => void;
}
/**
 * Edits a point look (style, size, color mode, gradient, axis, range, opacity). Used by every layer that draws points.
 */
export declare function PointLookEditor({ look, onChange }: PointLookEditorProps): import('react').JSX.Element;
export interface RangeInputProps extends Omit<NumberInputProps, "value" | "onChange" | "placeholder"> {
    value?: number | null;
    onChange: (value: number | null) => void;
    placeholder?: string;
}
/** A number or nothing (null = automatic): empty input clears it. */
export declare function RangeInput({ value, onChange, placeholder, ...rest }: RangeInputProps): import('react').JSX.Element;
