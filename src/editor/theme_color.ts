// Theme tokens as three.js colors: the page never hard-codes a color, it asks the skin.
import * as THREE from "three";

let probe: HTMLElement | null = null;
let pixel: CanvasRenderingContext2D | null = null;

/** resolves `var(--token)` (or any CSS color) to a three.js Color through the browser */
export function themeColor(css: string, fallback = "gray"): THREE.Color {
  if (!probe) {
    probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    pixel = canvas.getContext("2d", { willReadFrequently: true });
  }
  probe.style.color = fallback;
  probe.style.color = css;
  // a canvas normalizes every color syntax (oklch, color-mix, color()) to sRGB bytes
  const ctx = pixel!;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = getComputedStyle(probe).color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}
