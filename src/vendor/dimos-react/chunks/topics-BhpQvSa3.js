import { ct as desktopCorners, dt as installThemeCss, ht as watchDesktopTheme, lt as desktopSkin, mt as themeColors, pt as signalReady, st as applyTheme, ut as installInsets, yt as cx } from "./nav-D57o5csA.js";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region src/theme/provider.tsx
var useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
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
	useIsoLayoutEffect(() => {
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
//#region src/components/topics.tsx
var TYPE_COLORS = {
	Image: "warn",
	CompressedImage: "warn",
	CameraInfo: "warn",
	PointCloud2: "violet",
	LaserScan: "violet",
	OccupancyGrid: "cat-1",
	Path: "cat-1",
	Odometry: "info",
	PoseStamped: "info",
	Twist: "info",
	TFMessage: "ok",
	Bool: "cat-2",
	String: "cat-2"
};
var PACKAGE_COLORS = {
	sensor_msgs: "warn",
	geometry_msgs: "info",
	nav_msgs: "cat-1",
	tf2_msgs: "ok",
	vision_msgs: "violet",
	std_msgs: "cat-2"
};
var PALETTE = [
	"info",
	"warn",
	"cat-1",
	"violet",
	"ok",
	"cat-2",
	"cat-3",
	"cat-4"
];
var FALLBACKS = {
	violet: "var(--info)",
	"cat-1": "var(--primary)",
	"cat-2": "var(--ok)",
	"cat-3": "var(--violet, var(--info))",
	"cat-4": "var(--warn)"
};
/** A message type's short name: `sensor_msgs.Image` → `Image`. */
var messageTypeName = (type) => (type ?? "").split(/[./]/).pop() || "";
/** The theme token a message type is drawn in (by type, else by package, else a stable pick): `info`, `warn`, … */
function messageTypeToken(type) {
	const pkg = (type ?? "").split(/[./]/).find((part) => part.endsWith("_msgs")) ?? "";
	return TYPE_COLORS[messageTypeName(type)] ?? PACKAGE_COLORS[pkg] ?? PALETTE[[...type ?? ""].reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTE.length];
}
/** The CSS color a message type is drawn in: `var(--warn)`, … */
function messageTypeColor(type) {
	const token = messageTypeToken(type);
	return FALLBACKS[token] ? `var(--${token}, ${FALLBACKS[token]})` : `var(--${token})`;
}
/** `12.3 Hz` (`123 Hz` from 100 up). */
var formatRate = (hz) => `${hz >= 100 ? hz.toFixed(0) : hz.toFixed(1)} Hz`;
/** `850 B/s`, `1.2 MB/s`, … */
function formatBandwidth(bytesPerSecond) {
	const units = [
		"B/s",
		"KB/s",
		"MB/s",
		"GB/s"
	];
	let value = bytesPerSecond;
	let unit = 0;
	while (value >= 1e3 && unit < units.length - 1) {
		value /= 1e3;
		unit += 1;
	}
	return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
/** A cell's tint for `value` out of `max` (log scale, cool to hot); none at 0. */
function heatStyle(value, max) {
	if (!(value > 0) || !(max > 0)) return;
	const t = Math.log1p(value) / Math.log1p(max);
	return { background: `color-mix(in srgb, ${`color-mix(in srgb, var(--close-red, var(--danger)) ${Math.round(t * 100)}%, var(--info))`} ${Math.round(22 + 45 * t)}%, transparent)` };
}
/** A table of topics with their rate and bandwidth: each topic in its type's color, hot cells tinted, quiet rows dim. */
function TopicRates({ rows, empty, visibleRows = 6.5, className, style, ...rest }) {
	const top = (key) => Math.max(...rows.map((row) => row[key] ?? 0), 0);
	const [maxHz, maxBps] = [top("hz"), top("bps")];
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-rates", className),
		style: {
			maxHeight: `calc(${visibleRows} * 21px + 2px)`,
			...style
		},
		...rest,
		children: /* @__PURE__ */ jsx("table", { children: /* @__PURE__ */ jsxs("tbody", { children: [rows.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", {
			className: "dr-rates__empty",
			colSpan: 3,
			children: empty ?? "no topics on the bus"
		}) }) : null, rows.map((row) => {
			const type = String(row.type ?? "").replace(/\//g, ".");
			return /* @__PURE__ */ jsxs("tr", {
				className: (row.hz ?? 0) > 0 ? void 0 : "dr-rates--quiet",
				children: [
					/* @__PURE__ */ jsx("td", {
						className: "dr-rates__topic",
						title: `${row.topic}\n${type || "unknown type"}`,
						style: { color: messageTypeColor(type) },
						children: row.topic
					}),
					/* @__PURE__ */ jsxs("td", {
						className: "dr-rates__num",
						style: heatStyle(row.hz ?? 0, maxHz),
						children: [(row.hz ?? 0).toFixed(1), " Hz"]
					}),
					/* @__PURE__ */ jsx("td", {
						className: "dr-rates__num",
						style: heatStyle(row.bps ?? 0, maxBps),
						children: formatBandwidth(row.bps ?? 0)
					})
				]
			}, `${row.topic} ${type}`);
		})] }) })
	});
}
//#endregion
export { messageTypeColor as a, DimThemeProvider as c, heatStyle as i, useTheme as l, formatBandwidth as n, messageTypeName as o, formatRate as r, messageTypeToken as s, TopicRates as t, useThemeColors as u };

