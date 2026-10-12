import { $t as Slider, A as depthScale, Bn as headerFrameId, C as useStore, Cn as decodeMessage, Dn as parseKey, F as DEFAULT_GRADIENT, Ft as Badge, Gt as IconButton, It as Button, J as ColorSwatch, Ln as decode, Pn as useTopicList, Qn as themeColors, Qt as Select, R as GRADIENTS, S as readLocal, T as DEPTH_COLORMAPS, Ut as Field, V as RAMPS, W as isPalette, an as Toggle, b as Store, bt as EmptyState, jn as useDataSource, l as isDepthTopic, o as cameraInfoFor, q as sampleGradient, qt as NumberInput, rr as cx, s as cameraStreamsFor, sn as Icon, vt as Alert, w as writeLocal, x as localStore, z as PALETTES } from "./chunks/camera-q8Vl6GpJ.js";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import * as THREE from "three";
import { Matrix4, Quaternion, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
//#region src/three/on_top.ts
/** The three.js layer channel the on-top pass draws; the scene's own pass draws channel 0. */
var ON_TOP_CHANNEL = 1;
var OnTopPass = class {
	#roots = /* @__PURE__ */ new Set();
	/** `object` and everything under it (children added later too) on top, or back in the scene. */
	set(object, on) {
		if (on) {
			this.#roots.add(object);
			object.traverse((child) => child.layers.set(1));
		} else if (this.#roots.delete(object)) object.traverse((child) => child.layers.set(0));
	}
	has(object) {
		return this.#roots.has(object);
	}
	/** The scene, then (when anything is on top) the on-top objects over it. Lights must be on ON_TOP_CHANNEL too. */
	render(renderer, scene, camera) {
		if (!this.#roots.size) {
			renderer.render(scene, camera);
			return;
		}
		for (const root of this.#roots) root.traverse((child) => child.layers.set(1));
		renderer.render(scene, camera);
		const { autoClear } = renderer;
		const background = scene.background;
		const mask = camera.layers.mask;
		renderer.autoClear = false;
		scene.background = null;
		renderer.clearDepth();
		camera.layers.set(1);
		renderer.render(scene, camera);
		camera.layers.mask = mask;
		scene.background = background;
		renderer.autoClear = autoClear;
	}
};
//#endregion
//#region src/three/gradients.ts
var textures = /* @__PURE__ */ new Map();
/** The ramp or palette `name` as a 256×1 texture (cached). */
function gradientTexture(name) {
	let texture = textures.get(name);
	if (!texture) {
		const data = /* @__PURE__ */ new Uint8Array(1024);
		const cyclic = isPalette(name);
		for (let index = 0; index < 256; index++) {
			const [r, g, b] = sampleGradient(name, cyclic ? (index + .5) / 256 : index / 255);
			data.set([
				r,
				g,
				b,
				255
			], index * 4);
		}
		texture = new THREE.DataTexture(data, 256, 1);
		if (cyclic) texture.wrapS = THREE.RepeatWrapping;
		texture.colorSpace = THREE.NoColorSpace;
		texture.magFilter = THREE.LinearFilter;
		texture.minFilter = THREE.LinearFilter;
		texture.needsUpdate = true;
		textures.set(name, texture);
	}
	return texture;
}
/** CSS linear-gradient for a ramp or a palette (settings swatches). */
function gradientCss(name) {
	if (isPalette(name)) {
		const colors = (PALETTES[name] ?? PALETTES["aurora"]).colors;
		return `linear-gradient(90deg, ${[...colors, ...colors.slice(0, -1).reverse()].join(", ")})`;
	}
	return `linear-gradient(90deg, ${(RAMPS[name] ?? RAMPS["memworld"]).map(([position, hex]) => `${hex} ${position * 100}%`).join(", ")})`;
}
//#endregion
//#region src/three/point_material.ts
/** What glow splats fade into: the page behind the canvas (Viewer.setTheme keeps it on --scene-bg). */
var splatBackground = new THREE.Color().setRGB(0, 0, 0, THREE.NoColorSpace);
/** The point styles; each is a shader path selected by `uStyle` (plus a define when its shading differs). */
var POINT_STYLES = {
	voxel: {
		id: 2,
		label: "Cubes",
		define: "VOXEL",
		about: "lit cubes on the voxel grid"
	},
	splat: {
		id: 3,
		label: "Glow",
		define: "SPLAT",
		about: "soft gaussian splats fading into the background with distance"
	},
	disc: {
		id: 0,
		label: "Spheres",
		define: null,
		about: "lit spheres"
	},
	square: {
		id: 1,
		label: "Squares",
		define: null,
		about: "flat squares, the cheapest"
	}
};
/** How a cube's faces are lit. */
var CUBE_SHADES = {
	soft: {
		id: 0,
		label: "Soft",
		about: "gentle wrap-around light, no dark faces"
	},
	sky: {
		id: 1,
		label: "Sky",
		about: "lit from above: tops bright, sides mid, undersides dim"
	},
	outline: {
		id: 2,
		label: "Outlined",
		about: "flat color with thin dark edges"
	},
	bevel: {
		id: 3,
		label: "Beveled",
		about: "soft light with faces darkening toward their edges"
	},
	memworld: {
		id: 4,
		label: "Contrast",
		about: "strong per-face light"
	}
};
/** The look a point layer starts from; props override any field. */
var DEFAULT_LOOK = {
	style: "voxel",
	size: .05,
	colorMode: "height",
	gradient: "memworld",
	axis: 2,
	rangeMin: null,
	rangeMax: null,
	solid: "#ffffff",
	opacity: 1,
	cubeShade: "soft"
};
var COLOR = {
	height: 0,
	intensity: 1,
	range: 2,
	solid: 3
};
var VIEW_LIGHT = new THREE.Vector3(2, 4, 3).normalize();
var vertexShader = `
uniform float uSize;
uniform float uPxPerMeter;
uniform float uMinPx;
uniform int uStyle;
uniform int uColorMode;
uniform int uAxis;
uniform vec2 uRange;
uniform float uPeriod;
uniform vec3 uSolid;
uniform vec3 uSensor;
uniform float uNow;
uniform float uWindow;
uniform sampler2D uGradient;
uniform float uKeep;
uniform vec3 uClipMin;
uniform vec3 uClipMax;
attribute float aTime;
attribute float aIntensity;
varying vec3 vColor;
varying vec3 vCenter;
varying float vHalf;
varying float vViewDepth;

void main() {
    // attributes are only read when used, so an idle one isn't fetched for every point (10M points are vertex-bound)
#ifdef USE_WINDOW
    if (aTime < uNow - uWindow) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }
#endif
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    // the clip box (setClipBox): outside it, nothing is drawn
    if (any(lessThan(world, uClipMin)) || any(greaterThan(world, uClipMax))) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }
    vec3 center = uStyle == 2 ? (floor(world / uSize) + 0.5) * uSize : world;
#ifdef USE_INTENSITY
    float value = aIntensity;
#else
    float value = uColorMode == 2 ? distance(world, uSensor) : center[uAxis];
#endif
    // a repeating palette cycles every uPeriod meters (its texture wraps, so the repeat has no seam); a ramp spans uRange
    float t = uPeriod > 0.0 ? fract(value / uPeriod) : clamp((value - uRange.x) / max(1e-6, uRange.y - uRange.x), 0.0, 1.0);
    vColor = uColorMode == 3 ? uSolid : texture2D(uGradient, vec2(t, 0.5)).rgb;
    vec4 mv = viewMatrix * vec4(center, 1.0);
    float depth = max(1e-3, -mv.z);
    // a cube's silhouette can reach sqrt(3)/2 of its edge from the center; a splat's soft edge needs room too
    float px = uSize * uPxPerMeter / depth * (uStyle == 2 ? 1.8 : uStyle == 3 ? 1.8 : 1.0);
#ifdef SPLAT
    // over the splat budget, a stable random subset is drawn: blended splats are fill-bound, and where a map is dense
    // enough to exceed the budget its splats already overlap so much that the dropped ones don't change the picture
    if (fract(sin(float(gl_VertexID) * 12.9898) * 43758.5453) > uKeep) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }
    vViewDepth = depth;
#endif
    gl_Position = projectionMatrix * mv;
    // a splat right in front of the camera would be a screen-filling blob (and the most expensive fragment work)
    gl_PointSize = clamp(px, uMinPx, uStyle == 3 ? 64.0 : 512.0);
    vCenter = center;
    vHalf = 0.5 * gl_PointSize / uPxPerMeter * depth;
}
`;
var fragmentShader = `
uniform float uSize;
uniform int uStyle;
uniform float uOpacity;
uniform vec3 uLightWorld;
uniform vec2 uFog;
uniform vec3 uBackground;
uniform int uCubeShade;
// view-space light direction, MemWorld's normalize(2, 4, 3)
const vec3 LIGHT = vec3(0.3713907, 0.7427814, 0.5570860);
varying vec3 vColor;
varying vec3 vCenter;
varying float vHalf;
varying float vViewDepth;

void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
#if defined(SPLAT)
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float alpha = exp(-r2 * 3.2) * 0.85 * uOpacity;
    float fog = smoothstep(uFog.x, uFog.y, vViewDepth);
    vec3 color = mix(vColor * 1.15, uBackground, fog * 0.85);
    gl_FragColor = vec4(color * alpha, alpha);
#elif !defined(VOXEL)
    // disc / square never write depth themselves, so the GPU's early depth test keeps working for them
    if (uStyle == 1) {
        gl_FragColor = vec4(vColor, uOpacity);
        return;
    }
    // a ball: the sphere normal the disc implies, lit like MemWorld's voxel_sprites.js
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    vec3 n = vec3(p, sqrt(1.0 - r2));
    gl_FragColor = vec4(vColor * (0.45 + 0.75 * max(dot(n, LIGHT), 0.0)), uOpacity);
#else
    // voxel: cast this fragment's camera ray at the cube around vCenter
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 onSprite = vCenter + right * p.x * vHalf + up * p.y * vHalf;
    vec3 dir = normalize(onSprite - cameraPosition);
    vec3 h = vec3(0.5 * uSize);
    vec3 inv = 1.0 / dir;
    vec3 t0 = (vCenter - h - cameraPosition) * inv;
    vec3 t1 = (vCenter + h - cameraPosition) * inv;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);
    float tNear = max(max(tMin.x, tMin.y), tMin.z);
    float tFar = min(min(tMax.x, tMax.y), tMax.z);
    if (tNear > tFar || tFar < 0.0) discard;
    vec3 hit = cameraPosition + dir * tNear;
    vec3 local = (hit - vCenter) / h;
    vec3 a = abs(local);
    vec3 normal;
    vec2 face;
    if (a.x >= a.y && a.x >= a.z) { normal = vec3(sign(local.x), 0.0, 0.0); face = local.yz; }
    else if (a.y >= a.z) { normal = vec3(0.0, sign(local.y), 0.0); face = local.xz; }
    else { normal = vec3(0.0, 0.0, sign(local.z)); face = local.xy; }
    float rim = max(abs(face.x), abs(face.y));
    float ndl = dot(normal, uLightWorld);
    float light;
    if (uCubeShade == 0) {
        // wrap lighting: the face away from the light still keeps most of its color
        light = 0.66 + 0.36 * (0.5 + 0.5 * ndl) - 0.06 * smoothstep(0.9, 1.0, rim);
    } else if (uCubeShade == 1) {
        // hemisphere light from world up (z), with a small side bias so neighbouring side faces still differ
        light = normal.z > 0.5 ? 1.02 : normal.z < -0.5 ? 0.62 : 0.8 + 0.06 * (normal.x + 0.5 * normal.y);
        light -= 0.05 * smoothstep(0.9, 1.0, rim);
    } else if (uCubeShade == 2) {
        light = (0.9 + 0.08 * ndl) * (1.0 - 0.5 * smoothstep(0.88, 0.93, rim));
    } else if (uCubeShade == 3) {
        light = (0.72 + 0.3 * (0.5 + 0.5 * ndl)) * (1.0 - 0.22 * smoothstep(0.45, 1.0, rim));
    } else {
        // per-face light (MemWorld's cube faces): the view-space light turned into world space once per draw, on the CPU
        light = (0.42 + 0.72 * max(ndl, 0.0)) * (1.0 - 0.18 * smoothstep(0.86, 0.99, rim));
    }
    gl_FragColor = vec4(vColor * light, uOpacity);
#endif
}
`;
/** The camera's distance to what it orbits; the viewer keeps it current (splat fog is scaled by it). */
var focusDistance = { value: 10 };
/**
* @param pixelsPerMeter the viewer's (Viewer.pixelsPerMeter), shared so sprites size in meters
*/
function makePointMaterial(pixelsPerMeter) {
	const material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uSize: { value: .05 },
			uPxPerMeter: pixelsPerMeter,
			uMinPx: { value: 1.5 },
			uStyle: { value: 0 },
			uColorMode: { value: 0 },
			uAxis: { value: 2 },
			uRange: { value: new THREE.Vector2(0, 2) },
			uPeriod: { value: 0 },
			uSolid: { value: new THREE.Color().setRGB(1, 1, 1, THREE.NoColorSpace) },
			uSensor: { value: new THREE.Vector3() },
			uNow: { value: 0 },
			uWindow: { value: -1 },
			uOpacity: { value: 1 },
			uGradient: { value: gradientTexture("memworld") },
			uLightWorld: { value: new THREE.Vector3() },
			uKeep: { value: 1 },
			uFog: { value: new THREE.Vector2(10, 40) },
			uBackground: { value: splatBackground },
			uCubeShade: { value: 0 },
			uClipMin: { value: new THREE.Vector3(-1e9, -1e9, -1e9) },
			uClipMax: { value: new THREE.Vector3(1e9, 1e9, 1e9) }
		},
		defines: {}
	});
	const light = material.uniforms.uLightWorld.value;
	material.onBeforeRender = (_renderer, _scene, camera) => {
		light.copy(VIEW_LIGHT).transformDirection(camera.matrixWorld);
		const focus = focusDistance.value;
		material.uniforms.uFog.value.set(focus * .6, focus * 2.2);
	};
	return material;
}
/**
* Pushes a look into the material's uniforms; `range` is the resolved [min, max] when the look's is auto.
*/
function applyLook(material, partial, range) {
	const look = {
		...DEFAULT_LOOK,
		...partial
	};
	const uniforms = material.uniforms;
	uniforms.uCubeShade.value = CUBE_SHADES[look.cubeShade]?.id ?? 0;
	uniforms.uSize.value = Math.max(.001, look.size);
	const style = POINT_STYLES[look.style] ?? POINT_STYLES.disc;
	uniforms.uStyle.value = style.id;
	const wanted = /* @__PURE__ */ new Set();
	if (style.define) wanted.add(style.define);
	if (look.colorMode === "intensity") wanted.add("USE_INTENSITY");
	if (uniforms.uWindow.value >= 0) wanted.add("USE_WINDOW");
	const defines = material.defines;
	const current = Object.keys(defines);
	if (current.length !== wanted.size || current.some((name) => !wanted.has(name))) {
		for (const name of current) delete defines[name];
		for (const name of wanted) defines[name] = 1;
		material.needsUpdate = true;
	}
	uniforms.uColorMode.value = COLOR[look.colorMode] ?? 0;
	uniforms.uAxis.value = look.axis;
	uniforms.uRange.value.set(look.rangeMin ?? range[0], look.rangeMax ?? range[1]);
	uniforms.uSolid.value.setStyle(look.solid, THREE.NoColorSpace);
	uniforms.uOpacity.value = look.opacity;
	uniforms.uGradient.value = gradientTexture(look.gradient);
	uniforms.uPeriod.value = look.colorMode === "height" && isPalette(look.gradient) ? Math.max(.05, look.period ?? 9) : 0;
	const splat = look.style === "splat";
	material.transparent = splat || look.opacity < 1;
	material.depthWrite = !splat && look.opacity >= 1;
	material.blending = splat ? THREE.CustomBlending : THREE.NormalBlending;
	material.blendSrc = THREE.OneFactor;
	material.blendDst = THREE.OneMinusSrcAlphaFactor;
}
/**
* Draws only the points inside an axis-aligned box of the scene (world) frame; `null` bounds (or no call) = no limit
* on that side. `min` / `max` are [x, y, z] with nulls allowed.
*/
function setClipBox(material, min = null, max = null) {
	const big = 1e9;
	const at = (bounds, index, fallback) => bounds?.[index] ?? fallback;
	material.uniforms.uClipMin.value.set(at(min, 0, -1e9), at(min, 1, -1e9), at(min, 2, -1e9));
	material.uniforms.uClipMax.value.set(at(max, 0, big), at(max, 1, big), at(max, 2, big));
}
//#endregion
//#region src/three/follow.ts
/** how far behind the spring settles, seconds (~ its lag at a steady speed) */
var SMOOTH_SECONDS = .15;
var SNAP_GAP_SECONDS = 1;
var SmoothFollow = class {
	#at = null;
	#velocity = [
		0,
		0,
		0
	];
	/**
	* Where the camera should look this frame, given the target's latest position and the frame time.
	*/
	step(target, dtSeconds) {
		const at = this.#at;
		if (!at || dtSeconds > SNAP_GAP_SECONDS || Math.hypot(target[0] - at[0], target[1] - at[1], target[2] - at[2]) > 2) {
			this.#velocity = [
				0,
				0,
				0
			];
			const at = [...target];
			this.#at = at;
			return at;
		}
		const omega = 2 / SMOOTH_SECONDS;
		const x = omega * dtSeconds;
		const decay = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
		for (let axis = 0; axis < 3; axis++) {
			const change = at[axis] - target[axis];
			const pull = (this.#velocity[axis] + omega * change) * dtSeconds;
			this.#velocity[axis] = (this.#velocity[axis] - omega * pull) * decay;
			at[axis] = target[axis] + (change + pull) * decay;
		}
		return at;
	}
	reset() {
		this.#at = null;
	}
};
/** a pan this far (meters, or this share of the camera's distance if more) is the user looking around: following stops */
var PAN_PAUSE_METERS = .15;
var PAN_PAUSE_SHARE = .04;
/**
* Tells a deliberate pan from the slip of a pinch or an orbit: while following, a gesture's pan is undone ("undo")
* until it adds up past a threshold; then following stops and the whole pan is kept ("pause", with the earlier,
* undone part to put back so the view lands where the drag put it).
*/
var PanGate = class {
	#total = [
		0,
		0,
		0
	];
	/** a new drag or pinch began */
	start() {
		this.#total = [
			0,
			0,
			0
		];
	}
	/**
	* @param pan how far this frame's controls moved the target
	* @param distance camera to target
	*/
	step(pan, distance) {
		const before = this.#total;
		this.#total = [
			before[0] + pan[0],
			before[1] + pan[1],
			before[2] + pan[2]
		];
		if (Math.hypot(...this.#total) > Math.max(PAN_PAUSE_METERS, PAN_PAUSE_SHARE * distance)) {
			this.#total = [
				0,
				0,
				0
			];
			return {
				action: "pause",
				restore: before
			};
		}
		return { action: "undo" };
	}
};
/** how quickly a resumed follow brings the target back to the middle (seconds, its time constant) */
var CATCH_UP_SECONDS = .15;
//#endregion
//#region src/three/robot_model.ts
var ROBOT_KINDS = [
	"dog",
	"humanoid",
	"wheeled",
	"drone",
	"arrow"
];
/** A CSS color (or a token like "var(--primary)") as a THREE.Color; `fallback` when it can't be resolved. */
function cssColor(value, fallback = "#888888") {
	let text = value;
	if (typeof value === "string" && value.startsWith("var(") && typeof document !== "undefined") {
		const name = value.slice(4, -1).split(",")[0].trim();
		text = getComputedStyle(document.body ?? document.documentElement).getPropertyValue(name).trim();
	}
	const color = new THREE.Color();
	try {
		if (text && /^[a-z-]+\(/i.test(text) && !/^(rgb|hsl)a?\(/i.test(text) && typeof document !== "undefined") {
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 1;
			const context = canvas.getContext("2d");
			context.fillStyle = text;
			context.fillRect(0, 0, 1, 1);
			const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
			return color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
		}
		color.setStyle(text || fallback);
	} catch {
		color.setStyle(fallback);
	}
	return color;
}
function palette(colors = {}) {
	const theme = themeColors();
	return {
		body: cssColor(colors.body ?? theme.primary, "#5fb4e6"),
		dark: cssColor(colors.dark ?? theme.mutedFg, "#26323f"),
		nose: cssColor(colors.nose ?? theme.warn, "#f5b14c")
	};
}
function material$1(color, opacity = .85) {
	return new THREE.MeshLambertMaterial({
		color,
		transparent: opacity < 1,
		opacity,
		depthWrite: opacity >= 1
	});
}
function box(x, y, z, at, color) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material$1(color));
	mesh.position.set(...at);
	return mesh;
}
function cylinder(radius, length, at, axis, color) {
	const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), material$1(color));
	mesh.position.set(...at);
	if (axis === "x") mesh.rotation.z = Math.PI / 2;
	else if (axis === "z") mesh.rotation.x = Math.PI / 2;
	return mesh;
}
function heading(at, size, color) {
	const cone = new THREE.Mesh(new THREE.ConeGeometry(size * .5, size, 16), material$1(color, .95));
	cone.rotation.z = -Math.PI / 2;
	cone.position.set(...at);
	return cone;
}
var MAKERS = {
	dog(p) {
		const group = new THREE.Group();
		group.add(box(.6, .26, .14, [
			0,
			0,
			0
		], p.body));
		group.add(box(.14, .18, .12, [
			.33,
			0,
			.04
		], p.dark));
		for (const x of [.22, -.22]) for (const y of [.13, -.13]) group.add(cylinder(.025, .3, [
			x,
			y,
			-.2
		], "z", p.dark));
		group.add(heading([
			.45,
			0,
			.04
		], .08, p.nose));
		return group;
	},
	humanoid(p) {
		const group = new THREE.Group();
		group.add(box(.18, .34, .4, [
			0,
			0,
			.25
		], p.body));
		const head = new THREE.Mesh(new THREE.SphereGeometry(.1, 20, 14), material$1(p.dark));
		head.position.set(0, 0, .56);
		group.add(head);
		for (const y of [.1, -.1]) group.add(cylinder(.04, .6, [
			0,
			y,
			-.28
		], "z", p.dark));
		for (const y of [.22, -.22]) group.add(cylinder(.03, .42, [
			0,
			y,
			.22
		], "z", p.dark));
		group.add(heading([
			.16,
			0,
			.56
		], .07, p.nose));
		return group;
	},
	wheeled(p) {
		const group = new THREE.Group();
		group.add(box(.55, .45, .18, [
			0,
			0,
			0
		], p.body));
		for (const x of [.17, -.17]) for (const y of [.25, -.25]) group.add(cylinder(.09, .06, [
			x,
			y,
			-.06
		], "y", p.dark));
		group.add(heading([
			.33,
			0,
			.02
		], .09, p.nose));
		return group;
	},
	drone(p) {
		const group = new THREE.Group();
		group.add(box(.16, .16, .07, [
			0,
			0,
			0
		], p.body));
		for (const angle of [
			45,
			135,
			225,
			315
		]) {
			const radians = angle * Math.PI / 180;
			const arm = box(.26, .025, .02, [
				Math.cos(radians) * .13,
				Math.sin(radians) * .13,
				0
			], p.dark);
			arm.rotation.z = radians;
			group.add(arm);
			const rotor = cylinder(.08, .008, [
				Math.cos(radians) * .24,
				Math.sin(radians) * .24,
				.03
			], "z", p.body);
			rotor.material.opacity = .45;
			rotor.material.transparent = true;
			group.add(rotor);
		}
		group.add(heading([
			.13,
			0,
			0
		], .06, p.nose));
		return group;
	},
	arrow(p) {
		const group = new THREE.Group();
		group.add(cylinder(.025, .4, [
			.2,
			0,
			0
		], "x", p.body));
		group.add(heading([
			.45,
			0,
			0
		], .12, p.nose));
		return group;
	}
};
/**
* A stand-in model of `kind` (ROBOT_KINDS), or null for an unknown kind.
* @param colors CSS colors or tokens
*/
function robotModel(kind, colors) {
	const make = MAKERS[kind];
	if (!make) return null;
	const group = make(palette(colors));
	group.name = `robot-model-${kind}`;
	group.matrixAutoUpdate = false;
	group.renderOrder = 1;
	return group;
}
/** Disposes a model's geometries and materials (and removes it from its parent). */
function disposeTree(object) {
	object.traverse((child) => {
		const { geometry, material } = child;
		geometry?.dispose();
		if (Array.isArray(material)) material.forEach((item) => item.dispose());
		else material?.dispose();
	});
	object.removeFromParent();
}
//#endregion
//#region src/three/rendering.ts
/** The page-wide defaults (saved per viewer). A layer whose look says style "default" follows `pointStyle`. */
var rendering = localStore("dimos-react.rendering", {
	pointStyle: "voxel",
	cubeShade: "soft"
});
/** Set while splats are drawn as cubes because frames took longer than FRAME_BUDGET_MS for 3 s (the Viewer sets it). */
var splatFallback = new Store({
	active: false,
	frameMs: 0
});
var FRAME_BUDGET_MS = 16;
/**
* The style a layer draws with: its own, else the page default, with the fallback applied. A name that isn't a
* POINT_STYLES key passes through (applyLook draws it as "disc").
*/
function resolveStyle(style) {
	const chosen = !style || style === "default" ? rendering.get().pointStyle : style;
	return chosen === "splat" && splatFallback.get().active ? "voxel" : chosen;
}
/** A look with "default" style and the page's cube shading resolved, ready for applyLook. */
function resolveLook(look) {
	return {
		...look,
		style: resolveStyle(look.style),
		cubeShade: look.cubeShade ?? rendering.get().cubeShade
	};
}
//#endregion
//#region src/three/viewer.ts
var isPoints = (object) => !!object.isPoints;
var isMesh = (object) => !!object.isMesh;
var isLineSegments2 = (object) => !!object.isLineSegments2;
/**
* `direction` as a unit vector no further than `maxPolar` from +z (the orbit's limit): one below it keeps its heading
* and sits on the limit (straight down: from the front, -y). Null for a zero or non-finite direction.
*/
function limitPolar(direction, maxPolar) {
	const to = direction.clone().normalize();
	if (!Number.isFinite(to.x) || to.lengthSq() === 0) return null;
	if (Math.acos(THREE.MathUtils.clamp(to.z, -1, 1)) > maxPolar) {
		const flat = new THREE.Vector2(to.x, to.y);
		if (flat.lengthSq() < 1e-12) flat.set(0, -1);
		flat.normalize().multiplyScalar(Math.sin(maxPolar));
		to.set(flat.x, flat.y, Math.cos(maxPolar));
	}
	return to;
}
/** The canvas renders at the screen's resolution, up to 2× (beyond that the extra pixels cost more than they show). */
var pixelRatio = () => Math.min(2, globalThis.devicePixelRatio || 1);
var Viewer = class {
	renderer;
	labels;
	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(60, 1, .05, 1e4);
	controls;
	stats = new Store({
		fps: 0,
		frameMs: 0,
		latencyP50: null,
		latencyP95: null,
		arrivalToFrameMs: null,
		drawCalls: 0,
		points: 0
	});
	/** world units → pixels at 1 m depth; point shaders size by it */
	pixelsPerMeter = { value: 1 };
	/** view size in CSS pixels; thick-line materials share it */
	resolution = new THREE.Vector2(1, 1);
	fixedFrame = "world";
	/** where the camera follows (a point in the fixed frame); the React layer sets it each frame from followFrame */
	followTarget = null;
	/** a hidden view (display: none, a collapsed pane) draws nothing; what changed meanwhile is drawn once unpaused */
	paused = false;
	/** following stopped because the user panned away; `resumeFollow()` ends it */
	followPaused = new Store({ paused: false });
	/**
	* The clock things age by (ms): point-cloud windows, marker lifetimes, rates. performance.now() live; a replay's
	* playhead (Scene3D sets it from a replay source), so a paused replay doesn't age.
	*/
	dataClock = () => performance.now();
	#host;
	#dirty = true;
	#listeners = /* @__PURE__ */ new Set();
	#grid = null;
	#gridVisible = true;
	#gridSize = 200;
	#gridDivisions = 200;
	#frameTimes = [];
	#cpuTimes = [];
	#pendingData = [];
	#latencies = [];
	#arrivals = [];
	#lastStats = 0;
	#lastDeclutter = 0;
	#clock;
	#follow = new SmoothFollow();
	#lastFollow = new THREE.Vector3();
	#following = false;
	#followDelta = new THREE.Vector3();
	#catchingUp = false;
	#panGate = new PanGate();
	#beforeControls = new THREE.Vector3();
	#pan = new THREE.Vector3();
	#reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
	#lastFrame = 0;
	#frameRequest = 0;
	#resizeObserver;
	#disposed = false;
	#resetListeners = /* @__PURE__ */ new Set();
	#onTop = new OnTopPass();
	#slowSeconds = 0;
	/** a viewFrom() orbit in progress: unit directions (target → camera), start time, length */
	#glide = null;
	/**
	* @param host the element the canvas fills (give it a size; it is watched for resizes)
	* @param options `clock`: the clock message
	*   timestamps are in (ms, for latency; default Date.now). `near` / `far` / `fov`: the camera (defaults 0.05 m,
	*   10 km, 60°; a small model like a URDF wants near ≈ 0.001). `gridSize` (m) / `gridDivisions`: the ground grid
	*   (default 200 m in 1 m cells). `freeOrbit`: the camera may orbit below the ground (default: it stays above).
	*/
	constructor(host, { clock = () => Date.now(), grid = true, antialias = false, near = .05, far = 1e4, fov = 60, gridSize = 200, gridDivisions = 200, freeOrbit = false } = {}) {
		this.#host = host;
		this.#clock = clock;
		this.#gridVisible = grid;
		this.#gridSize = gridSize;
		this.#gridDivisions = gridDivisions;
		this.camera.near = near;
		this.camera.far = far;
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
		this.renderer = new THREE.WebGLRenderer({
			antialias,
			alpha: true,
			powerPreference: "high-performance"
		});
		this.renderer.setPixelRatio(pixelRatio());
		this.renderer.setClearColor(0, 0);
		this.renderer.domElement.className = "dr-scene-canvas";
		host.appendChild(this.renderer.domElement);
		this.labels = new CSS2DRenderer();
		this.labels.domElement.className = "dr-scene-labels";
		host.appendChild(this.labels.domElement);
		this.camera.up.set(0, 0, 1);
		this.camera.position.set(-6, -6, 5);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = .18;
		this.controls.screenSpacePanning = false;
		this.controls.maxPolarAngle = freeOrbit ? Math.PI : Math.PI * .495;
		this.controls.addEventListener("change", () => this.requestRender());
		this.controls.addEventListener("start", () => {
			this.#panGate.start();
			this.#glide = null;
		});
		const sky = new THREE.HemisphereLight(14543103, 2107440, 1.6);
		const sun = new THREE.DirectionalLight(16777215, 1.2);
		sun.position.set(5, 3, 10);
		for (const light of [sky, sun]) {
			light.layers.enable(1);
			this.scene.add(light);
		}
		this.setTheme();
		this.#resizeObserver = new ResizeObserver(() => this.#resize());
		this.#resizeObserver.observe(host);
		this.#watchPixelRatio();
		this.#resize();
		this.#frameRequest = requestAnimationFrame(this.#loop);
	}
	#makeGrid(dark) {
		const colors = themeColors();
		const grid = new THREE.GridHelper(this.#gridSize, this.#gridDivisions, cssColor(colors.sceneGridMajor || colors.border, "gray"), cssColor(colors.sceneGrid || colors.surface, "gray"));
		grid.rotation.x = Math.PI / 2;
		grid.userData.noPick = true;
		grid.material.transparent = true;
		grid.material.opacity = dark ? .7 : .55;
		grid.visible = this.#gridVisible;
		return grid;
	}
	/** Re-reads the theme: grid, fog and splat background (the background itself is CSS behind the canvas). */
	setTheme() {
		const dark = typeof document === "undefined" || getComputedStyle(document.documentElement).colorScheme.trim() !== "light";
		if (this.#grid) {
			this.scene.remove(this.#grid);
			this.#grid.geometry.dispose();
			this.#grid.material.dispose();
		}
		this.#grid = this.#makeGrid(dark);
		this.scene.add(this.#grid);
		const background = cssColor(themeColors().sceneBg || themeColors().bg, "black");
		this.scene.fog = dark ? null : new THREE.Fog(background, 40, 110);
		splatBackground.copy(background);
		this.requestRender();
	}
	/** Shows or hides the ground grid. */
	setGrid(visible) {
		this.#gridVisible = visible;
		if (this.#grid) this.#grid.visible = visible;
		this.requestRender();
	}
	/** Hides scene labels that overlap a more important one (frame names give way to data labels). */
	#declutter() {
		const elements = [...this.labels.domElement.querySelectorAll(".dr-scene-label")].filter((element) => element.style.display !== "none");
		const placed = [];
		const ranked = elements.map((element) => ({
			element,
			rect: element.getBoundingClientRect(),
			minor: element.classList.contains("dr-frame-label")
		})).sort((a, b) => Number(a.minor) - Number(b.minor));
		for (const { element, rect } of ranked) {
			const hit = placed.some((other) => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top);
			element.classList.toggle("dr-covered", hit);
			if (!hit) placed.push(rect);
		}
	}
	/**
	* The view as an image, now: runs the frame listeners, renders and reads the canvas in the same task (no
	* preserveDrawingBuffer needed). Returns a data URL (`type` default image/png).
	*/
	capture(type = "image/png") {
		const info = {
			now: performance.now(),
			dataNow: this.dataClock(),
			fixedFrame: this.fixedFrame,
			camera: this.camera
		};
		for (const listener of this.#listeners) listener(info);
		this.#render();
		return this.renderer.domElement.toDataURL(type);
	}
	/**
	* Draws `object` (and everything under it, children added later too) over the rest of the scene: in a second pass
	* after the depth buffer is cleared, so clouds and voxels never hide it (it still depth-tests against itself and
	* other on-top objects). Off (the default for every object): drawn in the scene, hidden by whatever is in front.
	*/
	setOnTop(object, on) {
		this.#onTop.set(object, on);
		this.requestRender();
	}
	#render() {
		this.#onTop.render(this.renderer, this.scene, this.camera);
	}
	/** Draw on the next frame. */
	requestRender() {
		this.#dirty = true;
	}
	/** Layers call this when a message changed what's drawn; the next frame draws it and times it. */
	noteData(timestampMs) {
		if (timestampMs !== void 0 && Number.isFinite(timestampMs)) this.#pendingData.push({
			ts: timestampMs,
			arrival: performance.now()
		});
		this.#dirty = true;
	}
	/** `listener()` when the data jumped (a replay's seek): layers drop what they gathered over time. */
	onReset(listener) {
		this.#resetListeners.add(listener);
		return () => this.#resetListeners.delete(listener);
	}
	/** Tells every layer the data jumped (Scene3D calls it on the source's seek). */
	reset() {
		for (const listener of [...this.#resetListeners]) try {
			listener();
		} catch (error) {
			console.error("[dimos-react] scene reset listener threw", error);
		}
		this.requestRender();
	}
	/**
	* `listener(frame)` every animation frame, before rendering. Returns unsubscribe.
	*/
	onFrame(listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
	/**
	* The point in the scene (the fixed frame) under a screen point (client px): the nearest drawn cloud point within
	* a few pixels of the ray or the nearest mesh hit, else where the ray meets the ground (z = 0). Null on a miss.
	*/
	pick(clientX, clientY) {
		const rect = this.renderer.domElement.getBoundingClientRect();
		const ndc = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
		const raycaster = new THREE.Raycaster();
		raycaster.layers.enable(1);
		raycaster.setFromCamera(ndc, this.camera);
		const { origin, direction } = raycaster.ray;
		const slope = 6 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 2 / Math.max(1, rect.height);
		let best = null;
		const meshes = [];
		const point = new THREE.Vector3();
		const offset = new THREE.Vector3();
		const visit = (object) => {
			if (!object.visible || object.userData.noPick) return;
			if (isPoints(object)) {
				const geometry = object.geometry;
				const position = geometry.getAttribute("position");
				if (position) {
					const end = Math.min(position.count, geometry.drawRange.start + geometry.drawRange.count);
					const array = position.array;
					const world = object.matrixWorld;
					for (let index = geometry.drawRange.start; index < end; index++) {
						point.set(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]).applyMatrix4(world);
						offset.subVectors(point, origin);
						const along = offset.dot(direction);
						if (along <= this.camera.near || best && along >= best.distance) continue;
						if (offset.addScaledVector(direction, -along).length() <= along * slope) best = {
							distance: along,
							point: point.clone(),
							on: "points",
							object
						};
					}
				}
			} else if (isMesh(object) && !isLineSegments2(object)) meshes.push(object);
			for (const child of object.children) visit(child);
		};
		this.scene.updateMatrixWorld();
		visit(this.scene);
		const hit = raycaster.intersectObjects(meshes, false)[0];
		if (hit && (!best || hit.distance < best.distance)) best = {
			distance: hit.distance,
			point: hit.point.clone(),
			on: "mesh",
			object: hit.object
		};
		if (best) return {
			point: best.point,
			on: best.on,
			object: best.object
		};
		const ground = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
		return ground ? {
			point: ground,
			on: "ground"
		} : null;
	}
	/** Looks at `target` from the current direction, `distance` away (from straight above: the default 3/4 view). */
	frame(target, distance) {
		const direction = this.camera.position.clone().sub(this.controls.target).normalize();
		if (!Number.isFinite(direction.x) || direction.lengthSq() === 0 || direction.z > .97) direction.set(-1, -1, .9).normalize();
		this.#place(target, target.clone().addScaledVector(direction, distance));
	}
	/** Frames everything drawn (dataBounds); false when nothing is drawn. */
	frameAll() {
		const box = this.dataBounds();
		if (!box) return false;
		const size = box.getSize(new THREE.Vector3()).length();
		this.frame(box.getCenter(new THREE.Vector3()), Math.max(2, size * .9));
		return true;
	}
	/**
	* Straight down on the area around `center` (the drawn data within 15 m of it, 12-30 m across), or without one on
	* everything drawn (or the origin).
	*/
	topDownAround(center) {
		const bounds = this.dataBounds();
		if (center) {
			let extent = 20;
			if (bounds) {
				const near = bounds.clone().intersect(new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(30, 30, 1e6)));
				if (!near.isEmpty()) {
					const size = near.getSize(new THREE.Vector3());
					extent = THREE.MathUtils.clamp(Math.max(size.x, size.y), 12, 30);
				}
			}
			this.topDown(center.clone(), extent);
		} else if (bounds) {
			const size = bounds.getSize(new THREE.Vector3());
			const middle = bounds.getCenter(new THREE.Vector3());
			this.topDown(middle.setZ(bounds.min.z), THREE.MathUtils.clamp(Math.max(size.x, size.y), 6, 400));
		} else this.topDown(new THREE.Vector3(), 20);
	}
	/** Straight down onto `target` from high enough that `extent` meters fit the shorter side of the view. */
	topDown(target, extent) {
		const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
		const fit = Math.min(1, this.camera.aspect);
		const height = extent / 2 / Math.tan(halfFov) / fit * 1.1;
		this.#place(target, new THREE.Vector3(target.x, target.y - height * .002, target.z + height));
	}
	/**
	* Orbits around the current target to look from `direction` (target → camera; need not be unit), keeping the
	* distance: a view cube's Top / Front / corner views. Glides there (`ms`, default 450; instant with
	* `animate: false` or prefers-reduced-motion). Without freeOrbit, directions below the horizon stop at it.
	*/
	viewFrom(direction, { animate = true, ms = 450 } = {}) {
		const to = limitPolar(direction, this.controls.maxPolarAngle);
		if (!to) return;
		const offset = this.camera.position.clone().sub(this.controls.target);
		const distance = offset.length() || 10;
		const from = offset.normalize();
		if (!animate || this.#reducedMotion?.matches || from.angleTo(to) < 1e-4) {
			this.#glide = null;
			this.#place(this.controls.target.clone(), this.controls.target.clone().addScaledVector(to, distance));
			return;
		}
		const turn = from.dot(to) < -.9999 ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI) : new THREE.Quaternion().setFromUnitVectors(from, to);
		this.#glide = {
			from,
			turn,
			start: performance.now(),
			ms,
			distance
		};
		this.requestRender();
	}
	/** One step of a viewFrom() glide (eased), around wherever the target is now (it may be following). */
	#stepGlide(now) {
		const glide = this.#glide;
		if (!glide) return;
		const t = THREE.MathUtils.clamp((now - glide.start) / glide.ms, 0, 1);
		const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		const direction = glide.from.clone().applyQuaternion(new THREE.Quaternion().slerp(glide.turn, eased)).normalize();
		this.#clearDamping();
		this.camera.position.copy(this.controls.target).addScaledVector(direction, glide.distance);
		this.camera.lookAt(this.controls.target);
		this.#dirty = true;
		if (t >= 1) this.#glide = null;
	}
	/** Drops OrbitControls' leftover damping, so a placed camera doesn't drift on. */
	#clearDamping() {
		const controls = this.controls;
		controls._sphericalDelta?.set(0, 0, 0);
		controls._panOffset?.set(0, 0, 0);
		if (controls._scale !== void 0) controls._scale = 1;
	}
	/** Puts the camera at `position` looking at `target` now (no leftover damping, no follow glide). */
	#place(target, position) {
		this.#clearDamping();
		this.controls.target.copy(target);
		this.camera.position.copy(position);
		this.camera.lookAt(target);
		this.controls.update();
		this.#following = false;
		this.#follow.reset();
		this.requestRender();
	}
	/** Stops following until `resumeFollow()`: the camera stays where it is. */
	pauseFollow() {
		if (!this.followPaused.get().paused) this.followPaused.set({ paused: true });
	}
	/** Follows again: the followed point glides back to the middle, angle and zoom kept. */
	resumeFollow() {
		this.#catchingUp = true;
		this.#following = false;
		this.#follow.reset();
		if (this.followPaused.get().paused) this.followPaused.set({ paused: false });
		this.requestRender();
	}
	/**
	* Where the drawn data is (point clouds and meshes, not the grid or helpers): the 2nd-98th percentile box of a
	* sample of their points. Null when nothing is drawn.
	*/
	dataBounds() {
		const xs = [], ys = [], zs = [];
		const point = new THREE.Vector3();
		this.scene.updateMatrixWorld();
		this.scene.traverseVisible((object) => {
			if (!(isPoints(object) || isMesh(object) && !isLineSegments2(object)) || object.userData.noPick) return;
			const geometry = object.geometry;
			const position = geometry?.getAttribute("position");
			if (!geometry || !position) return;
			const start = geometry.drawRange.start;
			const end = Math.min(position.count, start + geometry.drawRange.count);
			const stride = Math.max(1, Math.floor((end - start) / 2e4));
			for (let index = start; index < end; index += stride) {
				point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
				if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) {
					xs.push(point.x);
					ys.push(point.y);
					zs.push(point.z);
				}
			}
		});
		if (!xs.length) return null;
		const range = (values) => {
			values.sort((a, b) => a - b);
			return [values[Math.floor(values.length * .02)], values[Math.min(values.length - 1, Math.floor(values.length * .98))]];
		};
		const [x, y, z] = [
			range(xs),
			range(ys),
			range(zs)
		];
		return new THREE.Box3(new THREE.Vector3(x[0], y[0], z[0]), new THREE.Vector3(x[1], y[1], z[1]));
	}
	/** devicePixelRatio changes when the window moves between displays or the page is zoomed. */
	#watchPixelRatio() {
		(globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio}dppx)`))?.addEventListener("change", () => {
			if (this.#disposed) return;
			this.renderer.setPixelRatio(pixelRatio());
			this.#resize();
			this.#watchPixelRatio();
		}, { once: true });
	}
	#resize() {
		const width = Math.max(1, this.#host.clientWidth);
		const height = Math.max(1, this.#host.clientHeight);
		this.renderer.setSize(width, height);
		this.labels.setSize(width, height);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.resolution.set(width, height);
		this.pixelsPerMeter.value = height * this.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
		this.requestRender();
	}
	#loop = (now) => {
		if (this.#disposed) return;
		this.#frameRequest = requestAnimationFrame(this.#loop);
		const dt = this.#lastFrame ? (now - this.#lastFrame) / 1e3 : 0;
		this.#lastFrame = now;
		const reduced = !!this.#reducedMotion?.matches;
		const following = !!this.followTarget && !this.followPaused.get().paused;
		if (following) {
			const target = this.followTarget;
			if (reduced) this.#follow.reset();
			const [x, y, z] = this.#follow.step([
				target.x,
				target.y,
				target.z
			], dt);
			if (this.#catchingUp) {
				const gap = this.#followDelta.set(x, y, z).sub(this.controls.target);
				if (!reduced && gap.length() > .001) gap.multiplyScalar(1 - Math.exp(-dt / CATCH_UP_SECONDS));
				else this.#catchingUp = false;
				this.camera.position.add(gap);
				this.controls.target.add(gap);
				this.#dirty = true;
			} else if (this.#following) {
				const delta = this.#followDelta.set(x, y, z).sub(this.#lastFollow);
				if (delta.lengthSq() > 1e-10) {
					this.camera.position.add(delta);
					this.controls.target.add(delta);
					this.#dirty = true;
				}
			} else this.#catchingUp = true;
			this.#lastFollow.set(x, y, z);
			this.#following = true;
		} else {
			this.#following = false;
			this.#follow.reset();
		}
		this.#stepGlide(now);
		focusDistance.value = this.camera.position.distanceTo(this.controls.target);
		this.#beforeControls.copy(this.controls.target);
		if (this.controls.update()) this.#dirty = true;
		const pan = this.#pan.copy(this.controls.target).sub(this.#beforeControls);
		if (following && pan.lengthSq() > 0) {
			const verdict = this.#panGate.step([
				pan.x,
				pan.y,
				pan.z
			], focusDistance.value);
			if (verdict.action === "pause") {
				const [x, y, z] = verdict.restore;
				this.controls.target.add(this.#followDelta.set(x, y, z));
				this.camera.position.add(this.#followDelta);
				this.#catchingUp = false;
				this.pauseFollow();
			} else {
				this.controls.target.sub(pan);
				this.camera.position.sub(pan);
			}
		}
		const started = performance.now();
		const info = {
			now,
			dataNow: this.dataClock(),
			fixedFrame: this.fixedFrame,
			camera: this.camera
		};
		for (const listener of this.#listeners) try {
			listener(info);
		} catch (error) {
			console.error("[dimos-react] scene frame listener threw", error);
		}
		if (this.#dirty && !this.paused) {
			this.#dirty = false;
			this.#render();
			const mask = this.camera.layers.mask;
			this.camera.layers.enable(1);
			this.labels.render(this.scene, this.camera);
			this.camera.layers.mask = mask;
			if (now - this.#lastDeclutter > 150) {
				this.#lastDeclutter = now;
				this.#declutter();
			}
			const drawn = performance.now();
			if (this.#pendingData.length) {
				const clockNow = this.#clock();
				for (const data of this.#pendingData) {
					this.#latencies.push(clockNow - data.ts);
					this.#arrivals.push(drawn - data.arrival);
				}
				this.#pendingData.length = 0;
			}
			this.#cpuTimes.push(drawn - started);
		}
		this.#frameTimes.push(now);
		if (now - this.#lastStats > 1e3) this.#publishStats(now);
	};
	#publishStats(now) {
		const percentile = (values, p) => {
			if (!values.length) return null;
			const sorted = [...values].sort((a, b) => a - b);
			return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
		};
		const span = (now - this.#lastStats) / 1e3;
		let points = 0;
		let splats = false;
		this.scene.traverseVisible((object) => {
			if (isPoints(object)) {
				const material = object.material;
				splats ||= "SPLAT" in (material.defines ?? {});
				const geometry = object.geometry;
				points += Math.min(geometry.drawRange.count, geometry.getAttribute("position")?.count ?? 0);
			}
		});
		this.stats.set({
			fps: Math.round(this.#frameTimes.length / span),
			frameMs: this.#cpuTimes.length ? this.#cpuTimes.reduce((a, b) => a + b, 0) / this.#cpuTimes.length : 0,
			latencyP50: percentile(this.#latencies, .5),
			latencyP95: percentile(this.#latencies, .95),
			arrivalToFrameMs: percentile(this.#arrivals, .5),
			drawCalls: this.renderer.info.render.calls,
			points
		});
		const times = this.#frameTimes;
		const frameMs = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : 0;
		this.#slowSeconds = splats && frameMs > 20 ? this.#slowSeconds + 1 : 0;
		if (this.#slowSeconds >= 3 && !splatFallback.get().active) splatFallback.set({
			active: true,
			frameMs
		});
		this.#frameTimes.length = 0;
		this.#cpuTimes.length = 0;
		this.#latencies.length = 0;
		this.#arrivals.length = 0;
		this.#lastStats = now;
	}
	/** Stops the loop and frees the GPU context and DOM. */
	dispose() {
		this.#disposed = true;
		cancelAnimationFrame(this.#frameRequest);
		this.#resizeObserver.disconnect();
		this.controls.dispose();
		this.#grid?.geometry.dispose();
		this.#grid?.material.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss?.();
		this.renderer.domElement.remove();
		this.labels.domElement.remove();
		this.#listeners.clear();
		this.#resetListeners.clear();
	}
};
//#endregion
//#region src/three/view_cube.ts
/** how much of the cube's half-size counts as an edge or corner band (the rest of a face is the face) */
var EDGE_BAND = .3;
var FACES = [
	{
		normal: [
			0,
			0,
			1
		],
		up: [
			0,
			1,
			0
		],
		label: "Top"
	},
	{
		normal: [
			0,
			0,
			-1
		],
		up: [
			0,
			-1,
			0
		],
		label: "Bottom"
	},
	{
		normal: [
			0,
			-1,
			0
		],
		up: [
			0,
			0,
			1
		],
		label: "Front"
	},
	{
		normal: [
			0,
			1,
			0
		],
		up: [
			0,
			0,
			1
		],
		label: "Back"
	},
	{
		normal: [
			1,
			0,
			0
		],
		up: [
			0,
			0,
			1
		],
		label: "Right"
	},
	{
		normal: [
			-1,
			0,
			0
		],
		up: [
			0,
			0,
			1
		],
		label: "Left"
	}
];
/** The region under a point on the cube's surface (cube-local, half-size 1). */
function cubeRegion(point, band = EDGE_BAND) {
	const axis = (value) => value > 1 - band ? 1 : value < -(1 - band) ? -1 : 0;
	return [
		axis(point.x),
		axis(point.y),
		axis(point.z)
	];
}
/** "Top", "Front Right", "Top Front Left", ... */
function regionLabel([x, y, z]) {
	return [
		z > 0 ? "Top" : z < 0 ? "Bottom" : "",
		y < 0 ? "Front" : y > 0 ? "Back" : "",
		x > 0 ? "Right" : x < 0 ? "Left" : ""
	].filter(Boolean).join(" ");
}
/**
* The direction to look from (target → camera, unit) for a region. Straight above or below gets a hair of -y, so the
* screen's up stays +y (OrbitControls can't look exactly along its up axis).
*/
function regionDirection([x, y, z]) {
	const direction = new THREE.Vector3(x, y, z);
	if (x === 0 && y === 0) direction.y = -.002;
	return direction.normalize();
}
/** The highlight box of a region: its center and size, cube-local, a little proud of the surface. */
function regionBox(region, band = EDGE_BAND) {
	const proud = .04;
	const center = new THREE.Vector3();
	const size = new THREE.Vector3();
	region.forEach((value, axis) => {
		if (value === 0) {
			center.setComponent(axis, 0);
			size.setComponent(axis, 2 - 2 * band);
		} else {
			center.setComponent(axis, value * (1 - band / 2 + proud / 2));
			size.setComponent(axis, band + proud);
		}
	});
	return {
		center,
		size
	};
}
var faceColors = () => {
	const colors = themeColors();
	return {
		face: colors.raised || colors.surface || "#2a2f38",
		border: colors.border || "#4a505c",
		text: colors.fg || "#e6e8eb",
		hover: colors.primary || "#3b82f6",
		font: colors.sans || "system-ui, sans-serif"
	};
};
function faceTexture(label, colors) {
	const size = 256;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const context = canvas.getContext("2d");
	if (context) {
		context.fillStyle = colors.face;
		context.fillRect(0, 0, size, size);
		context.strokeStyle = colors.border;
		context.lineWidth = 10;
		context.strokeRect(5, 5, 246, 246);
		context.fillStyle = colors.text;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.font = `600 ${label.length > 5 ? 50 : 58}px ${colors.font}`;
		context.fillText(label.toUpperCase(), size / 2, 130);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}
var ViewCube = class {
	canvas;
	#viewer;
	#renderer;
	#scene = new THREE.Scene();
	#camera = new THREE.OrthographicCamera(-1.85, 1.85, 1.85, -1.85, .1, 50);
	#cube = new THREE.Group();
	#pickBox = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ visible: false }));
	#highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({
		transparent: true,
		opacity: .55,
		depthWrite: false
	}));
	#edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), new THREE.LineBasicMaterial({
		transparent: true,
		opacity: .9
	}));
	#faces = [];
	#hover = null;
	#lastQuaternion = new THREE.Quaternion(NaN, NaN, NaN, NaN);
	#dirty = true;
	#raycaster = new THREE.Raycaster();
	#drag = null;
	#offFrame;
	#onTheme = () => this.setTheme();
	constructor(viewer, parent, { corner = "top-right", size = 96 } = {}) {
		this.#viewer = viewer;
		this.#renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true
		});
		this.#renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
		this.#renderer.setSize(size, size);
		this.#renderer.setClearColor(0, 0);
		this.canvas = this.#renderer.domElement;
		this.canvas.className = `dr-scene-viewcube dr-scene-viewcube--${corner}`;
		this.canvas.setAttribute("role", "img");
		this.canvas.setAttribute("aria-label", "View cube: click a face, edge or corner to look from there");
		parent.appendChild(this.canvas);
		for (const face of FACES) {
			const normal = new THREE.Vector3(...face.normal);
			const up = new THREE.Vector3(...face.up);
			const right = up.clone().cross(normal);
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
			mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
			mesh.position.copy(normal);
			mesh.userData.label = face.label;
			this.#faces.push(mesh);
			this.#cube.add(mesh);
		}
		this.#highlight.visible = false;
		this.#highlight.renderOrder = 2;
		this.#cube.add(this.#pickBox, this.#edges, this.#highlight);
		this.#scene.add(this.#cube);
		this.setTheme();
		this.canvas.addEventListener("pointermove", this.#onMove);
		this.canvas.addEventListener("pointerleave", this.#onLeave);
		this.canvas.addEventListener("pointerdown", this.#onDown);
		this.canvas.addEventListener("pointerup", this.#onUp);
		this.canvas.addEventListener("pointercancel", this.#onCancel);
		this.canvas.addEventListener("wheel", this.#onWheel, { passive: false });
		addEventListener("dimos-react-theme", this.#onTheme);
		this.#offFrame = viewer.onFrame(() => this.#sync());
		this.#sync();
	}
	/** Re-reads the theme's colors (faces, edges, hover). */
	setTheme() {
		const colors = faceColors();
		for (const face of this.#faces) {
			face.material.map?.dispose();
			face.material.map = faceTexture(face.userData.label, colors);
			face.material.needsUpdate = true;
		}
		this.#edges.material.color.set(colors.border);
		this.#highlight.material.color.set(colors.hover);
		this.#dirty = true;
		this.#sync();
	}
	/** Mirrors the main camera: the cube shows the world's axes the way the view sees them. */
	#sync() {
		const camera = this.#viewer.camera;
		if (!this.#dirty && camera.quaternion.equals(this.#lastQuaternion)) return;
		this.#lastQuaternion.copy(camera.quaternion);
		this.#camera.quaternion.copy(camera.quaternion);
		this.#camera.position.set(0, 0, 10).applyQuaternion(camera.quaternion);
		this.#camera.updateMatrixWorld();
		this.#dirty = false;
		this.#renderer.render(this.#scene, this.#camera);
	}
	#regionAt(event) {
		const rect = this.canvas.getBoundingClientRect();
		const ndc = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
		this.#raycaster.setFromCamera(ndc, this.#camera);
		const hit = this.#raycaster.intersectObject(this.#pickBox, false)[0];
		return hit ? cubeRegion(this.#pickBox.worldToLocal(hit.point.clone())) : null;
	}
	#setHover(region) {
		if (region && this.#hover && region.every((value, axis) => value === this.#hover[axis]) || !region && !this.#hover) return;
		this.#hover = region;
		this.#highlight.visible = !!region;
		if (region) {
			const { center, size } = regionBox(region);
			this.#highlight.position.copy(center);
			this.#highlight.scale.copy(size);
		}
		this.canvas.title = region ? regionLabel(region) : "";
		this.canvas.style.cursor = region ? "pointer" : "";
		this.#dirty = true;
		this.#sync();
	}
	#onMove = (event) => {
		const drag = this.#drag;
		if (drag && drag.id === event.pointerId) {
			const dx = event.clientX - drag.x;
			const dy = event.clientY - drag.y;
			if (!drag.moved && Math.hypot(dx, dy) < 4) return;
			drag.moved = true;
			drag.x = event.clientX;
			drag.y = event.clientY;
			this.#orbit(dx, dy);
			return;
		}
		this.#setHover(this.#regionAt(event));
	};
	#onLeave = () => {
		if (!this.#drag) this.#setHover(null);
	};
	#onDown = (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		this.canvas.setPointerCapture?.(event.pointerId);
		this.#drag = {
			x: event.clientX,
			y: event.clientY,
			moved: false,
			id: event.pointerId
		};
	};
	#onUp = (event) => {
		const drag = this.#drag;
		this.#drag = null;
		this.canvas.releasePointerCapture?.(event.pointerId);
		if (!drag || drag.moved) return;
		const region = this.#regionAt(event);
		if (region) this.#viewer.viewFrom(regionDirection(region));
	};
	#onCancel = () => {
		this.#drag = null;
	};
	#onWheel = (event) => {
		event.preventDefault();
		this.#viewer.renderer.domElement.dispatchEvent(new WheelEvent("wheel", event));
	};
	/** Dragging the cube orbits the view around its target, like dragging the scene. */
	#orbit(dx, dy) {
		const viewer = this.#viewer;
		const offset = viewer.camera.position.clone().sub(viewer.controls.target);
		const spherical = new THREE.Spherical().setFromVector3(new THREE.Vector3(offset.x, offset.z, -offset.y));
		spherical.theta -= dx * .012;
		spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * .012, .001, viewer.controls.maxPolarAngle);
		const turned = new THREE.Vector3().setFromSpherical(spherical);
		viewer.viewFrom(new THREE.Vector3(turned.x, -turned.z, turned.y).normalize(), { animate: false });
	}
	dispose() {
		this.#offFrame();
		removeEventListener("dimos-react-theme", this.#onTheme);
		this.canvas.removeEventListener("pointermove", this.#onMove);
		this.canvas.removeEventListener("pointerleave", this.#onLeave);
		this.canvas.removeEventListener("pointerdown", this.#onDown);
		this.canvas.removeEventListener("pointerup", this.#onUp);
		this.canvas.removeEventListener("pointercancel", this.#onCancel);
		this.canvas.removeEventListener("wheel", this.#onWheel);
		this.#scene.traverse((object) => {
			const mesh = object;
			mesh.geometry?.dispose();
			const material = mesh.material;
			material?.map?.dispose();
			material?.dispose();
		});
		this.#renderer.dispose();
		this.#renderer.forceContextLoss?.();
		this.canvas.remove();
	}
};
//#endregion
//#region src/three/tf.ts
/** A dynamic edge older than this is "stale" (tf_static is exempt: it publishes rarely). */
var STALE_MS = 2e3;
/** Frames commonly used as the world, in preference order, when picking a default fixed frame. */
var WORLD_NAMES = [
	"world",
	"map",
	"odom"
];
var scratchVector = new Vector3();
var scratchQuaternion = new Quaternion();
var unitScale = new Vector3(1, 1, 1);
var clock = () => globalThis.performance?.now() ?? Date.now();
var TfTree = class {
	#edges = /* @__PURE__ */ new Map();
	#parentsSeen = /* @__PURE__ */ new Map();
	#cache = /* @__PURE__ */ new Map();
	#cacheFixed = "";
	#listeners = /* @__PURE__ */ new Set();
	/** bumped on every change, so layers know when to re-place what they drew */
	version = 0;
	now;
	/** @param options `now`: the clock (ms) for staleness; tests pass a fake one */
	constructor({ now = clock } = {}) {
		this.now = now;
	}
	/**
	* Sets T_parent_child.
	* @param rotation quaternion x, y, z, w
	*/
	set(parent, child, translation, rotation, isStatic = false) {
		if (!parent || !child || parent === child) return;
		let edge = this.#edges.get(child);
		if (!edge) {
			edge = {
				parent,
				matrix: new Matrix4(),
				isStatic,
				receivedAt: 0
			};
			this.#edges.set(child, edge);
		}
		edge.parent = parent;
		edge.isStatic = isStatic || edge.isStatic;
		edge.receivedAt = this.now();
		const quaternion = scratchQuaternion.set(...rotation);
		if (quaternion.lengthSq() < 1e-12) quaternion.set(0, 0, 0, 1);
		edge.matrix.compose(scratchVector.set(...translation), quaternion.normalize(), unitScale);
		let parents = this.#parentsSeen.get(child);
		if (!parents) {
			parents = /* @__PURE__ */ new Set();
			this.#parentsSeen.set(child, parents);
		}
		parents.add(parent);
		this.#changed();
	}
	/**
	* Feeds a decoded tf2_msgs.TFMessage (or an array of geometry_msgs.TransformStamped).
	*/
	setMessage(message, isStatic = false) {
		const transforms = Array.isArray(message) ? message : message?.transforms ?? [];
		for (const stamped of transforms) {
			const { translation, rotation } = stamped?.transform ?? {};
			if (!translation || !rotation) continue;
			this.set(stamped.header?.frame_id ?? "", stamped.child_frame_id ?? "", [
				translation.x ?? 0,
				translation.y ?? 0,
				translation.z ?? 0
			], [
				rotation.x ?? 0,
				rotation.y ?? 0,
				rotation.z ?? 0,
				rotation.w ?? 1
			], isStatic);
		}
	}
	/** Forgets every edge. */
	clear() {
		this.#edges.clear();
		this.#parentsSeen.clear();
		this.#changed();
	}
	#changed() {
		this.#cache.clear();
		this.version++;
		for (const listener of [...this.#listeners]) listener(this.version);
	}
	/** `listener(version)` after every change. Returns unsubscribe. */
	onChange(listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
	/** Whether the tree knows `frame` (as a child or a parent). */
	has(frame) {
		return this.#edges.has(frame) || [...this.#edges.values()].some((edge) => edge.parent === frame);
	}
	/** The parent of `frame`, or null for a root / unknown frame. */
	parentOf(frame) {
		return this.#edges.get(frame)?.parent ?? null;
	}
	/** The root above `frame` and T_root_frame, or null on a cycle. */
	#toRoot(frame) {
		const matrix = new Matrix4();
		let current = frame;
		for (let guard = 0; guard < 128; guard++) {
			const edge = this.#edges.get(current);
			if (!edge) return {
				root: current,
				matrix
			};
			matrix.premultiply(edge.matrix);
			current = edge.parent;
		}
		return null;
	}
	/**
	* T_fixed_frame: places data in `frame` into the fixed frame. An empty frame or the fixed frame itself is identity;
	* null when there is no path (different trees, unknown frame, a cycle). The result is cached: don't mutate it.
	*/
	lookup(frame, fixed) {
		if (fixed !== this.#cacheFixed) {
			this.#cache.clear();
			this.#cacheFixed = fixed;
		}
		const cached = this.#cache.get(frame);
		if (cached !== void 0) return cached;
		let result = null;
		if (frame === fixed || frame === "") result = new Matrix4();
		else {
			const from = this.#toRoot(frame);
			const to = this.#toRoot(fixed);
			if (from && to && from.root === to.root) result = to.matrix.clone().invert().multiply(from.matrix);
			else if (from && !this.has(fixed) && from.root === frame && WORLD_NAMES.includes(frame) && WORLD_NAMES.includes(fixed)) result = new Matrix4();
		}
		this.#cache.set(frame, result);
		return result;
	}
	/** The fixed frame to default to: a world-ish root if there is one, else the root of the biggest tree. */
	defaultFixedFrame() {
		const roots = this.#roots();
		for (const name of WORLD_NAMES) if (roots.includes(name)) return name;
		for (const name of WORLD_NAMES) if (this.has(name)) return name;
		let best = roots[0] ?? "world";
		let bestSize = -1;
		for (const root of roots) {
			const size = [...this.#edges.keys()].filter((child) => this.#toRoot(child)?.root === root).length;
			if (size > bestSize) {
				best = root;
				bestSize = size;
			}
		}
		return best;
	}
	#roots() {
		const roots = /* @__PURE__ */ new Set();
		for (const edge of this.#edges.values()) if (!this.#edges.has(edge.parent)) roots.add(edge.parent);
		return [...roots].sort();
	}
	/** Every frame name, sorted. */
	frames() {
		const frames = /* @__PURE__ */ new Set();
		for (const [child, edge] of this.#edges) {
			frames.add(child);
			frames.add(edge.parent);
		}
		return [...frames].sort();
	}
	snapshot() {
		const now = this.now();
		const edges = [];
		for (const [child, edge] of this.#edges) edges.push({
			parent: edge.parent,
			child,
			isStatic: edge.isStatic,
			ageMs: now - edge.receivedAt
		});
		return {
			frames: this.frames(),
			edges,
			problems: {
				doubleParent: [...this.#parentsSeen].filter(([, parents]) => parents.size > 1).map(([child, parents]) => [child, [...parents]]),
				roots: this.#roots(),
				cycle: [...this.#edges.keys()].filter((child) => this.#toRoot(child) === null),
				stale: edges.filter((edge) => !edge.isStatic && edge.ageMs > 2e3).map((edge) => edge.child)
			}
		};
	}
};
//#endregion
//#region src/three/cloud_quality.ts
var CLOUD_PRESETS = [
	{
		id: "low",
		label: "Low bandwidth",
		about: "up to 5 Hz, at most 1 point in 4 (fewer when the link is short)",
		maxHz: 5,
		quality: .25
	},
	{
		id: "balanced",
		label: "Balanced",
		about: "up to 20 Hz, every point unless the link is short",
		maxHz: 20,
		quality: 1
	},
	{
		id: "full",
		label: "Full",
		about: "up to 30 Hz, every point, never thinned (drops scans instead)",
		maxHz: 30,
		quality: 1,
		minQuality: 1
	}
];
/** The preset with `id`, else Balanced. */
var cloudPreset = (id) => CLOUD_PRESETS.find((preset) => preset.id === id) ?? CLOUD_PRESETS[1];
/** The gateway subscription for a cloud at a preset. */
function cloudOptions(preset) {
	return {
		delivery: "latest",
		encoding: "dimos_lcm_pointcloud2",
		maxHz: preset.maxHz,
		encodeOptions: { quality: preset.quality },
		...preset.minQuality !== void 0 ? { minQuality: preset.minQuality } : {}
	};
}
/** What changes going to `to` (zenoh-gateway >= 0.5.1's Subscription.update: null removes an option). */
function cloudChanges(to) {
	return {
		maxHz: to.maxHz,
		minQuality: to.minQuality ?? null,
		encodeOptions: { quality: to.quality }
	};
}
var QUALITY_KEY = "dimos-react.clouds.quality";
/** topic key → this viewer's preset (missing = Balanced) */
var cloudQualities = new Store(readLocal(QUALITY_KEY, {}));
function setCloudQuality(key, quality) {
	cloudQualities.update({ [key]: quality });
	writeLocal(QUALITY_KEY, cloudQualities.get());
}
var cloudQualityOf = (key) => cloudPreset(cloudQualities.get()[key]).id;
/** topic key → live rate of each cloud being drawn (gone when it stops) */
var cloudRates = new Store({});
function setCloudRate(key, rate) {
	const next = { ...cloudRates.get() };
	if (rate) next[key] = rate;
	else delete next[key];
	cloudRates.set(next);
}
/** A decoded cloud's `positions` (x, y, z, ...), if `value` has them. */
var positionsOf = (value) => value?.positions;
/**
* One cloud's subscription at its preset: a preset change updates it in place where the gateway can (else opens the
* new one, then closes the old), and it counts what arrives.
*/
var CloudStream = class {
	#stop;
	#preset;
	#closed = false;
	#counted = {
		scans: 0,
		points: 0,
		bytes: 0,
		since: 0
	};
	onMessage;
	key;
	source;
	/**
	* @param source a data source
	*/
	constructor(source, key, quality, onMessage, now = performance.now()) {
		this.source = source;
		this.key = key;
		this.onMessage = onMessage;
		this.#preset = cloudPreset(quality);
		this.#counted.since = now;
		this.#stop = this.#open();
	}
	get quality() {
		return this.#preset.id;
	}
	#open() {
		return this.source.subscribe(this.key, cloudOptions(this.#preset), (message) => {
			const positions = positionsOf(message.decoded) ?? positionsOf(message.value);
			this.#counted.scans++;
			this.#counted.points += positions ? positions.length / 3 : 0;
			this.#counted.bytes += message.bytes?.byteLength ?? 0;
			this.onMessage(message);
		});
	}
	async setQuality(quality) {
		const preset = cloudPreset(quality);
		if (this.#closed || preset.id === this.#preset.id) return;
		this.#preset = preset;
		const handle = this.#stop;
		if (handle.update) try {
			await handle.update(cloudChanges(preset));
			return;
		} catch {}
		if (this.#closed || this.#stop !== handle || this.#preset !== preset) return;
		this.#stop = this.#open();
		handle();
	}
	/** scans, points and bytes a second since the last call */
	sample(now = performance.now()) {
		const seconds = Math.max(.001, (now - this.#counted.since) / 1e3);
		const rate = {
			hz: this.#counted.scans / seconds,
			pointsPerSecond: this.#counted.points / seconds,
			bytesPerSecond: this.#counted.bytes / seconds
		};
		this.#counted = {
			scans: 0,
			points: 0,
			bytes: 0,
			since: now
		};
		return rate;
	}
	close() {
		this.#closed = true;
		this.#stop();
	}
};
var formatCount = (count) => count >= 1e6 ? `${(count / 1e6).toFixed(1)}M` : count >= 1e3 ? `${(count / 1e3).toFixed(count >= 1e4 ? 0 : 1)}k` : String(Math.round(count));
var formatBytes = (bytes) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : bytes >= 1e3 ? `${Math.round(bytes / 1e3)} kB` : `${Math.round(bytes)} B`;
//#endregion
//#region src/three/layers/registry.ts
/** Keeps `root` on top while `settings.onTop` says so; the returned function stops (and puts it back in the scene). */
function followOnTop(viewer, root, settings) {
	const apply = () => viewer.setOnTop(root, !!settings.get().onTop);
	apply();
	const off = settings.subscribe(apply);
	return () => {
		off();
		viewer.setOnTop(root, false);
	};
}
var layerTypes = [];
/** Registers a layer type (replacing one with the same id). */
function registerLayer(type) {
	const existing = layerTypes.findIndex((other) => other.id === type.id);
	if (existing >= 0) layerTypes.splice(existing, 1);
	layerTypes.push(type);
}
/** The layer type drawing a message type (the latest registration wins), or undefined. */
function layerTypeFor(messageType) {
	for (let index = layerTypes.length - 1; index >= 0; index--) if (layerTypes[index].types.includes(messageType)) return layerTypes[index];
}
/** A layer type by id. */
var layerTypeById = (id) => layerTypes.find((type) => type.id === id);
function allLayerTypes() {
	return layerTypes;
}
/** A type's default settings for a topic (a fresh copy). */
function defaultSettings(type, topic) {
	return typeof type.defaults === "function" ? type.defaults(topic) : structuredClone(type.defaults ?? {});
}
var overlayTypes = [];
/** Registers a 2D overlay drawn over camera images (e.g. Detection2DArray boxes). */
function registerOverlay(type) {
	const existing = overlayTypes.findIndex((other) => other.id === type.id);
	if (existing >= 0) overlayTypes.splice(existing, 1);
	overlayTypes.push(type);
}
function overlayTypeFor(messageType) {
	return [...overlayTypes].reverse().find((type) => type.types.includes(messageType));
}
function allOverlayTypes() {
	return overlayTypes;
}
/**
* Sets `object.matrix` to T_fixed_frame and shows it; with no TF path it hides it and reports why. Returns whether
* it could be placed.
*/
function placeLayer(context, object, frame, fixedFrame) {
	const matrix = context.tf.lookup(frame, fixedFrame);
	if (!matrix) {
		if (object.visible) {
			object.visible = false;
			context.viewer.requestRender();
		}
		context.setStatus({
			problem: `no TF path from "${frame}" to "${fixedFrame}"`,
			frame
		});
		return false;
	}
	if (!object.visible || !object.matrix.equals(matrix)) {
		object.matrix.copy(matrix);
		object.matrixWorldNeedsUpdate = true;
		object.visible = true;
		context.viewer.requestRender();
	}
	context.setStatus({
		problem: frame === "" ? "no frame_id: drawn in the fixed frame" : null,
		frame
	});
	return true;
}
/**
* Subscribes to a topic and hands each decoded message (and its timestamp) to `onMessage`; decode failures are
* counted into the layer's status. Returns unsubscribe.
*/
function subscribeDecoded(context, topic, options, onMessage) {
	let failures = 0;
	return context.source.subscribe(topic.key, {
		delivery: options.reliable ? "reliable" : "latest",
		maxHz: options.maxHz ?? 30
	}, (message) => {
		let decoded;
		try {
			decoded = decodeMessage(message, "auto", options.decodeAs ?? topic.type);
		} catch (error) {
			failures++;
			const reason = error instanceof Error ? error.message : error;
			context.setStatus({ problem: `cannot decode ${topic.type} (${failures}×): ${reason}` });
			return;
		}
		onMessage(decoded, message.timestamp, message);
	});
}
/** std_msgs ColorRGBA → THREE.Color + alpha. */
function rgba(color) {
	return {
		color: new THREE.Color(color?.r ?? 1, color?.g ?? 1, color?.b ?? 1),
		alpha: color?.a ?? 1
	};
}
/**
* The robot's latest pose in the fixed frame from any pose/odometry layer, for following it when no TF frame names
* the robot. The first topic to report keeps it until it goes away. One per Scene3D.
*/
var RobotPose = class {
	matrix = null;
	/** who reported it: a topic key, or the layer itself when it has no topic */
	source = null;
	report(source, matrix) {
		if (this.source === null || this.source === source) {
			this.source = source;
			this.matrix = matrix;
		}
	}
	forget(source) {
		if (this.source === source) {
			this.source = null;
			this.matrix = null;
		}
	}
};
//#endregion
//#region src/three/gradient_picker.tsx
function GradientPicker({ value, onChange, gradients = GRADIENTS, disabled, className, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-gradient-picker", className),
		role: "radiogroup",
		"aria-label": "Gradient",
		...rest,
		children: gradients.map((name) => /* @__PURE__ */ jsx("button", {
			type: "button",
			role: "radio",
			title: name,
			"aria-label": name,
			"aria-checked": name === value,
			disabled,
			className: "dr-gradient-picker__swatch",
			style: { background: gradientCss(name) },
			onClick: () => onChange?.(name)
		}, name))
	});
}
//#endregion
//#region src/three/look_editor.tsx
/**
* A card per point style with a one-line description; `withDefault` adds a "default · <style>" card that follows
* the page-wide default (Settings → Rendering).
*/
function StylePicker({ value, onChange, withDefault, className }) {
	const options = [...withDefault ? [[
		"default",
		`default · ${withDefault}`,
		"follow the page's default style"
	]] : [], ...Object.entries(POINT_STYLES).map(([style, info]) => [
		style,
		info.label,
		info.about
	])];
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-style-picker", className),
		role: "radiogroup",
		children: options.map(([style, label, about]) => /* @__PURE__ */ jsxs("button", {
			type: "button",
			role: "radio",
			"aria-checked": value === style,
			className: cx("dr-style-card", value === style && "dr-style-card--on"),
			onClick: () => onChange(style),
			title: about,
			children: [
				/* @__PURE__ */ jsx("span", { className: `dr-style-swatch dr-style-swatch--${style}` }),
				/* @__PURE__ */ jsx("span", {
					className: "dr-style-name",
					children: label
				}),
				/* @__PURE__ */ jsx("span", {
					className: "dr-style-about",
					children: about
				})
			]
		}, style))
	});
}
/** The page-wide cube shading (the `rendering` store), as a Select. */
function CubeShadePicker(props) {
	const { cubeShade } = useStore(rendering);
	return /* @__PURE__ */ jsx(Select, {
		value: cubeShade,
		options: Object.entries(CUBE_SHADES).map(([id, shade]) => ({
			value: id,
			label: shade.label
		})),
		onChange: (next) => rendering.update({ cubeShade: next }),
		...props
	});
}
/**
* Settings → Rendering for the 3D view: the default point style and cube shading, and the splat fallback's notice
* (with a retry).
*/
function RenderingSettings() {
	const value = useStore(rendering);
	const fallback = useStore(splatFallback);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Point style",
				hint: fallback.active ? `glow couldn't keep up (${fallback.frameMs.toFixed(0)} ms a frame): drawn as cubes` : "every point layer that keeps its style on default",
				children: /* @__PURE__ */ jsx(StylePicker, {
					value: value.pointStyle,
					onChange: (pointStyle) => rendering.update({ pointStyle })
				})
			}),
			fallback.active ? /* @__PURE__ */ jsx(Button, {
				size: "sm",
				onClick: () => splatFallback.set({
					active: false,
					frameMs: 0
				}),
				children: "Try glow again"
			}) : null,
			/* @__PURE__ */ jsx(Field, {
				label: "Cube shading",
				children: /* @__PURE__ */ jsx(CubeShadePicker, {})
			})
		]
	});
}
/**
* Edits a point look (style, size, color mode, gradient, axis, range, opacity). Used by every layer that draws points.
*/
function PointLookEditor({ look, onChange }) {
	const set = (patch) => onChange({
		...look,
		...patch
	});
	const global = useStore(rendering);
	const shown = look.style === "default" ? global.pointStyle : look.style;
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-look-editor",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Style",
				children: /* @__PURE__ */ jsx(StylePicker, {
					value: look.style,
					onChange: (style) => set({ style }),
					withDefault: POINT_STYLES[global.pointStyle]?.label
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: shown === "voxel" ? "Voxel" : "Size",
				children: /* @__PURE__ */ jsx(Slider, {
					min: .01,
					max: .5,
					step: .01,
					value: look.size,
					format: (size) => `${Math.round(size * 100)} cm`,
					onChange: (size) => set({ size })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Color",
				children: /* @__PURE__ */ jsx(Select, {
					value: look.colorMode,
					options: [
						["height", "by height"],
						["intensity", "by intensity"],
						["range", "by distance"],
						["solid", "solid"]
					],
					onChange: (colorMode) => set({ colorMode })
				})
			}),
			look.colorMode === "solid" ? /* @__PURE__ */ jsx(Field, {
				label: "Solid",
				children: /* @__PURE__ */ jsx(ColorSwatch, {
					value: look.solid,
					onChange: (solid) => set({ solid })
				})
			}) : [
				/* @__PURE__ */ jsx(GradientPicker, {
					value: look.gradient,
					onChange: (gradient) => set({ gradient })
				}, "gradients"),
				look.colorMode === "height" ? /* @__PURE__ */ jsx(Field, {
					label: "Axis",
					children: /* @__PURE__ */ jsx(Select, {
						value: look.axis,
						options: [
							[2, "z (height)"],
							[0, "x"],
							[1, "y"]
						],
						onChange: (axis) => set({ axis })
					})
				}, "axis") : null,
				/* @__PURE__ */ jsx(Field, {
					label: "Range",
					hint: "empty = automatic (5th–95th percentile)",
					children: /* @__PURE__ */ jsxs("span", {
						className: "dr-range-inputs",
						children: [/* @__PURE__ */ jsx(RangeInput, {
							value: look.rangeMin,
							onChange: (rangeMin) => set({ rangeMin })
						}), /* @__PURE__ */ jsx(RangeInput, {
							value: look.rangeMax,
							onChange: (rangeMax) => set({ rangeMax })
						})]
					})
				}, "range")
			],
			/* @__PURE__ */ jsx(Field, {
				label: "Opacity",
				children: /* @__PURE__ */ jsx(Slider, {
					min: .1,
					max: 1,
					step: .05,
					value: look.opacity ?? 1,
					format: (opacity) => `${Math.round(opacity * 100)}%`,
					onChange: (opacity) => set({ opacity })
				})
			})
		]
	});
}
/** A number or nothing (null = automatic): empty input clears it. */
function RangeInput({ value, onChange, placeholder = "auto", ...rest }) {
	return /* @__PURE__ */ jsx(NumberInput, {
		value,
		step: .1,
		placeholder,
		size: "sm",
		nullable: true,
		onChange,
		...rest
	});
}
//#endregion
//#region src/three/layers/pointcloud.tsx
var CLOUD_DEFAULTS = {
	look: {
		style: "default",
		size: .04,
		colorMode: "height",
		gradient: "memworld",
		axis: 2,
		rangeMin: null,
		rangeMax: null,
		solid: "#7fd4ff",
		opacity: 1
	},
	mode: "latest",
	windowSeconds: 10,
	maxPoints: 2e6
};
/** A map-like cloud by name (drawn with bigger points). */
var isMapTopic = (topic) => /map|global|voxel|terrain|costmap/i.test(topic?.name ?? "");
var SPLAT_BUDGET = 3e6;
/** How often a topic cloud's frame_id is re-read from one raw message (the encoding's output carries no header). */
var FRAME_RECHECK_MS = 3e4;
/**
* sensor_msgs.PointCloud2 (decoded) → `{ positions: Float32Array, intensity?: Uint8Array, frame }`: reads the x/y/z
* float32 fields (and intensity, scaled to 0..255) at their offsets; NaN points are skipped.
*/
function pointCloud2ToPositions(cloud) {
	const fields = Object.fromEntries((cloud.fields ?? []).map((field) => [field.name, field]));
	const step = cloud.point_step;
	const count = (cloud.width ?? 0) * (cloud.height ?? 1);
	const data = cloud.data;
	if (!fields.x || !fields.y || !fields.z || !step || !data) return {
		positions: /* @__PURE__ */ new Float32Array(0),
		frame: cloud.header?.frame_id ?? ""
	};
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const little = !cloud.is_bigendian;
	const positions = new Float32Array(count * 3);
	const intensityField = fields.intensity;
	const intensity = intensityField ? new Uint8Array(count) : void 0;
	const raw = intensityField ? new Float32Array(count) : null;
	let kept = 0;
	for (let index = 0; index < count; index++) {
		const at = index * step;
		if (at + step > data.byteLength) break;
		const x = view.getFloat32(at + fields.x.offset, little);
		const y = view.getFloat32(at + fields.y.offset, little);
		const z = view.getFloat32(at + fields.z.offset, little);
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
		positions[kept * 3] = x;
		positions[kept * 3 + 1] = y;
		positions[kept * 3 + 2] = z;
		if (raw && intensityField) raw[kept] = intensityField.datatype === 7 ? view.getFloat32(at + intensityField.offset, little) : view.getUint8(at + intensityField.offset);
		kept++;
	}
	if (raw && intensity) {
		let max = 0;
		for (let index = 0; index < kept; index++) max = Math.max(max, raw[index]);
		for (let index = 0; index < kept; index++) intensity[index] = max > 0 ? Math.round(raw[index] / max * 255) : 0;
	}
	return {
		positions: positions.subarray(0, kept * 3),
		intensity: intensity?.subarray(0, kept),
		frame: cloud.header?.frame_id ?? ""
	};
}
/** Any cloud-shaped value (decoded data: any shape) → `{ positions, intensity?, frame? }` or null. */
function cloudOf(value) {
	if (value?.positions) return {
		positions: value.positions,
		intensity: value.intensity,
		frame: value.frame ?? value.header?.frame_id
	};
	if (value?.fields) return pointCloud2ToPositions(value);
	return null;
}
var CloudLayer = class {
	root = new THREE.Group();
	#points;
	#geometry = new THREE.BufferGeometry();
	#material;
	#capacity = 0;
	#write = 0;
	#filled = 0;
	/** null until known: a cloud placed without its frame would ride the wrong pose */
	#frame = null;
	/** a frame given by the app (props), which wins over the data's */
	#fixedFrameOverride = void 0;
	#range = [0, 2];
	#rangeSeen = false;
	#unsubscribe = [];
	#stream = null;
	#rateSince = performance.now();
	#scans = 0;
	#frameTimer = void 0;
	#fixedFrame = "";
	#lastCount = 0;
	#mode;
	/** data-clock origin (ms): point times are seconds since it, small enough for float32 */
	#epoch;
	settings;
	topic;
	context;
	/** `topic` null: data comes through setData */
	constructor(context, topic, settings) {
		this.context = context;
		this.topic = topic;
		this.settings = settings;
		this.#mode = settings.get().mode;
		this.#epoch = context.viewer.dataClock();
		this.#material = makePointMaterial(context.viewer.pixelsPerMeter);
		this.#points = new THREE.Points(this.#geometry, this.#material);
		this.#points.frustumCulled = false;
		this.#points.matrixAutoUpdate = false;
		this.root.add(this.#points);
		this.#resize(1024);
		if (topic) {
			this.#readFrame();
			this.#frameTimer = setInterval(() => this.#readFrame(), FRAME_RECHECK_MS);
			this.#openStream();
			this.#unsubscribe.push(cloudQualities.subscribe(() => this.#stream?.setQuality(cloudQualityOf(topic.key))));
		}
		this.#unsubscribe.push(settings.subscribe(() => this.#onSettings()));
		this.#unsubscribe.push(rendering.subscribe(() => this.#onSettings()), splatFallback.subscribe(() => this.#onSettings()));
		this.#onSettings();
	}
	#openStream() {
		const topic = this.topic;
		if (!topic) return;
		const onMessage = (message) => {
			let value;
			try {
				value = decodeMessage(message, "auto", topic.type);
			} catch {
				return;
			}
			const cloud = cloudOf(value);
			if (!cloud) return;
			if (typeof cloud.frame === "string" && this.#frame === null) this.setFrame(cloud.frame);
			this.onCloud(cloud.positions, cloud.intensity, message.timestamp);
		};
		const { maxHz, quality } = this.settings.get();
		if (maxHz !== void 0 || quality !== void 0) {
			this.#stream = null;
			const stop = this.context.source.subscribe(topic.key, {
				delivery: "latest",
				maxHz: maxHz ?? 20,
				encoding: "dimos_lcm_pointcloud2",
				encodeOptions: { quality: quality ?? 1 }
			}, onMessage);
			this.#fixedStream = { stop };
			return;
		}
		this.#stream = new CloudStream(this.context.source, topic.key, cloudQualityOf(topic.key), onMessage);
	}
	#fixedStream = null;
	#onSettings() {
		const settings = this.settings.get();
		if (settings.frame !== void 0 && settings.frame !== this.#fixedFrameOverride) this.setFrame(settings.frame, true);
		if (settings.mode !== this.#mode) {
			this.#mode = settings.mode;
			this.#clear();
		}
		this.#material.uniforms.uWindow.value = settings.mode === "accumulate" && settings.windowSeconds > 0 ? settings.windowSeconds : -1;
		applyLook(this.#material, resolveLook(settings.look), this.#range);
		this.#syncSplatBudget();
		this.context.viewer.requestRender();
	}
	/** One raw message for its header's frame_id, then unsubscribe (a raw cloud is big). */
	#readFrame() {
		const topic = this.topic;
		if (this.#fixedFrameOverride !== void 0 || !topic) return;
		let stop = null;
		stop = this.context.source.subscribe(topic.key, {
			delivery: "latest",
			maxHz: 1
		}, (message) => {
			let frame = null;
			const value = message.value ?? message.decoded;
			try {
				frame = value ? value.frame ?? value.header?.frame_id ?? null : headerFrameId(topic.type, message.bytes);
			} catch {}
			if (typeof frame === "string") this.setFrame(frame);
			stop?.();
			stop = null;
		});
		this.#unsubscribe.push(() => stop?.());
	}
	/** The cloud's frame (an app-given frame wins over the data's). */
	setFrame(frame, override = false) {
		if (override) this.#fixedFrameOverride = frame;
		const next = this.#fixedFrameOverride ?? frame;
		if (next !== this.#frame) {
			this.#frame = next;
			this.#clear();
		}
	}
	/** Props data: `{ positions | points, intensity?, frame?, timestamp? }` or a decoded PointCloud2 (any shape). */
	setData(data) {
		const cloud = cloudOf(data?.points ? {
			...data,
			positions: data.points
		} : data);
		if (!cloud) return;
		const positions = cloud.positions instanceof Float32Array ? cloud.positions : Float32Array.from(cloud.positions);
		this.setFrame(cloud.frame ?? this.#frame ?? "");
		this.onCloud(positions, cloud.intensity, data.timestamp ?? Date.now());
	}
	#syncSplatBudget() {
		this.#material.uniforms.uKeep.value = Math.min(1, SPLAT_BUDGET / Math.max(1, this.#filled));
	}
	#resize(capacity) {
		this.#capacity = capacity;
		const position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
		const time = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
		const intensity = new THREE.BufferAttribute(new Uint8Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
		this.#geometry.dispose();
		this.#geometry = new THREE.BufferGeometry();
		this.#geometry.setAttribute("position", position);
		this.#geometry.setAttribute("aTime", time);
		this.#geometry.setAttribute("aIntensity", intensity);
		this.#geometry.setDrawRange(0, 0);
		this.#points.geometry = this.#geometry;
		this.#write = 0;
		this.#filled = 0;
	}
	#clear() {
		this.#write = 0;
		this.#filled = 0;
		this.#rangeSeen = false;
		this.#geometry.setDrawRange(0, 0);
		this.context.viewer.requestRender();
	}
	/** One scan: xyz triples (in the cloud's frame) and optional 0..255 intensity. */
	onCloud(positions, intensity, timestamp) {
		if (this.#frame === null) return;
		const settings = this.settings.get();
		const count = Math.floor(positions.length / 3);
		this.#lastCount = count;
		this.#scans++;
		const accumulate = settings.mode === "accumulate";
		let transform = null;
		if (accumulate) {
			transform = this.context.tf.lookup(this.#frame, this.context.viewer.fixedFrame);
			if (!transform) {
				this.context.setStatus({
					problem: `no TF path from "${this.#frame}" to "${this.context.viewer.fixedFrame}"`,
					frame: this.#frame
				});
				return;
			}
		}
		const wanted = accumulate ? Math.max(count, settings.maxPoints) : count;
		if (wanted > this.#capacity || !accumulate && this.#capacity > 4 * Math.max(wanted, 1024)) this.#resize(accumulate ? wanted : Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(1, wanted)))));
		const position = this.#geometry.getAttribute("position");
		const time = this.#geometry.getAttribute("aTime");
		const strength = this.#geometry.getAttribute("aIntensity");
		const now = (this.context.viewer.dataClock() - this.#epoch) / 1e3;
		const start = accumulate ? this.#write : 0;
		const xyz = position.array;
		const times = time.array;
		const values = strength.array;
		const e = transform?.elements;
		for (let index = 0; index < count; index++) {
			const slot = (start + index) % this.#capacity;
			const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
			if (e) {
				xyz[slot * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
				xyz[slot * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
				xyz[slot * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
			} else {
				xyz[slot * 3] = x;
				xyz[slot * 3 + 1] = y;
				xyz[slot * 3 + 2] = z;
			}
			times[slot] = now;
			values[slot] = intensity ? intensity[index] : 0;
		}
		for (const attribute of [
			position,
			time,
			strength
		]) {
			attribute.clearUpdateRanges();
			const size = attribute.itemSize;
			const firstLength = Math.min(count, this.#capacity - start);
			attribute.addUpdateRange(start * size, firstLength * size);
			if (firstLength < count) attribute.addUpdateRange(0, (count - firstLength) * size);
			attribute.needsUpdate = true;
		}
		if (accumulate) {
			this.#write = (start + count) % this.#capacity;
			this.#filled = Math.min(this.#capacity, this.#filled + count);
			this.#points.matrix.identity();
		} else this.#filled = count;
		this.#geometry.setDrawRange(0, this.#filled);
		this.#syncSplatBudget();
		this.#updateRange(positions, intensity, transform ?? this.context.tf.lookup(this.#frame, this.context.viewer.fixedFrame));
		this.context.viewer.noteData(timestamp);
	}
	/** Auto color range: 5th-95th percentile of a sample, eased so it doesn't flicker scan to scan. */
	#updateRange(positions, intensity, transform) {
		const look = this.settings.get().look;
		const count = positions.length / 3;
		if (!count) return;
		let low, high;
		if (look.colorMode === "intensity") [low, high] = intensity ? [0, 255] : [0, 1];
		else {
			const e = transform?.elements ?? new THREE.Matrix4().elements;
			const step = Math.max(1, Math.floor(count / 2048));
			const samples = [];
			for (let index = 0; index < count; index += step) {
				const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
				const world = [
					e[0] * x + e[4] * y + e[8] * z + e[12],
					e[1] * x + e[5] * y + e[9] * z + e[13],
					e[2] * x + e[6] * y + e[10] * z + e[14]
				];
				samples.push(look.colorMode === "range" ? Math.hypot(world[0] - e[12], world[1] - e[13], world[2] - e[14]) : world[look.axis ?? 2]);
			}
			samples.sort((a, b) => a - b);
			low = look.colorMode === "range" ? 0 : samples[Math.floor(samples.length * .05)];
			high = samples[Math.floor(samples.length * .95)];
		}
		if (!this.#rangeSeen) {
			this.#range = [low, high];
			this.#rangeSeen = true;
		} else this.#range = [this.#range[0] + (low - this.#range[0]) * .2, this.#range[1] + (high - this.#range[1]) * .2];
		applyLook(this.#material, resolveLook(look), this.#range);
	}
	/** The data jumped (a replay's seek): an accumulated map starts over. */
	reset() {
		if (this.settings.get().mode === "accumulate") this.#clear();
	}
	update(frame) {
		const settings = this.settings.get();
		if (frame.fixedFrame !== this.#fixedFrame) {
			this.#fixedFrame = frame.fixedFrame;
			if (settings.mode === "accumulate") this.#clear();
		}
		this.#material.uniforms.uNow.value = (frame.dataNow - this.#epoch) / 1e3;
		if (settings.mode === "accumulate" && settings.windowSeconds > 0) this.context.viewer.requestRender();
		if (this.#frame !== null) {
			if (settings.mode === "accumulate" || placeLayer(this.context, this.#points, this.#frame, frame.fixedFrame)) {
				const sensor = this.context.tf.lookup(this.#frame, frame.fixedFrame);
				if (sensor) this.#material.uniforms.uSensor.value.setFromMatrixPosition(sensor);
			}
		}
		if (frame.now - this.#rateSince > 1e3) {
			const seconds = (frame.now - this.#rateSince) / 1e3;
			this.#rateSince = frame.now;
			let rate;
			if (this.#stream && this.topic) {
				rate = this.#stream.sample(frame.now);
				setCloudRate(this.topic.key, rate);
			} else rate = {
				hz: this.#scans / seconds,
				bytesPerSecond: 0
			};
			this.#scans = 0;
			const kept = settings.mode === "accumulate" ? `${formatCount(this.#filled)} kept · ` : "";
			const bytes = rate.bytesPerSecond ? ` · ${formatBytes(rate.bytesPerSecond)}/s` : "";
			this.context.setStatus({
				info: this.#frame === null ? "waiting for frame_id…" : `${kept}${formatCount(this.#lastCount)} pts · ${rate.hz.toFixed(1)} Hz${bytes} · ${this.#frame || "no frame"}`,
				frame: this.#frame ?? void 0
			});
		}
	}
	dispose() {
		clearInterval(this.#frameTimer);
		this.#unsubscribe.forEach((stop) => stop());
		this.#stream?.close();
		this.#fixedStream?.stop();
		if (this.topic) setCloudRate(this.topic.key, null);
		this.#geometry.dispose();
		this.#material.dispose();
	}
};
/** This viewer's bandwidth preset for a cloud topic (shared by every place that shows it). */
function CloudQualitySelect({ topicKey, ...rest }) {
	useStore(cloudQualities);
	return /* @__PURE__ */ jsx(Select, {
		value: cloudQualityOf(topicKey),
		options: CLOUD_PRESETS.map((preset) => [preset.id, preset.label]),
		onChange: (quality) => setCloudQuality(topicKey, quality),
		...rest
	});
}
/** A point-cloud layer's settings: its look, keep mode and window, and this viewer's bandwidth preset. */
function CloudSettingsEditor({ settings, topic }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [
			/* @__PURE__ */ jsx(PointLookEditor, {
				look: value.look,
				onChange: (look) => settings.update({ look })
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Keep",
				children: /* @__PURE__ */ jsx(Select, {
					value: value.mode,
					options: [["latest", "latest scan"], ["accumulate", "accumulate"]],
					onChange: (mode) => settings.update({ mode })
				})
			}),
			value.mode === "accumulate" ? /* @__PURE__ */ jsx(Field, {
				label: "Window",
				children: /* @__PURE__ */ jsx(Select, {
					value: value.windowSeconds,
					options: [
						[5, "5 s"],
						[10, "10 s"],
						[30, "30 s"],
						[120, "2 min"],
						[0, "forever"]
					],
					onChange: (windowSeconds) => settings.update({ windowSeconds })
				})
			}) : null,
			topic ? /* @__PURE__ */ jsx(Field, {
				label: "Bandwidth",
				hint: `this viewer's: ${CLOUD_PRESETS.map((preset) => `${preset.label}: ${preset.about}`).join("; ")}`,
				children: /* @__PURE__ */ jsx(CloudQualitySelect, { topicKey: topic.key })
			}) : null
		]
	});
}
registerLayer({
	id: "pointcloud",
	label: "Point cloud",
	types: ["sensor_msgs.PointCloud2"],
	defaults: (topic) => isMapTopic(topic) ? {
		...CLOUD_DEFAULTS,
		look: {
			...CLOUD_DEFAULTS.look,
			size: .1
		}
	} : structuredClone(CLOUD_DEFAULTS),
	create: (context, topic, settings) => new CloudLayer(context, topic, settings),
	Settings: CloudSettingsEditor
});
//#endregion
//#region src/three/lines.ts
var FatLines = class {
	object;
	material;
	#geometry = new LineSegmentsGeometry();
	/** allocated by the constructor */
	#positions = null;
	#colors = null;
	#positionBuffer = null;
	#colorBuffer = null;
	#capacity = 0;
	#dirtyFrom = 0;
	count = 0;
	/**
	* @param resolution the view size in CSS px (Viewer.resolution), shared so widths stay in px
	*/
	constructor(resolution, options) {
		this.material = new LineMaterial({
			linewidth: options.width,
			color: options.vertexColors ? 16777215 : options.color ?? 16777215,
			vertexColors: !!options.vertexColors,
			transparent: (options.opacity ?? 1) < 1,
			opacity: options.opacity ?? 1,
			dashed: !!options.dashed,
			worldUnits: !!options.worldUnits
		});
		this.material.uniforms.resolution.value = resolution;
		this.object = new LineSegments2(this.#geometry, this.material);
		this.object.frustumCulled = false;
		this.#allocate(options.capacity ?? 64, !!options.vertexColors);
	}
	#allocate(capacity, withColors) {
		const positions = new Float32Array(capacity * 6);
		if (this.#positions) positions.set(this.#positions.subarray(0, this.count * 6));
		this.#positions = positions;
		this.#dirtyFrom = 0;
		const positionBuffer = new THREE.InstancedInterleavedBuffer(positions, 6, 1).setUsage(THREE.DynamicDrawUsage);
		this.#positionBuffer = positionBuffer;
		this.#geometry.setAttribute("instanceStart", new THREE.InterleavedBufferAttribute(positionBuffer, 3, 0));
		this.#geometry.setAttribute("instanceEnd", new THREE.InterleavedBufferAttribute(positionBuffer, 3, 3));
		if (withColors) {
			const colors = new Float32Array(capacity * 6);
			if (this.#colors) colors.set(this.#colors.subarray(0, this.count * 6));
			this.#colors = colors;
			const colorBuffer = new THREE.InstancedInterleavedBuffer(colors, 6, 1).setUsage(THREE.DynamicDrawUsage);
			this.#colorBuffer = colorBuffer;
			this.#geometry.setAttribute("instanceColorStart", new THREE.InterleavedBufferAttribute(colorBuffer, 3, 0));
			this.#geometry.setAttribute("instanceColorEnd", new THREE.InterleavedBufferAttribute(colorBuffer, 3, 3));
		}
		this.#capacity = capacity;
	}
	#reserve(count) {
		if (count > this.#capacity) this.#allocate(Math.max(count, this.#capacity * 2), this.#colors !== null);
	}
	clear() {
		this.count = 0;
		this.#dirtyFrom = 0;
		this.#geometry.instanceCount = 0;
	}
	/** Appends one segment (and its color when the lines have vertex colors). */
	push(ax, ay, az, bx, by, bz, color) {
		this.#reserve(this.count + 1);
		this.#dirtyFrom = Math.min(this.#dirtyFrom, this.count);
		const at = this.count * 6;
		const positions = this.#positions;
		positions[at] = ax;
		positions[at + 1] = ay;
		positions[at + 2] = az;
		positions[at + 3] = bx;
		positions[at + 4] = by;
		positions[at + 5] = bz;
		const colors = this.#colors;
		if (colors && color) {
			colors[at] = colors[at + 3] = color.r;
			colors[at + 1] = colors[at + 4] = color.g;
			colors[at + 2] = colors[at + 5] = color.b;
		}
		this.count++;
	}
	/** Drops the oldest `count` segments (a trail over its limit). */
	shift(count) {
		count = Math.min(count, this.count);
		this.#positions.copyWithin(0, count * 6, this.count * 6);
		this.#colors?.copyWithin(0, count * 6, this.count * 6);
		this.count -= count;
		this.#dirtyFrom = 0;
	}
	/** Uploads what changed since the last commit. */
	commit() {
		const from = Math.min(this.#dirtyFrom, this.count) * 6;
		const length = this.count * 6 - from;
		for (const buffer of [this.#positionBuffer, this.#colorBuffer]) if (buffer && length > 0) {
			buffer.clearUpdateRanges();
			buffer.addUpdateRange(from, length);
			buffer.needsUpdate = true;
		}
		this.#dirtyFrom = this.count;
		this.#geometry.instanceCount = this.count;
	}
	dispose() {
		this.#geometry.dispose();
		this.material.dispose();
	}
};
/** Twelve edges of a box centered at the origin with full sizes (x, y, z), pushed into `lines` through `matrix`. */
function pushBox(lines, matrix, size, color) {
	const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
	const corners = [
		[
			-hx,
			-hy,
			-hz
		],
		[
			hx,
			-hy,
			-hz
		],
		[
			hx,
			hy,
			-hz
		],
		[
			-hx,
			hy,
			-hz
		],
		[
			-hx,
			-hy,
			hz
		],
		[
			hx,
			-hy,
			hz
		],
		[
			hx,
			hy,
			hz
		],
		[
			-hx,
			hy,
			hz
		]
	].map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(matrix));
	for (const [a, b] of [
		[0, 1],
		[1, 2],
		[2, 3],
		[3, 0],
		[4, 5],
		[5, 6],
		[6, 7],
		[7, 4],
		[0, 4],
		[1, 5],
		[2, 6],
		[3, 7]
	]) lines.push(corners[a].x, corners[a].y, corners[a].z, corners[b].x, corners[b].y, corners[b].z, color);
}
//#endregion
//#region src/three/layers/pose.tsx
var POSE_DEFAULTS = {
	trail: true,
	trailLength: 2e4,
	jumpMeters: 2.5,
	color: "var(--primary)",
	width: 4,
	axesSize: .6,
	route: true
};
var MIN_STEP = .02;
/** A geometry_msgs Pose ({ position, orientation }), a `{ x, y, z, yaw }` shorthand or a Matrix4, as a Matrix4. */
function poseMatrix(pose, out = new THREE.Matrix4()) {
	if (pose?.isMatrix4) return out.copy(pose);
	if (pose && pose.position === void 0 && (pose.x !== void 0 || pose.yaw !== void 0)) {
		const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.yaw ?? 0);
		return out.compose(new THREE.Vector3(pose.x ?? 0, pose.y ?? 0, pose.z ?? 0), quaternion, new THREE.Vector3(1, 1, 1));
	}
	const position = pose?.position ?? {};
	const orientation = pose?.orientation ?? {};
	const quaternion = new THREE.Quaternion(orientation.x ?? 0, orientation.y ?? 0, orientation.z ?? 0, orientation.w ?? 1);
	if (quaternion.lengthSq() < 1e-12) quaternion.set(0, 0, 0, 1);
	return out.compose(new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0), quaternion.normalize(), new THREE.Vector3(1, 1, 1));
}
/** The pose inside a decoded message (any shape): Odometry / PoseWithCovarianceStamped (.pose.pose), PoseStamped (.pose), Pose. */
function poseOf(message) {
	return message?.pose?.pose ?? message?.pose ?? message;
}
var routes = /* @__PURE__ */ new WeakMap();
/** The source's recorded route of a pose topic, cached per source and topic (null when it has none). */
function routeOf(source, key) {
	if (typeof source.route !== "function") return Promise.resolve(null);
	let cache = routes.get(source);
	if (!cache) {
		cache = /* @__PURE__ */ new Map();
		routes.set(source, cache);
	}
	let promise = cache.get(key);
	if (!promise) {
		promise = Promise.resolve(source.route(key)).catch(() => null);
		cache.set(key, promise);
	}
	return promise;
}
var PoseLayer = class {
	root = new THREE.Group();
	#axes;
	#trail;
	#ghost;
	#stop = () => {};
	#pose = null;
	#frame = "";
	#last = null;
	#fixedFrame = "";
	#count = 0;
	#since = performance.now();
	#route = null;
	#ghostFrame = "";
	#unsubscribe;
	settings;
	topic;
	context;
	/** `topic` null: poses come through setData */
	constructor(context, topic, settings) {
		this.context = context;
		this.topic = topic;
		this.settings = settings;
		this.#axes = new THREE.AxesHelper(1);
		this.#axes.matrixAutoUpdate = false;
		this.#axes.visible = false;
		this.root.add(this.#axes);
		this.#trail = new FatLines(context.viewer.resolution, {
			width: settings.get().width,
			color: 16777215,
			capacity: 1024
		});
		this.#ghost = new FatLines(context.viewer.resolution, {
			width: Math.max(1, settings.get().width - 1.5),
			color: 16777215,
			capacity: 1024,
			opacity: .28
		});
		this.root.add(this.#trail.object, this.#ghost.object);
		this.#unsubscribe = settings.subscribe(() => this.#restyle());
		addEventListener("dimos-react-theme", this.#restyle);
		this.#restyle();
		if (topic) {
			routeOf(context.source, topic.key).then((route) => {
				if (route?.points?.length) {
					this.#route = route;
					this.#drawGhost();
					this.reset();
				}
			});
			this.#stop = subscribeDecoded(context, topic, { maxHz: 50 }, (message, timestamp) => {
				this.#onPose(poseOf(message), message?.header?.frame_id ?? message?.frame ?? "", timestamp);
			});
		}
	}
	#restyle = () => {
		const settings = this.settings.get();
		const color = cssColor(settings.color, "white");
		const theme = themeColors();
		this.#axes.setColors(cssColor(theme.axisX, "red"), cssColor(theme.axisY, "green"), cssColor(theme.axisZ, "blue"));
		this.#trail.material.color.copy(color);
		this.#trail.material.linewidth = settings.width;
		this.#trail.object.visible = settings.trail;
		this.#ghost.material.color.copy(color);
		this.#ghost.material.linewidth = Math.max(1, settings.width - 1.5);
		this.#ghost.object.visible = settings.route !== false;
		if (!settings.trail) this.#clearTrail();
		this.context.viewer.requestRender();
	};
	/** the whole route, in the fixed frame */
	#drawGhost() {
		this.#ghost.clear();
		const route = this.#route;
		const world = route && this.context.tf.lookup(route.frame ?? "", this.context.viewer.fixedFrame);
		this.#ghostFrame = world ? this.context.viewer.fixedFrame : "";
		if (route && world) {
			const jump = this.settings.get().jumpMeters;
			const a = new THREE.Vector3(), b = new THREE.Vector3();
			for (let index = 1; index < route.points.length; index++) {
				const [, ax, ay, az] = route.points[index - 1];
				const [, bx, by, bz] = route.points[index];
				a.set(ax, ay, az).applyMatrix4(world);
				b.set(bx, by, bz).applyMatrix4(world);
				if (a.distanceTo(b) <= jump) this.#ghost.push(a.x, a.y, a.z, b.x, b.y, b.z);
			}
		}
		this.#ghost.commit();
		this.context.viewer.requestRender();
	}
	#clearTrail() {
		this.#trail.clear();
		this.#trail.commit();
		this.#last = null;
	}
	/** The data jumped (a seek): the trail becomes the recorded route up to the playhead (or starts over). */
	reset() {
		this.#trail.clear();
		this.#last = null;
		const route = this.#route;
		const world = route && this.context.tf.lookup(route.frame ?? "", this.context.viewer.fixedFrame);
		if (route && world && this.settings.get().trail) {
			const now = this.context.viewer.dataClock() / 1e3;
			const settings = this.settings.get();
			const position = new THREE.Vector3();
			for (const [t, x, y, z] of route.points) {
				if (t > now) break;
				position.set(x, y, z).applyMatrix4(world);
				if (this.#last && position.distanceTo(this.#last) <= settings.jumpMeters) this.#trail.push(this.#last.x, this.#last.y, this.#last.z, position.x, position.y, position.z);
				this.#last = (this.#last ?? new THREE.Vector3()).copy(position);
			}
			if (this.#trail.count > settings.trailLength) this.#trail.shift(this.#trail.count - settings.trailLength);
		}
		this.#trail.commit();
		this.context.viewer.requestRender();
	}
	/** Props data: `{ pose, frame?, timestamp? }` (pose: geometry_msgs Pose, `{ x, y, yaw }` or a Matrix4). */
	setData(data) {
		if (data?.pose) this.#onPose(data.pose, data.frame ?? "", data.timestamp ?? Date.now());
	}
	#onPose(pose, frame, timestamp) {
		this.#frame = frame;
		this.#pose = poseMatrix(pose, this.#pose ?? new THREE.Matrix4());
		this.#count++;
		const world = this.context.tf.lookup(frame, this.context.viewer.fixedFrame);
		if (!world) {
			this.context.setStatus({
				problem: `no TF path from "${frame}" to "${this.context.viewer.fixedFrame}"`,
				frame
			});
			return;
		}
		const placed = world.clone().multiply(this.#pose);
		this.context.robotPose?.report(this.topic?.key ?? this, placed);
		this.context.onPose?.(placed);
		const position = new THREE.Vector3().setFromMatrixPosition(placed);
		const settings = this.settings.get();
		if (settings.trail && this.#last) {
			const step = position.distanceTo(this.#last);
			if (step < MIN_STEP) {
				this.context.viewer.noteData(timestamp);
				return;
			}
			if (step <= settings.jumpMeters) {
				this.#trail.push(this.#last.x, this.#last.y, this.#last.z, position.x, position.y, position.z);
				if (this.#trail.count > settings.trailLength) this.#trail.shift(Math.max(1, Math.floor(settings.trailLength * .1)));
				this.#trail.commit();
			}
		}
		this.#last = position;
		this.context.viewer.noteData(timestamp);
	}
	update(frame) {
		if (frame.fixedFrame !== this.#fixedFrame) {
			this.#fixedFrame = frame.fixedFrame;
			this.reset();
		}
		if (this.#route && this.#ghostFrame !== frame.fixedFrame) this.#drawGhost();
		if (this.#pose) {
			const world = this.context.tf.lookup(this.#frame, frame.fixedFrame);
			const size = this.settings.get().axesSize;
			this.#axes.visible = !!world && size > 0;
			if (world) {
				this.#axes.matrix.multiplyMatrices(world, this.#pose).scale(new THREE.Vector3().setScalar(size));
				this.#axes.matrixWorldNeedsUpdate = true;
				this.context.setStatus({
					problem: null,
					frame: this.#frame
				});
				this.context.viewer.requestRender();
			}
		}
		if (frame.now - this.#since > 1e3) {
			this.context.setStatus({ info: `${(this.#count * 1e3 / (frame.now - this.#since)).toFixed(0)} Hz · trail ${this.#trail.count} · ${this.#frame || "no frame"}` });
			this.#count = 0;
			this.#since = frame.now;
		}
	}
	dispose() {
		this.#stop();
		this.#unsubscribe();
		removeEventListener("dimos-react-theme", this.#restyle);
		this.context.robotPose?.forget(this.topic?.key ?? this);
		this.#trail.dispose();
		this.#ghost.dispose();
		this.#axes.dispose();
	}
};
/** A color setting: a swatch for hex colors (a token like var(--primary) shows as its current color). */
function ColorSetting({ value, onChange }) {
	const hex = `#${cssColor(value, "white").getHexString()}`;
	return /* @__PURE__ */ jsx(ColorSwatch, {
		value: hex,
		onChange
	});
}
function PoseSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Trail",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.trail,
					onChange: (trail) => settings.update({ trail })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Whole route",
				hint: "when the source knows it (a recording)",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.route !== false,
					onChange: (route) => settings.update({ route })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Length",
				children: /* @__PURE__ */ jsx(Select, {
					value: value.trailLength,
					options: [
						[500, "500 steps"],
						[5e3, "5k steps"],
						[2e4, "20k steps"],
						[1e5, "100k steps"]
					],
					onChange: (trailLength) => settings.update({ trailLength })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Color",
				children: /* @__PURE__ */ jsx(ColorSetting, {
					value: value.color,
					onChange: (color) => settings.update({ color })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Width",
				children: /* @__PURE__ */ jsx(Slider, {
					min: 1,
					max: 8,
					step: .5,
					value: value.width,
					format: (width) => `${width}px`,
					onChange: (width) => settings.update({ width })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Axes",
				children: /* @__PURE__ */ jsx(Slider, {
					min: 0,
					max: 2,
					step: .1,
					value: value.axesSize,
					format: (size) => `${size} m`,
					onChange: (axesSize) => settings.update({ axesSize })
				})
			})
		]
	});
}
registerLayer({
	id: "pose",
	label: "Pose + trail",
	types: [
		"nav_msgs.Odometry",
		"geometry_msgs.PoseStamped",
		"geometry_msgs.PoseWithCovarianceStamped"
	],
	defaults: () => ({ ...POSE_DEFAULTS }),
	create: (context, topic, settings) => new PoseLayer(context, topic, settings),
	Settings: PoseSettingsEditor
});
//#endregion
//#region src/three/layers/path.tsx
/** Points of a path (decoded data: any shape): nav_msgs.Path `poses` (PoseStamped), Poses, {x,y,z} or [x,y,z]. */
function pathPoints(poses) {
	const out = [];
	for (const item of poses ?? []) {
		const position = Array.isArray(item) ? {
			x: item[0],
			y: item[1],
			z: item[2] ?? 0
		} : item?.pose?.position ?? item?.position ?? item;
		if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) out.push([
			position.x,
			position.y,
			position.z ?? 0
		]);
	}
	return out;
}
var PathLayer = class {
	root = new THREE.Group();
	#lines;
	#stop = () => {};
	#unsubscribe;
	#frame = null;
	#points = [];
	settings;
	context;
	/** `topic` null: data comes through setData */
	constructor(context, topic, settings) {
		this.context = context;
		this.settings = settings;
		this.#lines = new FatLines(context.viewer.resolution, {
			width: settings.get().width,
			color: 16777215,
			capacity: 256
		});
		this.root.add(this.#lines.object);
		this.#unsubscribe = settings.subscribe(() => this.#restyle());
		this.#restyle();
		if (topic) this.#stop = subscribeDecoded(context, topic, { maxHz: 10 }, (path, timestamp) => {
			this.#set(pathPoints(path.poses ?? path), path.header?.frame_id ?? path.frame ?? "", timestamp);
		});
	}
	#restyle() {
		const settings = this.settings.get();
		this.#lines.material.color.copy(cssColor(settings.color, "white"));
		this.#lines.material.linewidth = settings.width;
		this.#draw();
	}
	/** Props data: `{ poses, frame?, timestamp? }` or the poses themselves (any shape pathPoints reads). */
	setData(data) {
		this.#set(pathPoints(data?.poses ?? data), data?.frame ?? "", data?.timestamp ?? Date.now());
	}
	#set(points, frame, timestamp) {
		this.#frame = frame;
		this.#points = points;
		this.#draw();
		this.context.setStatus({
			info: `${points.length} poses · ${frame || "no frame"}`,
			frame
		});
		this.context.viewer.noteData(timestamp);
	}
	#draw() {
		const lift = this.settings.get().lift ?? 0;
		this.#lines.clear();
		for (let index = 1; index < this.#points.length; index++) {
			const a = this.#points[index - 1], b = this.#points[index];
			this.#lines.push(a[0], a[1], a[2] + lift, b[0], b[1], b[2] + lift);
		}
		this.#lines.commit();
		this.context.viewer.requestRender();
	}
	update(frame) {
		if (this.#frame !== null) placeLayer(this.context, this.root, this.#frame, frame.fixedFrame);
	}
	dispose() {
		this.#stop();
		this.#unsubscribe();
		this.#lines.dispose();
	}
};
function PathSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [/* @__PURE__ */ jsx(Field, {
			label: "Color",
			children: /* @__PURE__ */ jsx(ColorSetting, {
				value: value.color,
				onChange: (color) => settings.update({ color })
			})
		}), /* @__PURE__ */ jsx(Field, {
			label: "Width",
			children: /* @__PURE__ */ jsx(Slider, {
				min: 1,
				max: 10,
				step: .5,
				value: value.width,
				format: (width) => `${width}px`,
				onChange: (width) => settings.update({ width })
			})
		})]
	});
}
/** A stable, distinct color per name, as a hex string (paths, arrays, boxes of one class). */
function colorFor(name) {
	let hash = 0;
	for (const char of String(name)) hash = hash * 31 + char.charCodeAt(0) | 0;
	return new THREE.Color().setHSL((hash >>> 0) % 360 / 360, .75, .6);
}
registerLayer({
	id: "path",
	label: "Path",
	types: ["nav_msgs.Path"],
	defaults: (topic) => ({
		color: `#${colorFor((topic?.name ?? "") + "path").getHexString()}`,
		width: 4,
		lift: .03
	}),
	create: (context, topic, settings) => new PathLayer(context, topic, settings),
	Settings: PathSettingsEditor
});
//#endregion
//#region src/three/layers/graph.tsx
var GraphLayer = class {
	root = new THREE.Group();
	#edges;
	#nodes;
	#nodeMaterial;
	#stop = () => {};
	#unsubscribe;
	#frame = null;
	settings;
	context;
	/** `topic` null (a <Layer> given `data`): nothing to draw, this type has no setData */
	constructor(context, topic, settings) {
		this.context = context;
		this.settings = settings;
		this.#edges = new FatLines(context.viewer.resolution, {
			width: settings.get().width,
			vertexColors: true
		});
		this.#nodeMaterial = makePointMaterial(context.viewer.pixelsPerMeter);
		this.#nodes = new THREE.Points(new THREE.BufferGeometry(), this.#nodeMaterial);
		this.#nodes.frustumCulled = false;
		this.root.add(this.#edges.object, this.#nodes);
		this.#unsubscribe = settings.subscribe(() => this.#restyle());
		this.#restyle();
		if (topic) this.#stop = subscribeDecoded(context, topic, {
			maxHz: 5,
			decodeAs: "nav_msgs.Path"
		}, (path, timestamp) => this.#onGraph(path, timestamp));
	}
	#restyle() {
		const settings = this.settings.get();
		this.#edges.material.linewidth = settings.width;
		this.#nodes.visible = settings.nodes;
		const solid = `#${cssColor(themeColors().fg, "white").getHexString()}`;
		applyLook(this.#nodeMaterial, {
			style: "disc",
			size: settings.nodeSize,
			colorMode: "solid",
			gradient: settings.gradient,
			axis: 2,
			rangeMin: 0,
			rangeMax: 1,
			solid,
			opacity: 1
		}, [0, 1]);
		this.context.viewer.requestRender();
	}
	#onGraph(path, timestamp) {
		this.#frame = path.header?.frame_id ?? "";
		const poses = path.poses ?? [];
		const edgeCount = Math.floor(poses.length / 2);
		const logs = [];
		for (let index = 0; index < edgeCount; index++) {
			const weight = poses[index * 2]?.pose?.orientation?.w ?? 1;
			logs.push(Math.log10(Math.max(1e-6, Math.abs(weight))));
		}
		const low = Math.min(...logs, 0), high = Math.max(...logs, low + 1e-6);
		const gradient = this.settings.get().gradient;
		this.#edges.clear();
		const nodes = /* @__PURE__ */ new Map();
		const color = new THREE.Color();
		for (let index = 0; index < edgeCount; index++) {
			const a = poses[index * 2].pose.position, b = poses[index * 2 + 1].pose.position;
			const [r, g, bl] = sampleGradient(gradient, (logs[index] - low) / (high - low));
			color.setRGB(r / 255, g / 255, bl / 255, THREE.SRGBColorSpace);
			this.#edges.push(a.x, a.y, a.z, b.x, b.y, b.z, color);
			for (const point of [a, b]) nodes.set(`${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`, [
				point.x,
				point.y,
				point.z
			]);
		}
		this.#edges.commit();
		const positions = new Float32Array(nodes.size * 3);
		let at = 0;
		for (const [x, y, z] of nodes.values()) {
			positions[at++] = x;
			positions[at++] = y;
			positions[at++] = z;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("aTime", new THREE.BufferAttribute(new Float32Array(nodes.size), 1));
		geometry.setAttribute("aIntensity", new THREE.BufferAttribute(new Float32Array(nodes.size), 1));
		this.#nodes.geometry.dispose();
		this.#nodes.geometry = geometry;
		this.context.setStatus({ info: `${nodes.size} nodes · ${edgeCount} edges · ${this.#frame || "no frame"}` });
		this.context.viewer.noteData(timestamp);
	}
	update(frame) {
		if (this.#frame !== null) placeLayer(this.context, this.root, this.#frame, frame.fixedFrame);
	}
	dispose() {
		this.#stop();
		this.#unsubscribe();
		this.#edges.dispose();
		this.#nodes.geometry.dispose();
		this.#nodeMaterial.dispose();
	}
};
function GraphSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Edge width",
				children: /* @__PURE__ */ jsx(Slider, {
					min: 1,
					max: 8,
					step: .5,
					value: value.width,
					format: (width) => `${width}px`,
					onChange: (width) => settings.update({ width })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Nodes",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.nodes,
					onChange: (nodes) => settings.update({ nodes })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Node size",
				children: /* @__PURE__ */ jsx(Slider, {
					min: .02,
					max: .5,
					step: .01,
					value: value.nodeSize,
					format: (size) => `${Math.round(size * 100)} cm`,
					onChange: (nodeSize) => settings.update({ nodeSize })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Weights",
				children: /* @__PURE__ */ jsx(Select, {
					value: value.gradient,
					options: [
						"viridis",
						"turbo",
						"plasma",
						"magma"
					],
					onChange: (gradient) => settings.update({ gradient })
				})
			})
		]
	});
}
registerLayer({
	id: "graph",
	label: "Graph (nodes + edges)",
	types: ["nav_msgs.LineSegments3D"],
	defaults: {
		width: 2,
		nodes: true,
		nodeSize: .08,
		gradient: "viridis"
	},
	create: (context, topic, settings) => new GraphLayer(context, topic, settings),
	Settings: GraphSettingsEditor
});
//#endregion
//#region src/three/layers/pose_array.tsx
var PoseArrayLayer = class {
	root = new THREE.Group();
	#lines;
	#stop = () => {};
	#unsubscribe;
	#frame = null;
	#poses = null;
	settings;
	context;
	/** `topic` null: data comes through setData */
	constructor(context, topic, settings) {
		this.context = context;
		this.settings = settings;
		this.#lines = new FatLines(context.viewer.resolution, {
			width: settings.get().width ?? 2.5,
			color: 16777215
		});
		this.root.add(this.#lines.object);
		this.#unsubscribe = settings.subscribe(() => this.#draw());
		if (topic) this.#stop = subscribeDecoded(context, topic, { maxHz: 10 }, (message, timestamp) => {
			this.#set(message.poses ?? message, message.header?.frame_id ?? "", timestamp);
		});
		this.#draw();
	}
	/** Props data: `{ poses, frame?, timestamp? }` or the poses themselves (any shape). */
	setData(data) {
		this.#set(data?.poses ?? data, data?.frame ?? "", data?.timestamp ?? Date.now());
	}
	#set(poses, frame, timestamp) {
		this.#frame = frame;
		this.#poses = poses;
		this.#draw();
		this.context.setStatus({
			info: `${poses?.length ?? 0} poses · ${frame || "no frame"}`,
			frame
		});
		this.context.viewer.noteData(timestamp);
	}
	#draw() {
		const { length, color, width } = this.settings.get();
		this.#lines.material.color.copy(cssColor(color, "white"));
		this.#lines.material.linewidth = width ?? 2.5;
		this.#lines.clear();
		const matrix = new THREE.Matrix4();
		const points = [
			new THREE.Vector3(),
			new THREE.Vector3(length, 0, 0),
			new THREE.Vector3(length * .7, length * .2, 0),
			new THREE.Vector3(length * .7, -length * .2, 0)
		];
		const placed = points.map(() => new THREE.Vector3());
		for (const pose of this.#poses ?? []) {
			poseMatrix(pose?.pose ?? pose, matrix);
			points.forEach((point, index) => placed[index].copy(point).applyMatrix4(matrix));
			const [tail, tip, left, right] = placed;
			this.#lines.push(tail.x, tail.y, tail.z, tip.x, tip.y, tip.z);
			this.#lines.push(tip.x, tip.y, tip.z, left.x, left.y, left.z);
			this.#lines.push(tip.x, tip.y, tip.z, right.x, right.y, right.z);
		}
		this.#lines.commit();
		this.context.viewer.requestRender();
	}
	update(frame) {
		if (this.#frame !== null) placeLayer(this.context, this.root, this.#frame, frame.fixedFrame);
	}
	dispose() {
		this.#stop();
		this.#unsubscribe();
		this.#lines.dispose();
	}
};
function ArrowSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [/* @__PURE__ */ jsx(Field, {
			label: "Length",
			children: /* @__PURE__ */ jsx(Slider, {
				min: .05,
				max: 2,
				step: .05,
				value: value.length,
				format: (length) => `${length} m`,
				onChange: (length) => settings.update({ length })
			})
		}), /* @__PURE__ */ jsx(Field, {
			label: "Color",
			children: /* @__PURE__ */ jsx(ColorSetting, {
				value: value.color,
				onChange: (color) => settings.update({ color })
			})
		})]
	});
}
registerLayer({
	id: "posearray",
	label: "Pose array",
	types: ["geometry_msgs.PoseArray"],
	defaults: (topic) => ({
		length: .4,
		color: `#${colorFor(topic?.name ?? "").getHexString()}`
	}),
	create: (context, topic, settings) => new PoseArrayLayer(context, topic, settings),
	Settings: ArrowSettingsEditor
});
//#endregion
//#region src/three/labels.ts
var LabelPool = class {
	group = new THREE.Group();
	#labels = [];
	#used = 0;
	className;
	constructor(className = "dr-scene-label") {
		this.className = className;
	}
	/** Call before placing a message's labels; `end()` hides the ones not reused. */
	begin() {
		this.#used = 0;
	}
	/**
	* @param color any CSS color (a token like "var(--warn)" works)
	*/
	place(text, position, color) {
		let label = this.#labels[this.#used];
		if (!label) {
			const element = document.createElement("div");
			element.className = this.className;
			label = new CSS2DObject(element);
			this.#labels.push(label);
			this.group.add(label);
		}
		this.#used++;
		if (label.element.textContent !== text) label.element.textContent = text;
		label.element.style.setProperty("--label-color", color ?? "");
		label.position.copy(position);
		label.visible = true;
		return label;
	}
	end() {
		for (let index = this.#used; index < this.#labels.length; index++) this.#labels[index].visible = false;
	}
	dispose() {
		for (const label of this.#labels) {
			label.element.remove();
			label.removeFromParent();
		}
		this.#labels = [];
	}
};
//#endregion
//#region src/three/layers/marker.ts
var MARKER_TYPE = {
	ARROW: 0,
	CUBE: 1,
	SPHERE: 2,
	CYLINDER: 3,
	LINE_STRIP: 4,
	LINE_LIST: 5,
	CUBE_LIST: 6,
	SPHERE_LIST: 7,
	POINTS: 8,
	TEXT: 9,
	MESH: 10,
	TRIANGLES: 11
};
var ACTION = {
	ADD: 0,
	DELETE: 2,
	DELETEALL: 3
};
var unitBox = new THREE.BoxGeometry(1, 1, 1);
var unitSphere = new THREE.SphereGeometry(.5, 20, 14);
var unitCylinder = new THREE.CylinderGeometry(.5, .5, 1, 24).rotateX(Math.PI / 2);
var unitCone = new THREE.ConeGeometry(.5, 1, 20);
var shared = /* @__PURE__ */ new Set([
	unitBox,
	unitSphere,
	unitCylinder,
	unitCone
]);
function material(color) {
	const { color: rgb, alpha } = rgba(color);
	return new THREE.MeshLambertMaterial({
		color: rgb,
		transparent: alpha < 1,
		opacity: alpha,
		side: THREE.DoubleSide
	});
}
function arrow(marker) {
	const group = new THREE.Group();
	const scale = marker.scale ?? {};
	let start = new THREE.Vector3(), end = new THREE.Vector3(scale.x || 1, 0, 0);
	let shaft = scale.y || .05, head = scale.z || .1, headLength = 0;
	if (marker.points && marker.points.length >= 2) {
		start = new THREE.Vector3(marker.points[0].x, marker.points[0].y, marker.points[0].z);
		end = new THREE.Vector3(marker.points[1].x, marker.points[1].y, marker.points[1].z);
		shaft = scale.x || .05;
		head = scale.y || shaft * 2;
		headLength = scale.z || 0;
	}
	const direction = end.clone().sub(start);
	const length = direction.length() || .001;
	headLength = headLength || Math.min(length * .3, head * 1.5);
	const paint = material(marker.color);
	const body = new THREE.Mesh(unitCylinder, paint);
	body.scale.set(shaft, shaft, Math.max(.001, length - headLength));
	body.position.set(0, 0, (length - headLength) / 2);
	const tip = new THREE.Mesh(unitCone, paint);
	tip.rotation.x = Math.PI / 2;
	tip.scale.set(head, headLength, head);
	tip.position.set(0, 0, length - headLength / 2);
	group.add(body, tip);
	group.position.copy(start);
	group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
	const wrapper = new THREE.Group();
	wrapper.add(group);
	return wrapper;
}
var pointsOf = (marker) => (marker.points ?? []).map((point) => new THREE.Vector3(point.x, point.y, point.z));
function colorsOf(marker, count) {
	const list = marker.colors ?? [];
	return list.length === count ? list.map((color) => rgba(color).color) : null;
}
var MarkerLayer = class {
	root = new THREE.Group();
	#kept = /* @__PURE__ */ new Map();
	#labels = new LabelPool();
	#stop;
	#unsupported = 0;
	context;
	constructor(context, topic) {
		this.context = context;
		this.root.add(this.#labels.group);
		const isArray = topic.type === "visualization_msgs.MarkerArray";
		this.#stop = subscribeDecoded(context, topic, {
			maxHz: 30,
			reliable: isArray
		}, (message, timestamp) => {
			for (const marker of isArray ? message.markers ?? [] : [message]) this.#apply(marker);
			context.viewer.noteData(timestamp);
		});
	}
	#apply(marker) {
		const key = `${marker.ns}/${marker.id}`;
		if (marker.action === ACTION.DELETEALL) {
			for (const [other] of this.#kept) if (!marker.ns || other.startsWith(`${marker.ns}/`)) this.#remove(other);
			return;
		}
		this.#remove(key);
		if (marker.action === ACTION.DELETE) return;
		const object = this.#build(marker);
		if (!object) return;
		object.matrixAutoUpdate = false;
		const lifetime = (marker.lifetime?.sec ?? 0) + (marker.lifetime?.nsec ?? 0) / 1e9;
		const kept = {
			object,
			frame: marker.header?.frame_id ?? "",
			pose: poseMatrix(marker.pose),
			expiresAt: lifetime > 0 ? this.context.viewer.dataClock() + lifetime * 1e3 : Infinity
		};
		if (marker.type === MARKER_TYPE.TEXT) {
			const { color } = rgba(marker.color);
			kept.label = {
				text: marker.text ?? "",
				color: `#${color.getHexString()}`
			};
		}
		this.#kept.set(key, kept);
		this.root.add(object);
	}
	#build(marker) {
		const scale = marker.scale ?? {
			x: 1,
			y: 1,
			z: 1
		};
		const sized = (geometry) => {
			const mesh = new THREE.Mesh(geometry, material(marker.color));
			mesh.scale.set(scale.x || .001, scale.y || .001, scale.z || .001);
			const group = new THREE.Group();
			group.add(mesh);
			return group;
		};
		switch (marker.type) {
			case MARKER_TYPE.ARROW: return arrow(marker);
			case MARKER_TYPE.CUBE: return sized(unitBox);
			case MARKER_TYPE.SPHERE: return sized(unitSphere);
			case MARKER_TYPE.CYLINDER: return sized(unitCylinder);
			case MARKER_TYPE.MESH:
				this.#unsupported++;
				this.context.setStatus({ problem: `${this.#unsupported} MESH_RESOURCE marker(s) drawn as their bounding box` });
				return sized(unitBox);
			case MARKER_TYPE.LINE_STRIP:
			case MARKER_TYPE.LINE_LIST: {
				const list = pointsOf(marker);
				const perPoint = colorsOf(marker, list.length);
				const lines = new FatLines(this.context.viewer.resolution, {
					width: Math.max(.005, scale.x || .02),
					worldUnits: true,
					vertexColors: !!perPoint,
					color: rgba(marker.color).color
				});
				const step = marker.type === MARKER_TYPE.LINE_LIST ? 2 : 1;
				for (let index = 0; index + 1 < list.length; index += step) {
					const a = list[index], b = list[index + 1];
					lines.push(a.x, a.y, a.z, b.x, b.y, b.z, perPoint?.[index]);
				}
				lines.commit();
				const group = new THREE.Group();
				group.add(lines.object);
				return group;
			}
			case MARKER_TYPE.CUBE_LIST:
			case MARKER_TYPE.SPHERE_LIST: {
				const list = pointsOf(marker);
				const mesh = new THREE.InstancedMesh(marker.type === MARKER_TYPE.CUBE_LIST ? unitBox : unitSphere, material(marker.color), Math.max(1, list.length));
				const perPoint = colorsOf(marker, list.length);
				const matrix = new THREE.Matrix4();
				list.forEach((point, index) => {
					mesh.setMatrixAt(index, matrix.makeScale(scale.x || .05, scale.y || .05, scale.z || .05).setPosition(point));
					if (perPoint) mesh.setColorAt(index, perPoint[index]);
				});
				mesh.count = list.length;
				mesh.frustumCulled = false;
				const group = new THREE.Group();
				group.add(mesh);
				return group;
			}
			case MARKER_TYPE.POINTS: {
				const list = pointsOf(marker);
				const geometry = new THREE.BufferGeometry().setFromPoints(list);
				const perPoint = colorsOf(marker, list.length);
				if (perPoint) geometry.setAttribute("color", new THREE.Float32BufferAttribute(perPoint.flatMap((color) => [
					color.r,
					color.g,
					color.b
				]), 3));
				const { color, alpha } = rgba(marker.color);
				const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({
					size: scale.x || .05,
					color: perPoint ? 16777215 : color,
					vertexColors: !!perPoint,
					transparent: alpha < 1,
					opacity: alpha
				}));
				const group = new THREE.Group();
				group.add(cloud);
				return group;
			}
			case MARKER_TYPE.TEXT: return new THREE.Group();
			case MARKER_TYPE.TRIANGLES: {
				const list = pointsOf(marker);
				const geometry = new THREE.BufferGeometry().setFromPoints(list);
				const perPoint = colorsOf(marker, list.length);
				if (perPoint) geometry.setAttribute("color", new THREE.Float32BufferAttribute(perPoint.flatMap((color) => [
					color.r,
					color.g,
					color.b
				]), 3));
				geometry.computeVertexNormals();
				const paint = material(marker.color);
				paint.vertexColors = !!perPoint;
				const mesh = new THREE.Mesh(geometry, paint);
				mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
				const group = new THREE.Group();
				group.add(mesh);
				return group;
			}
		}
		this.context.setStatus({ problem: `unknown marker type ${marker.type}` });
		return null;
	}
	#remove(key) {
		const kept = this.#kept.get(key);
		if (!kept) return;
		this.#kept.delete(key);
		kept.object.traverse((child) => {
			const holder = child;
			if (holder.geometry && shared.has(holder.geometry)) holder.geometry = null;
		});
		disposeTree(kept.object);
	}
	/** The data jumped (a replay's seek): what was kept belongs to another time. */
	reset() {
		for (const key of [...this.#kept.keys()]) this.#remove(key);
		this.context.viewer.requestRender();
	}
	update(frame) {
		const missing = /* @__PURE__ */ new Set();
		this.#labels.begin();
		const scratch = new THREE.Vector3();
		for (const [key, kept] of this.#kept) {
			if (frame.dataNow > kept.expiresAt) {
				this.#remove(key);
				this.context.viewer.requestRender();
				continue;
			}
			const world = this.context.tf.lookup(kept.frame, frame.fixedFrame);
			kept.object.visible = !!world;
			if (!world) {
				missing.add(kept.frame);
				continue;
			}
			kept.object.matrix.multiplyMatrices(world, kept.pose);
			kept.object.matrixWorldNeedsUpdate = true;
			if (kept.label) this.#labels.place(kept.label.text, scratch.setFromMatrixPosition(kept.object.matrix), kept.label.color);
		}
		this.#labels.end();
		this.context.setStatus({
			info: `${this.#kept.size} markers`,
			problem: missing.size ? `no TF path to "${frame.fixedFrame}" from ${[...missing].map((name) => `"${name}"`).join(", ")}` : null,
			frame: [...missing][0] ?? ""
		});
	}
	dispose() {
		this.#stop();
		this.reset();
		this.#labels.dispose();
	}
};
registerLayer({
	id: "marker",
	label: "Markers",
	types: ["visualization_msgs.Marker", "visualization_msgs.MarkerArray"],
	defaults: {},
	create: (context, topic) => {
		if (!topic) throw new Error("the marker layer draws a topic (it has no setData)");
		return new MarkerLayer(context, topic);
	}
});
//#endregion
//#region src/three/layers/boxes.tsx
/** The boxes in a detection message: `{ pose, size, label, className }` each. */
function boxesOf(type, message) {
	if (type === "vision_msgs.BoundingBox3DArray") return (message.boxes ?? []).map((box, index) => ({
		pose: box.center,
		size: box.size,
		label: `#${index}`,
		className: "box"
	}));
	return (type === "vision_msgs.Detection3D" ? [message] : message.detections ?? []).map((detection) => {
		const best = [...detection.results ?? []].sort((a, b) => (b.hypothesis?.score ?? 0) - (a.hypothesis?.score ?? 0))[0];
		const className = best?.hypothesis?.class_id || detection.id || "object";
		const score = best?.hypothesis?.score;
		return {
			pose: detection.bbox?.center,
			size: detection.bbox?.size,
			label: score !== void 0 ? `${className} ${(score * 100).toFixed(0)}%` : className,
			className
		};
	});
}
var BoxLayer = class {
	root = new THREE.Group();
	#lines;
	#labels = new LabelPool();
	#stop = () => {};
	#unsubscribe;
	#frame = null;
	/** props data: `[{ center, size, yaw, frame, label, color, fill }]`, each placed through TF every frame */
	#data = null;
	#placed = "";
	#fills = new THREE.Group();
	settings;
	context;
	constructor(context, topic, settings) {
		this.context = context;
		this.settings = settings;
		this.#lines = new FatLines(context.viewer.resolution, {
			width: settings.get().width,
			vertexColors: true
		});
		this.root.add(this.#lines.object, this.#labels.group);
		const restyle = () => {
			this.#lines.material.linewidth = settings.get().width;
			this.#labels.group.visible = settings.get().labels;
			context.viewer.requestRender();
		};
		this.#unsubscribe = settings.subscribe(restyle);
		restyle();
		this.root.add(this.#fills);
		if (!topic) return;
		this.#stop = subscribeDecoded(context, topic, { maxHz: 15 }, (message, timestamp) => {
			this.#frame = message.header?.frame_id ?? "";
			const boxes = boxesOf(topic.type, message);
			this.#lines.clear();
			this.#labels.begin();
			const matrix = new THREE.Matrix4();
			const top = new THREE.Vector3();
			for (const box of boxes) {
				const color = colorFor(box.className);
				poseMatrix(box.pose, matrix);
				pushBox(this.#lines, matrix, {
					x: box.size?.x ?? .1,
					y: box.size?.y ?? .1,
					z: box.size?.z ?? .1
				}, color);
				top.set(0, 0, (box.size?.z ?? 0) / 2).applyMatrix4(matrix);
				this.#labels.place(box.label, top, `#${color.getHexString()}`);
			}
			this.#lines.commit();
			this.#labels.end();
			context.setStatus({ info: `${boxes.length} boxes · ${this.#frame || "no frame"}` });
			context.viewer.noteData(timestamp);
		});
	}
	/**
	* Boxes from props (no topic): `[{ center: [x, y, z], size: [x, y, z], yaw, frame, label, color, fill }]`; `color`
	* any CSS color or token, `fill` the opacity of a translucent fill (0 = edges only).
	*/
	setData(data) {
		this.#data = Array.isArray(data) ? data : [];
		this.#placed = "";
	}
	#drawData(data, fixedFrame) {
		const placed = [];
		for (const box of data) {
			const local = new THREE.Matrix4().makeRotationZ(box.yaw ?? 0).setPosition(...box.center ?? [
				0,
				0,
				0
			]);
			if (box.frame && box.frame !== fixedFrame) {
				const transform = this.context.tf.lookup(box.frame, fixedFrame);
				if (!transform) continue;
				local.premultiply(transform);
			}
			placed.push({
				box,
				matrix: local
			});
		}
		const signature = placed.map(({ box, matrix }) => `${box.label}|${box.color}|${box.fill}|${box.size}|${matrix.elements.map((v) => v.toFixed(3))}`).join("\n");
		if (signature === this.#placed) return;
		this.#placed = signature;
		this.#lines.clear();
		this.#labels.begin();
		for (const child of [...this.#fills.children]) {
			child.geometry.dispose();
			child.material.dispose();
			child.removeFromParent();
		}
		const top = new THREE.Vector3();
		for (const { box, matrix } of placed) {
			const [sx, sy, sz] = box.size ?? [
				.1,
				.1,
				.1
			];
			const color = cssColor(box.color ?? "var(--warn)");
			pushBox(this.#lines, matrix, {
				x: sx,
				y: sy,
				z: sz
			}, color);
			if (box.fill) {
				const fill = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: box.fill,
					depthWrite: false
				}));
				fill.matrixAutoUpdate = false;
				fill.matrix.copy(matrix);
				this.#fills.add(fill);
			}
			if (box.label) {
				top.set(0, 0, sz / 2 + .12).applyMatrix4(matrix);
				this.#labels.place(box.label, top, `#${color.getHexString()}`);
			}
		}
		this.#lines.commit();
		this.#labels.end();
		this.context.setStatus({ info: `${placed.length} boxes` });
		this.context.viewer.requestRender();
	}
	update(frame) {
		if (this.#data) {
			this.#drawData(this.#data, frame.fixedFrame);
			return;
		}
		if (this.#frame !== null) placeLayer(this.context, this.root, this.#frame, frame.fixedFrame);
	}
	dispose() {
		this.#stop();
		this.#unsubscribe();
		for (const child of this.#fills.children) {
			child.geometry.dispose();
			child.material.dispose();
		}
		this.#lines.dispose();
		this.#labels.dispose();
	}
};
function BoxSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [/* @__PURE__ */ jsx(Field, {
			label: "Width",
			children: /* @__PURE__ */ jsx(Slider, {
				min: 1,
				max: 8,
				step: .5,
				value: value.width,
				format: (width) => `${width}px`,
				onChange: (width) => settings.update({ width })
			})
		}), /* @__PURE__ */ jsx(Field, {
			label: "Labels",
			children: /* @__PURE__ */ jsx(Toggle, {
				value: value.labels,
				onChange: (labels) => settings.update({ labels })
			})
		})]
	});
}
registerLayer({
	id: "boxes3d",
	label: "3D boxes",
	types: [
		"vision_msgs.Detection3DArray",
		"vision_msgs.Detection3D",
		"vision_msgs.BoundingBox3DArray"
	],
	defaults: {
		width: 2.5,
		labels: true
	},
	create: (context, topic, settings) => new BoxLayer(context, topic, settings),
	Settings: BoxSettingsEditor
});
//#endregion
//#region src/three/layers/labeled_points.ts
var ENTITY_COLORS = {
	person: "var(--entity-person, var(--danger))",
	object: "var(--entity-object, var(--ok))",
	location: "var(--entity-location, var(--info, var(--primary)))"
};
var OTHER = "var(--muted-fg)";
/** EntityMarkers bytes (u32 big-endian length + JSON) → `{ label, color, position }[]`. */
function entitiesOf(bytes) {
	const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
	return JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))).map((entity) => ({
		label: `${entity.id}: ${String(entity.label).slice(0, 40)}`,
		color: ENTITY_COLORS[entity.type] ?? OTHER,
		position: new THREE.Vector3(entity.x, entity.y, entity.z)
	}));
}
var sphere = new THREE.SphereGeometry(1, 16, 12);
var LabeledPoints = class {
	root = new THREE.Group();
	#labels = new LabelPool();
	#spheres;
	#stop = () => {};
	#frame = null;
	#show;
	/** props data: `[{ label, position: [x, y, z], frame, color }]`, each placed through TF every frame */
	#data = null;
	#placed = "";
	context;
	constructor(context, topic) {
		this.context = context;
		this.#spheres = new THREE.InstancedMesh(sphere, new THREE.MeshLambertMaterial(), 256);
		this.#spheres.count = 0;
		this.#spheres.frustumCulled = false;
		this.root.add(this.#spheres, this.#labels.group);
		const show = this.#show = (entities, frame, timestamp) => {
			this.#frame = frame;
			this.#labels.begin();
			const matrix = new THREE.Matrix4();
			const count = Math.min(entities.length, 256);
			for (let index = 0; index < count; index++) {
				const entity = entities[index];
				this.#spheres.setMatrixAt(index, matrix.makeScale(.12, .12, .12).setPosition(entity.position));
				this.#spheres.setColorAt(index, cssColor(entity.color, "gray"));
				this.#labels.place(entity.label, entity.position.clone().setZ(entity.position.z + .25), entity.color);
			}
			this.#spheres.count = count;
			this.#spheres.instanceMatrix.needsUpdate = true;
			if (this.#spheres.instanceColor) this.#spheres.instanceColor.needsUpdate = true;
			this.#labels.end();
			context.setStatus({ info: `${entities.length} points` });
			if (timestamp !== void 0) context.viewer.noteData(timestamp);
			context.viewer.requestRender();
		};
		if (!topic) return;
		if (topic.type === "visualization_msgs.EntityMarkers") this.#stop = context.source.subscribe(topic.key, {
			delivery: "latest",
			maxHz: 5
		}, (message) => {
			try {
				show(Array.isArray(message.value) ? message.value.map((entity) => ({
					label: `${entity.id}: ${String(entity.label).slice(0, 40)}`,
					color: ENTITY_COLORS[entity.type] ?? OTHER,
					position: new THREE.Vector3(entity.x, entity.y, entity.z)
				})) : entitiesOf(message.bytes), "", message.timestamp);
			} catch (error) {
				context.setStatus({ problem: `cannot decode: ${error?.message ?? error}` });
			}
		});
		else this.#stop = subscribeDecoded(context, topic, { maxHz: 10 }, (message, timestamp) => {
			const point = message.point ?? {};
			show([{
				label: topic.name,
				color: `#${colorFor(topic.name).getHexString()}`,
				position: new THREE.Vector3(point.x, point.y, point.z)
			}], message.header?.frame_id ?? "", timestamp);
		});
	}
	/** Points from props (no topic): `[{ label, position: [x, y, z], frame, color }]`. */
	setData(data) {
		this.#data = Array.isArray(data) ? data : [];
		this.#placed = "";
	}
	update(frame) {
		if (this.#data) {
			const entities = [];
			for (const item of this.#data) {
				const position = new THREE.Vector3(...item.position ?? [
					0,
					0,
					0
				]);
				const matrix = !item.frame || item.frame === frame.fixedFrame ? null : this.context.tf.lookup(item.frame, frame.fixedFrame);
				if (item.frame && item.frame !== frame.fixedFrame && !matrix) continue;
				if (matrix) position.applyMatrix4(matrix);
				entities.push({
					label: item.label ?? "",
					color: item.color ?? "var(--warn)",
					position
				});
			}
			const signature = entities.map((entity) => `${entity.label}|${entity.color}|${entity.position.toArray().map((v) => v.toFixed(3))}`).join("\n");
			if (signature !== this.#placed) {
				this.#placed = signature;
				this.#show(entities, "", void 0);
			}
			return;
		}
		if (this.#frame !== null) placeLayer(this.context, this.root, this.#frame, frame.fixedFrame);
	}
	dispose() {
		this.#stop();
		this.#spheres.dispose();
		this.#labels.dispose();
	}
};
registerLayer({
	id: "labeled-points",
	label: "Labeled points",
	types: ["visualization_msgs.EntityMarkers", "geometry_msgs.PointStamped"],
	defaults: {},
	create: (context, topic) => new LabeledPoints(context, topic)
});
//#endregion
//#region src/three/layers/occupancy.tsx
/** a costmap's lethal value (dimos marks obstacles 100) */
var LETHAL$1 = 100;
var mix$1 = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
var rgb255 = (value, fallback) => {
	const color = cssColor(value, fallback);
	color.convertLinearToSRGB?.();
	return [
		Math.round(color.r * 255),
		Math.round(color.g * 255),
		Math.round(color.b * 255)
	];
};
/** The floor-plan colors from the theme. */
function planColors() {
	const theme = themeColors();
	const floor = rgb255(theme.sceneFloor || theme.surface, "#152132");
	const rim = rgb255(theme.sceneWallRim || theme.primary, "#82d4ff");
	return {
		floor,
		body: theme.sceneWall ? rgb255(theme.sceneWall, "#264e7a") : mix$1(floor, rim, .35),
		rim,
		fg: rgb255(theme.fg, "#ffffff")
	};
}
var GridLayer = class {
	root = new THREE.Group();
	#mesh;
	#texture = null;
	#stop;
	#unsubscribe;
	#frame = null;
	#lut = /* @__PURE__ */ new Uint8Array(1024);
	#colors = planColors();
	#last = null;
	settings;
	context;
	constructor(context, topic, settings) {
		this.context = context;
		this.settings = settings;
		this.#mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide
		}));
		this.#mesh.matrixAutoUpdate = false;
		this.root.add(this.#mesh);
		this.#unsubscribe = settings.subscribe(() => this.#restyle());
		addEventListener("dimos-react-theme", this.#onTheme);
		this.#restyle();
		this.#stop = subscribeDecoded(context, topic, { maxHz: 2 }, (grid, timestamp) => this.#onGrid(grid, timestamp));
	}
	#onTheme = () => {
		this.#colors = planColors();
		this.#restyle();
	};
	#restyle() {
		this.#mesh.material.opacity = this.settings.get().opacity;
		this.#buildLut();
		if (this.#last) this.#onGrid(this.#last.grid, this.#last.timestamp);
		this.context.viewer.requestRender();
	}
	/** value (-1..100, as the u8 it arrives as) → rgba */
	#buildLut() {
		const style = this.settings.get().style;
		const { floor, body, rim, fg } = this.#colors;
		for (let byte = 0; byte < 256; byte++) {
			const value = byte > 127 ? byte - 256 : byte;
			let rgba;
			if (value < 0) rgba = style === "map" ? [...mix$1(fg, floor, .5), 40] : [
				0,
				0,
				0,
				0
			];
			else if (style === "map") {
				const shade = mix$1(fg, floor, value / 100);
				rgba = value === 0 ? [...fg, 70] : [...shade, 230];
			} else if (value === 0) rgba = [...floor, 215];
			else {
				const t = Math.sqrt(Math.min(value, 99) / LETHAL$1);
				rgba = [...t < .6 ? mix$1(floor, body, t / .6) : mix$1(body, rim, (t - .6) / .4 * .7), 235];
			}
			this.#lut.set(rgba.map(Math.round), byte * 4);
		}
	}
	#onGrid(grid, timestamp) {
		const info = grid.info;
		const data = grid.data;
		if (!info || !info.width || !info.height || !data || data.length < info.width * info.height) {
			this.context.setStatus({ problem: "empty or truncated grid" });
			return;
		}
		const { width, height, resolution, origin } = info;
		this.#last = {
			grid,
			timestamp
		};
		this.#frame = grid.header?.frame_id ?? "";
		if (!this.#texture || this.#texture.image.width !== width || this.#texture.image.height !== height) {
			this.#texture?.dispose();
			this.#texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height);
			this.#texture.magFilter = THREE.NearestFilter;
			this.#texture.colorSpace = THREE.SRGBColorSpace;
			this.#mesh.material.map = this.#texture;
			this.#mesh.material.needsUpdate = true;
		}
		const pixels = this.#texture.image.data;
		const lut = this.#lut;
		const bytes = new Uint8Array(data.buffer, data.byteOffset, width * height);
		const costmap = this.settings.get().style === "costmap";
		const { body, rim } = this.#colors;
		const lethal = (column, row) => column < 0 || row < 0 || column >= width || row >= height || bytes[row * width + column] === LETHAL$1;
		for (let index = 0; index < width * height; index++) {
			if (costmap && bytes[index] === LETHAL$1) {
				const column = index % width, row = (index - column) / width;
				const inside = lethal(column - 1, row) && lethal(column + 1, row) && lethal(column, row - 1) && lethal(column, row + 1);
				pixels.set([...inside ? body : rim, 255], index * 4);
				continue;
			}
			const at = bytes[index] * 4;
			pixels[index * 4] = lut[at];
			pixels[index * 4 + 1] = lut[at + 1];
			pixels[index * 4 + 2] = lut[at + 2];
			pixels[index * 4 + 3] = lut[at + 3];
		}
		this.#texture.needsUpdate = true;
		const size = new THREE.Vector3(width * resolution, height * resolution, 1);
		const center = new THREE.Matrix4().makeTranslation(size.x / 2, size.y / 2, this.settings.get().lift);
		this.#mesh.matrix.copy(poseMatrix(origin)).multiply(center).multiply(new THREE.Matrix4().makeScale(size.x, size.y, 1));
		this.context.setStatus({ info: `${width}×${height} @ ${resolution.toFixed(2)} m · ${this.#frame || "no frame"}` });
		this.context.viewer.noteData(timestamp);
	}
	update(frame) {
		if (this.#frame !== null) placeLayer(this.context, this.root, this.#frame, frame.fixedFrame);
	}
	dispose() {
		this.#stop();
		this.#unsubscribe();
		removeEventListener("dimos-react-theme", this.#onTheme);
		this.#texture?.dispose();
		this.#mesh.geometry.dispose();
		this.#mesh.material.dispose();
	}
};
function GridSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [/* @__PURE__ */ jsx(Field, {
			label: "Style",
			children: /* @__PURE__ */ jsx(Select, {
				value: value.style,
				options: [["costmap", "costmap (floor plan)"], ["map", "map (gray)"]],
				onChange: (style) => settings.update({ style })
			})
		}), /* @__PURE__ */ jsx(Field, {
			label: "Opacity",
			children: /* @__PURE__ */ jsx(Slider, {
				min: .1,
				max: 1,
				step: .05,
				value: value.opacity,
				format: (opacity) => `${Math.round(opacity * 100)}%`,
				onChange: (opacity) => settings.update({ opacity })
			})
		})]
	});
}
registerLayer({
	id: "occupancy",
	label: "Occupancy grid",
	types: ["nav_msgs.OccupancyGrid"],
	defaults: (topic) => ({
		opacity: .85,
		style: /cost/i.test(topic?.name ?? "") ? "costmap" : "map",
		lift: .01
	}),
	create: (context, topic, settings) => {
		if (!topic) throw new Error("the occupancy layer draws a topic (it has no setData)");
		return new GridLayer(context, topic, settings);
	},
	Settings: GridSettingsEditor
});
//#endregion
//#region src/three/layers/tf_frames.tsx
var TF_DEFAULTS = {
	axesSize: .25,
	names: true,
	links: true,
	maxNames: 16,
	named: [],
	maxFrames: 512
};
var TfFramesLayer = class {
	root = new THREE.Group();
	#axes;
	#links;
	#labels = new LabelPool("dr-scene-label dr-frame-label");
	#version = -1;
	#fixedFrame = "";
	#colors = [];
	#unsubscribe;
	settings;
	context;
	constructor(context, settings) {
		this.context = context;
		this.settings = settings;
		const maxFrames = settings.get().maxFrames ?? 512;
		this.#axes = new FatLines(context.viewer.resolution, {
			width: 2.5,
			vertexColors: true,
			capacity: maxFrames * 3
		});
		this.#links = new FatLines(context.viewer.resolution, {
			width: 1,
			color: 16777215,
			opacity: .6
		});
		this.root.add(this.#axes.object, this.#links.object, this.#labels.group);
		this.#unsubscribe = settings.subscribe(() => {
			this.#version = -1;
			context.viewer.requestRender();
		});
		addEventListener("dimos-react-theme", this.#restyle);
		this.#restyle();
	}
	#restyle = () => {
		const theme = themeColors();
		this.#colors = [
			cssColor(theme.axisX, "red"),
			cssColor(theme.axisY, "green"),
			cssColor(theme.axisZ, "blue")
		];
		this.#links.material.color.copy(cssColor(theme.mutedFg, "gray"));
		this.#version = -1;
	};
	update(frame) {
		const tf = this.context.tf;
		if (tf.version === this.#version && frame.fixedFrame === this.#fixedFrame) return;
		this.#version = tf.version;
		this.#fixedFrame = frame.fixedFrame;
		const settings = {
			...TF_DEFAULTS,
			...this.settings.get()
		};
		const snapshot = tf.snapshot();
		const unit = [
			new THREE.Vector3(1, 0, 0),
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(0, 0, 1)
		];
		this.#axes.clear();
		this.#links.clear();
		this.#labels.begin();
		const origin = new THREE.Vector3(), tip = new THREE.Vector3(), parent = new THREE.Vector3();
		const baseFrame = this.context.options?.baseFrame;
		let unplaced = 0;
		for (const name of snapshot.frames.slice(0, settings.maxFrames)) {
			const matrix = tf.lookup(name, frame.fixedFrame);
			if (!matrix) {
				unplaced++;
				continue;
			}
			origin.setFromMatrixPosition(matrix);
			for (let axis = 0; axis < 3; axis++) {
				tip.copy(unit[axis]).multiplyScalar(settings.axesSize).applyMatrix4(matrix);
				this.#axes.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, this.#colors[axis]);
			}
			const nameIt = snapshot.frames.length <= settings.maxNames || name === frame.fixedFrame || name === baseFrame || settings.named.includes(name);
			if (settings.names && nameIt) this.#labels.place(name, origin);
			const parentName = tf.parentOf(name);
			const parentMatrix = parentName && tf.lookup(parentName, frame.fixedFrame);
			if (settings.links && parentMatrix) {
				parent.setFromMatrixPosition(parentMatrix);
				this.#links.push(origin.x, origin.y, origin.z, parent.x, parent.y, parent.z);
			}
		}
		this.#axes.commit();
		this.#links.commit();
		this.#labels.end();
		this.context.setStatus({
			info: `${snapshot.frames.length} frames`,
			problem: unplaced ? `${unplaced} frames not connected to "${frame.fixedFrame}"` : null
		});
		this.context.viewer.requestRender();
	}
	dispose() {
		this.#unsubscribe();
		removeEventListener("dimos-react-theme", this.#restyle);
		this.#axes.dispose();
		this.#links.dispose();
		this.#labels.dispose();
	}
};
function TfSettingsEditor({ settings }) {
	const value = useStore(settings);
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Axes",
				children: /* @__PURE__ */ jsx(Slider, {
					min: .05,
					max: 1,
					step: .05,
					value: value.axesSize,
					format: (size) => `${size} m`,
					onChange: (axesSize) => settings.update({ axesSize })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Names",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.names,
					onChange: (names) => settings.update({ names })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Links",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.links,
					onChange: (links) => settings.update({ links })
				})
			})
		]
	});
}
registerLayer({
	id: "tf",
	label: "TF frames",
	types: ["tf2_msgs.TFMessage"],
	defaults: {
		axesSize: .25,
		names: true,
		links: true
	},
	enabledByDefault: (topic) => topic.name === "/tf",
	create: (context, _topic, settings) => new TfFramesLayer(context, settings),
	Settings: TfSettingsEditor
});
//#endregion
//#region src/camera/depth.ts
var DEFAULT_DEPTH_LOOK$1 = {
	colormap: "turbo",
	near: null,
	far: null
};
/** Tracks the automatic range (2nd–98th percentile of valid depth, eased) so it doesn't flicker frame to frame. */
var DepthRange = class {
	near = 0;
	far = 1;
	#seen = false;
	/** @param look fixed range (meters), null = automatic */
	update(image, look) {
		if (look.near !== null && look.near !== void 0 && look.far !== null && look.far !== void 0) return [look.near, look.far];
		const scale = depthScale(image.encoding);
		const data = image.data;
		const step = Math.max(1, Math.floor(data.length / 4096));
		const samples = [];
		for (let index = 0; index < data.length; index += step) {
			const value = data[index];
			if (value > 0 && Number.isFinite(value)) samples.push(value * scale);
		}
		if (samples.length) {
			samples.sort((a, b) => a - b);
			const low = samples[Math.floor(samples.length * .02)];
			const high = samples[Math.floor(samples.length * .98)];
			if (!this.#seen) {
				this.near = low;
				this.far = high;
				this.#seen = true;
			} else {
				this.near += (low - this.near) * .2;
				this.far += (high - this.far) * .2;
			}
		}
		const near = look.near ?? this.near;
		return [near, look.far ?? Math.max(near + .01, this.far)];
	}
};
var RAMP_GLSL = `
vec4 depthColor(float meters, vec2 range, sampler2D ramp) {
    if (!(meters > 0.0) || meters > 1e6) return vec4(0.0);
    float t = clamp((meters - range.x) / max(1e-6, range.y - range.x), 0.0, 1.0);
    return vec4(texture(ramp, vec2(1.0 - t, 0.5)).rgb, 1.0);
}
`;
function rampPixels(name) {
	const pixels = /* @__PURE__ */ new Uint8Array(1024);
	for (let index = 0; index < 256; index++) pixels.set([...sampleGradient(name, index / 255).map(Math.round), 255], index * 4);
	return pixels;
}
var asFloat = (image) => image.data instanceof Float32Array ? image.data : Float32Array.from(image.data.subarray(0, image.width * image.height));
var rampTextures = /* @__PURE__ */ new Map();
function rampTexture(name) {
	let texture = rampTextures.get(name);
	if (!texture) {
		texture = new THREE.DataTexture(rampPixels(name), 256, 1);
		texture.magFilter = THREE.LinearFilter;
		texture.needsUpdate = true;
		rampTextures.set(name, texture);
	}
	return texture;
}
/** A depth texture colored the same way, as a three.js material (`.material`); `update(image, look)` per image. */
var DepthMaterial = class {
	material;
	#texture = null;
	#range = new DepthRange();
	constructor() {
		this.material = new THREE.ShaderMaterial({
			glslVersion: THREE.GLSL3,
			transparent: true,
			side: THREE.DoubleSide,
			toneMapped: false,
			uniforms: {
				depth: { value: null },
				ramp: { value: rampTexture("turbo") },
				range: { value: new THREE.Vector2(0, 1) },
				scale: { value: .001 },
				opacity: { value: 1 }
			},
			vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: `
                uniform sampler2D depth;
                uniform sampler2D ramp;
                uniform vec2 range;
                uniform float scale;
                uniform float opacity;
                in vec2 vUv;
                ${RAMP_GLSL}
                void main() {
                    vec4 color = depthColor(texture(depth, vec2(vUv.x, 1.0 - vUv.y)).r * scale, range, ramp);
                    if (color.a == 0.0) discard;
                    gl_FragColor = vec4(color.rgb, opacity);
                }`
		});
	}
	update(image, look = DEFAULT_DEPTH_LOOK$1) {
		const { width, height } = image;
		const data = asFloat(image);
		if (!this.#texture || this.#texture.image.width !== width || this.#texture.image.height !== height) {
			this.#texture?.dispose();
			this.#texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.FloatType);
			this.material.uniforms.depth.value = this.#texture;
		} else this.#texture.image.data = data;
		this.#texture.needsUpdate = true;
		const [near, far] = this.#range.update(image, look);
		this.material.uniforms.range.value.set(near, far);
		this.material.uniforms.scale.value = depthScale(image.encoding);
		this.material.uniforms.ramp.value = rampTexture(look.colormap);
	}
	dispose() {
		this.#texture?.dispose();
		this.material.dispose();
	}
};
//#endregion
//#region src/three/layers/camera3d.tsx
var DEFAULT_DEPTH_LOOK = {
	colormap: "turbo",
	near: null,
	far: null
};
var OPTICAL_TO_BODY = new THREE.Matrix4().set(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1);
function guess(width, height) {
	const fx = width / 2 / Math.tan(THREE.MathUtils.degToRad(70) / 2);
	return {
		width,
		height,
		fx,
		fy: fx,
		cx: width / 2,
		cy: height / 2
	};
}
var Camera3dLayer = class {
	root = new THREE.Group();
	#content = new THREE.Group();
	#plane;
	#picture = null;
	#depth = null;
	#depthSize = [0, 0];
	#frustum;
	#texture = null;
	/** what the texture shows: the live stream, or a replay canvas's "WxH" */
	#textureOf = null;
	#canvas = null;
	#frame = null;
	#intrinsics = null;
	#infoKey = "";
	#stopInfo = null;
	#stopFrame = null;
	#stops = [];
	#camera;
	#element = null;
	#videoCallback = 0;
	#lastShape = "";
	#checkedInfoAt = 0;
	settings;
	topic;
	context;
	constructor(context, topic, settings) {
		this.context = context;
		this.topic = topic;
		this.settings = settings;
		this.#content.matrixAutoUpdate = false;
		this.#content.userData.noPick = true;
		this.root.add(this.#content);
		this.#frustum = new FatLines(context.viewer.resolution, {
			width: 1.5,
			color: cssColor(themeColors().warn, "yellow")
		});
		this.#camera = context.video.acquire(topic);
		if (isDepthTopic(topic)) {
			this.#depth = new DepthMaterial();
			this.#plane = new THREE.Mesh(new THREE.BufferGeometry(), this.#depth.material);
			this.#stops.push(this.#camera.depth.subscribe(() => {
				const image = this.#camera.depth.get().image;
				if (image && this.#depth) {
					this.#depthSize = [image.width, image.height];
					this.#depth.update(image, this.settings.get().depth ?? DEFAULT_DEPTH_LOOK);
					this.#reshape(false);
					context.viewer.requestRender();
				}
			}));
		} else {
			this.#picture = new THREE.MeshBasicMaterial({
				side: THREE.DoubleSide,
				transparent: true,
				toneMapped: false
			});
			this.#plane = new THREE.Mesh(new THREE.BufferGeometry(), this.#picture);
			this.#stops.push(this.#camera.video.subscribe(() => this.#onVideo()));
			this.#onVideo();
		}
		this.#content.add(this.#plane, this.#frustum.object);
		this.#stops.push(settings.subscribe(() => this.#reshape(true)));
		this.#findInfo();
	}
	/** a live stream → a video texture (each decoded frame asks for a redraw); a replay canvas → a canvas texture */
	#onVideo() {
		const picture = this.#picture;
		if (!picture) return;
		const state = this.#camera.video.get();
		if (state.stream) {
			if (this.#textureOf !== state.stream) {
				this.#textureOf = state.stream;
				this.#texture?.dispose();
				const element = this.context.video.element(this.#camera);
				this.#element = element;
				this.#texture = new THREE.VideoTexture(element);
				this.#texture.colorSpace = THREE.SRGBColorSpace;
				picture.map = this.#texture;
				picture.needsUpdate = true;
				const onVideoFrame = () => {
					this.context.viewer.requestRender();
					this.#videoCallback = element.requestVideoFrameCallback(onVideoFrame);
				};
				this.#videoCallback = element.requestVideoFrameCallback?.(onVideoFrame) ?? 0;
			}
		} else if (state.image) {
			const image = state.image;
			this.#canvas ??= document.createElement("canvas");
			const canvas = this.#canvas;
			const shape = `${image.width}x${image.height}`;
			if (canvas.width !== image.width || canvas.height !== image.height) {
				canvas.width = image.width;
				canvas.height = image.height;
			}
			const context2d = canvas.getContext("2d");
			if (image instanceof ImageData) context2d.putImageData(image, 0, 0);
			else context2d.drawImage(image, 0, 0);
			if (this.#textureOf !== shape) {
				this.#textureOf = shape;
				this.#texture?.dispose();
				this.#texture = new THREE.CanvasTexture(canvas);
				this.#texture.colorSpace = THREE.SRGBColorSpace;
				picture.map = this.#texture;
				picture.needsUpdate = true;
			}
			this.#texture.needsUpdate = true;
		} else return;
		this.#reshape(false);
		this.context.viewer.requestRender();
	}
	/**
	* The image's own frame comes from one raw image; intrinsics from the CameraInfo whose frame_id is that frame.
	* Several cameras can share one CameraInfo topic (Spot publishes all five on one port), so every info topic is
	* read and only messages for this camera's frame are used; the name-matched topic is the fallback when either
	* side has no frame_id.
	*/
	#findInfo() {
		this.#checkedInfoAt = performance.now();
		if (this.#frame === null && !this.#stopFrame) this.#stopFrame = this.context.source.subscribe(this.topic.key, {
			delivery: "latest",
			maxHz: 1
		}, (message) => {
			let frame;
			const value = message.value ?? message.decoded;
			if (value) frame = value.frame ?? value.header?.frame_id ?? null;
			else try {
				frame = headerFrameId(this.topic.type, message.bytes);
			} catch {
				frame = null;
			}
			if (frame === null) return;
			this.#frame = frame;
			this.#stopFrame?.();
			this.#stopFrame = null;
			this.#reshape(false);
		});
		const infos = this.context.topics().filter((topic) => topic.type === "sensor_msgs.CameraInfo");
		const key = infos.map((topic) => topic.key).join(",");
		if (key === this.#infoKey || this.#intrinsics) return;
		this.#stopInfo?.();
		this.#infoKey = key;
		const named = cameraInfoFor(this.topic, infos, this.context.options?.cameraInfo ?? {});
		const stops = infos.map((info) => subscribeDecoded(this.context, info, {
			maxHz: 30,
			reliable: true
		}, (message) => {
			const K = message.K ?? message.k ?? [];
			const infoFrame = message.header?.frame_id ?? "";
			if (!(infoFrame && this.#frame ? infoFrame === this.#frame : info.key === named?.key) || !message.width || !K[0]) return;
			if (!this.#frame) this.#frame = infoFrame;
			this.#intrinsics = {
				width: message.width,
				height: message.height,
				fx: K[0],
				fy: K[4],
				cx: K[2],
				cy: K[5]
			};
			this.#stopInfo?.();
			this.#stopInfo = null;
			this.#reshape(false);
		}));
		this.#stopInfo = () => stops.forEach((stop) => stop());
	}
	#reshape(force) {
		const settings = this.settings.get();
		const video = this.#camera.video.get();
		const [width, height] = this.#depth ? this.#depthSize : [video.width, video.height];
		const intrinsics = this.#intrinsics ?? (width ? guess(width, height) : null);
		if (!intrinsics) return;
		const shape = `${JSON.stringify(intrinsics)}/${settings.distance}/${settings.convention}/${this.#frame}`;
		if (shape === this.#lastShape && !force) return;
		this.#lastShape = shape;
		const d = settings.distance;
		const corner = (u, v) => new THREE.Vector3((u - intrinsics.cx) / intrinsics.fx * d, (v - intrinsics.cy) / intrinsics.fy * d, d);
		const corners = [
			corner(0, 0),
			corner(intrinsics.width, 0),
			corner(intrinsics.width, intrinsics.height),
			corner(0, intrinsics.height)
		];
		const [topLeft, topRight, bottomRight, bottomLeft] = corners;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap((point) => point.toArray()), 3));
		geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
			0,
			1,
			1,
			1,
			1,
			0,
			0,
			0
		], 2));
		geometry.setIndex([
			0,
			1,
			2,
			0,
			2,
			3
		]);
		this.#plane.geometry.dispose();
		this.#plane.geometry = geometry;
		if (this.#picture) this.#picture.opacity = settings.opacity;
		else if (this.#depth) this.#depth.material.uniforms.opacity.value = settings.opacity;
		this.#plane.visible = settings.image;
		this.#frustum.clear();
		for (const point of corners) this.#frustum.push(0, 0, 0, point.x, point.y, point.z);
		for (const [a, b] of [
			[topLeft, topRight],
			[topRight, bottomRight],
			[bottomRight, bottomLeft],
			[bottomLeft, topLeft]
		]) this.#frustum.push(a.x, a.y, a.z, b.x, b.y, b.z);
		this.#frustum.commit();
		this.#frustum.object.visible = settings.frustum;
		const optical = settings.convention === "optical" || settings.convention === "auto" && /optical/i.test(this.#frame ?? "");
		this.#content.matrix.copy(optical ? new THREE.Matrix4() : OPTICAL_TO_BODY);
		this.#content.matrixWorldNeedsUpdate = true;
		this.context.setStatus({ info: `${intrinsics.width}×${intrinsics.height}${this.#intrinsics ? "" : " (no CameraInfo: 70° guess)"} · ${optical ? "optical" : "body"} frame ${this.#frame || "?"}` });
		this.context.viewer.requestRender();
	}
	update(frame) {
		if (!this.#intrinsics && frame.now - this.#checkedInfoAt > 2e3) this.#findInfo();
		if (this.#frame === "" && !this.#intrinsics) {
			if (this.root.visible) {
				this.root.visible = false;
				this.context.viewer.requestRender();
			}
			this.context.setStatus({ problem: "waiting for a CameraInfo (the image has no frame_id)" });
		} else if (this.#frame !== null) {
			if (placeLayer(this.context, this.root, this.#frame, frame.fixedFrame)) this.#reshape(false);
		}
	}
	dispose() {
		this.#element?.cancelVideoFrameCallback?.(this.#videoCallback);
		this.#stops.forEach((stop) => stop());
		this.#depth?.dispose();
		this.#stopInfo?.();
		this.#stopFrame?.();
		this.context.video.release(this.topic);
		this.#texture?.dispose();
		this.#plane.geometry.dispose();
		this.#picture?.dispose();
		this.#frustum.dispose();
	}
};
function Camera3dSettingsEditor({ settings, topic }) {
	const value = useStore(settings);
	const depth = value.depth ?? DEFAULT_DEPTH_LOOK;
	const slider = (label, key, min, max, step, format) => /* @__PURE__ */ jsx(Field, {
		label,
		children: /* @__PURE__ */ jsx(Slider, {
			min,
			max,
			step,
			value: value[key],
			format,
			onChange: (next) => settings.update({ [key]: next })
		})
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "dr-layer-settings-grid",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Picture",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.image,
					onChange: (image) => settings.update({ image })
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Frustum",
				children: /* @__PURE__ */ jsx(Toggle, {
					value: value.frustum,
					onChange: (frustum) => settings.update({ frustum })
				})
			}),
			slider("Distance", "distance", .2, 10, .1, (distance) => `${distance.toFixed(1)} m`),
			slider("Opacity", "opacity", .1, 1, .05, (opacity) => `${Math.round(opacity * 100)}%`),
			topic && isDepthTopic(topic) ? [/* @__PURE__ */ jsx(Field, {
				label: "Colormap",
				children: /* @__PURE__ */ jsx(Select, {
					value: depth.colormap,
					options: DEPTH_COLORMAPS,
					onChange: (colormap) => settings.update({ depth: {
						...depth,
						colormap
					} })
				})
			}, "colormap"), /* @__PURE__ */ jsx(Field, {
				label: "Range",
				hint: "meters; empty = automatic (2nd–98th percentile)",
				children: /* @__PURE__ */ jsxs("span", {
					className: "dr-range-inputs",
					children: [/* @__PURE__ */ jsx(RangeInput, {
						value: depth.near,
						onChange: (near) => settings.update({ depth: {
							...depth,
							near
						} })
					}), /* @__PURE__ */ jsx(RangeInput, {
						value: depth.far,
						onChange: (far) => settings.update({ depth: {
							...depth,
							far
						} })
					})]
				})
			}, "range")] : null,
			/* @__PURE__ */ jsx(Field, {
				label: "Frame",
				children: /* @__PURE__ */ jsx(Select, {
					value: value.convention,
					options: [
						["auto", "auto (by name)"],
						["optical", "optical (z forward)"],
						["body", "body (x forward)"]
					],
					onChange: (convention) => settings.update({ convention })
				})
			})
		]
	});
}
registerLayer({
	id: "camera3d",
	label: "Camera in 3D",
	types: ["sensor_msgs.Image", "sensor_msgs.CompressedImage"],
	defaults: {
		distance: 1.5,
		opacity: .95,
		image: true,
		frustum: true,
		convention: "auto",
		depth: DEFAULT_DEPTH_LOOK
	},
	enabledByDefault: () => false,
	create: (context, topic, settings) => {
		if (!topic) throw new Error("the camera3d layer draws a topic (it has no setData)");
		return new Camera3dLayer(context, topic, settings);
	},
	Settings: Camera3dSettingsEditor
});
//#endregion
//#region src/three/layers/detection2d.ts
registerOverlay({
	id: "detection2d",
	label: "2D detections",
	types: [
		"vision_msgs.Detection2DArray",
		"vision_msgs.Detection2D",
		"vision_msgs.BoundingBox2DArray"
	],
	draw(context, message) {
		const boxes = message.detections ?? message.boxes?.map((bbox) => ({ bbox })) ?? [message];
		const textColor = `#${cssColor(themeColors().bg, "black").getHexString()}`;
		context.lineWidth = Math.max(2, context.canvas.width / 400);
		context.font = `${Math.max(12, context.canvas.width / 60)}px ui-sans-serif, system-ui`;
		context.textBaseline = "bottom";
		for (const detection of boxes) {
			const box = detection.bbox ?? {};
			const center = box.center?.position ?? {
				x: 0,
				y: 0
			};
			const left = center.x - (box.size_x ?? 0) / 2;
			const top = center.y - (box.size_y ?? 0) / 2;
			const best = [...detection.results ?? []].sort((a, b) => (b.hypothesis?.score ?? 0) - (a.hypothesis?.score ?? 0))[0];
			const name = best?.hypothesis?.class_id || detection.id || "";
			const color = `#${colorFor(name || "box").getHexString()}`;
			context.strokeStyle = color;
			context.strokeRect(left, top, box.size_x ?? 0, box.size_y ?? 0);
			if (name) {
				const text = best?.hypothesis?.score !== void 0 ? `${name} ${(best.hypothesis.score * 100).toFixed(0)}%` : name;
				const width = context.measureText(text).width + 8;
				const height = parseFloat(context.font) + 4;
				context.fillStyle = color;
				context.fillRect(left, top - height, width, height);
				context.fillStyle = textColor;
				context.fillText(text, left + 4, top - 2);
			}
		}
	}
});
//#endregion
//#region src/three/tf_check.ts
/** A dynamic transform this much older than its newest sibling has stopped (static ones are exempt). */
var TF_STALE_MS = 2e3;
var list = (names, max = 3) => names.length > max ? `${names.slice(0, max).join(", ")}, +${names.length - max}` : names.join(", ");
var seconds = (ms) => `${(ms / 1e3).toFixed(ms < 1e4 ? 1 : 0)} s`;
/**
* @param input `layers`: the drawn layers' data frames; `placed(frame)`: whether it can be placed in the fixed frame
*   (tf.lookup(frame, fixedFrame) !== null)
*/
function checkTf({ snapshot, fixedFrame, layers = [], placed }) {
	const { edges, problems } = snapshot;
	const issues = [];
	const cycle = [...problems.cycle].sort();
	if (cycle.length) issues.push({
		kind: "cycle",
		summary: `a cycle through ${list(cycle)}`,
		detail: `${cycle.join(", ")} ${cycle.length === 1 ? "is its own ancestor" : "are their own ancestors"}: none of them can be placed`,
		frames: cycle
	});
	for (const [child, parents] of problems.doubleParent) issues.push({
		kind: "twoParents",
		summary: `"${child}" has ${parents.length} parents`,
		detail: `"${child}" is published under ${parents.join(" and ")}: tf allows one, so its pose flips between them`,
		frames: [child, ...parents]
	});
	const parentOf = new Map(edges.map((edge) => [edge.child, edge.parent]));
	const rootOf = (frame) => {
		let at = frame;
		for (let step = 0; step <= parentOf.size && parentOf.has(at); step++) at = parentOf.get(at);
		return at;
	};
	const frames = new Set(edges.flatMap((edge) => [edge.parent, edge.child]));
	if (problems.roots.length > 1) {
		const fixedRoot = frames.has(fixedFrame) ? rootOf(fixedFrame) : null;
		const roots = [...problems.roots].sort((a, b) => Number(b === fixedRoot) - Number(a === fixedRoot));
		const sizes = roots.map((root) => `${root} (${[...frames].filter((frame) => rootOf(frame) === root).length})`);
		issues.push({
			kind: "separateTrees",
			summary: `${roots.length} separate trees (${list(roots)})`,
			detail: `roots ${sizes.join(", ")}: frames in different trees can't be placed relative to each other` + (fixedRoot ? `, so only ${fixedRoot}'s tree can be drawn in "${fixedFrame}"` : ""),
			frames: [...frames].filter((frame) => rootOf(frame) !== fixedRoot).sort()
		});
	}
	if (frames.size && !frames.has(fixedFrame) && !problems.roots.some(placed)) issues.push({
		kind: "fixedFrame",
		summary: `fixed frame "${fixedFrame}" isn't in the tree`,
		detail: `nothing in tf connects to "${fixedFrame}": pick a fixed frame from the tree`,
		frames: problems.roots
	});
	const unplaced = /* @__PURE__ */ new Map();
	for (const { name, frame } of layers) if (frame && !placed(frame)) unplaced.set(frame, [...unplaced.get(frame) ?? [], name]);
	for (const [frame, names] of [...unplaced].sort(([a], [b]) => a.localeCompare(b))) {
		const inTree = frames.has(frame);
		issues.push({
			kind: "unplaced",
			summary: inTree ? `"${frame}" isn't connected to "${fixedFrame}" (${list(names, 2)})` : `"${frame}" isn't in the tree (${list(names, 2)})`,
			detail: `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in "${frame}", which ` + (inTree ? `has no tf path to "${fixedFrame}"` : "tf never publishes") + ", so nothing places it in the view",
			frames: [frame]
		});
	}
	const dynamic = edges.filter((edge) => !edge.isStatic);
	const freshest = Math.min(...dynamic.map((edge) => edge.ageMs));
	const stale = dynamic.filter((edge) => edge.ageMs > 2e3 && edge.ageMs - freshest > 2e3).sort((a, b) => a.child.localeCompare(b.child));
	if (stale.length) {
		const oldest = Math.max(...stale.map((edge) => edge.ageMs));
		issues.push({
			kind: "stale",
			summary: stale.length === 1 ? `${stale[0].parent} → ${stale[0].child} stopped ${seconds(stale[0].ageMs)} ago` : `${stale.length} transforms stopped updating`,
			detail: `${stale.map((edge) => `${edge.parent} → ${edge.child}`).join(", ")}: no update for up to ${seconds(oldest)} while other transforms keep arriving`,
			frames: stale.map((edge) => edge.child)
		});
	}
	return issues;
}
var keyOf = (issue) => `${issue.kind}:${issue.kind === "separateTrees" ? issue.summary : issue.frames.join(",")}`;
/** The issues in `next` that were also in `previous`: a problem must last two checks to be shown. */
function confirmedIssues(previous, next) {
	const seen = new Set(previous.map(keyOf));
	return next.filter((issue) => seen.has(keyOf(issue)));
}
//#endregion
//#region src/three/frame_highlight.ts
/** axes length (m) and line widths (CSS px) of the highlight */
var AXES_METERS = 1.2;
var AXES_PX = 7;
var HALO_PX = 22;
var FrameHighlighter = class {
	root = new THREE.Group();
	frame = null;
	placed = false;
	#axes;
	#halo;
	#label = new LabelPool("dr-scene-label dr-highlight");
	onPlaced;
	tf;
	viewer;
	constructor(viewer, tf, onPlaced) {
		this.viewer = viewer;
		this.tf = tf;
		this.onPlaced = onPlaced;
		this.#halo = new FatLines(viewer.resolution, {
			width: HALO_PX,
			vertexColors: true,
			opacity: .3,
			capacity: 3
		});
		this.#axes = new FatLines(viewer.resolution, {
			width: AXES_PX,
			vertexColors: true,
			capacity: 3
		});
		for (const lines of [this.#halo, this.#axes]) {
			lines.material.depthTest = false;
			lines.material.depthWrite = false;
			lines.material.transparent = true;
			lines.object.renderOrder = 1e3;
		}
		this.#halo.object.renderOrder = 999;
		this.root.add(this.#halo.object, this.#axes.object, this.#label.group);
		this.root.userData.noPick = true;
	}
	set(frame) {
		if (frame !== this.frame) {
			this.frame = frame;
			this.placed = false;
			this.viewer.requestRender();
		}
	}
	update(frameInfo) {
		const frame = this.frame;
		const matrix = frame ? this.tf.lookup(frame, frameInfo.fixedFrame) : null;
		this.#axes.clear();
		this.#halo.clear();
		this.#label.begin();
		if (frame && matrix) {
			const theme = themeColors();
			const colors = [
				cssColor(theme.axisX, "red"),
				cssColor(theme.axisY, "green"),
				cssColor(theme.axisZ, "blue")
			];
			const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
			const tip = new THREE.Vector3();
			[
				new THREE.Vector3(1, 0, 0),
				new THREE.Vector3(0, 1, 0),
				new THREE.Vector3(0, 0, 1)
			].forEach((axis, index) => {
				tip.copy(axis).multiplyScalar(AXES_METERS).applyMatrix4(matrix);
				this.#axes.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, colors[index]);
				this.#halo.push(origin.x, origin.y, origin.z, tip.x, tip.y, tip.z, colors[index]);
			});
			this.#label.place(frame, origin);
		}
		this.#axes.commit();
		this.#halo.commit();
		this.#label.end();
		if (frame && this.placed !== !!matrix) {
			this.placed = !!matrix;
			this.onPlaced?.(this.placed);
		}
		if (frame) this.viewer.requestRender();
	}
	dispose() {
		this.#axes.dispose();
		this.#halo.dispose();
		this.#label.dispose();
	}
};
//#endregion
//#region src/three/react.tsx
var SceneContext = createContext({
	viewer: null,
	tf: null,
	fixedFrame: "world"
});
/**
* The enclosing Scene3D: `{ viewer, tf, fixedFrame, source, video, robotPose, options, frameInfo, actions }` (viewer
* is null until it has mounted). `frameInfo`: a Store of `{ fixedFrame, robotFound, followFound, following }`;
* `actions`: `{ recenter(), topDown() }`.
*/
function useScene() {
	return useContext(SceneContext);
}
/** The enclosing Scene3D's Viewer (null until mounted). */
function useViewer() {
	return useContext(SceneContext).viewer;
}
/** The enclosing Scene3D's TfTree. */
function useTf() {
	return useContext(SceneContext).tf;
}
/** The fixed frame the enclosing Scene3D draws in. */
function useFixedFrame() {
	return useContext(SceneContext).fixedFrame;
}
/** The enclosing Scene3D's camera actions: `{ recenter(), topDown() }`. */
function useSceneActions() {
	return useContext(SceneContext).actions;
}
/** Calls `callback(frame)` every animation frame of the enclosing scene (frame: { now, dataNow, fixedFrame, camera }). */
function useSceneFrame(callback) {
	const viewer = useViewer();
	const ref = useRef(callback);
	ref.current = callback;
	useEffect(() => {
		const off = viewer?.onFrame((frame) => ref.current(frame));
		return () => {
			off?.();
		};
	}, [viewer]);
}
/** The TF tree's frame names, re-rendered (at most every `throttleMs`) when the tree changes. */
function useTfFrames({ throttleMs = 500, tf: given } = {}) {
	const context = useTf();
	const tf = given ?? context;
	const [frames, setFrames] = useState(() => tf?.frames() ?? []);
	useEffect(() => {
		if (!tf) return;
		let timer = void 0;
		let last = "";
		const read = () => {
			timer = void 0;
			const next = tf.frames();
			const signature = next.join("\n");
			if (signature !== last) {
				last = signature;
				setFrames(next);
			}
		};
		read();
		const off = tf.onChange(() => {
			timer ??= setTimeout(read, throttleMs);
		});
		return () => {
			off();
			clearTimeout(timer);
		};
	}, [tf, throttleMs]);
	return frames;
}
/**
* Mounts a custom layer in the enclosing scene: `create({ viewer, tf, ... })` returns
* `{ root?: THREE.Object3D, update?(frame), reset?(), dispose?() }` (or null). `root` is added to the scene and
* removed on cleanup, `update` runs every frame, `reset` on a replay's seek. Re-created when `deps` change; returns a
* ref to the live layer (push new data into it from your own effects instead of re-creating it).
*/
function useLayer(create, deps = []) {
	const scene = useScene();
	const { viewer, tf } = scene;
	const ref = useRef(null);
	useEffect(() => {
		if (!scene.viewer) return;
		const viewer = scene.viewer;
		const layer = create(scene);
		if (!layer) return;
		if (layer.root) viewer.scene.add(layer.root);
		const offFrame = layer.update ? viewer.onFrame((frame) => layer.update?.(frame)) : null;
		const offReset = layer.reset ? viewer.onReset(() => layer.reset?.()) : null;
		ref.current = layer;
		viewer.requestRender();
		return () => {
			offFrame?.();
			offReset?.();
			layer.root?.removeFromParent();
			layer.dispose?.();
			if (ref.current === layer) ref.current = null;
			viewer.requestRender();
		};
	}, [
		viewer,
		tf,
		...deps
	]);
	return ref;
}
/**
* Sets `object.matrix` to T_fixed_frame and shows it; with no TF path it hides the object. Returns whether it could
* be placed (and why not, through `onStatus`).
*/
function placeInFixedFrame(viewer, tf, object, frame, fixedFrame, onStatus) {
	const matrix = tf.lookup(frame, fixedFrame);
	if (!matrix) {
		if (object.visible) {
			object.visible = false;
			viewer.requestRender();
		}
		onStatus?.({
			problem: `no TF path from "${frame}" to "${fixedFrame}"`,
			frame
		});
		return false;
	}
	if (!object.visible || !object.matrix.equals(matrix)) {
		object.matrix.copy(matrix);
		object.matrixWorldNeedsUpdate = true;
		object.visible = true;
		viewer.requestRender();
	}
	return true;
}
/** The layer context a layer type's instance gets (registry.js LayerContext). */
function layerContext(scene, setStatus, extra = {}) {
	return {
		viewer: scene.viewer,
		tf: scene.tf,
		source: scene.source,
		video: scene.video,
		robotPose: scene.robotPose,
		options: scene.options ?? {},
		topics: () => scene.topics?.() ?? [],
		setStatus,
		...extra
	};
}
/**
* The 3D view. Give it a size (style/className); layers go in `children`, and any DOM children (buttons, stats) are
* laid over it.
*   `fixedFrame`: the frame everything is drawn in (default: the TF tree's world-ish root). `followFrame`: a TF frame
*   the camera follows while `follow` (orbit and zoom keep following; a pan pauses it until resumed). `robotFrame`:
*   the robot's frame (default `followFrame`): the camera frames it once when it first shows up, and without it in
*   TF the newest pose from a Pose layer stands in for it. A replay source (memorySource({ clock })) drives the data
*   clock (fading, staleness, lifetimes) and its seek() resets the layers. `near`, `far`, `fov`, `gridSize`,
*   `gridDivisions`, `freeOrbit`: the Viewer's options, read once when it mounts. `viewCube`: a CAD view cube in a
*   corner (click a face / edge / corner to look from there, drag it to orbit); default off.
*/
function Scene3D({ fixedFrame, followFrame = null, follow = true, onFollowChange, robotFrame, viewDistance = 7, grid = true, tf: givenTf, clock, onPick, onViewer, layerOptions, topics, className, style, children, cameraPosition, cameraTarget, near, far, fov, gridSize, gridDivisions, freeOrbit, viewCube = false, ...rest }) {
	const hostRef = useRef(null);
	const rootRef = useRef(null);
	const source = useDataSource();
	const [viewer, setViewer] = useState(null);
	const tf = useMemo(() => givenTf ?? new TfTree(), [givenTf]);
	const robotPose = useMemo(() => new RobotPose(), []);
	const frameInfo = useMemo(() => new Store({
		fixedFrame: "",
		robotFound: false,
		followFound: false,
		following: false
	}), []);
	const [autoFixed, setAutoFixed] = useState("world");
	const fixed = fixedFrame || autoFixed;
	const robot = robotFrame === void 0 ? followFrame : robotFrame;
	const current = {
		follow,
		followFrame,
		robot,
		viewDistance,
		onFollowChange
	};
	const props = useRef(current);
	props.current = current;
	useEffect(() => {
		const created = new Viewer(hostRef.current, {
			clock: clock ?? (() => source.now?.() ?? Date.now()),
			grid,
			near,
			far,
			fov,
			gridSize,
			gridDivisions,
			freeOrbit
		});
		setViewer(created);
		const onTheme = () => created.setTheme();
		addEventListener("dimos-react-theme", onTheme);
		return () => {
			removeEventListener("dimos-react-theme", onTheme);
			created.dispose();
			setViewer(null);
		};
	}, []);
	useEffect(() => {
		if (!viewer) return;
		if (source.replay) {
			viewer.dataClock = () => source.now();
			tf.now = () => source.now();
		}
		const off = source.onSeek?.(() => viewer.reset());
		return () => {
			off?.();
			viewer.dataClock = () => performance.now();
		};
	}, [
		viewer,
		source,
		tf
	]);
	useEffect(() => {
		if (viewer) onViewer?.(viewer);
	}, [viewer]);
	useEffect(() => viewer?.setGrid(grid), [viewer, grid]);
	const cubeCorner = viewCube === true ? "top-right" : viewCube || null;
	useEffect(() => {
		if (!viewer || !cubeCorner || !rootRef.current) return;
		const cube = new ViewCube(viewer, rootRef.current, { corner: cubeCorner });
		return () => cube.dispose();
	}, [viewer, cubeCorner]);
	useEffect(() => {
		if (!viewer) return;
		if (cameraTarget) viewer.controls.target.set(...cameraTarget);
		if (cameraPosition) viewer.camera.position.set(...cameraPosition);
		viewer.controls.update();
		viewer.requestRender();
	}, [
		viewer,
		cameraPosition?.join(","),
		cameraTarget?.join(",")
	]);
	useEffect(() => {
		if (fixedFrame) return;
		const check = () => setAutoFixed(tf.defaultFixedFrame());
		check();
		let timer = void 0;
		const off = tf.onChange(() => {
			timer ??= setTimeout(() => {
				timer = void 0;
				check();
			}, 300);
		});
		return () => {
			off();
			clearTimeout(timer);
		};
	}, [tf, fixedFrame]);
	useEffect(() => {
		if (viewer) {
			viewer.fixedFrame = fixed;
			viewer.requestRender();
		}
	}, [viewer, fixed]);
	const positions = useRef({
		robot: null,
		follow: null,
		framed: false
	});
	useEffect(() => {
		if (!viewer) return;
		positions.current.framed = false;
		const robotAt = new THREE.Vector3();
		const followAt = new THREE.Vector3();
		const off = viewer.onFrame((frame) => {
			const { follow, followFrame, robot, viewDistance } = props.current;
			const robotMatrix = robot ? tf.lookup(robot, frame.fixedFrame) ?? robotPose.matrix : robotPose.matrix;
			const robotPosition = robotMatrix ? robotAt.setFromMatrixPosition(robotMatrix) : null;
			if (robotPosition && !positions.current.framed) {
				positions.current.framed = true;
				viewer.frame(robotPosition.clone(), viewDistance);
			}
			let followed = null;
			if (followFrame) {
				followed = followFrame === robot ? robotPosition : null;
				if (!followed) {
					const matrix = tf.lookup(followFrame, frame.fixedFrame);
					followed = matrix ? followAt.setFromMatrixPosition(matrix) : null;
				}
			}
			positions.current.robot = robotPosition;
			positions.current.follow = followed;
			viewer.followTarget = follow ? followed : null;
			const following = !!(follow && followFrame) && !viewer.followPaused.get().paused;
			const info = frameInfo.get();
			if (info.fixedFrame !== frame.fixedFrame || info.robotFound !== !!robotPosition || info.followFound !== !!followed || info.following !== following) frameInfo.set({
				fixedFrame: frame.fixedFrame,
				robotFound: !!robotPosition,
				followFound: !!followed,
				following
			});
		});
		return () => {
			off();
			viewer.followTarget = null;
		};
	}, [
		viewer,
		tf,
		robotPose
	]);
	useEffect(() => {
		viewer?.resumeFollow();
	}, [viewer, followFrame]);
	const actions = useMemo(() => ({
		/**
		* Not following (paused by a pan, or off): follows again, gliding the followed frame back to the middle with
		* the angle and zoom kept. Already following: frames it afresh. Without it in TF, frames the data that's
		* drawn, or else the origin.
		*/
		recenter() {
			if (!viewer) return;
			const { follow, followFrame, viewDistance, onFollowChange } = props.current;
			const wasFollowing = follow && !!followFrame && !viewer.followPaused.get().paused;
			if (!follow) onFollowChange?.(true);
			viewer.resumeFollow();
			const followed = positions.current.follow;
			if (wasFollowing && followed) {
				viewer.frame(followed.clone(), viewDistance);
				return;
			}
			if (followed) return;
			const bounds = viewer.dataBounds();
			if (bounds) {
				const size = bounds.getSize(new THREE.Vector3());
				viewer.frame(bounds.getCenter(new THREE.Vector3()), THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) * 1.2, 4, 300));
				return;
			}
			viewer.frame(new THREE.Vector3(), viewDistance);
		},
		/** Straight down on the area around the robot (or on everything drawn without one). */
		topDown() {
			viewer?.topDownAround(positions.current.robot);
		}
	}), [viewer]);
	const pickRef = useRef(onPick);
	pickRef.current = onPick;
	useEffect(() => {
		if (!viewer) return;
		const canvas = viewer.renderer.domElement;
		let down = null;
		const onDown = (event) => {
			down = {
				x: event.clientX,
				y: event.clientY
			};
		};
		const onUp = (event) => {
			if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || !pickRef.current) return;
			const picked = viewer.pick(event.clientX, event.clientY);
			if (picked) pickRef.current({
				...picked,
				event
			});
		};
		canvas.addEventListener("pointerdown", onDown);
		canvas.addEventListener("pointerup", onUp);
		return () => {
			canvas.removeEventListener("pointerdown", onDown);
			canvas.removeEventListener("pointerup", onUp);
		};
	}, [viewer]);
	const topicsRef = useRef(topics);
	topicsRef.current = topics;
	const optionsSignature = JSON.stringify(layerOptions ?? {});
	const value = useMemo(() => ({
		viewer,
		tf,
		fixedFrame: fixed,
		source,
		video: cameraStreamsFor(source),
		robotPose,
		options: {
			baseFrame: robot ?? void 0,
			...layerOptions
		},
		topics: () => topicsRef.current?.() ?? [],
		frameInfo,
		actions
	}), [
		viewer,
		tf,
		fixed,
		source,
		robotPose,
		robot,
		optionsSignature,
		frameInfo,
		actions
	]);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-scene", className),
		style,
		ref: rootRef,
		...rest,
		children: [/* @__PURE__ */ jsx("div", {
			className: "dr-scene-host",
			ref: hostRef
		}), /* @__PURE__ */ jsx(SceneContext.Provider, {
			value,
			children: viewer ? children : null
		})]
	});
}
/**
* Feeds the scene's TF tree: every tf2_msgs.TFMessage topic on the bus (or `topics`), and/or `transforms` given as
* props. A topic named like tf_static is static (exempt from staleness). `transforms`: a decoded TFMessage, an array
* of TransformStamped, or `[{ parent, child, translation, rotation }]`.
*/
function TfFeed({ topics, transforms, staticTransforms, tf: given }) {
	const context = useScene();
	const tf = given ?? context.tf;
	const viewer = context.viewer;
	const source = useDataSource();
	const listed = useTopicList({
		types: ["tf2_msgs.TFMessage"],
		intervalMs: topics ? 36e5 : 2e3
	});
	const keys = topics ?? listed.map((topic) => topic.key);
	const keysSignature = keys.join("\n");
	useEffect(() => {
		if (!tf) return;
		const stops = keys.map((key) => source.subscribe(key, { delivery: "reliable" }, (message) => {
			let decoded;
			try {
				decoded = decodeMessage(message, "auto", parseKey(key)?.type ?? "tf2_msgs.TFMessage");
			} catch {
				return;
			}
			tf.setMessage(decoded, /static/i.test(key));
			viewer?.noteData(message.timestamp);
		}));
		return () => stops.forEach((stop) => stop());
	}, [
		source,
		tf,
		viewer,
		keysSignature
	]);
	useEffect(() => {
		applyTransforms(tf, staticTransforms, true);
		viewer?.requestRender();
	}, [tf, staticTransforms]);
	useEffect(() => {
		applyTransforms(tf, transforms, false);
		viewer?.requestRender();
	}, [tf, transforms]);
	return null;
}
/** Same as TfFeed (the name the component inventory uses). */
var TfProvider = TfFeed;
function applyTransforms(tf, transforms, isStatic) {
	if (!tf || !transforms) return;
	const list = Array.isArray(transforms) ? transforms : transforms.transforms ?? [];
	for (const item of list) if (item?.child !== void 0) tf.set(item.parent, item.child, item.translation ?? [
		0,
		0,
		0
	], item.rotation ?? [
		0,
		0,
		0,
		1
	], item.static ?? isStatic);
	else tf.setMessage([item], isStatic);
}
/**
* One layer of a registered type (layers/registry.js) in the scene: from a topic, or from `data` (types that take
* props data: pointcloud, pose, path, posearray, labeled-points `[{ label, position, frame, color }]`, boxes3d
* `[{ center, size, yaw, frame, label, color, fill }]`). `settings` override the type's defaults (live: a change restyles,
* it doesn't re-create); every type also takes `onTop` (LayerCommonSettings: drawn over everything else).
*/
function Layer({ type, topic, settings, data, onStatus, onPose }) {
	const scene = useScene();
	const layerType = typeof type === "string" ? layerTypeById(type) : type;
	if (!layerType) throw new Error(`[dimos-react] no layer type "${type}"`);
	const topicObject = typeof topic === "string" ? parseKey(topic) ?? {
		key: topic,
		name: topic,
		type: ""
	} : topic ?? null;
	const store = useMemo(() => new Store({
		...defaultSettings(layerType, topicObject),
		...settings
	}), [layerType, topicObject?.key]);
	const settingsSignature = JSON.stringify(settings ?? {});
	useEffect(() => {
		if (settings) store.update(settings);
	}, [store, settingsSignature]);
	const callbacks = useRef({
		onStatus,
		onPose
	});
	callbacks.current = {
		onStatus,
		onPose
	};
	const instance = useLayer((mounted) => {
		const created = layerType.create(layerContext(mounted, (status) => callbacks.current.onStatus?.(status), { onPose: (matrix) => callbacks.current.onPose?.(matrix) }), topicObject, store);
		created.root.matrixAutoUpdate = false;
		const offTop = followOnTop(mounted.viewer, created.root, store);
		const dispose = created.dispose.bind(created);
		created.dispose = () => {
			offTop();
			dispose();
		};
		return created;
	}, [
		layerType,
		topicObject?.key,
		store
	]);
	useEffect(() => {
		if (data !== void 0 && instance.current?.setData) instance.current.setData(data);
	}, [
		scene.viewer,
		data,
		instance.current
	]);
	return null;
}
/**
* Every topic a LayerManager lists, drawn by its layer type while switched on (unsubscribed while off or paused).
* The manager (panels.js useLayerManager) is shared with a LayersPanel outside the scene.
*/
function TopicLayers({ manager }) {
	const scene = useScene();
	const { list } = useStore(manager.entries);
	const { paused } = useStore(manager.paused);
	const instances = useRef(/* @__PURE__ */ new Map());
	const sceneRef = useRef(scene);
	sceneRef.current = scene;
	useEffect(() => {
		const mounted = sceneRef.current;
		if (!mounted.viewer) return;
		const viewer = mounted.viewer;
		const wanted = new Map(paused ? [] : list.filter((entry) => entry.enabled).map((entry) => [entry.topic.key, entry]));
		for (const [key, running] of instances.current) if (!wanted.has(key) || wanted.get(key)?.type !== running.type) stop(key);
		for (const [key, entry] of wanted) {
			if (instances.current.has(key)) continue;
			const context = layerContext(mounted, (status) => manager.setStatus(key, status), { topics: () => manager.topics.get().list });
			try {
				const instance = entry.type.create(context, entry.topic, entry.settings);
				instance.root.matrixAutoUpdate = false;
				viewer.scene.add(instance.root);
				const offFrame = instance.update ? viewer.onFrame((frame) => instance.update?.(frame)) : null;
				const offReset = instance.reset ? viewer.onReset(() => instance.reset?.()) : null;
				const offTop = followOnTop(viewer, instance.root, entry.settings);
				instances.current.set(key, {
					instance,
					type: entry.type,
					offFrame,
					offReset,
					offTop
				});
			} catch (error) {
				manager.setStatus(key, { problem: `failed to start: ${error instanceof Error ? error.message : error}` });
			}
		}
		viewer.requestRender();
		function stop(key) {
			const running = instances.current.get(key);
			instances.current.delete(key);
			running.offFrame?.();
			running.offReset?.();
			running.offTop();
			running.instance.root.removeFromParent();
			running.instance.dispose();
			manager.clearStatus(key);
		}
	}, [
		scene.viewer,
		list,
		paused,
		manager
	]);
	useEffect(() => () => {
		for (const [key, running] of instances.current) {
			running.offFrame?.();
			running.offReset?.();
			running.offTop();
			running.instance.root.removeFromParent();
			running.instance.dispose();
			manager.clearStatus(key);
		}
		instances.current.clear();
	}, [scene.viewer, manager]);
	return null;
}
/**
* The TF tree drawn: an axes gizmo per frame (theme --axis-x/y/z), its name, and a line to its parent. A big tree
* names only `named` frames (and the fixed frame) past `maxNames`.
*/
function TfFrames({ axesSize = .25, names = true, links = true, maxNames = 16, named = [], maxFrames = 512, onTop = false, onStatus }) {
	return /* @__PURE__ */ jsx(Layer, {
		type: tfType,
		settings: {
			axesSize,
			names,
			links,
			maxNames,
			named,
			maxFrames,
			onTop
		},
		onStatus
	});
}
var tfType = {
	id: "tf-frames",
	label: "TF frames",
	types: [],
	defaults: TF_DEFAULTS,
	create: (context, _topic, settings) => new TfFramesLayer(context, settings)
};
var cloudType = {
	id: "pointcloud-props",
	label: "Point cloud",
	types: [],
	defaults: {},
	create: (context, topic, settings) => new CloudLayer(context, topic, settings)
};
/**
* A point cloud: from a topic (sensor_msgs.PointCloud2 through the gateway's dimos_lcm_pointcloud2 encoding at this
* viewer's bandwidth preset, or any source publishing `{ positions, intensity?, frame? }` or a decoded PointCloud2) or
* from `points` props. `color`: the solid color (CSS or a token like "var(--primary)"; colorMode "solid"); `maxHz` /
* `quality` pin the subscription instead of the viewer's preset.
*/
function PointCloud({ topic, points, intensity, frame, mode = "latest", windowSeconds = 10, maxPoints = 2e6, maxHz, quality, style, size, colorMode, gradient, period, axis, rangeMin, rangeMax, color, opacity, cubeShade, onTop = false, onStatus }) {
	const look = {
		...CLOUD_DEFAULTS.look,
		style: "voxel",
		size: .05
	};
	for (const [name, value] of Object.entries({
		style,
		size,
		colorMode,
		gradient,
		period,
		axis,
		rangeMin,
		rangeMax,
		opacity,
		cubeShade
	})) if (value !== void 0) look[name] = value;
	if (color !== void 0) look.solid = `#${cssColor(color, "white").getHexString()}`;
	const settings = {
		look,
		mode,
		windowSeconds,
		maxPoints,
		maxHz,
		quality,
		frame,
		onTop
	};
	const data = useMemo(() => points ? {
		positions: points,
		intensity,
		frame
	} : void 0, [
		points,
		intensity,
		frame
	]);
	return /* @__PURE__ */ jsx(Layer, {
		type: cloudType,
		topic,
		settings,
		data,
		onStatus
	});
}
var pathType = {
	id: "path-props",
	label: "Path",
	types: [],
	defaults: {},
	create: (context, topic, settings) => new PathLayer(context, topic, settings)
};
/** A path as a thick line: a nav_msgs.Path topic, or `poses` (+ `frame`) as props. `color`: CSS or token (default var(--primary)). */
function Path({ topic, poses, frame = "", color = "var(--primary)", width = 4, lift = .03, onTop = false, onStatus }) {
	const data = useMemo(() => poses ? {
		poses,
		frame
	} : void 0, [poses, frame]);
	return /* @__PURE__ */ jsx(Layer, {
		type: pathType,
		topic,
		settings: {
			color,
			width,
			lift,
			onTop
		},
		data,
		onStatus
	});
}
var poseType = {
	id: "pose-props",
	label: "Pose",
	types: [],
	defaults: POSE_DEFAULTS,
	create: (context, topic, settings) => new PoseLayer(context, topic, settings)
};
/**
* A pose as axes (theme axis colors), with an optional trail of where it has been (kept in the fixed frame; a jump
* leaves a gap) and, when the source knows it (a recording), the whole route faint ahead. From a topic
* (nav_msgs.Odometry, geometry_msgs.PoseStamped / PoseWithCovarianceStamped) or `pose` (+ `frame`) as props.
* `onPose`: the pose in the fixed frame.
*/
function Pose({ topic, pose, frame = "", axesSize = .6, trail = false, trailLength = 2e4, jumpMeters = 2.5, color = "var(--primary)", width = 4, onTop = false, route = true, onPose, onStatus }) {
	const data = useMemo(() => pose ? {
		pose,
		frame
	} : void 0, [pose, frame]);
	return /* @__PURE__ */ jsx(Layer, {
		type: poseType,
		topic,
		settings: {
			axesSize,
			trail,
			trailLength,
			jumpMeters,
			color,
			width,
			onTop,
			route
		},
		data,
		onPose,
		onStatus
	});
}
var poseArrayType = {
	id: "posearray-props",
	label: "Pose array",
	types: [],
	defaults: {},
	create: (context, topic, settings) => new PoseArrayLayer(context, topic, settings)
};
/** Many poses as arrows: a geometry_msgs.PoseArray topic, or `poses` (+ `frame`) as props. */
function PoseArray({ topic, poses, frame = "", color = "var(--accent-alt)", length = .4, width = 2, onTop = false, onStatus }) {
	const data = useMemo(() => poses ? {
		poses,
		frame
	} : void 0, [poses, frame]);
	return /* @__PURE__ */ jsx(Layer, {
		type: poseArrayType,
		topic,
		settings: {
			color,
			length,
			width,
			onTop
		},
		data,
		onStatus
	});
}
/**
* A stand-in robot model (ROBOT_KINDS: dog, humanoid, wheeled, drone, arrow) at a TF frame (`frame`, default the
* scene's robotFrame, else base_link) or at `pose` (in `poseFrame`). Without its frame in TF it stands at the newest
* pose a Pose layer reported. Colors follow the theme unless `colors` says otherwise.
*/
function RobotModel({ kind = "wheeled", frame, pose, poseFrame = "", scale = 1, visible = true, colors }) {
	const scene = useScene();
	const current = {
		frame: frame ?? scene.options?.baseFrame ?? "base_link",
		pose,
		poseFrame,
		scale,
		visible
	};
	const settings = useRef(current);
	settings.current = current;
	useLayer(({ viewer, tf, robotPose }) => {
		const first = robotModel(kind, colors);
		if (!first) return null;
		let model = first;
		const root = new THREE.Group();
		root.add(model);
		const rebuild = () => {
			disposeTree(model);
			model = robotModel(kind, colors);
			root.add(model);
			viewer.requestRender();
		};
		addEventListener("dimos-react-theme", rebuild);
		const local = new THREE.Matrix4();
		const scaleVector = new THREE.Vector3();
		return {
			root,
			update(frameInfo) {
				const { frame, pose, poseFrame, scale, visible } = settings.current;
				const base = pose ? tf.lookup(poseFrame, frameInfo.fixedFrame) : tf.lookup(frame, frameInfo.fixedFrame) ?? robotPose?.matrix ?? null;
				if (!base || !visible) {
					if (model.visible) {
						model.visible = false;
						viewer.requestRender();
					}
					return;
				}
				const matrix = pose ? base.clone().multiply(poseMatrix(pose, local)) : base.clone();
				matrix.scale(scaleVector.setScalar(scale));
				if (!model.visible || !model.matrix.equals(matrix)) {
					model.matrix.copy(matrix);
					model.matrixWorldNeedsUpdate = true;
					model.visible = true;
					viewer.requestRender();
				}
			},
			dispose() {
				removeEventListener("dimos-react-theme", rebuild);
				disposeTree(model);
			}
		};
	}, [kind, JSON.stringify(colors ?? {})]);
	return null;
}
/**
* One TF frame picked out (e.g. a TF panel's hovered row): big axes drawn over everything with a halo and its name,
* following the frame as it moves. `onPlaced(placed)` says whether it could be placed in the fixed frame.
*/
function FrameHighlight({ frame, onPlaced }) {
	const placedRef = useRef(onPlaced);
	placedRef.current = onPlaced;
	const layer = useLayer(({ viewer, tf }) => new FrameHighlighter(viewer, tf, (placed) => placedRef.current?.(placed)), []);
	useEffect(() => {
		layer.current?.set(frame ?? null);
	}, [frame, layer.current]);
	return null;
}
/**
* What's wrong with the scene's TF tree (tf_check.js), checked every `intervalMs`; a problem shows once two checks in a
* row see it. `layers`: the drawn layers' frames (a LayerManager's layerFrames()).
*/
function useTfIssues({ layers, tf: given, fixedFrame: givenFixed, intervalMs = 2e3 } = {}) {
	const scene = useScene();
	const tf = given ?? scene.tf;
	const fixedRef = useRef(givenFixed ?? scene.fixedFrame);
	fixedRef.current = givenFixed ?? scene.viewer?.fixedFrame ?? scene.fixedFrame;
	const layersRef = useRef(layers);
	layersRef.current = layers;
	const [issues, setIssues] = useState([]);
	useEffect(() => {
		if (!tf) return;
		let seen = [];
		let shown = "[]";
		const check = () => {
			const fixedFrame = fixedRef.current;
			const next = checkTf({
				snapshot: tf.snapshot(),
				fixedFrame,
				layers: typeof layersRef.current === "function" ? layersRef.current() : layersRef.current ?? [],
				placed: (frame) => tf.lookup(frame, fixedFrame) !== null
			});
			const confirmed = confirmedIssues(seen, next);
			seen = next;
			const signature = JSON.stringify(confirmed);
			if (signature !== shown) {
				shown = signature;
				setIssues(confirmed);
			}
		};
		const timer = setInterval(check, intervalMs);
		return () => clearInterval(timer);
	}, [tf, intervalMs]);
	return issues;
}
/** A Select of the scene's TF frames (inside a Scene3D, or pass `tf`). `noneLabel`: an extra "none" option (null). */
function FramePicker({ value, onChange, tf, noneLabel = null, placeholder = "frame…", ...rest }) {
	const frames = useTfFrames({ tf });
	const options = [...noneLabel !== null ? [[null, noneLabel]] : [], ...frames.map((name) => [name, name])];
	if (value && !frames.includes(value)) options.push([value, `${value} (not seen)`]);
	return /* @__PURE__ */ jsx(Select, {
		value: value ?? null,
		onChange,
		options,
		placeholder,
		...rest
	});
}
var emptyStats = new Store({
	fps: 0,
	frameMs: 0,
	latencyP50: null,
	latencyP95: null,
	arrivalToFrameMs: null,
	drawCalls: 0,
	points: 0
});
/**
* The scene's render numbers as a small overlay: fps · points · frame ms · latency, or with `detailed` the full set
* (CPU per frame, latency p50/p95, arrival→frame, `rttMs` if given, points, draw calls).
*/
function SceneStats({ className, detailed = false, rttMs }) {
	const viewer = useViewer();
	const stats = useStore(viewer?.stats ?? emptyStats);
	if (detailed) {
		const ms = (value) => value === null || value === void 0 ? "–" : `${value.toFixed(1)} ms`;
		return /* @__PURE__ */ jsxs("div", {
			className: cx("dr-scene-stats dr-scene-stats--detailed", className),
			"data-testid": "stats",
			children: [
				/* @__PURE__ */ jsx("div", { children: `${stats.fps} fps · ${stats.frameMs.toFixed(2)} ms/frame CPU` }),
				/* @__PURE__ */ jsx("div", { children: `latency p50 ${ms(stats.latencyP50)} · p95 ${ms(stats.latencyP95)}` }),
				/* @__PURE__ */ jsx("div", { children: `arrival→frame ${ms(stats.arrivalToFrameMs)}${rttMs !== void 0 ? ` · rtt ${ms(rttMs)}` : ""}` }),
				/* @__PURE__ */ jsx("div", { children: `${stats.points.toLocaleString()} points · ${stats.drawCalls} draws` })
			]
		});
	}
	const points = stats.points > 1e6 ? `${(stats.points / 1e6).toFixed(1)}M` : stats.points > 1e3 ? `${(stats.points / 1e3).toFixed(0)}k` : String(stats.points);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-scene-stats", className),
		children: [`${stats.fps} fps · ${points} pts · ${stats.frameMs.toFixed(1)} ms`, stats.latencyP50 !== null ? ` · ${Math.round(stats.latencyP50)} ms latency` : ""]
	});
}
/**
* Camera buttons over the scene: follow (reframes the followed frame, or follows again after a pan), top-down (on the
* area around the robot), frame everything. `children`: extra buttons.
* `onFrameAll` / `onTopDown` replace what those buttons do (an app's own idea of "everything"); `position`:
* "bottom-right" (default) | "top-right" | "top-left" | "bottom-left".
*/
function SceneControls({ className, children, frameAll = true, onFrameAll, onTopDown, position = "bottom-right" }) {
	const { viewer, frameInfo, actions } = useScene();
	const info = useStore(frameInfo ?? emptyFrameInfo);
	const button = (icon, label, onClick, pressed) => /* @__PURE__ */ jsx(IconButton, {
		icon,
		label,
		title: label,
		className: "dr-scene-btn",
		"aria-pressed": pressed,
		onClick
	});
	const followTitle = info.following ? `Following${info.followFound ? "" : " (waiting for the frame in TF)"}: orbit and zoom keep following, a pan looks around. Click to reframe` : "Follow again";
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-scene-controls", position !== "bottom-right" && `dr-scene-controls--${position}`, className),
		"data-testid": "view-controls",
		children: [
			button("target", followTitle, () => actions?.recenter(), info.following),
			button("top", "Top-down", () => onTopDown ? onTopDown() : actions?.topDown()),
			frameAll ? button("fit", "Frame everything", () => onFrameAll ? onFrameAll() : viewer?.frameAll()) : null,
			children
		]
	});
}
var emptyFrameInfo = new Store({
	fixedFrame: "",
	robotFound: false,
	followFound: false,
	following: false
});
var FLY_KEYS = /* @__PURE__ */ new Set([..."wasdqeijkl"]);
/**
* Keyboard flying for the enclosing scene, beside the mouse orbit: W/S forward/back and A/D left/right over the ground,
* Q/E down/up, I/K look up/down and J/L look left/right (the camera stays put, the orbit target swings around it).
* `speed` (m/s), `lookSpeed` (rad/s). Keys typed into inputs, and chords with ⌘/Ctrl/Alt, are ignored.
*/
function KeyboardFly({ speed = 2, lookSpeed = 1.5, enabled = true }) {
	const viewer = useViewer();
	const settings = useRef({
		speed,
		lookSpeed
	});
	settings.current = {
		speed,
		lookSpeed
	};
	useEffect(() => {
		if (!viewer || !enabled) return;
		const held = /* @__PURE__ */ new Set();
		const typing = (event) => event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable]");
		const keydown = (event) => {
			if (typing(event)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) {
				held.clear();
				return;
			}
			const key = event.key.toLowerCase();
			if (FLY_KEYS.has(key)) held.add(key);
		};
		const keyup = (event) => held.delete(event.key.toLowerCase());
		const blur = () => held.clear();
		addEventListener("keydown", keydown);
		addEventListener("keyup", keyup);
		addEventListener("blur", blur);
		const { camera, controls } = viewer;
		const forward = new THREE.Vector3();
		const right = new THREE.Vector3();
		const offset = new THREE.Vector3();
		const move = new THREE.Vector3();
		let last = 0;
		const off = viewer.onFrame(({ now }) => {
			const dt = last ? Math.min(.1, (now - last) / 1e3) : 0;
			last = now;
			if (held.size === 0 || dt === 0) return;
			const step = settings.current.speed * dt;
			const turn = settings.current.lookSpeed * dt;
			forward.subVectors(controls.target, camera.position).setZ(0);
			if (forward.lengthSq() < 1e-12) forward.set(0, 1, 0);
			forward.normalize();
			right.crossVectors(forward, camera.up).normalize();
			move.set(0, 0, 0);
			if (held.has("w")) move.add(forward);
			if (held.has("s")) move.sub(forward);
			if (held.has("d")) move.add(right);
			if (held.has("a")) move.sub(right);
			if (move.lengthSq() > 0) move.normalize().multiplyScalar(step);
			move.addScaledVector(camera.up, ((held.has("e") ? 1 : 0) - (held.has("q") ? 1 : 0)) * step);
			camera.position.add(move);
			controls.target.add(move);
			offset.subVectors(controls.target, camera.position);
			if (held.has("j")) offset.applyAxisAngle(camera.up, turn);
			if (held.has("l")) offset.applyAxisAngle(camera.up, -turn);
			if (held.has("i") || held.has("k")) {
				const pitched = offset.clone().applyAxisAngle(right, (held.has("i") ? 1 : 0) * turn - (held.has("k") ? 1 : 0) * turn);
				if (Math.abs(pitched.clone().normalize().dot(camera.up)) < .985) offset.copy(pitched);
			}
			controls.target.copy(camera.position).add(offset);
			viewer.requestRender();
		});
		return () => {
			off();
			removeEventListener("keydown", keydown);
			removeEventListener("keyup", keyup);
			removeEventListener("blur", blur);
		};
	}, [viewer, enabled]);
	return null;
}
//#endregion
//#region src/three/layers/manager.ts
/** A listed topic that already says its name and type. */
var isTopic = (item) => !!item.name && !!item.type && typeof item.name === "string" && typeof item.type === "string";
var LayerManager = class {
	entries = new Store({ list: [] });
	/** every topic seen (drawn or not), sorted by name */
	topics = new Store({ list: [] });
	/** the 3D view is off: no layer runs (nothing subscribed); the switches keep what to start again */
	paused = new Store({ paused: false });
	/** topic key → switched on, as saved */
	#enabled;
	#persist;
	#prefix;
	#lastSeen = /* @__PURE__ */ new Map();
	forgetMs;
	source;
	constructor({ source, persist = localStore, storagePrefix = "dimos-react.layers", forgetMs = 2e4 }) {
		this.source = source;
		this.#persist = persist;
		this.#prefix = storagePrefix;
		this.forgetMs = forgetMs;
		this.#enabled = persist(`${storagePrefix}.enabled`, {});
		this.#enabled.subscribe(() => {
			for (const entry of this.entries.get().list) {
				const wanted = this.#enabled.get()[entry.topic.key];
				if (wanted !== void 0 && wanted !== entry.enabled) this.#patch(entry.topic.key, { enabled: wanted });
			}
		});
	}
	/** Lists the source's topics now and every `intervalMs` (and on the source's topic events). Returns stop. */
	watch({ filter = "dimos/**", intervalMs = 2e3 } = {}) {
		let live = true;
		let timer;
		const round = async () => {
			try {
				this.setTopics(await this.source.listTopics(filter));
			} catch {}
			if (live) timer = setTimeout(round, intervalMs);
		};
		round();
		const offTopics = this.source.onTopics?.(() => {
			clearTimeout(timer);
			round();
		});
		return () => {
			live = false;
			clearTimeout(timer);
			offTopics?.();
		};
	}
	/** Topics found (`[{ key }]` or `[{ key, name, type }]`): new drawable ones become entries; gone ones are kept for `forgetMs`. */
	setTopics(found) {
		const now = Date.now();
		for (const item of found) {
			const topic = isTopic(item) ? item : parseKey(item.key);
			if (topic) this.#lastSeen.set(topic.key, {
				topic,
				at: now
			});
		}
		for (const [key, seen] of this.#lastSeen) if (now - seen.at > this.forgetMs) this.#lastSeen.delete(key);
		const all = [...this.#lastSeen.values()].map((seen) => seen.topic).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
		const old = this.topics.get().list;
		if (old.length !== all.length || old.some((topic, index) => topic.key !== all[index].key)) this.topics.set({ list: all });
		this.#sync(all);
	}
	#sync(topics) {
		const list = this.entries.get().list;
		const known = new Set(list.map((entry) => entry.topic.key));
		const added = [];
		for (const topic of topics) {
			const type = layerTypeFor(topic.type);
			if (!type || known.has(topic.key)) continue;
			const enabled = this.#enabled.get()[topic.key] ?? type.enabledByDefault?.(topic) ?? true;
			const settings = this.#persist(`${this.#prefix}.${type.id}.${topic.key}`, defaultSettings(type, topic));
			added.push({
				topic,
				type,
				enabled,
				status: {},
				settings
			});
		}
		if (added.length) this.entries.set({ list: [...list, ...added].sort((a, b) => a.topic.name.localeCompare(b.topic.name)) });
	}
	/** Switches a topic's layer on (subscribes) or off (unsubscribes); remembered. */
	setEnabled(key, enabled) {
		this.#enabled.update({ [key]: enabled });
		this.#patch(key, { enabled });
	}
	/** Off: every layer stops; on: the enabled ones start again. */
	setPaused(paused) {
		if (paused !== this.paused.get().paused) this.paused.set({ paused });
	}
	/** Topics of these types being drawn (e.g. to pick a robot pose source). */
	enabledOfType(...types) {
		return this.entries.get().list.filter((entry) => entry.enabled && types.includes(entry.topic.type)).map((entry) => entry.topic);
	}
	/** The drawn layers' data frames (for the TF check). */
	layerFrames() {
		return this.entries.get().list.flatMap((entry) => entry.enabled && entry.status.frame ? [{
			name: entry.topic.name,
			frame: entry.status.frame
		}] : []);
	}
	/** A layer reports info / a problem / its frame (only real changes re-render). */
	setStatus(key, status) {
		const current = this.entries.get().list.find((entry) => entry.topic.key === key)?.status;
		if (!current || Object.keys(status).some((field) => current[field] !== status[field])) this.#patch(key, { status: {
			...current,
			...status
		} });
	}
	/** A layer stopped: its info and problem go with it. */
	clearStatus(key) {
		this.#patch(key, { status: {} });
	}
	#patch(key, patch) {
		const list = this.entries.get().list;
		if (list.some((entry) => entry.topic.key === key)) this.entries.set({ list: list.map((entry) => entry.topic.key === key ? {
			...entry,
			...patch
		} : entry) });
	}
};
//#endregion
//#region src/three/panels.tsx
/** A LayerManager for the data source in effect, watching its topics while mounted. */
function useLayerManager({ persist, storagePrefix, filter, intervalMs } = {}) {
	const source = useDataSource();
	const manager = useMemo(() => new LayerManager({
		source,
		persist,
		storagePrefix
	}), [source, storagePrefix]);
	useEffect(() => manager.watch({
		filter,
		intervalMs
	}), [
		manager,
		filter,
		intervalMs
	]);
	return manager;
}
/** Every layer's "Draw on top" (LayerCommonSettings.onTop): applied in place, the layer keeps running. */
function OnTopSetting({ settings }) {
	const { onTop } = useStore(settings);
	return /* @__PURE__ */ jsx("div", {
		className: "dr-layer-settings-grid",
		children: /* @__PURE__ */ jsx(Field, {
			label: "Draw on top",
			hint: "over the clouds; off: what's in front hides it",
			children: /* @__PURE__ */ jsx(Toggle, {
				value: !!onTop,
				onChange: (on) => settings.update({ onTop: on })
			})
		})
	});
}
function LayerRow({ manager, entry }) {
	const [open, setOpen] = useState(false);
	const Settings = entry.type.Settings;
	const status = entry.status;
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-layer-row", entry.enabled && "dr-layer-row--on", status.problem && "dr-layer-row--problem"),
		"data-key": entry.topic.key,
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "dr-layer-line",
				children: [/* @__PURE__ */ jsx(Toggle, {
					value: entry.enabled,
					size: "sm",
					"aria-label": `Show ${entry.topic.name}`,
					onChange: (enabled) => manager.setEnabled(entry.topic.key, enabled)
				}), /* @__PURE__ */ jsxs("button", {
					type: "button",
					className: "dr-layer-name",
					onClick: () => setOpen(!open),
					title: entry.topic.key,
					"aria-expanded": open,
					children: [
						/* @__PURE__ */ jsx("span", {
							className: "dr-layer-topic",
							children: entry.topic.name
						}),
						/* @__PURE__ */ jsx("span", {
							className: "dr-layer-type",
							children: entry.topic.type.split(".")[1]
						}),
						/* @__PURE__ */ jsx("span", {
							className: cx("dr-layer-chevron", open && "dr-layer-chevron--open"),
							children: /* @__PURE__ */ jsx(Icon, {
								name: "chevron-right",
								size: 14
							})
						})
					]
				})]
			}),
			entry.enabled && (status.problem || status.info) ? /* @__PURE__ */ jsx("div", {
				className: cx("dr-layer-status", status.problem && "dr-layer-status--problem"),
				children: status.problem ?? status.info
			}) : null,
			open ? /* @__PURE__ */ jsxs("div", {
				className: "dr-layer-settings",
				children: [/* @__PURE__ */ jsx(OnTopSetting, { settings: entry.settings }), Settings ? /* @__PURE__ */ jsx(Settings, {
					settings: entry.settings,
					topic: entry.topic
				}) : null]
			}) : null
		]
	});
}
/**
* Every drawable topic, grouped by layer type: a switch (on = subscribed), live info or the problem, and the layer's
* settings behind a disclosure; then the topics nothing draws.
*/
function LayersPanel({ manager, emptyText, className }) {
	const { list } = useStore(manager.entries);
	const { list: topics } = useStore(manager.topics);
	const groups = /* @__PURE__ */ new Map();
	for (const entry of list) groups.set(entry.type.label, [...groups.get(entry.type.label) ?? [], entry]);
	const drawn = new Set(list.map((entry) => entry.topic.key));
	const other = topics.filter((topic) => !drawn.has(topic.key));
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-layers", className),
		children: [
			!list.length ? /* @__PURE__ */ jsx(EmptyState, {
				icon: "layers",
				title: "Waiting for topics…",
				message: emptyText ?? "Start a blueprint (or a replay) and they appear here."
			}) : null,
			[...groups].map(([label, entries]) => /* @__PURE__ */ jsxs("section", {
				className: "dr-layer-group",
				children: [/* @__PURE__ */ jsx("h3", {
					className: "dr-layer-group-title",
					children: label
				}), entries.map((entry) => /* @__PURE__ */ jsx(LayerRow, {
					manager,
					entry
				}, entry.topic.key))]
			}, label)),
			other.length ? /* @__PURE__ */ jsxs("details", {
				className: "dr-layer-group dr-layer-other",
				children: [/* @__PURE__ */ jsx("summary", { children: `${other.length} other topics (not drawn)` }), other.map((topic) => /* @__PURE__ */ jsxs("div", {
					className: "dr-layer-other-topic",
					children: [/* @__PURE__ */ jsx("span", { children: topic.name }), /* @__PURE__ */ jsx("span", {
						className: "dr-layer-type",
						children: topic.type
					})]
				}, topic.key))]
			}) : null
		]
	});
}
function TreeRows({ snapshot, frame, depth, seen, hovered, flagged, onHover, rows }) {
	if (seen.has(frame) || depth > 64) return;
	seen.add(frame);
	const edge = snapshot.edges.find((other) => other.child === frame);
	const stale = snapshot.problems.stale.includes(frame);
	rows.push(/* @__PURE__ */ jsxs("div", {
		className: cx("dr-tf-frame", stale && "dr-tf-frame--stale", flagged.has(frame) && "dr-tf-frame--flagged", hovered === frame && "dr-tf-frame--highlighted"),
		style: { paddingLeft: depth * 14 + 4 },
		"data-frame": frame,
		title: onHover ? "Hover to find it in the 3D view" : void 0,
		onPointerEnter: () => onHover?.(frame),
		onPointerLeave: () => onHover?.(null),
		children: [/* @__PURE__ */ jsx("span", { children: frame }), edge ? /* @__PURE__ */ jsx("span", {
			className: "dr-tf-age",
			children: edge.isStatic ? "static" : `${Math.round(edge.ageMs)} ms`
		}) : null]
	}, frame));
	const children = snapshot.edges.filter((other) => other.parent === frame).map((other) => other.child).sort();
	for (const child of children) TreeRows({
		snapshot,
		frame: child,
		depth: depth + 1,
		seen,
		hovered,
		flagged,
		onHover,
		rows
	});
}
/**
* The TF tree as an indented list (age per edge, stale and flagged frames marked), what's wrong with it, and which
* frame the view is fixed to (`fixedFrame` = the choice, "" = auto; `activeFixedFrame` = the one in use).
*/
function TfPanel({ tf, fixedFrame = "", activeFixedFrame, onFixedFrame, issues = [], robotFrame, robotFound, hovered = null, hoveredPlaced = true, onHover, className }) {
	const [snapshot, setSnapshot] = useState(() => tf.snapshot());
	useEffect(() => {
		const timer = setInterval(() => setSnapshot(tf.snapshot()), 1e3);
		return () => clearInterval(timer);
	}, [tf]);
	useEffect(() => () => onHover?.(null), []);
	const flagged = new Set(issues.flatMap((issue) => issue.frames));
	const tree = useRef(null);
	const scrolled = useRef(false);
	useEffect(() => {
		const first = tree.current?.querySelector(".dr-tf-frame--flagged");
		if (first && !scrolled.current) {
			scrolled.current = true;
			first.scrollIntoView({ block: "nearest" });
		}
	});
	const active = activeFixedFrame ?? (fixedFrame || tf.defaultFixedFrame());
	const rows = [];
	for (const root of snapshot.problems.roots) TreeRows({
		snapshot,
		frame: root,
		depth: 0,
		seen: /* @__PURE__ */ new Set(),
		hovered,
		flagged,
		onHover,
		rows
	});
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-tf-panel", className),
		children: [
			onFixedFrame ? /* @__PURE__ */ jsx(Field, {
				label: "Fixed frame",
				hint: "everything is drawn relative to this frame",
				children: /* @__PURE__ */ jsx(Select, {
					value: fixedFrame,
					options: [["", `auto (${active})`], ...snapshot.frames.map((frame) => [frame, frame])],
					onChange: onFixedFrame
				})
			}) : null,
			robotFrame ? /* @__PURE__ */ jsxs("p", {
				className: "dr-hint",
				children: [`Robot frame: ${robotFrame} `, /* @__PURE__ */ jsx(Badge, {
					tone: robotFound ? "ok" : "warn",
					children: robotFound ? "in TF" : "not in TF yet"
				})]
			}) : null,
			issues.map((issue) => /* @__PURE__ */ jsx(Alert, {
				tone: "warn",
				title: issue.summary,
				"data-frames": issue.frames.join(","),
				children: issue.detail
			}, issue.kind + issue.summary)),
			!snapshot.frames.length ? /* @__PURE__ */ jsx(EmptyState, {
				icon: "info",
				title: "no tf yet"
			}) : null,
			/* @__PURE__ */ jsx("div", {
				className: "dr-tf-tree",
				ref: tree,
				onPointerLeave: () => onHover?.(null),
				children: rows
			}),
			hovered && !hoveredPlaced ? /* @__PURE__ */ jsx("p", {
				className: "dr-hint",
				children: `${hovered} isn't connected to ${active}: it can't be shown in the view`
			}) : null
		]
	});
}
/**
* A quiet one-line note over the view's corner when the TF tree is broken; nothing when it's fine. `onOpen`: e.g.
* open the TF panel, where the frames involved are marked.
*/
function TfFootnote({ issues, onOpen, className }) {
	if (!issues?.length) return null;
	const more = issues.length > 1 ? ` · +${issues.length - 1} more` : "";
	return /* @__PURE__ */ jsxs("button", {
		type: "button",
		className: cx("dr-tf-footnote", className),
		"data-testid": "tf-footnote",
		title: issues.map((issue) => `${issue.summary}: ${issue.detail}`).join("\n"),
		onClick: onOpen,
		children: [/* @__PURE__ */ jsx(Icon, {
			name: "warn",
			size: 13
		}), /* @__PURE__ */ jsx("span", { children: `TF: ${issues[0].summary}${more}` })]
	});
}
//#endregion
//#region src/map2d/math.ts
var MIN_METERS_PER_PIXEL = .002;
function worldToScreen(view, width, height, x, y) {
	return [width / 2 + (x - view.centerX) / view.metersPerPixel, height / 2 - (y - view.centerY) / view.metersPerPixel];
}
function screenToWorld(view, width, height, sx, sy) {
	return [view.centerX + (sx - width / 2) * view.metersPerPixel, view.centerY - (sy - height / 2) * view.metersPerPixel];
}
/** Zooms by `factor` (>1 = in) keeping the world point under (sx, sy) where it is. */
function zoomAt(view, width, height, sx, sy, factor) {
	const metersPerPixel = Math.min(2, Math.max(MIN_METERS_PER_PIXEL, view.metersPerPixel / factor));
	const [x, y] = screenToWorld(view, width, height, sx, sy);
	return {
		centerX: x - (sx - width / 2) * metersPerPixel,
		centerY: y + (sy - height / 2) * metersPerPixel,
		metersPerPixel
	};
}
/** Moves the view so the content follows a drag of (dx, dy) CSS pixels. */
function pan(view, dx, dy) {
	return {
		...view,
		centerX: view.centerX - dx * view.metersPerPixel,
		centerY: view.centerY + dy * view.metersPerPixel
	};
}
/** the TF frame the map follows unless the viewer picks another */
var DEFAULT_FOLLOW_FRAME = "base_link";
/** A wheel event as a zoom (a mouse wheel, a trackpad pinch, a vertical scroll) or a pan (sideways, or with shift). */
function wheelGesture(event) {
	if (event.ctrlKey) return "zoom";
	return event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "pan" : "zoom";
}
/**
* Whether the view follows a TF frame. Following is the default (and is never remembered: a reload follows again);
* any pan (drag, sideways wheel, a pinch whose middle moves) suspends it, a zoom alone keeps it (about the frame), and
* re-centering resumes it. A frame not in the TF tree yet ("waiting") leaves the view where it is.
*/
var MapFollow = class {
	frame;
	following = true;
	#pinchDrift = 0;
	constructor(frame = DEFAULT_FOLLOW_FRAME) {
		this.frame = frame;
	}
	/** a drag, a wheel pan or a fit: true when that stopped following */
	pan() {
		const was = this.following;
		this.following = false;
		return was;
	}
	/** true when that resumed following */
	recenter() {
		const was = this.following;
		this.following = true;
		return !was;
	}
	pinchStart() {
		this.#pinchDrift = 0;
	}
	/** a pinch step whose middle moved (dx, dy): false while it's still only a zoom (following and within the slop) */
	pinchPans(dx, dy) {
		if (!this.following) return true;
		this.#pinchDrift += Math.hypot(dx, dy);
		if (this.#pinchDrift > 12) {
			this.following = false;
			return true;
		}
		return false;
	}
	/** the view, centered on the target while following; unchanged without a target (waiting for its frame) */
	view(view, target) {
		return this.following && target ? {
			...view,
			centerX: target.x,
			centerY: target.y
		} : view;
	}
	/** where a zoom at (sx, sy) is anchored: the target while following one (so it stays centered) */
	zoomAnchor(view, width, height, sx, sy, target) {
		return this.following && target ? worldToScreen(view, width, height, target.x, target.y) : [sx, sy];
	}
};
/** The frames to offer for following: the TF tree's, with the chosen one first marked waiting when it's not there yet. */
function followFrameOptions(frames, chosen) {
	const known = frames.map((frame) => ({
		frame,
		waiting: false
	}));
	return frames.includes(chosen) ? known : [{
		frame: chosen,
		waiting: true
	}, ...known];
}
/** A view that's usable: finite and within the zoom limits. */
var isValidView = (view) => {
	if (!view) return false;
	const { centerX, centerY, metersPerPixel } = view;
	return [
		centerX,
		centerY,
		metersPerPixel
	].every(Number.isFinite) && metersPerPixel >= .002 && metersPerPixel <= 2;
};
/** The view that shows a world box (minX, minY, maxX, maxY) with a margin; null when the box isn't finite. */
function fitView(box, width, height) {
	const [minX, minY, maxX, maxY] = box;
	if (!box.every(Number.isFinite) || maxX < minX || maxY < minY) return null;
	const spanX = Math.max(4, maxX - minX), spanY = Math.max(4, maxY - minY);
	const metersPerPixel = Math.min(2, Math.max(MIN_METERS_PER_PIXEL, Math.max(spanX / Math.max(1, width), spanY / Math.max(1, height)) * 1.1));
	return {
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2,
		metersPerPixel
	};
}
/** A 4×4 column-major matrix (THREE.Matrix4.elements) seen from above: its position on the floor and its heading. */
function floorPose(elements) {
	return {
		x: elements[12],
		y: elements[13],
		yaw: Math.atan2(elements[1], elements[0])
	};
}
/** The scale bar's length: the largest 1/2/5 × 10^n meters that fits in `maxMeters`. */
function niceLength(maxMeters) {
	if (!(maxMeters > 0)) return 1;
	const power = 10 ** Math.floor(Math.log10(maxMeters));
	for (const step of [
		5,
		2,
		1
	]) if (step * power <= maxMeters) return step * power;
	return power;
}
var formatMeters = (meters) => meters >= 1e3 ? `${meters / 1e3} km` : meters >= 1 ? `${meters} m` : `${Math.round(meters * 100)} cm`;
/** a costmap's lethal value (dimos marks obstacles 100) */
var LETHAL = 100;
var mix = (a, b, t) => [
	0,
	1,
	2,
	3
].map((index) => Math.round(a[index] + (b[index] - a[index]) * t));
/** cell value (-1..100, as the byte it arrives as) → rgba */
function gridLut(palette) {
	const lut = /* @__PURE__ */ new Uint8ClampedArray(1024);
	for (let byte = 0; byte < 256; byte++) {
		const value = byte > 127 ? byte - 256 : byte;
		const rgba = value < 0 ? palette.unknown : value === 0 ? palette.free : value >= LETHAL ? palette.lethal : mix(palette.low, palette.high, Math.sqrt(value / LETHAL));
		lut.set(rgba, byte * 4);
	}
	return lut;
}
/** An OccupancyGrid's cells as RGBA, row 0 first (row 0 is the grid's lowest y). Reuses `out` when it's the right size. */
function gridPixels(data, width, height, lut, out) {
	const pixels = out && out.length === width * height * 4 ? out : new Uint8ClampedArray(width * height * 4);
	const bytes = data instanceof Int8Array ? new Uint8Array(data.buffer, data.byteOffset, width * height) : null;
	for (let index = 0; index < width * height; index++) {
		const at = (bytes ? bytes[index] : data[index] & 255) * 4;
		const to = index * 4;
		pixels[to] = lut[at];
		pixels[to + 1] = lut[at + 1];
		pixels[to + 2] = lut[at + 2];
		pixels[to + 3] = lut[at + 3];
	}
	return pixels;
}
/** the projected image's longest side, at most */
var MAX_CLOUD_PIXELS = 1600;
/** a heat ramp (inferno's upper part: no near-black, so the floor still shows on a dark background) */
var HEAT_STOPS = [
	[
		60,
		18,
		110,
		255
	],
	[
		120,
		28,
		109,
		255
	],
	[
		187,
		55,
		84,
		255
	],
	[
		237,
		105,
		37,
		255
	],
	[
		251,
		180,
		26,
		255
	],
	[
		252,
		255,
		164,
		255
	]
];
/** 256 heat colors, cold (0) to hot (255), as RGBA bytes. */
function heatLut(stops = HEAT_STOPS) {
	const lut = /* @__PURE__ */ new Uint8ClampedArray(1024);
	for (let index = 0; index < 256; index++) {
		const at = index / 255 * (stops.length - 1), below = Math.min(stops.length - 2, Math.floor(at));
		lut.set(mix(stops[below], stops[below + 1], at - below), index * 4);
	}
	return lut;
}
/**
* A point cloud seen from above, as a heatmap: each point placed by `elements` (cloud frame → fixed frame, column-major
* 4×4) and binned into `cell`-meter pixels (coarser when the cloud is too big for MAX_CLOUD_PIXELS); a pixel takes
* the heat of its highest point between the floor (cold) and the tallest (hot), so walls stand out from the floor.
*/
function projectCloud(positions, elements, lut, cell = .05) {
	const count = Math.floor(positions.length / 3);
	if (!count) return null;
	const e = elements;
	const xs = new Float32Array(count), ys = new Float32Array(count), zs = new Float32Array(count);
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	let kept = 0;
	for (let index = 0; index < count; index++) {
		const px = positions[index * 3], py = positions[index * 3 + 1], pz = positions[index * 3 + 2];
		if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;
		const x = e[0] * px + e[4] * py + e[8] * pz + e[12];
		const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
		const z = e[2] * px + e[6] * py + e[10] * pz + e[14];
		xs[kept] = x;
		ys[kept] = y;
		zs[kept] = z;
		kept++;
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
	}
	if (!kept) return null;
	cell = Math.max(cell, (maxX - minX) / MAX_CLOUD_PIXELS, (maxY - minY) / MAX_CLOUD_PIXELS);
	const width = Math.floor((maxX - minX) / cell) + 1, height = Math.floor((maxY - minY) / cell) + 1;
	const sorted = zs.slice(0, kept).sort();
	const zLow = sorted[Math.floor(kept * .02)], zHigh = sorted[Math.min(kept - 1, Math.floor(kept * .98))];
	const top = new Float32Array(width * height).fill(-Infinity);
	for (let index = 0; index < kept; index++) {
		const column = Math.floor((xs[index] - minX) / cell);
		const at = Math.floor((ys[index] - minY) / cell) * width + column;
		if (zs[index] > top[at]) top[at] = zs[index];
	}
	const pixels = new Uint8ClampedArray(width * height * 4);
	const span = Math.max(.001, zHigh - zLow);
	for (let at = 0; at < width * height; at++) {
		if (top[at] === -Infinity) continue;
		const heat = Math.round(255 * Math.min(1, Math.max(0, (top[at] - zLow) / span))) * 4;
		pixels[at * 4] = lut[heat];
		pixels[at * 4 + 1] = lut[heat + 1];
		pixels[at * 4 + 2] = lut[heat + 2];
		pixels[at * 4 + 3] = lut[heat + 3];
	}
	return {
		pixels,
		width,
		height,
		originX: minX,
		originY: minY,
		cell
	};
}
/** Where the robot has been: a polyline on the floor, broken (NaN) at a jump, at most `capacity` points. */
var Trail = class {
	minStep;
	jump;
	capacity;
	/** x, y pairs; a NaN pair breaks the line */
	points = [];
	#last = null;
	constructor(minStep = .05, jump = 2.5, capacity = 2e4) {
		this.minStep = minStep;
		this.jump = jump;
		this.capacity = capacity;
	}
	/** Adds a pose; true when the trail changed. */
	push(x, y) {
		if (this.#last) {
			const step = Math.hypot(x - this.#last[0], y - this.#last[1]);
			if (step < this.minStep) return false;
			if (step > this.jump) this.points.push(NaN, NaN);
		}
		this.points.push(x, y);
		this.#last = [x, y];
		if (this.points.length > this.capacity * 2) this.points.splice(0, Math.floor(this.capacity * .2) * 2);
		return true;
	}
	clear() {
		this.points = [];
		this.#last = null;
	}
};
var isGridTopic = (topic) => topic.type === "nav_msgs.OccupancyGrid";
var isCloudTopic = (topic) => topic.type === "sensor_msgs.PointCloud2";
/** an accumulated cloud map (the 3D view's global map) first, other map clouds, single scans, then occupancy grids */
var rank = (topic) => isCloudTopic(topic) ? /^\/global_map$/.test(topic.name) ? 0 : /map|global|voxel/i.test(topic.name) ? 1 : 2 : 10 + (/^\/map$/.test(topic.name) ? 0 : /global/.test(topic.name) ? 1 : /map/.test(topic.name) ? 2 : 3);
/** The topics the panel can draw as its base, best first: point clouds (as a top-down heatmap), then occupancy grids. */
function mapCandidates(topics) {
	return topics.filter((topic) => isGridTopic(topic) || isCloudTopic(topic)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
/** The picked topic when it's on the bus, else the best candidate ("" picks automatically). */
function chooseMapTopic(topics, picked) {
	const candidates = mapCandidates(topics);
	return candidates.find((topic) => topic.key === picked) ?? candidates[0] ?? null;
}
/** The occupancy grids (costmaps) the panel can lay over its base, best first. */
var overlayCandidates = (topics) => mapCandidates(topics).filter(isGridTopic);
/** The overlay grid: the picked one when it's on the bus and isn't the base; "" (the default) is none. */
function chooseOverlay(topics, picked, base) {
	return picked && picked !== base?.key ? overlayCandidates(topics).find((topic) => topic.key === picked) ?? null : null;
}
//#endregion
//#region src/map2d/renderer.ts
/** Each topic's last data for a map context (`map.retained`, a Map): a reopened map shows it at once. */
function retainedFor(map, key) {
	let entry = map.retained.get(key);
	if (!entry) map.retained.set(key, entry = {});
	return entry;
}
var css = ([r, g, b, a], alpha = 1) => `rgba(${r}, ${g}, ${b}, ${a / 255 * alpha})`;
var blend = (a, b, t) => [
	0,
	1,
	2,
	3
].map((index) => Math.round(a[index] + (b[index] - a[index]) * t));
/** A theme token (any CSS color, color-mix included) as rgba bytes, read back off a 1×1 canvas. */
function token(name) {
	const probe = document.createElement("span");
	probe.style.color = `var(${name})`;
	document.body.appendChild(probe);
	const color = getComputedStyle(probe).color;
	probe.remove();
	const pixel = document.createElement("canvas");
	pixel.width = pixel.height = 1;
	const context = pixel.getContext("2d", { willReadFrequently: true });
	context.fillStyle = color;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
	return [
		r,
		g,
		b,
		a
	];
}
function themePalette() {
	const background = token("--scene-bg, var(--bg)");
	const fg = token("--fg"), muted = token("--muted-fg"), primary = token("--primary");
	const opaque = (color) => [
		color[0],
		color[1],
		color[2],
		255
	];
	const base = opaque(background);
	const clear = [
		0,
		0,
		0,
		0
	];
	return {
		background: base,
		fg,
		muted,
		primary,
		robot: token("--warn"),
		path: token("--ok"),
		axisX: css(token("--axis-x")),
		axisY: css(token("--axis-y")),
		gridLut: gridLut({
			free: blend(base, opaque(fg), .1),
			low: blend(base, opaque(primary), .3),
			high: blend(base, opaque(primary), .8),
			lethal: opaque(fg),
			unknown: clear
		}),
		overlayLut: gridLut({
			free: clear,
			low: [...primary.slice(0, 3), 70],
			high: [...primary.slice(0, 3), 190],
			lethal: [...primary.slice(0, 3), 235],
			unknown: clear
		}),
		heatLut: heatLut()
	};
}
/** How far the robot moves (m) or turns (rad) before the map is redrawn for it. */
var POSE_EPSILON = .005;
var YAW_EPSILON = .005;
/** the default zoom before there's anything to fit */
var DEFAULT_METERS_PER_PIXEL = .05;
/** One topic the map draws (the base, or the costmap over it): its subscription, its latest data as an image. */
var MapSource = class {
	map;
	topic;
	/** the colors to draw it in (read at each rebuild: the theme can change) */
	lut;
	changed;
	grid = null;
	gridImage = null;
	#gridPixels;
	/** the grid's (0,0) corner in the fixed frame, as last drawn */
	gridPose = null;
	cloud = null;
	cloudImage = null;
	#cloudFrame = null;
	/** the last cloud, kept to recolor it on a theme change */
	#cloudPositions = null;
	#cloudMatrix = null;
	info = "";
	problem = "";
	#stop = [];
	constructor(map, topic, lut, changed) {
		this.map = map;
		this.topic = topic;
		this.lut = lut;
		this.changed = changed;
		const connection = map.source;
		const kept = retainedFor(map, topic.key);
		this.problem = `waiting for ${topic.name}`;
		if (kept.grid) {
			this.grid = kept.grid;
			this.info = kept.gridInfo ?? "";
			this.problem = "";
		}
		if (kept.cloudFrame !== void 0) this.#cloudFrame = kept.cloudFrame;
		if (kept.cloudPositions && kept.cloudMatrix) {
			this.#cloudPositions = kept.cloudPositions;
			this.#cloudMatrix = kept.cloudMatrix;
			this.info = kept.cloudInfo ?? "";
			this.problem = "";
		}
		this.rebuild();
		if (isGridTopic(topic)) {
			this.#stop.push(connection.subscribe(topic.key, {
				delivery: "latest",
				maxHz: 2
			}, (message) => {
				let grid;
				try {
					grid = message.value ?? decode(topic.type, message.bytes);
				} catch (error) {
					this.#status(this.info, `cannot decode ${topic.name}: ${error}`);
					return;
				}
				const { width, height, resolution, origin } = grid.info ?? {};
				if (!width || !height || !(resolution > 0) || !grid.data || grid.data.length < width * height) {
					this.#status(this.info, `${topic.name}: empty or truncated grid`);
					return;
				}
				this.grid = kept.grid = {
					width,
					height,
					resolution,
					origin,
					data: grid.data,
					frame: grid.header?.frame_id ?? ""
				};
				this.gridPose = null;
				this.rebuild();
				kept.gridInfo = `${width}×${height} @ ${resolution.toFixed(2)} m`;
				this.#status(kept.gridInfo, "");
			}));
			return;
		}
		let frameStop = connection.subscribe(topic.key, {
			delivery: "latest",
			maxHz: 1
		}, (message) => {
			const value = message.value;
			this.#cloudFrame = kept.cloudFrame = (value ? value.frame ?? value.header?.frame_id : headerFrameId(topic.type, message.bytes)) ?? "";
			frameStop?.();
			frameStop = null;
		});
		this.#stop.push(() => frameStop?.());
		this.#stop.push(connection.subscribe(topic.key, {
			delivery: "latest",
			maxHz: 1,
			encoding: "dimos_lcm_pointcloud2"
		}, (message) => {
			const positions = (message.decoded ?? message.value)?.positions;
			if (!positions || this.#cloudFrame === null) return;
			const placed = map.tf.lookup(this.#cloudFrame, map.fixedFrame());
			if (!placed) {
				this.#status(this.info, `no TF from "${this.#cloudFrame}" to "${map.fixedFrame()}"`);
				return;
			}
			this.#cloudPositions = kept.cloudPositions = positions;
			this.#cloudMatrix = kept.cloudMatrix = placed.elements.slice();
			this.rebuild();
			kept.cloudInfo = `${Math.round(positions.length / 3).toLocaleString()} pts`;
			this.#status(kept.cloudInfo, "");
		}));
	}
	dispose() {
		this.#stop.forEach((stop) => stop());
		this.#stop = [];
	}
	#status(info, problem) {
		this.info = info;
		this.problem = problem;
		this.changed();
	}
	/** the image from the latest data in the current colors */
	rebuild() {
		if (this.grid) {
			this.#gridPixels = gridPixels(this.grid.data, this.grid.width, this.grid.height, this.lut(), this.#gridPixels);
			this.gridImage = toCanvas(this.#gridPixels, this.grid.width, this.grid.height, this.gridImage);
		}
		if (this.#cloudPositions && this.#cloudMatrix) {
			this.cloud = projectCloud(this.#cloudPositions, this.#cloudMatrix, this.lut());
			this.cloudImage = this.cloud ? toCanvas(this.cloud.pixels, this.cloud.width, this.cloud.height, this.cloudImage) : null;
		}
	}
	/** every 3D frame: the grid's TF placement; true when it moved */
	place(fixedFrame) {
		if (!this.grid) return false;
		const placed = this.map.tf.lookup(this.grid.frame, fixedFrame);
		if (!placed) {
			const had = !!this.gridPose;
			this.gridPose = null;
			if (!this.problem) this.#status(this.info, `no TF from "${this.grid.frame}" to "${fixedFrame}"`);
			return had;
		}
		const pose = floorPose(placed.clone().multiply(poseMatrix(this.grid.origin)).elements);
		const before = this.gridPose;
		if (!before || Math.abs(before.x - pose.x) > 1e-4 || Math.abs(before.y - pose.y) > 1e-4 || Math.abs(before.yaw - pose.yaw) > 1e-5) {
			this.gridPose = pose;
			if (this.problem.startsWith("no TF")) this.#status(this.info, "");
			return true;
		}
		return false;
	}
	/** the drawn data's box in the fixed frame, or null */
	bounds() {
		if (this.grid && this.gridPose) {
			const { width, height, resolution } = this.grid, { x, y, yaw } = this.gridPose;
			const cos = Math.cos(yaw), sin = Math.sin(yaw);
			const corners = [
				[0, 0],
				[width, 0],
				[0, height],
				[width, height]
			].map(([u, v]) => [x + (u * cos - v * sin) * resolution, y + (u * sin + v * cos) * resolution]);
			return [
				Math.min(...corners.map((c) => c[0])),
				Math.min(...corners.map((c) => c[1])),
				Math.max(...corners.map((c) => c[0])),
				Math.max(...corners.map((c) => c[1]))
			];
		}
		if (this.cloud) {
			const { originX, originY, width, height, cell } = this.cloud;
			return [
				originX,
				originY,
				originX + width * cell,
				originY + height * cell
			];
		}
		return null;
	}
	/** draws itself in world coordinates (the context already maps meters to the screen) */
	draw(context) {
		if (this.grid && this.gridImage && this.gridPose) {
			context.translate(this.gridPose.x, this.gridPose.y);
			context.rotate(this.gridPose.yaw);
			context.scale(this.grid.resolution, this.grid.resolution);
			context.drawImage(this.gridImage, 0, 0);
		} else if (this.cloud && this.cloudImage) {
			context.translate(this.cloud.originX, this.cloud.originY);
			context.scale(this.cloud.cell, this.cloud.cell);
			context.drawImage(this.cloudImage, 0, 0);
		}
	}
};
/** Draws the map onto its canvas (no React): subscriptions, view, interaction. */
var Map2DRenderer = class {
	map;
	canvas;
	events;
	#view;
	#fitted;
	#follow;
	/** where the followed frame is on the floor, or null while it isn't in the TF tree */
	#target = null;
	#palette = themePalette();
	#base = null;
	#overlay = null;
	#robot = null;
	#trail = new Trail();
	#fixedFrame = "";
	#frameRequest = 0;
	/** the pointers down on the canvas (by pointerId), where each was last */
	#pointers = /* @__PURE__ */ new Map();
	#dragged = false;
	#dispose = [];
	/** a nav_msgs.Path drawn over the map: its poses (x, y) in `frame` */
	#path = null;
	#stopPath = null;
	constructor(map, canvas, view, followFrame, events) {
		this.map = map;
		this.canvas = canvas;
		this.events = events;
		this.#view = isValidView(view) ? view : {
			centerX: 0,
			centerY: 0,
			metersPerPixel: DEFAULT_METERS_PER_PIXEL
		};
		this.#fitted = isValidView(view);
		this.#follow = new MapFollow(followFrame);
		let loop = 0;
		const tick = () => {
			this.#eachFrame();
			loop = requestAnimationFrame(tick);
		};
		loop = requestAnimationFrame(tick);
		this.#dispose.push(() => cancelAnimationFrame(loop));
		const theme = () => {
			this.#palette = themePalette();
			this.#base?.rebuild();
			this.#overlay?.rebuild();
			this.requestDraw();
		};
		addEventListener("dimos-react-theme", theme);
		this.#dispose.push(() => removeEventListener("dimos-react-theme", theme));
		const resize = new ResizeObserver(() => this.requestDraw());
		resize.observe(canvas);
		this.#dispose.push(() => resize.disconnect());
		const redraw = () => this.requestDraw();
		addEventListener("resize", redraw);
		this.#dispose.push(() => removeEventListener("resize", redraw));
		this.#listen();
		this.#report();
		this.#target = this.#lookupTarget();
		this.#reportFollow();
		this.requestDraw();
	}
	/** Draws a nav_msgs.Path topic over the map (null: none). */
	setPath(topicKey) {
		this.#stopPath?.();
		this.#stopPath = null;
		this.#path = null;
		if (topicKey) {
			const off = this.map.source.subscribe(topicKey, {
				delivery: "latest",
				maxHz: 5
			}, (message) => {
				let path;
				try {
					path = message.value ?? decode("nav_msgs.Path", message.bytes);
				} catch {
					return;
				}
				const points = (path.poses ?? []).map((pose) => [pose.pose?.position?.x ?? 0, pose.pose?.position?.y ?? 0]);
				this.#path = {
					frame: path.header?.frame_id ?? "",
					points
				};
				this.requestDraw();
			});
			this.#stopPath = () => off();
		}
		this.requestDraw();
	}
	dispose() {
		this.#stopPath?.();
		cancelAnimationFrame(this.#frameRequest);
		this.#base?.dispose();
		this.#overlay?.dispose();
		this.#dispose.forEach((stop) => stop());
	}
	/** follows another TF frame (and resumes following: picking one means "show me that") */
	setFollowFrame(frame) {
		if (frame !== this.#follow.frame) {
			this.#follow.frame = frame;
			this.#target = this.#lookupTarget();
			this.recenter();
		}
	}
	/** resumes following and centers on the frame now (the zoom stays) */
	recenter() {
		this.#follow.recenter();
		this.#setView(this.#follow.view(this.#view, this.#target));
		this.#reportFollow();
	}
	#reportFollow() {
		this.events.onFollow({
			following: this.#follow.following,
			waiting: !this.#target
		});
	}
	#lookupTarget() {
		const placed = this.map.tf.lookup(this.#follow.frame, this.map.fixedFrame());
		return placed && this.map.tf.has(this.#follow.frame) ? floorPose(placed.elements) : null;
	}
	/** the base map and the costmap over it (null: none); a source that didn't change keeps its data */
	setTopics(base, overlay) {
		const changed = () => {
			this.#report();
			this.requestDraw();
		};
		if (base?.key !== this.#base?.topic.key) {
			this.#base?.dispose();
			this.#base = base ? new MapSource(this.map, base, () => isGridTopic(base) ? this.#palette.gridLut : this.#palette.heatLut, changed) : null;
		}
		if (overlay?.key !== this.#overlay?.topic.key) {
			this.#overlay?.dispose();
			this.#overlay = overlay ? new MapSource(this.map, overlay, () => this.#palette.overlayLut, changed) : null;
		}
		changed();
	}
	#report() {
		const base = this.#base, overlay = this.#overlay;
		const info = [base?.info, overlay?.info && `+ ${overlay.topic.name} ${overlay.info}`].filter(Boolean).join(" · ");
		const problem = !base ? "no point cloud or occupancy grid on the bus" : base.problem || overlay?.problem || "";
		this.events.onStatus({
			info,
			problem
		});
	}
	/** every 3D frame: the robot's pose, the grids' TF placement, the fixed frame; a redraw only when one changed */
	#eachFrame() {
		const fixedFrame = this.map.fixedFrame();
		if (fixedFrame !== this.#fixedFrame) {
			this.#fixedFrame = fixedFrame;
			this.#trail.clear();
			this.requestDraw();
		}
		const matrix = this.map.tf.lookup(this.map.robotFrame(), fixedFrame);
		const robot = matrix ? floorPose(matrix.elements) : null;
		const old = this.#robot;
		if (!robot !== !old || robot && old && (Math.abs(robot.x - old.x) > POSE_EPSILON || Math.abs(robot.y - old.y) > POSE_EPSILON || Math.abs(robot.yaw - old.yaw) > YAW_EPSILON)) {
			this.#robot = robot;
			if (robot) {
				this.#trail.push(robot.x, robot.y);
				if (!this.#fitted && !this.#bounds()) this.#view = {
					...this.#view,
					centerX: robot.x,
					centerY: robot.y
				};
			}
			this.requestDraw();
		}
		const target = this.#lookupTarget();
		const before = this.#target;
		if (!target !== !before || target && before && Math.hypot(target.x - before.x, target.y - before.y) > POSE_EPSILON) {
			this.#target = target;
			if (!target !== !before) this.#reportFollow();
			if (this.#follow.following && target) {
				this.#view = this.#follow.view(this.#view, target);
				this.requestDraw();
			}
		}
		const movedBase = this.#base?.place(fixedFrame) ?? false;
		const movedOverlay = this.#overlay?.place(fixedFrame) ?? false;
		if (movedBase || movedOverlay) this.requestDraw();
	}
	/** the box around everything drawn, in the fixed frame, or null */
	#bounds() {
		const boxes = [this.#base?.bounds(), this.#overlay?.bounds()].filter((box) => !!box);
		if (!boxes.length) return null;
		return [
			Math.min(...boxes.map((b) => b[0])),
			Math.min(...boxes.map((b) => b[1])),
			Math.max(...boxes.map((b) => b[2])),
			Math.max(...boxes.map((b) => b[3]))
		];
	}
	/** Shows all of the map (and stops following); with nothing to fit, centers on the robot. A no-op when it can't tell. */
	fit() {
		const box = this.canvas.getBoundingClientRect();
		const bounds = this.#bounds();
		const fitted = bounds && box.width >= 2 && box.height >= 2 ? fitView(bounds, box.width, box.height) : null;
		if (fitted) {
			this.#pan();
			this.#setView(fitted);
		} else if (this.#robot) this.#setView({
			centerX: this.#robot.x,
			centerY: this.#robot.y,
			metersPerPixel: DEFAULT_METERS_PER_PIXEL
		});
	}
	#setView(view) {
		if (!isValidView(view)) return;
		this.#view = view;
		this.#fitted = true;
		this.requestDraw();
		this.#saveView();
	}
	#saveTimer = 0;
	#saveView() {
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => this.events.onView(this.#view), 400);
	}
	requestDraw() {
		if (!this.#frameRequest) this.#frameRequest = requestAnimationFrame(() => {
			this.#frameRequest = 0;
			this.#draw();
		});
	}
	#listen() {
		const canvas = this.canvas;
		const wheel = (event) => {
			event.preventDefault();
			const box = canvas.getBoundingClientRect();
			const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
			if (wheelGesture(event) === "pan") {
				const [dx, dy] = event.shiftKey && !event.deltaX ? [event.deltaY, 0] : [event.deltaX, event.deltaY];
				this.#pan();
				this.#setView(pan(this.#view, -dx * lines, -dy * lines));
				return;
			}
			this.#zoom(Math.exp(-event.deltaY * lines * .0015), event.clientX - box.left, event.clientY - box.top);
		};
		const down = (event) => {
			canvas.setPointerCapture(event.pointerId);
			this.#pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			this.#dragged = false;
			if (this.#pointers.size === 2) this.#follow.pinchStart();
		};
		const move = (event) => {
			const before = this.#pointers.get(event.pointerId);
			if (!before) return;
			const box = canvas.getBoundingClientRect();
			const others = [...this.#pointers.entries()].filter(([id]) => id !== event.pointerId).map(([, point]) => point);
			if (others.length) {
				const other = others[0];
				const spreadBefore = Math.hypot(before.x - other.x, before.y - other.y), spreadAfter = Math.hypot(event.clientX - other.x, event.clientY - other.y);
				const middleDx = (event.clientX - before.x) / 2, middleDy = (event.clientY - before.y) / 2;
				const wasFollowing = this.#follow.following;
				const pans = this.#follow.pinchPans(middleDx, middleDy);
				if (wasFollowing && !this.#follow.following) this.#reportFollow();
				let view = pans ? pan(this.#view, middleDx, middleDy) : this.#view;
				if (spreadBefore > 10) {
					const [anchorX, anchorY] = this.#follow.zoomAnchor(view, box.width, box.height, (event.clientX + other.x) / 2 - box.left, (event.clientY + other.y) / 2 - box.top, this.#target);
					view = zoomAt(view, box.width, box.height, anchorX, anchorY, spreadAfter / spreadBefore);
				}
				this.#setView(view);
			} else {
				const dx = event.clientX - before.x, dy = event.clientY - before.y;
				if (!this.#dragged && Math.hypot(dx, dy) < 3) return;
				this.#dragged = true;
				this.#pan();
				this.#setView(pan(this.#view, dx, dy));
			}
			this.#pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
		};
		const up = (event) => {
			const tap = this.#pointers.size === 1 && !this.#dragged && event.type === "pointerup";
			this.#pointers.delete(event.pointerId);
			if (tap && this.events.onPick) {
				const box = canvas.getBoundingClientRect();
				const [x, y] = screenToWorld(this.#view, box.width, box.height, event.clientX - box.left, event.clientY - box.top);
				this.events.onPick({
					x,
					y,
					frame: this.map.fixedFrame(),
					event
				});
			}
		};
		const doubleClick = () => this.recenter();
		canvas.addEventListener("wheel", wheel, { passive: false });
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		canvas.addEventListener("dblclick", doubleClick);
		this.#dispose.push(() => {
			canvas.removeEventListener("wheel", wheel);
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
			canvas.removeEventListener("dblclick", doubleClick);
		});
	}
	/** the viewer moved the map: stop following */
	#pan() {
		if (this.#follow.pan()) this.#reportFollow();
	}
	/** zooms about a point; following, about the followed frame (so it stays centered) */
	#zoom(factor, sx, sy) {
		const box = this.canvas.getBoundingClientRect();
		const [anchorX, anchorY] = this.#follow.zoomAnchor(this.#view, box.width, box.height, sx, sy, this.#target);
		this.#setView(zoomAt(this.#view, box.width, box.height, anchorX, anchorY, factor));
	}
	#draw() {
		const canvas = this.canvas;
		const box = canvas.getBoundingClientRect();
		const width = box.width, height = box.height;
		if (width < 2 || height < 2) return;
		const ratio = globalThis.devicePixelRatio || 1;
		const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
		if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
			canvas.width = pixelWidth;
			canvas.height = pixelHeight;
		}
		const bounds = this.#fitted ? null : this.#bounds();
		const fitted = bounds && fitView(bounds, width, height);
		if (fitted) {
			this.#view = this.#follow.following && this.#target ? this.#follow.view(fitted, this.#target) : fitted;
			this.#fitted = true;
		}
		const context = canvas.getContext("2d");
		const palette = this.#palette;
		const view = this.#view;
		const scale = 1 / view.metersPerPixel;
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.fillStyle = css(palette.background);
		context.fillRect(0, 0, pixelWidth, pixelHeight);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		const toScreen = (x, y) => worldToScreen(view, width, height, x, y);
		const step = niceLength(80 * view.metersPerPixel);
		context.strokeStyle = css(palette.fg, .06);
		context.lineWidth = 1;
		context.beginPath();
		const [left, top] = [view.centerX - width / 2 * view.metersPerPixel, view.centerY + height / 2 * view.metersPerPixel];
		for (let x = Math.ceil(left / step) * step; x < left + width * view.metersPerPixel; x += step) {
			const sx = Math.round(toScreen(x, 0)[0]) + .5;
			context.moveTo(sx, 0);
			context.lineTo(sx, height);
		}
		for (let y = Math.floor(top / step) * step; y > top - height * view.metersPerPixel; y -= step) {
			const sy = Math.round(toScreen(0, y)[1]) + .5;
			context.moveTo(0, sy);
			context.lineTo(width, sy);
		}
		context.stroke();
		context.imageSmoothingEnabled = false;
		for (const [source, alpha] of [[this.#base, 1], [this.#overlay, .85]]) if (source) {
			context.setTransform(ratio * scale, 0, 0, -ratio * scale, ratio * (width / 2 - view.centerX * scale), ratio * (height / 2 + view.centerY * scale));
			context.globalAlpha = alpha;
			source.draw(context);
		}
		context.globalAlpha = 1;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		const axis = Math.max(24, Math.min(60, step * scale));
		const [ox, oy] = toScreen(0, 0);
		if (ox > -axis && ox < width + axis && oy > -axis && oy < height + axis) drawAxes(context, palette, ox, oy, axis, true);
		const trail = this.#trail.points;
		if (trail.length >= 4) {
			context.strokeStyle = css(palette.primary, .85);
			context.lineWidth = 2;
			context.lineJoin = "round";
			context.lineCap = "round";
			context.beginPath();
			let pen = false;
			for (let index = 0; index < trail.length; index += 2) {
				if (Number.isNaN(trail[index])) {
					pen = false;
					continue;
				}
				const [sx, sy] = toScreen(trail[index], trail[index + 1]);
				if (pen) context.lineTo(sx, sy);
				else context.moveTo(sx, sy);
				pen = true;
			}
			context.stroke();
		}
		const path = this.#path;
		const placed = path && path.points.length > 1 ? path.frame && path.frame !== this.map.fixedFrame() ? this.map.tf.lookup(path.frame, this.map.fixedFrame()) : null : null;
		if (path && path.points.length > 1 && (placed || !path.frame || path.frame === this.map.fixedFrame())) {
			const e = placed?.elements;
			context.strokeStyle = css(palette.path, .95);
			context.lineWidth = 2.5;
			context.lineJoin = "round";
			context.beginPath();
			path.points.forEach(([px, py], index) => {
				const wx = e ? e[0] * px + e[4] * py + e[12] : px;
				const wy = e ? e[1] * px + e[5] * py + e[13] : py;
				const [sx, sy] = toScreen(wx, wy);
				if (index) context.lineTo(sx, sy);
				else context.moveTo(sx, sy);
			});
			context.stroke();
		}
		if (this.#robot) {
			const [sx, sy] = toScreen(this.#robot.x, this.#robot.y);
			context.save();
			context.translate(sx, sy);
			context.rotate(-this.#robot.yaw);
			context.beginPath();
			context.moveTo(11, 0);
			context.lineTo(-7, 7);
			context.lineTo(-3, 0);
			context.lineTo(-7, -7);
			context.closePath();
			context.fillStyle = css(palette.robot);
			context.strokeStyle = css(palette.background);
			context.lineWidth = 2;
			context.stroke();
			context.fill();
			context.restore();
		}
		drawAxes(context, palette, width - 40, height - 14, 22, false);
		const barMeters = niceLength(110 * view.metersPerPixel);
		const barPixels = barMeters * scale;
		context.strokeStyle = css(palette.fg, .9);
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(12, height - 16);
		context.lineTo(12, height - 11);
		context.lineTo(12 + barPixels, height - 11);
		context.lineTo(12 + barPixels, height - 16);
		context.stroke();
		context.fillStyle = css(palette.fg, .9);
		context.font = "10px ui-monospace, monospace";
		context.textBaseline = "bottom";
		context.fillText(formatMeters(barMeters), 14, height - 15);
	}
};
/** x (right) and y (up) arrows from (x, y); labeled ones mark the world origin */
function drawAxes(context, palette, x, y, length, origin) {
	const arrow = (dx, dy, color, name) => {
		context.strokeStyle = color;
		context.fillStyle = color;
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(x, y);
		context.lineTo(x + dx * length, y + dy * length);
		context.stroke();
		context.beginPath();
		context.moveTo(x + dx * (length + 5), y + dy * (length + 5));
		context.lineTo(x + dx * length - dy * 4, y + dy * length + dx * 4);
		context.lineTo(x + dx * length + dy * 4, y + dy * length - dx * 4);
		context.closePath();
		context.fill();
		context.font = "600 10px ui-sans-serif, sans-serif";
		context.textBaseline = "middle";
		context.fillText(name, x + dx * (length + 12) - (dx ? 0 : 3), y + dy * (length + 12));
	};
	arrow(1, 0, palette.axisX, origin ? "x" : "+x");
	arrow(0, -1, palette.axisY, origin ? "y" : "+y");
}
/** RGBA pixels on a canvas the map draws scaled (reused when the size matches). */
function toCanvas(pixels, width, height, reuse) {
	const canvas = reuse && reuse.width === width && reuse.height === height ? reuse : document.createElement("canvas");
	if (canvas !== reuse) {
		canvas.width = width;
		canvas.height = height;
	}
	canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
	return canvas;
}
//#endregion
//#region src/map2d/react.tsx
/** each data source's last map data per topic, so a remounted map shows it at once */
var retainedBySource = /* @__PURE__ */ new WeakMap();
function Map2D({ tf, topic = null, overlay = null, path = null, followFrame = DEFAULT_FOLLOW_FRAME, robotFrame, fixedFrame, view = null, onView, onFollow, onStatus, onPick, onMap, className, style, children }) {
	const source = useDataSource();
	const canvas = useRef(null);
	const renderer = useRef(null);
	const latest = {
		onView,
		onFollow,
		onStatus,
		onPick,
		onMap,
		fixedFrame,
		robotFrame,
		followFrame
	};
	const props = useRef(latest);
	props.current = latest;
	const map = useMemo(() => {
		let retained = retainedBySource.get(source);
		if (!retained) retainedBySource.set(source, retained = /* @__PURE__ */ new Map());
		return {
			source,
			tf,
			retained,
			fixedFrame: () => props.current.fixedFrame || tf.defaultFixedFrame(),
			robotFrame: () => props.current.robotFrame || props.current.followFrame
		};
	}, [source, tf]);
	useEffect(() => {
		const created = new Map2DRenderer(map, canvas.current, view, followFrame, {
			onView: (next) => props.current.onView?.(next),
			onFollow: (next) => props.current.onFollow?.(next),
			onStatus: (next) => props.current.onStatus?.(next),
			onPick: (pick) => props.current.onPick?.(pick)
		});
		renderer.current = created;
		props.current.onMap?.(created);
		return () => {
			props.current.onMap?.(null);
			created.dispose();
			renderer.current = null;
		};
	}, [map]);
	useEffect(() => renderer.current?.setFollowFrame(followFrame), [map, followFrame]);
	useEffect(() => renderer.current?.setTopics(topic, overlay), [
		map,
		topic?.key,
		overlay?.key
	]);
	useEffect(() => renderer.current?.setPath(path), [map, path]);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-map2d", className),
		style,
		children: [/* @__PURE__ */ jsx("canvas", {
			ref: canvas,
			className: "dr-map2d-canvas",
			"aria-label": "Top-down map"
		}), children]
	});
}
//#endregion
export { BoxLayer, CATCH_UP_SECONDS, CLOUD_PRESETS, CUBE_SHADES, Camera3dLayer, CloudLayer, CloudQualitySelect, CloudSettingsEditor, CloudStream, ColorSetting, CubeShadePicker, DEFAULT_DEPTH_LOOK, DEFAULT_GRADIENT, DEFAULT_LOOK, DepthMaterial, DepthRange, FRAME_BUDGET_MS, FatLines, FrameHighlight, FrameHighlighter, FramePicker, GRADIENTS, GradientPicker, GraphLayer, GridLayer, KeyboardFly, LabelPool, LabeledPoints, Layer, LayerManager, LayersPanel, MARKER_TYPE, Map2D, Map2DRenderer, MarkerLayer, ON_TOP_CHANNEL, POINT_STYLES, PanGate, Path, PathLayer, PointCloud, PointLookEditor, Pose, PoseArray, PoseArrayLayer, PoseLayer, RAMPS, ROBOT_KINDS, RangeInput, RenderingSettings, RobotModel, RobotPose, STALE_MS, Scene3D, SceneControls, SceneStats, SmoothFollow, Store, StylePicker, TF_STALE_MS, TfFeed, TfFootnote, TfFrames, TfFramesLayer, TfPanel, TfProvider, TfTree, TopicLayers, ViewCube, Viewer, WORLD_NAMES, allLayerTypes, allOverlayTypes, applyLook, boxesOf, checkTf, chooseMapTopic, chooseOverlay, cloudChanges, cloudOptions, cloudPreset, cloudQualities, cloudQualityOf, cloudRates, colorFor, confirmedIssues, cssColor, cubeRegion, defaultSettings, disposeTree, entitiesOf, fitView as fitMapView, focusDistance, followFrameOptions, followOnTop, formatBytes, formatCount, gradientCss, gradientTexture, isGridTopic, isMapTopic, layerTypeById, layerTypeFor, localStore, makePointMaterial, mapCandidates, screenToWorld as mapScreenToWorld, worldToScreen as mapWorldToScreen, zoomAt as mapZoomAt, overlayCandidates, overlayTypeFor, pathPoints, placeInFixedFrame, placeLayer, pointCloud2ToPositions, poseMatrix, poseOf, pushBox, readLocal, regionDirection, regionLabel, registerLayer, registerOverlay, rendering, resolveLook, resolveStyle, rgba, robotModel, sampleGradient, setClipBox, setCloudQuality, setCloudRate, splatBackground, splatFallback, subscribeDecoded, useFixedFrame, useLayer, useLayerManager, useScene, useSceneActions, useSceneFrame, useStore, useTf, useTfFrames, useTfIssues, useViewer, writeLocal };

