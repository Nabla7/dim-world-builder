import { $ as StickIndicator, $n as watchDesktopTheme, $t as Slider, A as depthScale, An as useConnectionState, At as toast, B as PALETTE_NAMES, Bn as headerFrameId, Bt as ConnectionStatus, C as useStore, Cn as decodeMessage, Ct as Progress, D as ImageView, Dn as parseKey, Dt as ToastProvider, E as IMAGE_OVERLAY_TYPES, En as memorySource, Et as Spinner, F as DEFAULT_GRADIENT, Fn as useZenoh, Ft as Badge, G as otherPalette, Gn as applyTheme, Gt as IconButton, H as cyclePhase, Hn as CORNERS_KEY, Ht as Fab, I as DEFAULT_PALETTE, In as zenohSource, It as Button, J as ColorSwatch, Jn as installInsets, Jt as Radio, K as paletteAt, Kn as desktopCorners, Kt as Kbd, L as DEFAULT_PERIOD, Ln as decode, Lt as ButtonGroup, M as normalizeFrame, Mn as useSubscription, Mt as usePrompt, N as playbackClock, Nn as useTopic, Nt as useToast, O as PlaybackBar, On as useBackendEvents, Ot as ToastViewport, P as rawToImageData, Pn as useTopicList, Pt as AngleDial, Q as KeyHints, Qn as themeColors, Qt as Select, R as GRADIENTS, Rn as encode, Rt as Checkbox, Sn as ZenohProvider, St as Modal, T as DEPTH_COLORMAPS, Tn as keyMatches, Tt as Skeleton, U as heightColor, Un as DESKTOP_THEME_URL, Ut as Field, V as RAMPS, Vn as schemas, Vt as CopyButton, W as isPalette, Wn as SKIN_KEY, Wt as HoldButton, X as FileDrop, Xn as onDesktop, Xt as RangeSlider, Y as DPad, Yn as installThemeCss, Yt as RadioGroup, Z as Joystick, Zn as signalReady, Zt as SearchInput, _ as useVideoQuality, _n as useMediaQuery, _t as useCommandPalette, a as VIDEO_PRESETS, an as Toggle, at as Menu, b as Store, bn as usePersistentState, bt as EmptyState, c as cameraTabs, cn as ICONS, ct as NavRail, d as lowLatencyRendering, dn as useDrag, dt as Sidebar, en as StatusDot, er as COMPONENT_CSS, et as stickValue, f as needsNewReceiver, fn as useEscape, ft as Stepper, g as useCameraStreams, gn as useLatest, gt as placeFloating, h as useCameraStream, hn as useHotkeys, ht as fuzzyScore, i as CameraView, in as TextInput, it as ContextMenu, j as drawDetections2D, jn as useDataSource, jt as useConfirm, k as colorizeDepth, kn as useBackendState, kt as dismissToast, l as isDepthTopic, ln as copyText, lt as Popover, m as retargetCameras, mn as useHeldKeys, mt as Tooltip, n as CameraStreamsProvider, nn as TagList, nr as TOKENS_CSS, nt as Breadcrumbs, o as cameraInfoFor, on as normalizeOptions, ot as MenuAt, p as pickCamera, pn as useGamepad, pt as Tabs, q as sampleGradient, qn as desktopSkin, qt as NumberInput, r as CameraTabs, rn as TextArea, rr as cx, rt as CommandPalette, s as cameraStreamsFor, sn as Icon, st as MenuList, t as CameraStreams, tn as Switch, tr as SKINS, tt as useRepeatWhileHeld, u as isImageTopic, un as matchesHotkey, ut as Segmented, v as videoPreset, vn as useMobile, vt as Alert, wn as dimosKey, wt as ProgressRing, xn as DataSourceProvider, xt as ErrorBoundary, y as videoPresetChanges, yn as useNow, yt as DialogProvider, z as PALETTES, zn as fingerprint, zt as Chip } from "./chunks/camera-BJcjl0WY.js";
import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/theme/provider.tsx
var useIsoLayoutEffect$1 = typeof document === "undefined" ? useEffect : useLayoutEffect;
var ThemeContext = createContext({
	skin: "portal",
	corners: "theme",
	dark: true,
	square: true,
	colors: {},
	setSkin: () => {},
	setCorners: () => {}
});
/**
* `skin` / `corners`: pin them (default: Desktop's saved choice, followed live). `themeUrl`: Desktop's tokens
* stylesheet (default /theme.css on Desktop, the bundled copy elsewhere). `global`: style <body> too (default true).
*/
function DimThemeProvider({ skin, corners, themeUrl, bundled, global = true, children }) {
	const [desktop, setDesktop] = useState(() => ({
		skin: typeof window === "undefined" ? "portal" : desktopSkin(),
		corners: typeof window === "undefined" ? "theme" : desktopCorners()
	}));
	const [override, setOverride] = useState({});
	const [state, setState] = useState({
		dark: true,
		square: true,
		colors: {},
		ready: false
	});
	const wantedSkin = skin ?? override.skin ?? desktop.skin;
	const wantedCorners = corners ?? override.corners ?? desktop.corners;
	useEffect(() => {
		installInsets();
		return watchDesktopTheme(() => setDesktop({
			skin: desktopSkin(),
			corners: desktopCorners()
		}));
	}, []);
	useIsoLayoutEffect$1(() => {
		if (typeof document === "undefined") return;
		let live = true;
		const update = () => {
			if (!live) return;
			const applied = applyTheme({
				skin: wantedSkin,
				corners: wantedCorners
			});
			setState({
				dark: applied.dark,
				square: applied.square,
				colors: themeColors(),
				ready: true
			});
			document.body?.classList.toggle("dr-body", global);
			dispatchEvent(new CustomEvent("dimos-react-theme", { detail: applied }));
		};
		update();
		installThemeCss({
			themeUrl,
			bundled
		}).then(() => {
			update();
			signalReady();
		});
		return () => {
			live = false;
		};
	}, [
		wantedSkin,
		wantedCorners,
		themeUrl,
		bundled,
		global
	]);
	const value = useMemo(() => ({
		skin: wantedSkin,
		corners: wantedCorners,
		dark: state.dark,
		square: state.square,
		colors: state.colors,
		ready: state.ready,
		setSkin: (next) => setOverride((old) => ({
			...old,
			skin: next
		})),
		setCorners: (next) => setOverride((old) => ({
			...old,
			corners: next
		}))
	}), [
		wantedSkin,
		wantedCorners,
		state
	]);
	return /* @__PURE__ */ jsx(ThemeContext.Provider, {
		value,
		children
	});
}
/** `{ skin, corners, dark, square, colors, ready, setSkin, setCorners }` (setSkin/setCorners: this page only). */
function useTheme() {
	return useContext(ThemeContext);
}
/** The theme's colors (themeColors()), re-read on every skin change: for canvases, charts and 3D scenes. */
function useThemeColors() {
	return useContext(ThemeContext).colors;
}
//#endregion
//#region src/url_state.tsx
/** The params of `href` as a plain object of strings. */
function parseUrlState(href, { mode = "search" } = {}) {
	const url = new URL(href, "http://localhost/");
	const raw = mode === "hash" ? url.hash.replace(/^#/, "") : url.search;
	return Object.fromEntries(new URLSearchParams(raw));
}
/** `href` with `changes` applied (null / undefined / "" remove a param; `clear` drops every other param first). */
function urlWith(href, changes, { mode = "search", clear = false } = {}) {
	const url = new URL(href, "http://localhost/");
	const params = new URLSearchParams(clear ? "" : mode === "hash" ? url.hash.replace(/^#/, "") : url.search);
	for (const [key, value] of Object.entries(changes ?? {})) if (value === null || value === void 0 || value === "") params.delete(key);
	else params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
	params.sort();
	const text = params.toString();
	if (mode === "hash") url.hash = text;
	else url.search = text;
	return url.href;
}
/**
* What a backend event does to the URL: `{ href, replace }`, or null if it isn't a url event (or changes nothing).
* @param href the current URL
* @param event a backend event (anything; only `{ type: eventType, … }` objects count)
*/
function applyUrlEvent(href, event, { mode = "search", eventType = "url" } = {}) {
	if (!event || typeof event !== "object" || event.type !== eventType) return null;
	const urlEvent = event;
	const next = urlWith(href, urlEvent.set ?? urlEvent.params ?? {}, {
		mode,
		clear: !!urlEvent.clear
	});
	if (next === new URL(href, "http://localhost/").href) return null;
	return {
		href: next,
		replace: !!urlEvent.replace
	};
}
/**
* A window stand-in with a working location + history (pushState, replaceState, back, forward, go → popstate), for
* tests and server rendering.
*/
function createMemoryWindow(initialHref = "http://localhost/") {
	const entries = [{
		href: new URL(initialHref).href,
		state: null
	}];
	let index = 0;
	const listeners = /* @__PURE__ */ new Map();
	const fire = (type) => {
		for (const listener of [...listeners.get(type) ?? []]) listener({
			type,
			state: entries[index].state
		});
	};
	return {
		location: {
			get href() {
				return entries[index].href;
			},
			get search() {
				return new URL(entries[index].href).search;
			},
			get hash() {
				return new URL(entries[index].href).hash;
			},
			get pathname() {
				return new URL(entries[index].href).pathname;
			}
		},
		history: {
			get length() {
				return entries.length;
			},
			get state() {
				return entries[index].state;
			},
			pushState(state, _title, href) {
				entries.splice(index + 1);
				entries.push({
					href: new URL(href, entries[index].href).href,
					state
				});
				index = entries.length - 1;
			},
			replaceState(state, _title, href) {
				entries[index] = {
					href: new URL(href, entries[index].href).href,
					state
				};
			},
			go(delta) {
				const next = Math.min(entries.length - 1, Math.max(0, index + delta));
				if (next !== index) {
					index = next;
					fire("popstate");
				}
			},
			back() {
				this.go(-1);
			},
			forward() {
				this.go(1);
			}
		},
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, /* @__PURE__ */ new Set());
			listeners.get(type).add(listener);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		}
	};
}
/**
* The URL as a store: `get()` → params (the same object until the URL changes), `subscribe(listener)`,
* `set(changes, { replace, clear })`, `applyEvent(event)`, `href()`. Follows back/forward (popstate, hashchange).
*/
function createUrlStore({ window: win = globalThis.window, mode = "search" } = {}) {
	const listeners = /* @__PURE__ */ new Set();
	let lastHref = null;
	let lastParams = {};
	const notify = () => listeners.forEach((listener) => listener());
	const store = {
		mode,
		href: () => win?.location?.href ?? "http://localhost/",
		get() {
			const href = store.href();
			if (href !== lastHref) {
				lastHref = href;
				lastParams = parseUrlState(href, { mode });
			}
			return lastParams;
		},
		subscribe(listener) {
			listeners.add(listener);
			if (listeners.size === 1 && win) {
				win.addEventListener("popstate", notify);
				win.addEventListener("hashchange", notify);
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && win) {
					win.removeEventListener("popstate", notify);
					win.removeEventListener("hashchange", notify);
				}
			};
		},
		set(changes, { replace = false, clear = false } = {}) {
			const href = store.href();
			const next = urlWith(href, changes, {
				mode,
				clear
			});
			if (next === new URL(href, "http://localhost/").href) return false;
			win?.history?.[replace ? "replaceState" : "pushState"](win.history.state ?? null, "", next);
			notify();
			return true;
		},
		applyEvent(event, { eventType = "url" } = {}) {
			const change = applyUrlEvent(store.href(), event, {
				mode,
				eventType
			});
			if (!change) return false;
			win?.history?.[change.replace ? "replaceState" : "pushState"](win.history.state ?? null, "", change.href);
			notify();
			return true;
		}
	};
	return store;
}
/**
* Wires a data source's backend events to a URL store (non-React pages): every url event on the frontend topic
* `topic` changes the URL. Returns unsubscribe.
*/
function bindUrlEvents(source, store, { topic = "events", eventType = "url" } = {}) {
	return source.subscribeFrontend(topic, (event) => store.applyEvent(event, { eventType }));
}
var UrlStateContext = createContext(null);
var defaultStore = null;
var getDefaultStore = () => defaultStore ??= createUrlStore();
/**
* Provides the URL store below it and (unless `events={false}`) lets the app's backend change the URL with url events
* on its `events` frontend topic (`events` may name another topic). `window` (tests: createMemoryWindow()) and
* `mode` ("search" | "hash") pick where the params live; `store` passes a ready-made one.
*/
function UrlStateProvider({ mode = "search", window: win, store: givenStore, events = "events", eventType = "url", children }) {
	const store = useMemo(() => givenStore ?? createUrlStore({
		window: win ?? globalThis.window,
		mode
	}), [
		givenStore,
		win,
		mode
	]);
	const source = useDataSource();
	useEffect(() => {
		if (!events) return;
		return bindUrlEvents(source, store, {
			topic: typeof events === "string" ? events : "events",
			eventType
		});
	}, [
		source,
		store,
		events,
		eventType
	]);
	return /* @__PURE__ */ jsx(UrlStateContext.Provider, {
		value: store,
		children
	});
}
/** The URL store in effect (the provider's, else one over the real window). */
function useUrlStore() {
	return useContext(UrlStateContext) ?? getDefaultStore();
}
/** `[params, setParams(changes, { replace, clear })]`: every URL param, re-rendered on any URL change. */
function useUrlParams() {
	const store = useUrlStore();
	return [useSyncExternalStore(store.subscribe, store.get, store.get), useCallback((changes, options) => store.set(changes, options), [store])];
}
var CODECS = {
	string: {
		parse: (text) => text,
		format: (value) => value
	},
	number: {
		parse: (text) => {
			const number = Number(text);
			return Number.isFinite(number) ? number : void 0;
		},
		format: (value) => Number.isFinite(value) ? String(value) : null
	},
	boolean: {
		parse: (text) => text === "1" || text === "true",
		format: (value) => value ? "1" : null
	},
	json: {
		parse: (text) => {
			try {
				return JSON.parse(text);
			} catch {
				return;
			}
		},
		format: (value) => value === void 0 ? null : JSON.stringify(value)
	}
};
function useUrlState(key, defaultValue, { codec = "string", replace = false } = {}) {
	const store = useUrlStore();
	const { parse, format } = typeof codec === "string" ? CODECS[codec] : codec;
	const raw = useSyncExternalStore(store.subscribe, () => store.get()[key], () => store.get()[key]);
	const value = raw === void 0 ? defaultValue : parse(raw) ?? defaultValue;
	const latest = useRef(value);
	latest.current = value;
	return [value, useCallback((next, options = {}) => {
		const resolved = typeof next === "function" ? next(latest.current) : next;
		const same = JSON.stringify(resolved) === JSON.stringify(defaultValue);
		store.set({ [key]: same ? null : format(resolved) }, {
			replace,
			...options
		});
	}, [
		store,
		key,
		replace,
		format,
		JSON.stringify(defaultValue)
	])];
}
//#endregion
//#region src/app_provider.tsx
/**
* `theme`: DimThemeProvider props (skin, corners, themeUrl…); `source`: a data source (memorySource(), …; default:
* the page's zenoh-gateway connection); `url`: UrlStateProvider props, or false for none
*/
function AppProvider({ theme = {}, source, url = {}, toastPosition, children }) {
	let tree = /* @__PURE__ */ jsx(DialogProvider, { children: /* @__PURE__ */ jsx(ToastProvider, {
		position: toastPosition,
		children
	}) });
	if (url !== false) tree = /* @__PURE__ */ jsx(UrlStateProvider, {
		...url,
		children: tree
	});
	if (source) tree = /* @__PURE__ */ jsx(DataSourceProvider, {
		source,
		children: tree
	});
	return /* @__PURE__ */ jsx(DimThemeProvider, {
		...theme,
		children: tree
	});
}
//#endregion
//#region src/components/layout.tsx
/** A bordered surface. `title`, `description`, `actions` (right side of the header); `padded` (default true). */
function Card({ title, description, actions, padded = true, glass = false, className, children, ...rest }) {
	return /* @__PURE__ */ jsxs("section", {
		className: cx("dr-card", padded && "dr-card--padded", glass && "dr-glass", className),
		...rest,
		children: [title || actions ? /* @__PURE__ */ jsxs("header", {
			className: "dr-card-head",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "dr-card-titles",
				children: [title ? /* @__PURE__ */ jsx("h3", {
					className: "dr-card-title",
					children: title
				}) : null, description ? /* @__PURE__ */ jsx("div", {
					className: "dr-card-desc",
					children: description
				}) : null]
			}), actions ? /* @__PURE__ */ jsx("div", {
				className: "dr-card-actions",
				children: actions
			}) : null]
		}) : null, children]
	});
}
/**
* A panel with a header that can collapse its body. `collapsible`, `open`/`onOpenChange` (controlled) or
* `defaultOpen`; `persistKey` remembers it; `glass` for panels floating over a 3D/video view; `icon`, `actions`.
*/
function Panel({ title, icon, actions, collapsible = false, open, onOpenChange, defaultOpen = true, persistKey, glass = false, className, bodyClassName, children, ...rest }) {
	const [savedOpen, setSavedOpen] = usePersistentState(persistKey ? `dr.panel.${persistKey}` : "dr.panel.__unsaved", defaultOpen);
	const [localOpen, setLocalOpen] = useState(defaultOpen);
	const isOpen = !collapsible || (open ?? (persistKey ? savedOpen : localOpen));
	const setOpen = (next) => {
		onOpenChange?.(next);
		if (open === void 0) {
			if (persistKey) setSavedOpen(next);
			else setLocalOpen(next);
		}
	};
	return /* @__PURE__ */ jsxs("section", {
		className: cx("dr-panel", glass && "dr-glass", !isOpen && "dr-panel--closed", className),
		...rest,
		children: [title || actions ? /* @__PURE__ */ jsxs("header", {
			className: "dr-panel-head",
			children: [collapsible ? /* @__PURE__ */ jsxs("button", {
				type: "button",
				className: "dr-panel-toggle",
				"aria-expanded": isOpen,
				onClick: () => setOpen(!isOpen),
				children: [
					/* @__PURE__ */ jsx(Icon, {
						name: isOpen ? "chevron-down" : "chevron-right",
						size: 14
					}),
					icon ? /* @__PURE__ */ jsx(Icon, {
						name: icon,
						size: 15
					}) : null,
					/* @__PURE__ */ jsx("span", {
						className: "dr-panel-title",
						children: title
					})
				]
			}) : /* @__PURE__ */ jsxs("div", {
				className: "dr-panel-toggle dr-panel-toggle--static",
				children: [icon ? /* @__PURE__ */ jsx(Icon, {
					name: icon,
					size: 15
				}) : null, /* @__PURE__ */ jsx("span", {
					className: "dr-panel-title",
					children: title
				})]
			}), actions ? /* @__PURE__ */ jsx("div", {
				className: "dr-panel-actions",
				children: actions
			}) : null]
		}) : null, isOpen ? /* @__PURE__ */ jsx("div", {
			className: cx("dr-panel-body", bodyClassName),
			children
		}) : null]
	});
}
/**
* A panel that floats over the page and can be dragged by its header (position remembered with `persistKey`).
* `defaultPosition` { x, y } (px from the top-left; negative = from the right/bottom); `onClose` adds an ✕.
*/
function FloatingPanel({ title, icon, actions, onClose, defaultPosition = {
	x: 16,
	y: 16
}, persistKey, width = 300, className, style, children, ...rest }) {
	const [saved, setSaved] = usePersistentState(persistKey ? `dr.float.${persistKey}` : "dr.float.__unsaved", defaultPosition);
	const [local, setLocal] = useState(defaultPosition);
	const position = persistKey ? saved : local;
	const setPosition = persistKey ? setSaved : setLocal;
	const start = useRef(position);
	const panel = useRef(null);
	const drag = useDrag({
		onStart: () => {
			const rect = panel.current.getBoundingClientRect();
			start.current = {
				x: rect.left,
				y: rect.top
			};
		},
		onMove: ({ dx, dy }) => {
			const rect = panel.current.getBoundingClientRect();
			const x = Math.min(Math.max(0, start.current.x + dx), innerWidth - rect.width);
			const y = Math.min(Math.max(0, start.current.y + dy), innerHeight - 40);
			setPosition({
				x,
				y
			});
		}
	});
	const placement = {
		left: position.x >= 0 ? position.x : void 0,
		right: position.x < 0 ? -position.x : void 0,
		top: position.y >= 0 ? position.y : void 0,
		bottom: position.y < 0 ? -position.y : void 0
	};
	return /* @__PURE__ */ jsxs("section", {
		ref: panel,
		className: cx("dr-panel dr-glass dr-floating", className),
		style: {
			width,
			...placement,
			...style
		},
		...rest,
		children: [/* @__PURE__ */ jsxs("header", {
			className: "dr-panel-head dr-floating-head",
			...drag,
			children: [/* @__PURE__ */ jsxs("div", {
				className: "dr-panel-toggle dr-panel-toggle--static",
				children: [
					/* @__PURE__ */ jsx(Icon, {
						name: "grip",
						size: 14
					}),
					icon ? /* @__PURE__ */ jsx(Icon, {
						name: icon,
						size: 15
					}) : null,
					/* @__PURE__ */ jsx("span", {
						className: "dr-panel-title",
						children: title
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "dr-panel-actions",
				onPointerDown: (event) => event.stopPropagation(),
				children: [actions, onClose ? /* @__PURE__ */ jsx("button", {
					type: "button",
					className: "dr-panel-close",
					"aria-label": "Close",
					onClick: onClose,
					children: /* @__PURE__ */ jsx(Icon, {
						name: "close",
						size: 14
					})
				}) : null]
			})]
		}), /* @__PURE__ */ jsx("div", {
			className: "dr-panel-body",
			children
		})]
	});
}
/**
* Two panes with a draggable divider. `direction` "row" (side by side) | "column"; `size` of the first pane (px or
* %, controlled with onSizeChange) or `defaultSize`; `min` / `max` px; `persistKey`.
*/
function SplitPane({ direction = "row", size, onSizeChange, defaultSize = "50%", min = 120, max, persistKey, className, children, ...rest }) {
	const [saved, setSaved] = usePersistentState(persistKey ? `dr.split.${persistKey}` : "dr.split.__unsaved", defaultSize);
	const [local, setLocal] = useState(defaultSize);
	const current = size ?? (persistKey ? saved : local);
	const container = useRef(null);
	const first = useRef(null);
	const start = useRef(0);
	const set = (next) => {
		onSizeChange?.(next);
		if (size === void 0) (persistKey ? setSaved : setLocal)(next);
	};
	const row = direction === "row";
	const drag = useDrag({
		onStart: () => {
			start.current = row ? first.current.offsetWidth : first.current.offsetHeight;
		},
		onMove: ({ dx, dy }) => {
			const total = row ? container.current.offsetWidth : container.current.offsetHeight;
			const next = Math.min(max ?? total - min, Math.max(min, start.current + (row ? dx : dy)));
			set(next);
		}
	});
	const [a, b] = Array.isArray(children) ? children : [children, null];
	return /* @__PURE__ */ jsxs("div", {
		ref: container,
		className: cx("dr-split", `dr-split--${direction}`, className),
		...rest,
		children: [
			/* @__PURE__ */ jsx("div", {
				ref: first,
				className: "dr-split-pane",
				style: { flexBasis: typeof current === "number" ? `${current}px` : current },
				children: a
			}),
			/* @__PURE__ */ jsx("div", {
				className: "dr-split-divider",
				role: "separator",
				"aria-orientation": row ? "vertical" : "horizontal",
				tabIndex: 0,
				onKeyDown: (event) => {
					const step = event.shiftKey ? 40 : 10;
					const now = row ? first.current.offsetWidth : first.current.offsetHeight;
					if (row && event.key === "ArrowLeft" || !row && event.key === "ArrowUp") set(Math.max(min, now - step));
					else if (row && event.key === "ArrowRight" || !row && event.key === "ArrowDown") set(now + step);
				},
				...drag
			}),
			/* @__PURE__ */ jsx("div", {
				className: "dr-split-pane dr-split-pane--rest",
				children: b
			})
		]
	});
}
/**
* A corner grip for resizing a panel: `onResize({ dx, dy, done })` while dragging (px from where it started) and once
* more with `done: true` on release. `corner` "bottom-right" | "bottom-left" (the one facing into the screen).
*/
function ResizeHandle({ onResize, onStart, corner = "bottom-right", label = "Resize", className, ...rest }) {
	const start = useRef(null);
	const report = (event, done) => start.current && onResize({
		dx: event.clientX - start.current.x,
		dy: event.clientY - start.current.y,
		done
	});
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-resize-handle", `dr-resize-handle--${corner}`, className),
		role: "separator",
		"aria-label": label,
		title: label,
		onPointerDown: (event) => {
			event.preventDefault();
			event.stopPropagation();
			event.currentTarget.setPointerCapture?.(event.pointerId);
			start.current = {
				x: event.clientX,
				y: event.clientY
			};
			onStart?.();
		},
		onPointerMove: (event) => report(event, false),
		onPointerUp: (event) => {
			report(event, true);
			start.current = null;
		},
		onPointerCancel: (event) => {
			report(event, true);
			start.current = null;
		},
		...rest
	});
}
/** The app's top bar: `title` (and `icon`), `left` / center `children` / `right` slots. */
function TopBar({ title, icon, left, right, className, children, ...rest }) {
	return /* @__PURE__ */ jsxs("header", {
		className: cx("dr-topbar", className),
		...rest,
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "dr-topbar-left",
				children: [
					icon ? /* @__PURE__ */ jsx(Icon, {
						name: icon,
						size: 18
					}) : null,
					title ? /* @__PURE__ */ jsx("span", {
						className: "dr-title",
						children: title
					}) : null,
					left
				]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "dr-topbar-center",
				children
			}),
			/* @__PURE__ */ jsx("div", {
				className: "dr-topbar-right",
				children: right
			})
		]
	});
}
/** A row of controls (buttons, selects, separators). `floating` gives it a glass background (over a view). */
function Toolbar({ floating = false, vertical = false, className, children, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-toolbar", floating && "dr-toolbar--floating dr-glass", vertical && "dr-toolbar--vertical", className),
		role: "toolbar",
		...rest,
		children
	});
}
/** A bar pinned to the bottom of its container, above Desktop's dock (status lines, playback controls). */
function BottomBar({ className, children, ...rest }) {
	return /* @__PURE__ */ jsx("footer", {
		className: cx("dr-bottombar", className),
		...rest,
		children
	});
}
/** A thin divider; `vertical` inside rows/toolbars. */
function Separator({ vertical = false, className, ...rest }) {
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-sep", vertical && "dr-sep--vertical", className),
		role: "separator",
		...rest
	});
}
/** Flex helpers: `gap` (px), `align`, `justify`, `wrap`, `grow`. */
function Row({ gap = 8, align = "center", justify, wrap = false, grow = false, className, style, children, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-row", className),
		style: {
			gap,
			alignItems: align,
			justifyContent: justify,
			flexWrap: wrap ? "wrap" : void 0,
			flex: grow ? 1 : void 0,
			...style
		},
		...rest,
		children
	});
}
function Column({ gap = 8, align, justify, grow = false, className, style, children, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-col", className),
		style: {
			gap,
			alignItems: align,
			justifyContent: justify,
			flex: grow ? 1 : void 0,
			...style
		},
		...rest,
		children
	});
}
/** Takes the free space in a Row/Column. */
function Spacer() {
	return /* @__PURE__ */ jsx("span", { className: "dr-spacer" });
}
/**
* A HUD overlay pinned to a corner of a positioned parent (a 3D view, a video): `position` "top-left" | "top-right" |
* "bottom-left" | "bottom-right" | "top" | "bottom" | "center".
*/
function Hud({ position = "top-left", className, children, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-hud", `dr-hud--${position}`, className),
		...rest,
		children
	});
}
/** Headings and text in the theme's type: level 1 (page title), 2 (section head), 3 (micro-label). */
function Heading({ level = 2, className, children, ...rest }) {
	const Tag = `h${level}`;
	return /* @__PURE__ */ jsx(Tag, {
		className: cx(`dr-h${level}`, className),
		...rest,
		children
	});
}
function Label({ className, children, ...rest }) {
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-label", className),
		...rest,
		children
	});
}
/** Text: `muted`, `mono`, `small`, `tone` ("ok" | "warn" | "danger"). */
function Text({ as = "span", muted, mono, small, tone, className, children, ...rest }) {
	return /* @__PURE__ */ jsx(as, {
		className: cx("dr-text", muted && "dr-muted", mono && "dr-mono", small && "dr-small", tone && `dr-${tone}`, className),
		...rest,
		children
	});
}
function Link({ className, children, ...rest }) {
	return /* @__PURE__ */ jsx("a", {
		className: cx("dr-link", className),
		...rest,
		children
	});
}
/**
* Full-page app frame: top bar, optional side, main area (fills the viewport). `insetBottom` ends the main area above
* Desktop's dock (without a bottomBar; a BottomBar already does).
*/
function AppShell({ topBar, sidebar, bottomBar, insetBottom = false, className, children, ...rest }) {
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-shell", insetBottom && "dr-shell--inset", className),
		...rest,
		children: [
			topBar,
			/* @__PURE__ */ jsxs("div", {
				className: "dr-shell-main",
				children: [sidebar, /* @__PURE__ */ jsx("main", {
					className: "dr-shell-content",
					children
				})]
			}),
			bottomBar
		]
	});
}
/**
* Another page embedded in this one (an iframe that fills its positioned parent, no border, on the page background).
* `title` names it for screen readers; other props go to the iframe (`src`, `allow`, `sandbox`, …).
*/
function Embed({ title, className, ...rest }) {
	return /* @__PURE__ */ jsx("iframe", {
		title,
		className: cx("dr-embed", className),
		...rest
	});
}
/**
* A big selectable card (a picker's choice: a robot, a template, a recording). A button: `onClick`, `selected`,
* `disabled`. `media` (an image, an icon element) or `icon` (an Icon name) on top, then `title` and `subtitle`, then
* `children`. `align` "center" (a picker's icons) | "start" (text cards: a featured item with its description). With
* `loading` it is a placeholder (no click).
*/
function Tile({ title, subtitle, media, icon, selected, loading = false, align = "center", className, children, ...rest }) {
	if (loading) return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-tile", "dr-tile--loading", className),
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ jsx("span", { className: "dr-tile__media dr-skeleton" }),
			/* @__PURE__ */ jsx("span", { className: "dr-tile__bar dr-skeleton" }),
			/* @__PURE__ */ jsx("span", { className: "dr-tile__bar dr-tile__bar--short dr-skeleton" })
		]
	});
	return /* @__PURE__ */ jsxs("button", {
		type: "button",
		className: cx("dr-tile", align === "start" && "dr-tile--start", selected && "dr-tile--selected", className),
		"aria-pressed": selected === void 0 ? void 0 : !!selected,
		...rest,
		children: [
			media || icon ? /* @__PURE__ */ jsx("span", {
				className: "dr-tile__media",
				children: media ?? /* @__PURE__ */ jsx(Icon, {
					name: icon ?? "",
					size: 40
				})
			}) : null,
			title ? /* @__PURE__ */ jsx("span", {
				className: "dr-tile__title",
				children: title
			}) : null,
			subtitle ? /* @__PURE__ */ jsx("span", {
				className: "dr-tile__subtitle",
				children: subtitle
			}) : null,
			children
		]
	});
}
/** Tiles in a responsive grid: as many columns of at least `min` px as fit. */
function TileGrid({ min = 150, className, style, children, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		role: "list",
		className: cx("dr-tile-grid", className),
		style: {
			gridTemplateColumns: `repeat(auto-fill, minmax(${typeof min === "number" ? `${min}px` : min}, 1fr))`,
			...style
		},
		...rest,
		children
	});
}
//#endregion
//#region src/components/data.tsx
var useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
/** Controlled when `value` is given, else internal state seeded from `initial`. */
function useControllable(value, initial, onChange) {
	const [inner, setInner] = useState(initial);
	const controlled = value !== void 0;
	const current = controlled ? value : inner;
	const set = (next) => {
		if (!controlled) setInner(next);
		onChange?.(next);
	};
	return [current, set];
}
var compareValues = (a, b) => {
	if (a === b) return 0;
	if (a === void 0 || a === null) return 1;
	if (b === void 0 || b === null) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b), void 0, { numeric: true });
};
/** A row's field by name (rows are the caller's records, of any shape). */
var field = (row, key) => row?.[key];
/**
* A sortable table. `sortRows: false`: the rows arrive already sorted (by a backend); the headers still show and change
* `sort`.
*/
function Table({ columns, rows = [], rowKey, sort, onSortChange, defaultSort = null, onRowClick, selected, empty = "Nothing here yet", sticky = true, compact = false, maxHeight, sortRows = true, className, style, ...rest }) {
	const [currentSort, setSort] = useControllable(sort, defaultSort, onSortChange);
	const sorted = useMemo(() => {
		if (!currentSort || !sortRows) return rows;
		const column = columns.find((item) => item.key === currentSort.key);
		if (!column) return rows;
		const read = column.value ?? ((row) => field(row, column.key));
		const compare = typeof column.sort === "function" ? column.sort : (a, b) => compareValues(read(a), read(b));
		const out = [...rows].sort(compare);
		return currentSort.dir === "desc" ? out.reverse() : out;
	}, [
		rows,
		columns,
		currentSort?.key,
		currentSort?.dir,
		sortRows
	]);
	const keyOf = (row, index) => typeof rowKey === "function" ? rowKey(row, index) : rowKey ? field(row, rowKey) : field(row, "id") ?? field(row, "key") ?? index;
	const onHeader = (column) => {
		if (!column.sort) return;
		if (currentSort?.key !== column.key) setSort({
			key: column.key,
			dir: "asc"
		});
		else if (currentSort.dir === "asc") setSort({
			key: column.key,
			dir: "desc"
		});
		else setSort(null);
	};
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-table-wrap", "dr-scroll", className),
		style: {
			maxHeight,
			...style
		},
		...rest,
		children: /* @__PURE__ */ jsxs("table", {
			className: cx("dr-table", compact && "dr-table--compact", sticky && "dr-table--sticky"),
			children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: columns.map((column) => {
				const active = currentSort?.key === column.key;
				return /* @__PURE__ */ jsxs("th", {
					style: {
						width: column.width,
						textAlign: column.align
					},
					className: cx(column.sort && "dr-table__sortable", active && "dr-table__sorted"),
					onClick: () => onHeader(column),
					"aria-sort": active ? currentSort.dir === "asc" ? "ascending" : "descending" : void 0,
					children: [/* @__PURE__ */ jsx("span", { children: column.label ?? column.key }), column.sort ? /* @__PURE__ */ jsx(Icon, {
						name: active ? currentSort.dir === "asc" ? "chevron-up" : "chevron-down" : "sort",
						size: 12,
						className: "dr-table__sort-icon"
					}) : null]
				}, column.key);
			}) }) }), /* @__PURE__ */ jsx("tbody", { children: sorted.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", {
				className: "dr-table__empty",
				colSpan: columns.length,
				children: empty
			}) }) : sorted.map((row, index) => {
				const key = keyOf(row, index);
				return /* @__PURE__ */ jsx("tr", {
					className: cx(onRowClick && "dr-table__clickable", selected === key && "dr-table__selected"),
					onClick: onRowClick ? () => onRowClick(row, index) : void 0,
					children: columns.map((column) => /* @__PURE__ */ jsx("td", {
						style: { textAlign: column.align },
						children: column.render ? column.render(row, index) : String(field(row, column.key) ?? "")
					}, column.key))
				}, key);
			}) })]
		})
	});
}
/** A collapsible tree (TF frames, recording summaries, URDF links). */
function Tree({ nodes = [], expanded, defaultExpanded = [], onExpandedChange, selected, onSelect, renderLabel, className, ...rest }) {
	const allIds = useMemo(() => {
		const ids = [];
		const walk = (list) => list.forEach((node) => {
			if (node.children?.length) {
				ids.push(node.id);
				walk(node.children);
			}
		});
		walk(nodes);
		return ids;
	}, [nodes]);
	const [open, setOpen] = useControllable(expanded, defaultExpanded === "all" ? allIds : defaultExpanded, onExpandedChange);
	const openSet = new Set(open);
	const toggle = (id) => setOpen(openSet.has(id) ? open.filter((other) => other !== id) : [...open, id]);
	const renderNodes = (list, depth) => list.map((node) => {
		const hasChildren = !!node.children?.length;
		const isOpen = openSet.has(node.id);
		return /* @__PURE__ */ jsxs("li", {
			role: "treeitem",
			"aria-expanded": hasChildren ? isOpen : void 0,
			children: [/* @__PURE__ */ jsxs("div", {
				className: cx("dr-tree__row", selected === node.id && "dr-tree__row--selected"),
				style: { paddingLeft: 6 + depth * 14 },
				onClick: () => onSelect?.(node.id, node),
				children: [
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: cx("dr-tree__twisty", !hasChildren && "dr-tree__twisty--leaf"),
						tabIndex: hasChildren ? 0 : -1,
						"aria-label": hasChildren ? isOpen ? "Collapse" : "Expand" : void 0,
						onClick: (event) => {
							event.stopPropagation();
							if (hasChildren) toggle(node.id);
						},
						children: hasChildren ? /* @__PURE__ */ jsx(Icon, {
							name: isOpen ? "chevron-down" : "chevron-right",
							size: 12
						}) : null
					}),
					node.icon ? /* @__PURE__ */ jsx(Icon, {
						name: node.icon,
						size: 14,
						className: "dr-tree__icon"
					}) : null,
					/* @__PURE__ */ jsx("span", {
						className: "dr-tree__label",
						children: renderLabel ? renderLabel(node) : node.label ?? node.id
					}),
					node.badge !== void 0 && node.badge !== null ? /* @__PURE__ */ jsx("span", {
						className: "dr-tree__badge",
						children: node.badge
					}) : null
				]
			}), hasChildren && isOpen ? /* @__PURE__ */ jsx("ul", {
				role: "group",
				children: renderNodes(node.children, depth + 1)
			}) : null]
		}, node.id);
	});
	return /* @__PURE__ */ jsx("ul", {
		className: cx("dr-tree", className),
		role: "tree",
		...rest,
		children: renderNodes(nodes, 0)
	});
}
/** One label / value row (`children` is the value). */
function KeyValueRow({ label, children, mono = true, className, ...rest }) {
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-kv__row", className),
		...rest,
		children: [/* @__PURE__ */ jsx("span", {
			className: "dr-kv__key",
			children: label
		}), /* @__PURE__ */ jsx("span", {
			className: cx("dr-kv__value", mono && "dr-mono"),
			children
		})]
	});
}
/** Label / value readout rows. */
function KeyValue({ items, children, mono = true, className, ...rest }) {
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-kv", className),
		...rest,
		children: [items?.map(([label, value], index) => /* @__PURE__ */ jsx(KeyValueRow, {
			label,
			mono,
			children: value
		}, index)), children]
	});
}
/** A big number: label, value, unit, a change, a tone. */
function Stat({ label, value, unit, delta, tone, hint, className, ...rest }) {
	const deltaTone = typeof delta === "number" ? delta > 0 ? "up" : delta < 0 ? "down" : "flat" : "flat";
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-stat", tone && `dr-stat--${tone}`, className),
		...rest,
		children: [
			/* @__PURE__ */ jsx("div", {
				className: "dr-stat__label",
				children: label
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "dr-stat__value",
				children: [value, unit ? /* @__PURE__ */ jsx("span", {
					className: "dr-stat__unit",
					children: unit
				}) : null]
			}),
			delta !== void 0 && delta !== null ? /* @__PURE__ */ jsx("div", {
				className: cx("dr-stat__delta", `dr-stat__delta--${deltaTone}`),
				children: typeof delta === "number" && delta > 0 ? `+${delta}` : String(delta)
			}) : null,
			hint ? /* @__PURE__ */ jsx("div", {
				className: "dr-stat__hint",
				children: hint
			}) : null
		]
	});
}
/** A vertical list of ListRows. */
function List({ children, className, divided = true, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-list", divided && "dr-list--divided", className),
		role: "list",
		...rest,
		children
	});
}
/** A list row: icon, title, subtitle, meta on the right, actions. `handle`: a drag grip. */
function ListRow({ icon, title, subtitle, meta, actions, selected, onClick, handle, disabled, className, ...rest }) {
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-list-row", onClick && "dr-list-row--clickable", selected && "dr-list-row--selected", disabled && "dr-list-row--disabled", className),
		role: "listitem",
		tabIndex: onClick && !disabled ? 0 : void 0,
		"aria-selected": selected || void 0,
		onClick: disabled ? void 0 : onClick,
		onKeyDown: onClick && !disabled ? (event) => {
			if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
				event.preventDefault();
				onClick(event);
			}
		} : void 0,
		...rest,
		children: [
			handle ? /* @__PURE__ */ jsx("span", {
				className: "dr-list-row__handle",
				...typeof handle === "object" ? handle : {},
				children: /* @__PURE__ */ jsx(Icon, {
					name: "grip",
					size: 14
				})
			}) : null,
			icon ? /* @__PURE__ */ jsx("span", {
				className: "dr-list-row__icon",
				children: typeof icon === "string" ? /* @__PURE__ */ jsx(Icon, {
					name: icon,
					size: 16
				}) : icon
			}) : null,
			/* @__PURE__ */ jsxs("span", {
				className: "dr-list-row__text",
				children: [/* @__PURE__ */ jsx("span", {
					className: "dr-list-row__title",
					children: title
				}), subtitle ? /* @__PURE__ */ jsx("span", {
					className: "dr-list-row__subtitle",
					children: subtitle
				}) : null]
			}),
			meta !== void 0 && meta !== null ? /* @__PURE__ */ jsx("span", {
				className: "dr-list-row__meta",
				children: meta
			}) : null,
			actions ? /* @__PURE__ */ jsx("span", {
				className: "dr-list-row__actions",
				onClick: (event) => event.stopPropagation(),
				children: actions
			}) : null
		]
	});
}
var formatTs = (ts) => {
	if (ts === void 0 || ts === null) return "";
	const date = typeof ts === "number" || typeof ts === "string" ? new Date(ts) : ts;
	return Number.isNaN(date.getTime?.()) ? String(ts) : date.toTimeString().slice(0, 8);
};
/** A console: follows the tail (auto scroll) until you scroll up, then offers "jump to end". */
function LogView({ lines = [], filter = "", maxLines = 5e3, follow = true, height = 260, showTime = true, wrap = false, className, style, ...rest }) {
	const box = useRef(null);
	const [atEnd, setAtEnd] = useState(true);
	const shown = useMemo(() => {
		const needle = filter.trim().toLowerCase();
		const normalized = lines.map((line) => typeof line === "string" ? { text: line } : line);
		const filtered = needle ? normalized.filter((line) => line.text.toLowerCase().includes(needle)) : normalized;
		return filtered.length > maxLines ? filtered.slice(filtered.length - maxLines) : filtered;
	}, [
		lines,
		filter,
		maxLines
	]);
	useIsoLayoutEffect(() => {
		if (follow && atEnd && box.current) box.current.scrollTop = box.current.scrollHeight;
	}, [
		shown,
		follow,
		atEnd
	]);
	const onScroll = () => {
		const element = box.current;
		if (element) setAtEnd(element.scrollHeight - element.scrollTop - element.clientHeight < 24);
	};
	const jump = () => {
		setAtEnd(true);
		if (box.current) box.current.scrollTop = box.current.scrollHeight;
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-log", className),
		style: {
			height,
			...style
		},
		...rest,
		children: [/* @__PURE__ */ jsx("div", {
			className: cx("dr-log__lines", "dr-scroll", wrap && "dr-log__lines--wrap"),
			ref: box,
			onScroll,
			children: shown.length === 0 ? /* @__PURE__ */ jsx("div", {
				className: "dr-log__empty",
				children: filter ? "No lines match" : "No output yet"
			}) : shown.map((line, index) => /* @__PURE__ */ jsxs("div", {
				className: cx("dr-log__line", line.level && `dr-log__line--${line.level}`),
				children: [showTime && line.ts !== void 0 ? /* @__PURE__ */ jsx("span", {
					className: "dr-log__ts",
					children: formatTs(line.ts)
				}) : null, /* @__PURE__ */ jsx("span", {
					className: "dr-log__text",
					children: line.text
				})]
			}, index))
		}), !atEnd && follow ? /* @__PURE__ */ jsxs("button", {
			type: "button",
			className: "dr-log__jump",
			onClick: jump,
			children: [/* @__PURE__ */ jsx(Icon, {
				name: "arrow-down",
				size: 12
			}), "Jump to end"]
		}) : null]
	});
}
var KEYWORDS = {
	js: "const let var function return if else for while of in new class extends import export from await async true false null undefined this throw try catch",
	py: "def return if elif else for while in import from as class with try except finally raise lambda True False None and or not is pass yield async await self",
	sh: "if then else fi for do done case esac function export local echo cd sudo",
	json: "true false null"
};
KEYWORDS.ts = KEYWORDS.js;
KEYWORDS.python = KEYWORDS.py;
KEYWORDS.bash = KEYWORDS.sh;
KEYWORDS.javascript = KEYWORDS.js;
/** Splits one line of code into [kind, text] tokens (kw, str, num, com, func, plain). */
function tokenizeLine(line, language = "js") {
	const keywords = new Set((KEYWORDS[language] ?? KEYWORDS.js).split(" "));
	const pattern = new RegExp(`(${language === "py" || language === "python" || language === "sh" || language === "bash" ? "#[^\\n]*" : language === "json" ? "(?!)" : "\\/\\/[^\\n]*"})|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)(?=\\s*\\()|([A-Za-z_$][\\w$]*)`, "g");
	const tokens = [];
	let last = 0;
	for (const match of line.matchAll(pattern)) {
		if (match.index > last) tokens.push(["plain", line.slice(last, match.index)]);
		if (match[1]) tokens.push(["com", match[1]]);
		else if (match[2]) tokens.push(["str", match[2]]);
		else if (match[3]) tokens.push(["num", match[3]]);
		else if (match[4]) tokens.push([keywords.has(match[4]) ? "kw" : "func", match[4]]);
		else tokens.push([keywords.has(match[5]) ? "kw" : "plain", match[5]]);
		last = match.index + match[0].length;
	}
	if (last < line.length) tokens.push(["plain", line.slice(last)]);
	return tokens;
}
/** Code with light highlighting (the theme's --code-* colors), line numbers and a copy button. */
function CodeBlock({ code = "", language = "js", lineNumbers = false, copy = true, title, maxHeight, className, style, ...rest }) {
	const [copied, setCopied] = useState(false);
	const lines = String(code).replace(/\n$/, "").split("\n");
	const onCopy = async () => {
		if (await copyText(code)) {
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		}
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-code", className),
		style,
		...rest,
		children: [title || language || copy ? /* @__PURE__ */ jsxs("div", {
			className: "dr-code__head",
			children: [/* @__PURE__ */ jsx("span", {
				className: "dr-code__lang",
				children: title ?? language
			}), copy ? /* @__PURE__ */ jsxs("button", {
				type: "button",
				className: "dr-code__copy",
				onClick: onCopy,
				"aria-label": "Copy code",
				children: [/* @__PURE__ */ jsx(Icon, {
					name: copied ? "check" : "copy",
					size: 13
				}), copied ? "Copied" : "Copy"]
			}) : null]
		}) : null, /* @__PURE__ */ jsx("pre", {
			className: "dr-code__pre dr-scroll",
			style: { maxHeight },
			children: /* @__PURE__ */ jsx("code", { children: lines.map((line, index) => /* @__PURE__ */ jsxs("div", {
				className: "dr-code__line",
				children: [lineNumbers ? /* @__PURE__ */ jsx("span", {
					className: "dr-code__num",
					children: index + 1
				}) : null, /* @__PURE__ */ jsxs("span", { children: [tokenizeLine(line, language).map(([kind, text], tokenIndex) => kind === "plain" ? text : /* @__PURE__ */ jsx("span", {
					className: `dr-tok-${kind}`,
					children: text
				}, tokenIndex)), line === "" ? "​" : null] })]
			}, index)) })
		})]
	});
}
/**
* An attitude indicator (artificial horizon): the horizon rolls and shifts with the body's roll and pitch, yaw is
* printed below. Angles in radians; null shows a level, dimmed horizon.
*/
function AttitudeIndicator({ roll = null, pitch = null, yaw = null, height = 84, pitchScale = 1.4, className, ...rest }) {
	const deg = (radians) => radians * 180 / Math.PI;
	const known = roll !== null && pitch !== null;
	const shift = known ? Math.max(-height / 2, Math.min(height / 2, deg(pitch) * pitchScale)) : 0;
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-attitude", !known && "dr-attitude--unknown", className),
		style: { height },
		role: "img",
		"aria-label": known ? `roll ${deg(roll).toFixed(1)}°, pitch ${deg(pitch).toFixed(1)}°` : "attitude unknown",
		...rest,
		children: [
			/* @__PURE__ */ jsx("div", {
				className: "dr-attitude__sky",
				style: known ? { transform: `rotate(${(-deg(roll)).toFixed(1)}deg) translateY(${shift.toFixed(0)}px)` } : void 0
			}),
			/* @__PURE__ */ jsx("div", { className: "dr-attitude__cross" }),
			/* @__PURE__ */ jsx("div", {
				className: "dr-attitude__yaw",
				children: `yaw ${yaw === null ? "—" : deg(yaw).toFixed(0)}°`
			})
		]
	});
}
/** A tiny line chart (rates, latency, battery). `color`: a CSS color, default var(--primary). */
function Sparkline({ values = [], width = 120, height = 28, color = "var(--primary)", fill = true, min, max, strokeWidth = 1.5, className, title, ...rest }) {
	const finite = values.filter(Number.isFinite);
	const low = min ?? Math.min(...finite, 0);
	const span = (max ?? Math.max(...finite, low + 1e-9)) - low || 1;
	const step = values.length > 1 ? width / (values.length - 1) : width;
	const points = values.map((value, index) => [index * step, height - 1 - ((Number.isFinite(value) ? value : low) - low) / span * (height - 2)]);
	const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
	return /* @__PURE__ */ jsxs("svg", {
		className: cx("dr-sparkline", className),
		width,
		height,
		viewBox: `0 0 ${width} ${height}`,
		role: title ? "img" : void 0,
		"aria-hidden": title ? void 0 : "true",
		style: { color },
		...rest,
		children: [
			title ? /* @__PURE__ */ jsx("title", { children: title }) : null,
			points.length > 1 && fill ? /* @__PURE__ */ jsx("path", {
				d: `${line}L${width},${height}L0,${height}Z`,
				className: "dr-sparkline__fill"
			}) : null,
			points.length > 1 ? /* @__PURE__ */ jsx("path", {
				d: line,
				fill: "none",
				stroke: "currentColor",
				strokeWidth,
				strokeLinejoin: "round"
			}) : null,
			points.length ? /* @__PURE__ */ jsx("circle", {
				cx: points.at(-1)[0],
				cy: points.at(-1)[1],
				r: 2,
				fill: "currentColor"
			}) : null
		]
	});
}
/** Seconds → "m:ss" (or "h:mm:ss"). */
function formatDuration(seconds) {
	const total = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total % 3600 / 60);
	const secs = String(total % 60).padStart(2, "0");
	return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}
/**
* A recording player's scrubber: play/pause, the position, markers. Times in seconds (any unit works with your own
* `format`).
*/
function Timeline({ start = 0, end, value, onChange, playing, onPlayPause, markers = [], format, step, disabled, className, style, ...rest }) {
	const track = useRef(null);
	const show = format ?? ((t) => formatDuration(t - start));
	const span = Math.max(1e-9, end - start);
	const fraction = Math.min(1, Math.max(0, (value - start) / span));
	const timeAt = (clientX) => {
		const rect = track.current.getBoundingClientRect();
		const t = start + Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))) * span;
		return step ? Math.round(t / step) * step : t;
	};
	const onPointerDown = (event) => {
		if (disabled || !onChange) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		onChange(timeAt(event.clientX));
	};
	const onPointerMove = (event) => {
		if (!disabled && onChange && event.currentTarget.hasPointerCapture?.(event.pointerId)) onChange(timeAt(event.clientX));
	};
	const onKeyDown = (event) => {
		if (disabled || !onChange) return;
		const nudge = step ?? span / 100;
		if (event.key === "ArrowRight") onChange(Math.min(end, value + nudge));
		else if (event.key === "ArrowLeft") onChange(Math.max(start, value - nudge));
		else if (event.key === "Home") onChange(start);
		else if (event.key === "End") onChange(end);
		else if (event.key === " " && onPlayPause) onPlayPause(!playing);
		else return;
		event.preventDefault();
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-timeline", disabled && "dr-timeline--disabled", className),
		style,
		...rest,
		children: [
			onPlayPause ? /* @__PURE__ */ jsx("button", {
				type: "button",
				className: "dr-timeline__play",
				onClick: () => onPlayPause(!playing),
				disabled,
				"aria-label": playing ? "Pause" : "Play",
				children: /* @__PURE__ */ jsx(Icon, {
					name: playing ? "pause" : "play",
					size: 16
				})
			}) : null,
			/* @__PURE__ */ jsx("span", {
				className: "dr-timeline__time",
				children: show(value)
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "dr-timeline__track",
				ref: track,
				role: "slider",
				tabIndex: disabled ? -1 : 0,
				"aria-valuemin": start,
				"aria-valuemax": end,
				"aria-valuenow": value,
				"aria-valuetext": show(value),
				onPointerDown,
				onPointerMove,
				onKeyDown,
				style: { touchAction: "none" },
				children: [
					/* @__PURE__ */ jsx("div", { className: "dr-timeline__rail" }),
					/* @__PURE__ */ jsx("div", {
						className: "dr-timeline__done",
						style: { width: `${fraction * 100}%` }
					}),
					markers.map((marker, index) => /* @__PURE__ */ jsx("span", {
						className: cx("dr-timeline__marker", marker.tone && `dr-timeline__marker--${marker.tone}`),
						style: { left: `${Math.min(1, Math.max(0, (marker.t - start) / span)) * 100}%` },
						title: marker.label
					}, index)),
					/* @__PURE__ */ jsx("div", {
						className: "dr-timeline__thumb",
						style: { left: `${fraction * 100}%` }
					})
				]
			}),
			/* @__PURE__ */ jsx("span", {
				className: "dr-timeline__time dr-timeline__time--end",
				children: show(end)
			})
		]
	});
}
/**
* A video stream or an image in a themed frame. `stream` (a MediaStream, e.g. a zenoh-gateway camera track) plays in a
* muted inline <video>; without `stream`, `src` shows as an image. `placeholder` covers it until there is something to
* show. `ref` reaches the <video>/<img> (for captureFrame).
*/
function MediaFrame({ stream, src, alt = "", fit = "contain", height = 360, placeholder = "No video", ref, className, style, ...rest }) {
	const element = useRef(null);
	const [playing, setPlaying] = useState(false);
	const isVideo = stream !== void 0;
	useEffect(() => {
		const video = element.current;
		if (isVideo && video && video.srcObject !== (stream ?? null)) {
			video.srcObject = stream ?? null;
			setPlaying(false);
		}
	}, [isVideo, stream]);
	const setRef = (node) => {
		element.current = node;
		if (typeof ref === "function") ref(node);
		else if (ref) ref.current = node;
	};
	const shown = isVideo ? stream && playing : Boolean(src);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-media", className),
		style: {
			maxHeight: height,
			aspectRatio: "16 / 9",
			...style
		},
		...rest,
		children: [isVideo ? /* @__PURE__ */ jsx("video", {
			ref: setRef,
			className: "dr-media__el",
			style: { objectFit: fit },
			autoPlay: true,
			muted: true,
			playsInline: true,
			onPlaying: () => setPlaying(true),
			onEmptied: () => setPlaying(false)
		}) : src ? /* @__PURE__ */ jsx("img", {
			ref: setRef,
			className: "dr-media__el",
			style: { objectFit: fit },
			src,
			alt
		}) : null, !shown && placeholder ? /* @__PURE__ */ jsx("div", {
			className: "dr-media__placeholder",
			children: placeholder
		}) : null]
	});
}
/** The frame a <video> is showing, as a data URL (null before its first frame). */
function captureFrame(video, type = "image/png") {
	if (!video?.videoWidth) return null;
	const canvas = Object.assign(document.createElement("canvas"), {
		width: video.videoWidth,
		height: video.videoHeight
	});
	canvas.getContext("2d").drawImage(video, 0, 0);
	return canvas.toDataURL(type);
}
//#endregion
//#region src/components/text.tsx
var INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
var LIST_ITEM = /^\s*([-*]|\d+\.)\s/;
/** `code`, **bold**, *italic*, [links](url) → React nodes (no HTML passes through; only http(s), /, #, . links). */
function markdownInline(text, key = 0) {
	const out = [];
	const pattern = new RegExp(INLINE.source, "g");
	let last = 0;
	let match;
	while (match = pattern.exec(text)) {
		if (match.index > last) out.push(text.slice(last, match.index));
		const token = match[0];
		const k = `${key}-${match.index}`;
		if (match[1]) out.push(/* @__PURE__ */ jsx("code", {
			className: "dr-code-inline",
			children: token.slice(1, -1)
		}, k));
		else if (match[2]) out.push(/* @__PURE__ */ jsx("strong", { children: markdownInline(token.slice(2, -2), key + 1) }, k));
		else if (match[3]) out.push(/* @__PURE__ */ jsx("em", { children: markdownInline(token.slice(1, -1), key + 1) }, k));
		else {
			const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
			const safe = /^(https?:|\/|#|\.)/.test(href) ? href : "#";
			const external = safe.startsWith("http");
			out.push(/* @__PURE__ */ jsx("a", {
				className: "dr-link",
				href: safe,
				target: external ? "_blank" : void 0,
				rel: "noreferrer",
				children: label
			}, k));
		}
		last = match.index + token.length;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}
/**
* Markdown → themed React: headings, paragraphs, lists, fenced code, tables, `code`, **bold**, *italic*, [links](url).
* No HTML passes through. `inline` renders a single paragraph without block margins.
*/
function Markdown({ text, inline = false, className, ...rest }) {
	if (!text) return null;
	const lines = String(text).replace(/\r/g, "").split("\n");
	const blocks = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (/^```/.test(line)) {
			const body = [];
			i++;
			while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
			i++;
			blocks.push(/* @__PURE__ */ jsx("pre", {
				className: "dr-md__pre dr-scroll",
				children: body.join("\n")
			}, i));
		} else if (/^#{1,6}\s/.test(line)) {
			const Tag = line.match(/^#+/)[0].length <= 2 ? "h4" : "h5";
			blocks.push(/* @__PURE__ */ jsx(Tag, {
				className: "dr-md__h",
				children: markdownInline(line.replace(/^#+\s*/, ""), i)
			}, i));
			i++;
		} else if (LIST_ITEM.test(line)) {
			const ordered = /^\s*\d+\./.test(line);
			const items = [];
			while (i < lines.length && LIST_ITEM.test(lines[i])) {
				const indent = lines[i].match(/^\s*/)[0].length;
				let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
				i++;
				while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST_ITEM.test(lines[i])) item += " " + lines[i++].trim();
				items.push(/* @__PURE__ */ jsx("li", {
					className: indent >= 2 ? "dr-md__sub" : void 0,
					children: markdownInline(item, i)
				}, i));
			}
			const Tag = ordered ? "ol" : "ul";
			blocks.push(/* @__PURE__ */ jsx(Tag, { children: items }, i));
		} else if (/^\s*\|/.test(line)) {
			const rows = [];
			while (i < lines.length && /^\s*\|/.test(lines[i])) {
				const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
				if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
				i++;
			}
			const [head = [], ...body] = rows;
			blocks.push(/* @__PURE__ */ jsx(Table, {
				compact: true,
				className: "dr-md__table",
				columns: head.map((cell, column) => ({
					key: String(column),
					label: markdownInline(cell, column),
					render: (row) => markdownInline(row[column] ?? "", column)
				})),
				rows: body,
				rowKey: (_row, index) => index
			}, i));
		} else if (line.trim() === "") i++;
		else {
			const paragraph = [];
			while (i < lines.length && lines[i].trim() !== "" && !/^(```|#{1,6}\s|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])) paragraph.push(lines[i++].trim());
			blocks.push(/* @__PURE__ */ jsx("p", { children: markdownInline(paragraph.join(" "), i) }, i));
		}
	}
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-md", inline && "dr-md--inline", className),
		...rest,
		children: blocks.map((block, index) => /* @__PURE__ */ jsx(Fragment, { children: block }, index))
	});
}
/**
* A number that briefly lights up when it changes (live counts, rates). `format(value)` → text.
*/
function LiveValue({ value, format = String, className, ...rest }) {
	const last = useRef(value);
	const [flash, setFlash] = useState(0);
	useEffect(() => {
		if (value !== last.current) {
			last.current = value;
			setFlash((count) => count + 1);
		}
	}, [value]);
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-live-value", flash && "dr-live-value--flash", className),
		...rest,
		children: format(value)
	}, flash);
}
/** Box-drawing characters as ASCII: the themes' mono faces have no box-drawing glyphs (they'd fall back to a system
* font and misalign diagrams). */
var BOX_ASCII = [
	[/[─━═╌╍┄┅]/g, "-"],
	[/[│┃║╎╏┆┇]/g, "|"],
	[/[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬╭╮╯╰┏┓┗┛┣┫┳┻╋]/g, "+"],
	[/[▶►→]/g, ">"],
	[/[◀◄←]/g, "<"],
	[/[▼↓]/g, "v"],
	[/[▲↑]/g, "^"]
];
/**
* `html` without what runs or restyles: scripts, styles, frames, forms, `on*` handlers, `javascript:` URLs and inline
* styles go; links open in a new tab; box-drawing in <pre> becomes ASCII. Browser only (DOMParser).
*/
function sanitizeHtml(html) {
	const page = new DOMParser().parseFromString(String(html ?? ""), "text/html");
	for (const block of page.querySelectorAll("pre")) {
		const walker = page.createTreeWalker(block, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) node.textContent = BOX_ASCII.reduce((text, [from, to]) => text.replace(from, to), node.textContent ?? "");
	}
	for (const node of page.querySelectorAll("script, style, iframe, object, embed, form, link, meta, base")) node.remove();
	for (const element of page.body.querySelectorAll("*")) {
		for (const attribute of [...element.attributes]) {
			const value = attribute.value.trim().toLowerCase();
			if (attribute.name.startsWith("on") || attribute.name === "style" || value.startsWith("javascript:")) element.removeAttribute(attribute.name);
		}
		if (element.tagName === "A") {
			element.setAttribute("target", "_blank");
			element.setAttribute("rel", "noopener noreferrer");
		}
	}
	return page.body.innerHTML;
}
/**
* HTML a server rendered (a doc page, a README), sanitized (sanitizeHtml) and set in the theme's prose type (the same
* as Markdown's).
*/
function SafeHtml({ html, className, ...rest }) {
	const clean = useMemo(() => html ? sanitizeHtml(html) : "", [html]);
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-md", "dr-prose", className),
		dangerouslySetInnerHTML: { __html: clean },
		...rest
	});
}
//#endregion
//#region src/components/view_panel.tsx
/** every panel's header height (px): a panel is this plus its body */
var VIEW_PANEL_HEAD_PX = 33;
/** how much of a floating panel always stays on screen (its header's left part) */
var KEEP_VISIBLE_X = 80;
var KEEP_VISIBLE_Y = 40;
var topLimit = (top) => typeof top === "number" ? top : 0;
/**
* Drags `element` with the pointer from `event` (a header's pointerdown), kept on screen and below `top` px;
* `onDone(x, y)` gets where it was dropped (only if it moved).
*/
function startPanelDrag(event, element, onDone, { top = 0 } = {}) {
	const box = element.getBoundingClientRect();
	const offsetX = event.clientX - box.left;
	const offsetY = event.clientY - box.top;
	let moved = false;
	const move = (pointer) => {
		moved = true;
		const x = Math.max(0, Math.min(innerWidth - KEEP_VISIBLE_X, pointer.clientX - offsetX));
		const y = Math.max(topLimit(top), Math.min(innerHeight - KEEP_VISIBLE_Y, pointer.clientY - offsetY));
		Object.assign(element.style, {
			left: `${x}px`,
			top: `${y}px`,
			right: "auto",
			bottom: "auto"
		});
	};
	const up = () => {
		removeEventListener("pointermove", move);
		removeEventListener("pointerup", up);
		if (!moved) return;
		element.style.right = "";
		element.style.bottom = "";
		const after = element.getBoundingClientRect();
		onDone(after.left, after.top);
	};
	addEventListener("pointermove", move);
	addEventListener("pointerup", up);
}
/**
* Resizes `element` from a bottom corner: "left" grows it leftward (its right edge stays), "right" rightward. With
* `aspect` (body height / width) the height follows the width. It stays in the window; `onDone(box)` gets the final
* `{ x, y, width, height }`.
*/
function startPanelResize(event, element, { corner, minimum, aspect, onDone, headPx = 33 }) {
	event.preventDefault();
	event.stopPropagation();
	const box = element.getBoundingClientRect();
	const startX = event.clientX;
	const startY = event.clientY;
	const handle = event.currentTarget;
	handle.setPointerCapture?.(event.pointerId);
	let width = box.width;
	let height = box.height;
	let left = box.left;
	Object.assign(element.style, {
		left: `${box.left}px`,
		top: `${box.top}px`,
		right: "auto",
		bottom: "auto"
	});
	const maxWidth = corner === "left" ? box.right - 8 : innerWidth - box.left - 8;
	const maxHeight = innerHeight - box.top - 8;
	const move = (moved) => {
		const grown = corner === "left" ? startX - moved.clientX : moved.clientX - startX;
		const widest = aspect ? Math.min(maxWidth, (maxHeight - headPx) / aspect) : maxWidth;
		width = Math.round(Math.max(Math.min(minimum.width, widest), Math.min(widest, box.width + grown)));
		height = aspect ? Math.round(width * aspect) + headPx : Math.round(Math.max(minimum.height, Math.min(maxHeight, box.height + moved.clientY - startY)));
		left = corner === "left" ? box.right - width : box.left;
		Object.assign(element.style, {
			width: `${width}px`,
			height: `${height}px`,
			left: `${left}px`
		});
	};
	const up = () => {
		handle.removeEventListener("pointermove", move);
		handle.removeEventListener("pointerup", up);
		handle.removeEventListener("pointercancel", up);
		element.style.right = "";
		element.style.bottom = "";
		onDone({
			x: Math.round(left),
			y: Math.round(box.top),
			width,
			height
		});
	};
	handle.addEventListener("pointermove", move);
	handle.addEventListener("pointerup", up);
	handle.addEventListener("pointercancel", up);
}
/**
* A remembered panel box made safe for this window: a size that fits (at least `minimum`), a position that keeps the
* header reachable (on screen, below `top`); anything not a finite number takes its default. x/y < 0 = "the default
* corner" (returned as -1, -1).
*/
function clampPanelBox(box, defaults, viewport, minimum, { top = 48 } = {}) {
	const finite = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
	const viewWidth = viewport.width > 0 ? viewport.width : 1280;
	const viewHeight = viewport.height > 0 ? viewport.height : 800;
	const width = Math.round(Math.max(minimum.width, Math.min(Math.max(minimum.width, viewWidth - 16), finite(box.width, defaults.width))));
	const height = Math.round(Math.max(minimum.height, Math.min(Math.max(minimum.height, viewHeight - top - 8), finite(box.height, defaults.height))));
	const x = finite(box.x, defaults.x);
	const y = finite(box.y, defaults.y);
	if (x < 0 || y < 0) return {
		x: -1,
		y: -1,
		width,
		height
	};
	return {
		x: Math.round(Math.max(0, Math.min(viewWidth - KEEP_VISIBLE_X, x))),
		y: Math.round(Math.max(top, Math.min(viewHeight - KEEP_VISIBLE_Y, y))),
		width,
		height
	};
}
/** The order with `a` and `b` swapped (a tiled layout's drop). */
function swapTiles(order, a, b) {
	const ia = order.indexOf(a);
	const ib = order.indexOf(b);
	if (ia < 0 || ib < 0 || ia === ib) return order;
	const next = order.slice();
	next[ia] = b;
	next[ib] = a;
	return next;
}
/** Tiles: a header dragged onto another tile swaps the two (the tile under the pointer lights up on the way). */
function startTileSwap(event, region, tiles) {
	const startX = event.clientX;
	const startY = event.clientY;
	let target = null;
	const tileAt = (x, y) => document.elementsFromPoint(x, y).map((node) => node.closest?.("[data-region].dr-view-panel--tile")).find((tile) => tile && tile.dataset.region !== region) ?? null;
	const move = (moved) => {
		if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < 6) return;
		document.body.classList.add("dr-tile-dragging");
		const next = tileAt(moved.clientX, moved.clientY);
		if (next !== target) {
			target?.classList.remove("dr-view-panel--drop");
			next?.classList.add("dr-view-panel--drop");
			target = next;
		}
	};
	const up = () => {
		removeEventListener("pointermove", move);
		removeEventListener("pointerup", up);
		removeEventListener("pointercancel", up);
		document.body.classList.remove("dr-tile-dragging");
		target?.classList.remove("dr-view-panel--drop");
		const other = target?.dataset.region;
		if (other) tiles.onOrder(swapTiles(tiles.order, region, other));
	};
	addEventListener("pointermove", move);
	addEventListener("pointerup", up);
	addEventListener("pointercancel", up);
}
/** A view's panel (see the top of this file). */
function ViewPanel({ placement, dock, head, children, className, style, bodyClassName, bodyOnClick, onHeadDoubleClick, onMove, top = 0, resize, panelRef, title, wrapHead = false, ...rest }) {
	const element = useRef(null);
	const setRef = (node) => {
		element.current = node;
		if (typeof panelRef === "function") panelRef(node);
		else if (panelRef) panelRef.current = node;
	};
	const fromControl = (event) => !!event.target.closest("button, select, input, label, textarea, [role=tab]");
	const startHeadDrag = (event) => {
		if (fromControl(event) || event.button !== 0) return;
		if (placement === "float" && onMove) startPanelDrag(event, element.current, onMove, { top });
		else if (placement === "dock" && dock?.tiles && !dock.maximized) startTileSwap(event, dock.region, dock.tiles);
	};
	const docked = placement === "dock";
	const hidden = docked && !dock?.rect;
	const placed = docked ? dock?.rect ? {
		left: dock.rect.x,
		top: dock.rect.y,
		width: dock.rect.width,
		height: dock.rect.height
	} : {} : style ?? {};
	return /* @__PURE__ */ jsxs("div", {
		ref: setRef,
		className: cx("dr-view-panel", `dr-view-panel--${placement}`, hidden && "dr-view-panel--hidden", dock?.maximized && "dr-view-panel--maximized", dock?.tiles && "dr-view-panel--tile", className),
		style: placed,
		"data-region": dock?.region,
		"aria-hidden": hidden || void 0,
		...rest,
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: cx("dr-view-panel-head", wrapHead && "dr-view-panel-head--wrap"),
				title,
				onPointerDown: startHeadDrag,
				onDoubleClick: (event) => {
					if (fromControl(event)) return;
					if (docked) dock?.onMaximize();
					else onHeadDoubleClick?.();
				},
				children: [head, docked && dock ? /* @__PURE__ */ jsx(IconButton, {
					size: "sm",
					className: "dr-view-panel-maximize",
					icon: dock.maximized ? "fullscreen-exit" : "fullscreen",
					label: dock.maximized ? "Back to the layout" : "Maximize (fill the page)",
					pressed: dock.maximized,
					onClick: dock.onMaximize
				}) : null]
			}),
			/* @__PURE__ */ jsx("div", {
				className: cx("dr-view-panel-body", bodyClassName),
				onClick: bodyOnClick,
				children
			}),
			placement === "float" && resize ? /* @__PURE__ */ jsx("div", {
				className: cx("dr-view-panel-resize", `dr-view-panel-resize--${resize.corner}`),
				title: "Drag to resize",
				"aria-label": "Resize",
				onPointerDown: (event) => startPanelResize(event, element.current, resize)
			}) : null
		]
	});
}
/** A short live readout in a panel header ("640×480 · 30 fps"): muted, mono, truncated. */
function PanelInfo({ className, children, ...rest }) {
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-view-panel-info", className),
		...rest,
		children
	});
}
//#endregion
//#region src/components/thumbstick.tsx
/** below this share of the radius a resting thumb sends nothing */
var STICK_DEAD_ZONE = .12;
/** >1 flattens the middle: small moves are finer, the edge is still full speed */
var STICK_EXPO = 1.6;
/** how quickly a held stick's output follows the thumb (time constant, ms) */
var STICK_SMOOTH_MS = 70;
var clean = (value) => Math.round(value * 1e3) / 1e3 || 0;
function shapeAxis(value) {
	const size = Math.min(1, Math.abs(value));
	if (size <= .12) return 0;
	return clean(Math.sign(value) * Math.pow((size - STICK_DEAD_ZONE) / .88, STICK_EXPO));
}
/**
* The thumb's offset from the stick's center (px, screen y down) → `{ x, y }` in -1..1 (up = +y). `axes` "xy" uses a
* radial dead zone (no snapping to an axis); "x" / "y" look at that axis alone.
*/
function shapeStick(dx, dy, radius, axes = "xy") {
	if (!(radius > 0)) return {
		x: 0,
		y: 0
	};
	let x = dx / radius;
	let y = -dy / radius;
	if (axes === "x") return {
		x: shapeAxis(x),
		y: 0
	};
	if (axes === "y") return {
		x: 0,
		y: shapeAxis(y)
	};
	const length = Math.hypot(x, y);
	if (length <= .12) return {
		x: 0,
		y: 0
	};
	const scaled = Math.pow((Math.min(1, length) - STICK_DEAD_ZONE) / .88, STICK_EXPO);
	x = x / length * scaled;
	y = y / length * scaled;
	return {
		x: clean(x),
		y: clean(y)
	};
}
/**
* One easing step: `current` toward `target` over `dtMs` (exponential, time constant `tauMs`). Snaps when close; a
* target of exactly zero is returned as zero (releasing is never eased).
*/
function smoothToward(current, target, dtMs, tauMs = 70) {
	if (target === 0) return 0;
	const next = current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs));
	return Math.abs(next - target) < .005 ? target : clean(next);
}
var releases = new EventTarget();
/** A STOP button (or anything that must override a held thumb) calls this: every ThumbStick lets go until lifted. */
function releaseAllThumbSticks() {
	releases.dispatchEvent(new Event("release"));
}
/** A thumb stick zone (size it with CSS: it fills its box; the ring's size is `--dr-stick`). */
function ThumbStick({ onMove, axes = "xy", label, shape = shapeStick, smooth = smoothToward, className, style, ...rest }) {
	const zone = useRef(null);
	const base = useRef(null);
	const onMoveRef = useRef(onMove);
	onMoveRef.current = onMove;
	const latest = useRef({
		shape,
		smooth
	});
	latest.current = {
		shape,
		smooth
	};
	const [view, setView] = useState({
		active: false,
		origin: null,
		knob: {
			x: 0,
			y: 0
		}
	});
	const live = useRef({
		pointer: null,
		origin: {
			x: 0,
			y: 0
		},
		radius: 1,
		target: {
			x: 0,
			y: 0
		},
		current: {
			x: 0,
			y: 0
		},
		frame: 0,
		last: 0
	});
	const emit = (x, y) => {
		const state = live.current;
		if (x !== state.current.x || y !== state.current.y) {
			state.current = {
				x,
				y
			};
			onMoveRef.current(x, y);
		}
	};
	const release = () => {
		const state = live.current;
		cancelAnimationFrame(state.frame);
		state.frame = 0;
		const wasActive = state.pointer !== null;
		state.pointer = null;
		state.target = {
			x: 0,
			y: 0
		};
		if (wasActive || state.current.x !== 0 || state.current.y !== 0) {
			state.current = {
				x: 0,
				y: 0
			};
			onMoveRef.current(0, 0);
		}
		setView({
			active: false,
			origin: null,
			knob: {
				x: 0,
				y: 0
			}
		});
	};
	const releaseRef = useRef(release);
	releaseRef.current = release;
	const step = (now) => {
		const state = live.current;
		if (state.pointer === null) return;
		const dt = state.last ? now - state.last : 16;
		state.last = now;
		emit(latest.current.smooth(state.current.x, state.target.x, dt), latest.current.smooth(state.current.y, state.target.y, dt));
		state.frame = requestAnimationFrame(step);
	};
	const track = (clientX, clientY) => {
		const state = live.current;
		let dx = clientX - state.origin.x;
		let dy = clientY - state.origin.y;
		const length = Math.hypot(dx, dy);
		if (length > state.radius) {
			dx *= state.radius / length;
			dy *= state.radius / length;
		}
		if (axes === "x") dy = 0;
		else if (axes === "y") dx = 0;
		state.target = latest.current.shape(dx, dy, state.radius, axes);
		if (state.target.x === 0 && state.target.y === 0) emit(0, 0);
		setView((old) => ({
			...old,
			knob: {
				x: dx,
				y: dy
			}
		}));
	};
	const down = (event) => {
		const state = live.current;
		if (state.pointer !== null || event.pointerType === "mouse" && event.button !== 0) return;
		event.preventDefault();
		const box = zone.current.getBoundingClientRect();
		const ring = base.current.offsetWidth / 2 || 60;
		state.radius = ring;
		const x = Math.max(box.left + ring, Math.min(box.right - ring, event.clientX));
		const y = Math.max(box.top + ring, Math.min(box.bottom - ring, event.clientY));
		state.origin = {
			x,
			y
		};
		state.pointer = event.pointerId;
		state.last = 0;
		zone.current.setPointerCapture?.(event.pointerId);
		setView({
			active: true,
			origin: {
				x: x - box.left,
				y: y - box.top
			},
			knob: {
				x: 0,
				y: 0
			}
		});
		track(event.clientX, event.clientY);
		state.frame = requestAnimationFrame(step);
	};
	const move = (event) => {
		if (event.pointerId === live.current.pointer) {
			event.preventDefault();
			track(event.clientX, event.clientY);
		}
	};
	const up = (event) => {
		if (event.pointerId === live.current.pointer) release();
	};
	useEffect(() => {
		const element = zone.current;
		const letGo = () => releaseRef.current();
		const touchEnd = (event) => {
			if (event.targetTouches.length === 0) letGo();
		};
		const hidden = () => {
			if (document.visibilityState !== "visible") letGo();
		};
		element.addEventListener("touchend", touchEnd);
		element.addEventListener("touchcancel", letGo);
		addEventListener("blur", letGo);
		addEventListener("pagehide", letGo);
		addEventListener("orientationchange", letGo);
		document.addEventListener("visibilitychange", hidden);
		releases.addEventListener("release", letGo);
		return () => {
			element.removeEventListener("touchend", touchEnd);
			element.removeEventListener("touchcancel", letGo);
			removeEventListener("blur", letGo);
			removeEventListener("pagehide", letGo);
			removeEventListener("orientationchange", letGo);
			document.removeEventListener("visibilitychange", hidden);
			releases.removeEventListener("release", letGo);
			letGo();
		};
	}, []);
	const { active, origin, knob } = view;
	return /* @__PURE__ */ jsx("div", {
		ref: zone,
		className: cx("dr-thumbstick", active && "dr-thumbstick--active", className),
		style,
		"aria-label": label,
		onPointerDown: down,
		onPointerMove: move,
		onPointerUp: up,
		onPointerCancel: up,
		onLostPointerCapture: up,
		onContextMenu: (event) => event.preventDefault(),
		...rest,
		children: /* @__PURE__ */ jsxs("div", {
			ref: base,
			className: "dr-thumbstick-base",
			style: origin ? {
				left: origin.x,
				top: origin.y
			} : void 0,
			children: [
				label ? /* @__PURE__ */ jsx("span", {
					className: "dr-thumbstick-label",
					children: label
				}) : null,
				/* @__PURE__ */ jsx("span", { className: cx("dr-thumbstick-guide", `dr-thumbstick-guide--${axes}`) }),
				/* @__PURE__ */ jsx("div", {
					className: "dr-thumbstick-knob",
					style: { transform: `translate(${knob.x}px, ${knob.y}px)` }
				})
			]
		})
	});
}
/** Keyboard keys in rows, lit while held: `rows` = [[{ label: "Q", down: false }, null (a gap), …], …]. */
function KeyPad({ rows = [], className, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-keypad", className),
		...rest,
		children: rows.map((row, index) => /* @__PURE__ */ jsx("div", {
			className: "dr-keypad-row",
			children: row.map((key, column) => /* @__PURE__ */ jsx(KeyCap, { ...key ? {
				key: column,
				...key
			} : {
				key: column,
				label: "",
				empty: true
			} }))
		}, index))
	});
}
/** One key: `label`, `down` lights it; `empty` keeps its place invisible; `wide` for Space / Shift. */
function KeyCap({ label, down = false, empty = false, wide = false, title, className, ...rest }) {
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-keycap", down && "dr-keycap--down", empty && "dr-keycap--empty", wide && "dr-keycap--wide", className),
		title,
		"aria-pressed": empty ? void 0 : down,
		...rest,
		children: label
	});
}
//#endregion
export { Alert, AngleDial, AppProvider, AppShell, AttitudeIndicator, Badge, BottomBar, Breadcrumbs, Button, ButtonGroup, COMPONENT_CSS, CORNERS_KEY, CameraStreams, CameraStreamsProvider, CameraTabs, CameraView, Card, Checkbox, Chip, CodeBlock, ColorSwatch, Column, CommandPalette, ConnectionStatus, ContextMenu, CopyButton, DEFAULT_GRADIENT, DEFAULT_PALETTE, DEFAULT_PERIOD, DEPTH_COLORMAPS, DESKTOP_THEME_URL, DPad, DataSourceProvider, DialogProvider, DimThemeProvider, Embed, EmptyState, ErrorBoundary, Fab, Field, FileDrop, FloatingPanel, GRADIENTS, Heading, HoldButton, Hud, ICONS, IMAGE_OVERLAY_TYPES, Icon, IconButton, ImageView, Joystick, Kbd, KeyCap, KeyHints, KeyPad, KeyValue, KeyValueRow, Label, Link, List, ListRow, LiveValue, LogView, Markdown, MediaFrame, Menu, MenuAt, MenuList, Modal, NavRail, NumberInput, PALETTES, PALETTE_NAMES, Panel, PanelInfo, PlaybackBar, Popover, Progress, ProgressRing, RAMPS, Radio, RadioGroup, RangeSlider, ResizeHandle, Row, SKINS, SKIN_KEY, STICK_DEAD_ZONE, STICK_EXPO, STICK_SMOOTH_MS, SafeHtml, SearchInput, Segmented, Select, Separator, Sidebar, Skeleton, Slider, Spacer, Sparkline, Spinner, SplitPane, Stat, StatusDot, Stepper, StickIndicator, Store, Switch, TOKENS_CSS, Table, Tabs, TagList, Text, TextArea, TextInput, ThumbStick, Tile, TileGrid, Timeline, ToastProvider, ToastViewport, Toggle, Toolbar, Tooltip, TopBar, Tree, UrlStateProvider, VIDEO_PRESETS, VIEW_PANEL_HEAD_PX, ViewPanel, ZenohProvider, applyTheme, applyUrlEvent, bindUrlEvents, cameraInfoFor, cameraStreamsFor, cameraTabs, captureFrame, clampPanelBox, colorizeDepth, copyText, createMemoryWindow, createUrlStore, cx, cyclePhase, decode as decodeLcm, decodeMessage, depthScale, desktopCorners, desktopSkin, dimosKey, dismissToast, drawDetections2D, encode as encodeLcm, formatDuration, fuzzyScore, headerFrameId, heightColor, installInsets, installThemeCss, isDepthTopic, isImageTopic, isPalette, keyMatches, fingerprint as lcmFingerprint, schemas as lcmSchemas, lowLatencyRendering, markdownInline, matchesHotkey, memorySource, needsNewReceiver, normalizeFrame, normalizeOptions, onDesktop, otherPalette, paletteAt, parseKey, parseUrlState, pickCamera, placeFloating, playbackClock, rawToImageData, releaseAllThumbSticks, retargetCameras, sampleGradient, sanitizeHtml, shapeStick, signalReady, smoothToward, startPanelDrag, startPanelResize, stickValue, swapTiles, themeColors, toast, tokenizeLine, urlWith, useBackendEvents, useBackendState, useCameraStream, useCameraStreams, useCommandPalette, useConfirm, useConnectionState, useDataSource, useDrag, useEscape, useGamepad, useHeldKeys, useHotkeys, useLatest, useMediaQuery, useMobile, useNow, usePersistentState, usePrompt, useRepeatWhileHeld, useStore, useSubscription, useTheme, useThemeColors, useToast, useTopic, useTopicList, useUrlParams, useUrlState, useUrlStore, useVideoQuality, useZenoh, videoPreset, videoPresetChanges, watchDesktopTheme, zenohSource };

