import { SVGAttributes } from 'react';
import { ICONS } from '../icons_data.ts';
export { ICONS };
export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "name" | "path"> {
    /** a key of ICONS */
    name: string;
    /** px */
    size?: number;
    strokeWidth?: number;
    /** an accessible name (an unnamed icon is aria-hidden) */
    title?: string;
    /** your own SVG path data instead of a named icon */
    path?: string;
}
/** A dimOS line icon by `name` (or your own `path`). */
export declare function Icon({ name, size, strokeWidth, className, title, path, ...rest }: IconProps): import('react').JSX.Element;
