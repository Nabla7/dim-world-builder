import * as THREE from "three";
export { DEFAULT_GRADIENT, GRADIENTS, RAMPS, sampleGradient } from '../colormaps.ts';
/** The ramp or palette `name` as a 256×1 texture (cached). */
export declare function gradientTexture(name: string): THREE.DataTexture;
/** CSS linear-gradient for a ramp or a palette (settings swatches). */
export declare function gradientCss(name: string): string;
