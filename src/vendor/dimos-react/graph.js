import { b as ButtonGroup, l as Segmented, y as Button, yt as cx } from "./chunks/nav-D57o5csA.js";
import { a as messageTypeColor, l as useTheme, r as formatRate } from "./chunks/topics-BhpQvSa3.js";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Fragment as Fragment$1, jsx, jsxs } from "react/jsx-runtime";
//#region src/graph/layout.ts
var LAYOUTS = [
	{
		id: "hierarchy",
		label: "Hierarchy"
	},
	{
		id: "vertical",
		label: "Vertical"
	},
	{
		id: "force",
		label: "Force"
	},
	{
		id: "radial",
		label: "Radial"
	},
	{
		id: "circular",
		label: "Circular"
	}
];
var LAYER_GAP = 90;
var NODE_GAP = 22;
var MARGIN = 10;
function layout(id, nodes, edges) {
	if (id === "force") return {
		positions: separate(nodes, force(nodes, edges)),
		routes: /* @__PURE__ */ new Map()
	};
	if (id === "radial") return {
		positions: separate(nodes, radial(nodes, edges)),
		routes: /* @__PURE__ */ new Map()
	};
	if (id === "circular") return {
		positions: separate(nodes, circular(nodes, edges)),
		routes: /* @__PURE__ */ new Map()
	};
	if (id === "vertical") {
		const down = layered(nodes.map((node) => ({
			...node,
			w: node.h,
			h: node.w
		})), edges);
		const flip = (point) => ({
			x: point.y,
			y: point.x
		});
		return {
			positions: new Map([...down.positions].map(([id, point]) => [id, flip(point)])),
			routes: new Map([...down.routes].map(([index, points]) => [index, points.map(flip)])),
			vertical: true
		};
	}
	return layered(nodes, edges);
}
/** Sugiyama-style: break cycles, assign layers, order each layer to cut crossings, then place without overlap. */
function layered(nodes, edges) {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const live = edges.map((edge, index) => ({
		...edge,
		index
	})).filter((edge) => byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to);
	const state = /* @__PURE__ */ new Map();
	const outs = new Map(nodes.map((node) => [node.id, []]));
	for (const edge of live) outs.get(edge.from).push(edge);
	const visit = (id) => {
		state.set(id, 1);
		for (const edge of outs.get(id)) {
			const seen = state.get(edge.to);
			if (seen === 1) edge.reversed = true;
			else if (!seen) visit(edge.to);
		}
		state.set(id, 2);
	};
	for (const node of nodes) if (!state.get(node.id)) visit(node.id);
	const dag = live.map((edge) => edge.reversed ? {
		...edge,
		from: edge.to,
		to: edge.from
	} : edge);
	const layer = new Map(nodes.map((node) => [node.id, 0]));
	const preds = new Map(nodes.map((node) => [node.id, []]));
	const succs = new Map(nodes.map((node) => [node.id, []]));
	for (const edge of dag) {
		preds.get(edge.to).push(edge.from);
		succs.get(edge.from).push(edge.to);
	}
	const indegree = new Map(nodes.map((node) => [node.id, preds.get(node.id).length]));
	const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
	while (queue.length) {
		const id = queue.shift();
		for (const next of succs.get(id)) {
			layer.set(next, Math.max(layer.get(next), layer.get(id) + 1));
			indegree.set(next, indegree.get(next) - 1);
			if (indegree.get(next) === 0) queue.push(next);
		}
	}
	for (const node of nodes) {
		const after = succs.get(node.id);
		if (preds.get(node.id).length === 0 && after.length) layer.set(node.id, Math.max(0, Math.min(...after.map((id) => layer.get(id))) - 1));
	}
	const dims = new Map(nodes.map((node) => [node.id, {
		w: node.w,
		h: node.h
	}]));
	const links = [];
	const chains = /* @__PURE__ */ new Map();
	for (const edge of dag) {
		let from = edge.from;
		const chain = [];
		for (let at = layer.get(edge.from) + 1; at < layer.get(edge.to); at++) {
			const dummy = `\u0000${edge.index}:${at}`;
			layer.set(dummy, at);
			dims.set(dummy, {
				w: 0,
				h: 4
			});
			links.push([from, dummy]);
			chain.push(dummy);
			from = dummy;
		}
		links.push([from, edge.to]);
		chains.set(edge.index, {
			chain,
			reversed: !!edge.reversed
		});
	}
	const count = Math.max(0, ...layer.values()) + 1;
	const layers = Array.from({ length: count }, () => []);
	for (const [id, at] of layer) layers[at].push(id);
	const up = new Map([...layer.keys()].map((id) => [id, []]));
	const down = new Map([...layer.keys()].map((id) => [id, []]));
	for (const [from, to] of links) {
		down.get(from).push(to);
		up.get(to).push(from);
	}
	const position = /* @__PURE__ */ new Map();
	const index = () => layers.forEach((ids) => ids.forEach((id, i) => position.set(id, i)));
	index();
	const crossings = () => {
		let total = 0;
		for (let at = 0; at + 1 < count; at++) {
			const pairs = [];
			for (const id of layers[at]) for (const to of down.get(id)) pairs.push([position.get(id), position.get(to)]);
			for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) total++;
		}
		return total;
	};
	let best = layers.map((ids) => [...ids]);
	let fewest = crossings();
	for (let sweep = 0; sweep < 16 && fewest > 0; sweep++) {
		const downward = sweep % 2 === 0;
		const order = downward ? [...layers.keys()] : [...layers.keys()].reverse();
		for (const at of order) {
			const near = downward ? up : down;
			const centre = (id) => {
				const others = near.get(id);
				return others.length ? others.reduce((sum, other) => sum + position.get(other), 0) / others.length : position.get(id);
			};
			const keyed = layers[at].map((id) => [id, centre(id)]);
			keyed.sort((a, b) => a[1] - b[1]);
			layers[at] = keyed.map(([id]) => id);
			layers[at].forEach((id, i) => position.set(id, i));
		}
		const now = crossings();
		if (now < fewest) {
			fewest = now;
			best = layers.map((ids) => [...ids]);
		}
	}
	best.forEach((ids, at) => layers[at] = ids);
	index();
	const widths = layers.map((ids) => Math.max(0, ...ids.map((id) => dims.get(id).w)));
	const columnX = [];
	let x = 0;
	for (let at = 0; at < count; at++) {
		columnX.push(x + widths[at] / 2);
		x += widths[at] + LAYER_GAP;
	}
	const y = /* @__PURE__ */ new Map();
	for (const ids of layers) {
		let top = 0;
		for (const id of ids) {
			const h = dims.get(id).h;
			y.set(id, top + h / 2);
			top += h + NODE_GAP;
		}
	}
	const bottomOf = (ids) => {
		const last = ids[ids.length - 1];
		return last === void 0 ? 0 : y.get(last) + dims.get(last).h / 2;
	};
	const tallest = Math.max(0, ...layers.map(bottomOf));
	for (const ids of layers) {
		const shift = ids.length ? (tallest - bottomOf(ids)) / 2 : 0;
		ids.forEach((id) => y.set(id, y.get(id) + shift));
	}
	const heights = (ids) => ids.map((id) => dims.get(id).h);
	for (let pass = 0; pass < 24; pass++) {
		const order = pass % 2 === 0 ? [...layers.keys()] : [...layers.keys()].reverse();
		for (const at of order) {
			const ids = layers[at];
			placeInOrder(ids, ids.map((id) => {
				const others = [...up.get(id), ...down.get(id)];
				return others.length ? others.reduce((sum, other) => sum + y.get(other), 0) / others.length : y.get(id);
			}), heights(ids)).forEach((value, i) => y.set(ids[i], value));
		}
	}
	const chainOf = /* @__PURE__ */ new Map();
	for (const { chain } of chains.values()) if (chain.length > 1) chain.forEach((id) => chainOf.set(id, chain));
	const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
	for (let pass = 0; pass < 8; pass++) {
		const track = /* @__PURE__ */ new Map();
		for (const chain of new Set(chainOf.values())) track.set(chain, median(chain.map((id) => y.get(id))));
		for (const ids of layers) placeInOrder(ids, ids.map((id) => chainOf.has(id) ? track.get(chainOf.get(id)) : y.get(id)), heights(ids)).forEach((value, i) => y.set(ids[i], value));
	}
	const positions = /* @__PURE__ */ new Map();
	for (const node of nodes) positions.set(node.id, {
		x: columnX[layer.get(node.id)],
		y: y.get(node.id)
	});
	const routes = /* @__PURE__ */ new Map();
	for (const [edgeIndex, { chain, reversed }] of chains) {
		const points = chain.map((id) => ({
			x: columnX[layer.get(id)],
			y: y.get(id)
		}));
		routes.set(edgeIndex, reversed ? points.reverse() : points);
	}
	return {
		positions,
		routes
	};
}
/** The closest centres to `wanted` that keep `ids` in order, NODE_GAP apart (pool-adjacent-violators). */
function placeInOrder(ids, wanted, heights) {
	const offsets = [0];
	for (let i = 1; i < ids.length; i++) offsets.push(offsets[i - 1] + heights[i - 1] / 2 + NODE_GAP + heights[i] / 2);
	const blocks = [];
	wanted.forEach((value, i) => {
		blocks.push({
			sum: value - offsets[i],
			n: 1
		});
		while (blocks.length > 1) {
			const last = blocks[blocks.length - 1];
			const before = blocks[blocks.length - 2];
			if (before.sum / before.n <= last.sum / last.n) break;
			before.sum += last.sum;
			before.n += last.n;
			blocks.pop();
		}
	});
	const out = [];
	for (const block of blocks) for (let k = 0; k < block.n; k++) out.push(block.sum / block.n + offsets[out.length]);
	return out;
}
function force(nodes, edges) {
	const p = circular(nodes, edges);
	const size = new Map(nodes.map((node) => [node.id, Math.hypot(node.w, node.h) / 2]));
	const ids = nodes.map((node) => node.id);
	const linked = edges.filter((edge) => p.has(edge.from) && p.has(edge.to) && edge.from !== edge.to);
	for (let step = 0, heat = 40; step < 400; step++, heat *= .99) {
		const move = new Map(ids.map((id) => [id, {
			x: 0,
			y: 0
		}]));
		for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
			const a = p.get(ids[i]);
			const b = p.get(ids[j]);
			let dx = a.x - b.x;
			let dy = a.y - b.y;
			const d = Math.hypot(dx, dy) || .01;
			const room = size.get(ids[i]) + size.get(ids[j]) + 10;
			const push = room * room / d / 16;
			dx /= d;
			dy /= d;
			move.get(ids[i]).x += dx * push;
			move.get(ids[i]).y += dy * push;
			move.get(ids[j]).x -= dx * push;
			move.get(ids[j]).y -= dy * push;
		}
		for (const edge of linked) {
			const a = p.get(edge.from);
			const b = p.get(edge.to);
			const d = Math.hypot(a.x - b.x, a.y - b.y) || .01;
			const pull = (d - (size.get(edge.from) + size.get(edge.to) + 16)) * .2;
			const ux = (b.x - a.x) / d;
			const uy = (b.y - a.y) / d;
			move.get(edge.from).x += ux * pull;
			move.get(edge.from).y += uy * pull;
			move.get(edge.to).x -= ux * pull;
			move.get(edge.to).y -= uy * pull;
		}
		for (const id of ids) {
			const m = move.get(id);
			const at = p.get(id);
			m.x -= at.x * .06;
			m.y -= at.y * .06;
			const length = Math.hypot(m.x, m.y);
			const scale = length > heat ? heat / length : 1;
			at.x += m.x * scale;
			at.y += m.y * scale;
		}
	}
	return p;
}
function radial(nodes, edges) {
	const near = new Map(nodes.map((node) => [node.id, /* @__PURE__ */ new Set()]));
	for (const edge of edges) if (near.has(edge.from) && near.has(edge.to) && edge.from !== edge.to) {
		near.get(edge.from).add(edge.to);
		near.get(edge.to).add(edge.from);
	}
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const rings = [];
	const angle = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	const parent = /* @__PURE__ */ new Map();
	const roots = [...nodes].sort((a, b) => near.get(b.id).size - near.get(a.id).size);
	for (const root of roots) {
		if (seen.has(root.id) || near.get(root.id).size === 0) continue;
		seen.add(root.id);
		let ring = [root.id];
		let depth = 0;
		while (ring.length) {
			rings[depth] = [...rings[depth] ?? [], ...ring];
			const next = [];
			for (const id of ring) for (const other of near.get(id)) if (!seen.has(other)) {
				seen.add(other);
				parent.set(other, id);
				next.push(other);
			}
			ring = next;
			depth++;
		}
	}
	const lonely = nodes.filter((node) => !seen.has(node.id)).map((node) => node.id);
	if (lonely.length) rings.push(lonely);
	const p = /* @__PURE__ */ new Map();
	let radius = 0;
	rings.forEach((ids, depth) => {
		const span = (id) => (byId.get(id).w + byId.get(id).h) / 2 + 16;
		const around = ids.reduce((sum, id) => sum + span(id), 0);
		const thickest = Math.max(...ids.map((id) => byId.get(id).h));
		if (depth === 0 && ids.length === 1) {
			p.set(ids[0], {
				x: 0,
				y: 0
			});
			angle.set(ids[0], 0);
			radius = Math.max(byId.get(ids[0]).w, byId.get(ids[0]).h) / 2;
			return;
		}
		radius = Math.max(radius + thickest + 70, around / (2 * Math.PI));
		const parentAngle = (id) => angle.get(parent.get(id) ?? "") ?? 0;
		ids.sort((a, b) => parentAngle(a) - parentAngle(b));
		let walked = 0;
		for (const id of ids) {
			const a = (walked + span(id) / 2) / around * 2 * Math.PI;
			walked += span(id);
			angle.set(id, a);
			p.set(id, {
				x: radius * Math.cos(a),
				y: radius * Math.sin(a)
			});
		}
	});
	return p;
}
function circular(nodes, edges) {
	const { positions } = layered(nodes, edges);
	const order = [...nodes].sort((a, b) => {
		const pa = positions.get(a.id);
		const pb = positions.get(b.id);
		return pa.x - pb.x || pa.y - pb.y;
	});
	const span = (node) => (node.w + node.h) / 2 + 16;
	const around = order.reduce((sum, node) => sum + span(node), 0);
	const radius = Math.max(60, around / (2 * Math.PI));
	const p = /* @__PURE__ */ new Map();
	let walked = 0;
	for (const node of order) {
		const a = (walked + span(node) / 2) / around * 2 * Math.PI - Math.PI / 2;
		walked += span(node);
		p.set(node.id, {
			x: radius * Math.cos(a),
			y: radius * Math.sin(a)
		});
	}
	return p;
}
/** Pushes overlapping boxes apart along their shallower overlap, in place. */
function separate(nodes, positions) {
	for (let pass = 0; pass < 400; pass++) {
		let moved = false;
		for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
			const a = positions.get(nodes[i].id);
			const b = positions.get(nodes[j].id);
			const ox = (nodes[i].w + nodes[j].w) / 2 + MARGIN - Math.abs(a.x - b.x);
			const oy = (nodes[i].h + nodes[j].h) / 2 + MARGIN - Math.abs(a.y - b.y);
			if (ox <= 0 || oy <= 0) continue;
			moved = true;
			if (ox < oy) {
				const s = (a.x < b.x || a.x === b.x && i < j ? -1 : 1) * (ox / 2 + .5);
				a.x += s;
				b.x -= s;
			} else {
				const s = (a.y < b.y || a.y === b.y && i < j ? -1 : 1) * (oy / 2 + .5);
				a.y += s;
				b.y -= s;
			}
		}
		if (!moved) break;
	}
	return positions;
}
function overlaps(nodes, positions) {
	for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
		const a = positions.get(nodes[i].id);
		const b = positions.get(nodes[j].id);
		if (Math.abs(a.x - b.x) < (nodes[i].w + nodes[j].w) / 2 && Math.abs(a.y - b.y) < (nodes[i].h + nodes[j].h) / 2) return true;
	}
	return false;
}
//#endregion
//#region src/graph/paths.ts
function side(node, after, vertical, port) {
	const sign = after ? 1 : -1;
	const reach = (vertical ? node.h : node.w) / 2 + port / 2;
	return vertical ? {
		x: node.x,
		y: node.y + sign * reach
	} : {
		x: node.x + sign * reach,
		y: node.y
	};
}
/** From the right (bottom, when vertical) of `from` to the left (top) of `to`, along the bends a layered layout gave. */
function flowPath(from, to, bends, vertical, port = 0) {
	const uv = (p) => vertical ? {
		u: p.y,
		v: p.x
	} : {
		u: p.x,
		v: p.y
	};
	const xy = (u, v) => vertical ? `${v} ${u}` : `${u} ${v}`;
	const a = uv(side(from, true, vertical, port));
	const b = uv(side(to, false, vertical, port));
	if (!bends.length) {
		const half = Math.max(Math.abs(b.u - a.u) / 2, 30);
		return `M${xy(a.u, a.v)} C${xy(a.u + half, a.v)} ${xy(b.u - half, b.v)} ${xy(b.u, b.v)}`;
	}
	const track = bends.map((p) => uv(p).v).sort((m, n) => m - n)[Math.floor(bends.length / 2)];
	const forward = b.u > a.u;
	const r = Math.max(32, Math.min(110, forward ? Math.abs(b.u - a.u) / 3 : 80));
	let d = `M${xy(a.u, a.v)}`;
	if (forward) {
		d += ` C${xy(a.u + r / 2, a.v)} ${xy(a.u + r / 2, track)} ${xy(a.u + r, track)}`;
		d += ` L${xy(b.u - r, track)}`;
		d += ` C${xy(b.u - r / 2, track)} ${xy(b.u - r / 2, b.v)} ${xy(b.u, b.v)}`;
	} else {
		d += ` C${xy(a.u + r, a.v)} ${xy(a.u + r, track)} ${xy(a.u, track)}`;
		d += ` L${xy(b.u, track)}`;
		d += ` C${xy(b.u - r, track)} ${xy(b.u - r, b.v)} ${xy(b.u, b.v)}`;
	}
	return d;
}
function exit(node, toward) {
	const dx = toward.x - node.x;
	const dy = toward.y - node.y;
	const scale = 1 / Math.max(Math.abs(dx) / (node.w / 2) || 0, Math.abs(dy) / (node.h / 2) || 0, 1e-6);
	return {
		x: node.x + dx * Math.min(scale, 1),
		y: node.y + dy * Math.min(scale, 1)
	};
}
/** A straight line between the two boxes' borders. */
function straightPath(from, to) {
	const a = exit(from, to);
	const b = exit(to, from);
	return `M${a.x} ${a.y} L${b.x} ${b.y}`;
}
var measurer = null;
/** The width `text` takes in a CSS `font`, for sizing boxes before they render. */
function textWidth(text, font) {
	measurer ??= document.createElement("canvas").getContext("2d");
	measurer.font = font;
	return measurer.measureText(text).width;
}
//#endregion
//#region src/graph/graph_view.tsx
var clampScale = (k) => Math.max(.1, Math.min(4, k));
function GraphViewInner(props, ref) {
	const { nodes, edges, layout: layoutId = "hierarchy", renderNode, nodeClassName, nodeTitle, nodeStyle, focusable, edgeClassName, edgeStyle, onNodeClick, onBackgroundClick, onHover, onLayout, port = 0, fitPadding = {
		x: 24,
		top: 52,
		bottom: 60
	}, fitMinScale = { hierarchy: .8 }, gridSize = 22, focus = null } = props;
	const pane = useRef(null);
	const svg = useRef(null);
	const moved = useRef(false);
	const [view, setView] = useState({
		x: 0,
		y: 0,
		k: 1
	});
	const viewRef = useRef(view);
	viewRef.current = view;
	const arrow = `graph-arrow-${useId().replace(/:/g, "")}`;
	const shape = nodes.map((node) => `${node.id}\u0000${node.w}\u0000${node.h}`).join("") + "" + edges.map((edge) => `${edge.from}\u0000${edge.to}`).join("");
	const placement = useMemo(() => layout(layoutId, nodes, edges), [shape, layoutId]);
	const placed = useMemo(() => nodes.map((node) => ({
		...node,
		...placement.positions.get(node.id)
	})), [nodes, placement]);
	const byId = useMemo(() => new Map(placed.map((node) => [node.id, node])), [placed]);
	const fit = useCallback(() => {
		const box = pane.current?.getBoundingClientRect();
		if (!box || !placed.length || box.width < 10 || box.height < 10) return;
		const left = Math.min(...placed.map((n) => n.x - n.w / 2));
		const right = Math.max(...placed.map((n) => n.x + n.w / 2));
		const top = Math.min(...placed.map((n) => n.y - n.h / 2));
		const bottom = Math.max(...placed.map((n) => n.y + n.h / 2));
		const pad = fitPadding;
		const fitHeight = Math.min(1.4, (box.height - pad.top - pad.bottom) / (bottom - top || 1));
		let k = Math.min(fitHeight, (box.width - pad.x * 2) / (right - left || 1));
		const least = fitMinScale[layoutId];
		if (least !== void 0) k = Math.max(k, Math.min(fitHeight, least));
		const spare = box.width - pad.x * 2 - (right - left) * k;
		moved.current = false;
		setView({
			k,
			x: pad.x + Math.max(spare, 0) / 2 - left * k,
			y: pad.top + (box.height - pad.top - pad.bottom - (bottom - top) * k) / 2 - top * k
		});
	}, [placed, layoutId]);
	const zoom = useCallback((factor, cx, cy) => {
		const box = pane.current.getBoundingClientRect();
		const at = viewRef.current;
		const x = cx ?? box.width / 2;
		const y = cy ?? box.height / 2;
		const k = clampScale(at.k * factor);
		moved.current = true;
		setView({
			k,
			x: x - (x - at.x) * k / at.k,
			y: y - (y - at.y) * k / at.k
		});
	}, []);
	const reveal = useCallback((id) => {
		const node = byId.get(id);
		const box = pane.current?.getBoundingClientRect();
		if (!node || !box || box.width < 10) return;
		const from = viewRef.current;
		const { k } = from;
		const margin = {
			x: 40,
			top: 60,
			bottom: 70
		};
		const left = from.x + (node.x - node.w / 2) * k;
		const right = from.x + (node.x + node.w / 2) * k;
		const top = from.y + (node.y - node.h / 2) * k;
		const bottom = from.y + (node.y + node.h / 2) * k;
		if (left >= margin.x && right <= box.width - margin.x && top >= margin.top && bottom <= box.height - margin.bottom) return;
		const to = {
			x: box.width / 2 - node.x * k,
			y: (box.height + margin.top - margin.bottom) / 2 - node.y * k
		};
		const start = performance.now();
		const step = (now) => {
			const t = Math.min((now - start) / 260, 1);
			const ease = 1 - (1 - t) ** 3;
			setView({
				k,
				x: from.x + (to.x - from.x) * ease,
				y: from.y + (to.y - from.y) * ease
			});
			if (t < 1) requestAnimationFrame(step);
		};
		moved.current = true;
		requestAnimationFrame(step);
	}, [byId]);
	useImperativeHandle(ref, () => ({
		zoom,
		fit,
		reveal
	}), [
		zoom,
		fit,
		reveal
	]);
	useLayoutEffect(() => {
		onLayout?.(placement);
		fit();
	}, [placement]);
	useEffect(() => {
		const observer = new ResizeObserver(() => !moved.current && fit());
		observer.observe(pane.current);
		return () => observer.disconnect();
	}, [fit]);
	const handlers = useRef({
		onNodeClick,
		onBackgroundClick,
		onHover
	});
	handlers.current = {
		onNodeClick,
		onBackgroundClick,
		onHover
	};
	const nodeAt = useCallback((target) => {
		const id = (target?.closest?.("[data-graph-node]"))?.getAttribute("data-graph-node");
		return id ? nodes.find((node) => node.id === id) ?? null : null;
	}, [nodes]);
	useEffect(() => {
		const element = svg.current;
		const onWheel = (event) => {
			event.preventDefault();
			const sideways = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
			if (Math.abs(sideways) > Math.abs(event.shiftKey ? 0 : event.deltaY)) {
				moved.current = true;
				setView((at) => ({
					...at,
					x: at.x - sideways
				}));
				return;
			}
			const box = pane.current.getBoundingClientRect();
			zoom(Math.exp(-event.deltaY * .0016), event.clientX - box.left, event.clientY - box.top);
		};
		const touches = /* @__PURE__ */ new Map();
		let drag = null;
		let pinch = null;
		const twoFingers = () => {
			const [a, b] = [...touches.values()];
			const box = pane.current.getBoundingClientRect();
			return {
				gap: Math.hypot(a.x - b.x, a.y - b.y),
				x: (a.x + b.x) / 2 - box.left,
				y: (a.y + b.y) / 2 - box.top
			};
		};
		const onDown = (event) => {
			touches.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			if (touches.size === 2) {
				pinch = {
					...twoFingers(),
					at: viewRef.current
				};
				drag = null;
			} else if (touches.size === 1) drag = {
				x: event.clientX,
				y: event.clientY,
				at: viewRef.current,
				far: false
			};
		};
		const onMove = (event) => {
			if (touches.has(event.pointerId)) touches.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			if (pinch && touches.size === 2) {
				const now = twoFingers();
				const { at } = pinch;
				const k = clampScale(at.k * now.gap / pinch.gap);
				moved.current = true;
				setView({
					k,
					x: now.x - (pinch.x - at.x) * k / at.k,
					y: now.y - (pinch.y - at.y) * k / at.k
				});
				return;
			}
			if (!drag) return;
			const dx = event.clientX - drag.x;
			const dy = event.clientY - drag.y;
			if (!drag.far && Math.hypot(dx, dy) < 4) return;
			drag.far = true;
			element.classList.add("panning");
			moved.current = true;
			setView({
				...drag.at,
				x: drag.at.x + dx,
				y: drag.at.y + dy
			});
		};
		const onCancel = (event) => {
			touches.delete(event.pointerId);
			pinch = null;
			drag = null;
			element.classList.remove("panning");
		};
		const onUp = (event) => {
			touches.delete(event.pointerId);
			if (pinch) {
				pinch = touches.size ? pinch : null;
				return;
			}
			const was = drag;
			drag = null;
			element.classList.remove("panning");
			if (was && !was.far) {
				const node = nodeAt(event.target);
				if (node) handlers.current.onNodeClick?.(node);
				else if (event.target?.closest?.("svg") === element) handlers.current.onBackgroundClick?.();
			}
		};
		element.addEventListener("wheel", onWheel, { passive: false });
		element.addEventListener("pointerdown", onDown);
		addEventListener("pointermove", onMove);
		addEventListener("pointercancel", onCancel);
		addEventListener("pointerup", onUp);
		return () => {
			element.removeEventListener("wheel", onWheel);
			element.removeEventListener("pointerdown", onDown);
			removeEventListener("pointermove", onMove);
			removeEventListener("pointercancel", onCancel);
			removeEventListener("pointerup", onUp);
		};
	}, [zoom, nodeAt]);
	const lit = useMemo(() => {
		const ids = new Set(focus && byId.has(focus) ? [focus] : []);
		for (const edge of ids.size ? edges : []) if (edge.from === focus || edge.to === focus) ids.add(edge.from === focus ? edge.to : edge.from);
		return ids;
	}, [
		edges,
		focus,
		byId
	]);
	const layered = layoutId === "hierarchy" || layoutId === "vertical";
	const drawing = useMemo(() => /* @__PURE__ */ jsxs(Fragment$1, { children: [/* @__PURE__ */ jsx("g", {
		className: "edges",
		children: edges.map((edge, index) => {
			const from = byId.get(edge.from);
			const to = byId.get(edge.to);
			if (!from || !to) return null;
			const d = layered ? flowPath(from, to, placement.routes.get(index) ?? [], !!placement.vertical, port) : straightPath(from, to);
			return /* @__PURE__ */ jsx("path", {
				className: cx("edge", focus && (edge.from === focus || edge.to === focus) && "lit", edgeClassName?.(edge, index)),
				style: edgeStyle?.(edge, index),
				d,
				markerEnd: `url(#${arrow})`
			}, index);
		})
	}), /* @__PURE__ */ jsx("g", {
		className: "nodes",
		children: placed.map((node) => {
			const title = nodeTitle?.(node);
			return /* @__PURE__ */ jsxs("g", {
				className: cx("node", lit.has(node.id) && "lit", nodeClassName?.(node)),
				style: nodeStyle?.(node),
				transform: `translate(${node.x - node.w / 2} ${node.y - node.h / 2})`,
				tabIndex: focusable?.(node) ? 0 : -1,
				"data-graph-node": node.id,
				children: [title && /* @__PURE__ */ jsx("title", { children: title }), renderNode(node)]
			}, node.id);
		})
	})] }), [
		placed,
		edges,
		byId,
		placement,
		layered,
		port,
		arrow,
		renderNode,
		nodeClassName,
		nodeTitle,
		nodeStyle,
		focusable,
		edgeClassName,
		edgeStyle,
		focus,
		lit
	]);
	const grid = gridSize * view.k;
	return /* @__PURE__ */ jsxs("div", {
		ref: pane,
		className: cx("dr-graph", lit.size > 0 && "dr-graph--focus", props.className),
		style: {
			...props.style,
			backgroundSize: `${grid}px ${grid}px`,
			backgroundPosition: `${view.x}px ${view.y}px`
		},
		children: [/* @__PURE__ */ jsxs("svg", {
			ref: svg,
			className: "graph",
			role: "img",
			"aria-label": props["aria-label"] ?? "Graph",
			style: { touchAction: "none" },
			onPointerOver: (event) => handlers.current.onHover?.(nodeAt(event.target)),
			onPointerLeave: () => handlers.current.onHover?.(null),
			onKeyDown: (event) => {
				const node = nodeAt(event.target);
				if (event.key === "Enter" && node && focusable?.(node)) handlers.current.onNodeClick?.(node);
			},
			children: [/* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsx("marker", {
				id: arrow,
				viewBox: "0 0 10 10",
				refX: "9",
				refY: "5",
				markerWidth: "7",
				markerHeight: "7",
				orient: "auto-start-reverse",
				children: /* @__PURE__ */ jsx("path", {
					d: "M0 1 L10 5 L0 9 z",
					fill: "context-stroke"
				})
			}) }), /* @__PURE__ */ jsx("g", {
				transform: `translate(${view.x} ${view.y}) scale(${view.k})`,
				children: drawing
			})]
		}), props.children]
	});
}
/**
* A pannable, zoomable view of a laid-out graph on a dotted grid; a ref gives zoom, fit and reveal. Edges and nodes
* take the classes "edge" / "node" (plus yours); `focus` lights a node's neighbourhood.
*/
var GraphView = forwardRef(GraphViewInner);
//#endregion
//#region src/graph/graph_controls.tsx
/** Zoom in / out / fit and the layout picker, as children of a GraphView. */
function GraphControls({ graph, layout, onLayoutChange }) {
	return /* @__PURE__ */ jsxs(Fragment$1, { children: [/* @__PURE__ */ jsxs(ButtonGroup, {
		className: "dr-graph__zoom",
		children: [
			/* @__PURE__ */ jsx(Button, {
				size: "sm",
				"aria-label": "Zoom in",
				onClick: () => graph.current?.zoom(1.25),
				children: "+"
			}),
			/* @__PURE__ */ jsx(Button, {
				size: "sm",
				"aria-label": "Zoom out",
				onClick: () => graph.current?.zoom(.8),
				children: "−"
			}),
			/* @__PURE__ */ jsx(Button, {
				size: "sm",
				onClick: () => graph.current?.fit(),
				children: "Fit"
			})
		]
	}), /* @__PURE__ */ jsx(Segmented, {
		className: "dr-graph__layouts",
		size: "sm",
		label: "Layout",
		items: LAYOUTS.map(({ id, label }) => ({
			value: id,
			label,
			props: { "data-layout": id }
		})),
		value: layout,
		onChange: onLayoutChange
	})] });
}
//#endregion
//#region src/graph/blueprint_graph.tsx
/** The topic a stream lands on: its pinned topic, else its wired name, else its own name (no leading slash). */
var topicOf = (stream) => (stream.topic ?? stream.wire ?? stream.name).replace(/^\/+/, "");
/** A module's class name (the last part of its dotted path), or its name. */
var moduleClassName = (module) => module.class.split(".").pop() || module.name;
var MODULE_H = 46;
var MODULE_BAR = 4;
var TAG_GAP = 10;
var CHEV_W = 22;
var TOPIC_H = 30;
var PAD_X = 9;
var PORT = 7;
var RATE_RESERVE = "999.9 Hz";
function fontOf(token, fallback) {
	if (typeof document === "undefined") return fallback;
	return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}
var measureText = (text, font) => {
	try {
		return textWidth(text, font);
	} catch {
		const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12);
		return text.length * px * .6;
	}
};
/** Modules become module nodes, each topic a topic node; an edge runs module → topic it writes, topic → module reading it. */
function buildBlueprintGraph(modules, extras = [], measure = measureText) {
	const sans = fontOf("--sans", "sans-serif");
	const mono = fontOf("--mono", "monospace");
	const nodes = [];
	const edges = [];
	const topics = /* @__PURE__ */ new Map();
	const tagW = Math.ceil(measure("MOD", `600 9.5px ${sans}`) * 1.25);
	for (const module of modules) {
		const label = moduleClassName(module);
		const labelW = Math.ceil(measure(label, `600 15px ${sans}`));
		nodes.push({
			id: `m:${module.name}`,
			kind: "module",
			name: module.name,
			label,
			tagW,
			w: 20 + tagW + TAG_GAP + labelW + CHEV_W,
			h: MODULE_H
		});
		for (const stream of module.streams) {
			const topic = topicOf(stream);
			if (!topics.has(topic)) topics.set(topic, {
				type: stream.type,
				extra: false
			});
			if (stream.direction !== "in") edges.push({
				from: `m:${module.name}`,
				to: `t:${topic}`,
				topic
			});
			if (stream.direction !== "out") edges.push({
				from: `t:${topic}`,
				to: `m:${module.name}`,
				topic
			});
		}
	}
	for (const extra of extras) if (!topics.has(extra.topic)) topics.set(extra.topic, {
		type: extra.type,
		extra: true
	});
	const written = new Set(edges.filter((edge) => edge.from.startsWith("m:")).map((edge) => edge.topic));
	const read = new Set(edges.filter((edge) => edge.to.startsWith("m:")).map((edge) => edge.topic));
	for (const [topic, { type, extra }] of topics) {
		const width = Math.max(measure(topic, `500 12px ${mono}`), measure(RATE_RESERVE, `10px ${mono}`));
		nodes.push({
			id: `t:${topic}`,
			kind: "topic",
			topic,
			type,
			extra,
			loose: !(written.has(topic) && read.has(topic)),
			w: Math.ceil(width) + 18,
			h: TOPIC_H
		});
	}
	return {
		nodes,
		edges
	};
}
/** Two fingers over `element` zoom only the graph, never the page (even with Android's "force enable zoom"). */
function useNoPagePinch(element) {
	useEffect(() => {
		if (!element) return;
		const onTouchMove = (event) => {
			if (event.touches.length > 1) event.preventDefault();
		};
		const onGesture = (event) => event.preventDefault();
		element.addEventListener("touchmove", onTouchMove, { passive: false });
		element.addEventListener("gesturestart", onGesture);
		element.addEventListener("gesturechange", onGesture);
		return () => {
			element.removeEventListener("touchmove", onTouchMove);
			element.removeEventListener("gesturestart", onGesture);
			element.removeEventListener("gesturechange", onGesture);
		};
	}, [element]);
}
/**
* Fullscreen for an element: the Fullscreen API where there is one, else (or when it refuses, e.g. in an iframe
* without allow="fullscreen") a full-window overlay the caller styles. Esc leaves either.
*/
function useFullscreen(element) {
	const [mode, setMode] = useState(null);
	useEffect(() => {
		if (typeof document === "undefined") return;
		const onChange = () => {
			setMode((was) => document.fullscreenElement && document.fullscreenElement === element ? "native" : was === "native" ? null : was);
		};
		document.addEventListener("fullscreenchange", onChange);
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, [element]);
	useEffect(() => {
		if (!mode) return;
		const onKey = (event) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
				setMode(null);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [mode]);
	const enter = useCallback(() => {
		if (!element) return;
		if (document.fullscreenEnabled && element.requestFullscreen) element.requestFullscreen().then(() => setMode("native"), () => setMode("overlay"));
		else setMode("overlay");
	}, [element]);
	const exit = useCallback(() => {
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		setMode(null);
	}, []);
	return {
		mode,
		enter,
		exit,
		toggle: useCallback(() => mode ? exit() : enter(), [
			mode,
			enter,
			exit
		])
	};
}
/**
* A blueprint's module graph: modules (a bar, "MOD" and the class name) and the topics between them (tinted by message
* type), pannable and zoomable (drag, wheel, pinch; two fingers never zoom the page), with a fullscreen button. A ref
* gives GraphView's zoom, fit and reveal (a module's id is `m:<name>`, a topic's `t:<topic>`).
*/
var BlueprintGraph = forwardRef(function BlueprintGraph(props, ref) {
	const { modules, extras = [], rates = null, onModule, onTopic, onHover, controls = true, fullscreen = true, empty = "No modules to draw." } = props;
	const [ownLayout, setOwnLayout] = useState("hierarchy");
	const layout = props.layout ?? ownLayout;
	const setLayout = (next) => {
		setOwnLayout(next);
		props.onLayoutChange?.(next);
	};
	const [hovered, setHovered] = useState(null);
	const spot = props.spot !== void 0 ? props.spot : hovered;
	const ownRef = useRef(null);
	const setRefs = useCallback((handle) => {
		ownRef.current = handle;
		if (typeof ref === "function") ref(handle);
		else if (ref) ref.current = handle;
	}, [ref]);
	const [box, setBox] = useState(null);
	useNoPagePinch(box);
	const { mode, toggle } = useFullscreen(box);
	useEffect(() => {
		const timer = setTimeout(() => ownRef.current?.fit(), 60);
		return () => clearTimeout(timer);
	}, [mode]);
	const { skin } = useTheme();
	const shape = JSON.stringify([modules.map((m) => [
		m.name,
		m.class,
		m.streams
	]), extras]);
	const { nodes, edges } = useMemo(() => buildBlueprintGraph(modules, extras), [shape, skin]);
	const types = useMemo(() => new Map(nodes.flatMap((node) => node.kind === "topic" ? [[node.topic, node.type]] : [])), [nodes]);
	const focus = spot && "module" in spot ? `m:${spot.module}` : spot ? `t:${spot.topic}` : null;
	const hz = (topic) => rates?.get(topic) ?? 0;
	return /* @__PURE__ */ jsxs("div", {
		ref: setBox,
		className: cx("dr-bpgraph", mode === "overlay" && "dr-bpgraph--overlay", mode && "dr-bpgraph--fullscreen", props.className),
		style: props.style,
		"data-fullscreen": mode ?? void 0,
		children: [nodes.length === 0 ? /* @__PURE__ */ jsx("div", {
			className: "dr-bpgraph__empty",
			children: empty
		}) : /* @__PURE__ */ jsxs(GraphView, {
			ref: setRefs,
			className: cx("dr-bpgraph__view", rates && "dr-bpgraph__view--running"),
			"aria-label": props["aria-label"] ?? "Module graph",
			nodes,
			edges,
			layout,
			focus,
			port: PORT,
			fitMinScale: props.fitMinScale,
			focusable: (node) => node.kind === "module",
			nodeClassName: (node) => cx(node.kind, node.kind === "topic" && node.extra && "extra", node.kind === "topic" && node.loose && "loose", node.kind === "topic" && hz(node.topic) > 0 && "live"),
			nodeTitle: (node) => node.kind === "module" ? node.name : `/${node.topic}\n${node.type}` + (node.extra ? "\n(not wired in this blueprint)" : "") + (node.loose ? "\n(only written or only read here)" : ""),
			edgeClassName: (edge) => hz(edge.topic) > 0 ? "flow" : void 0,
			nodeStyle: (node) => node.kind === "topic" ? { "--dr-bpgraph-type": messageTypeColor(node.type) } : void 0,
			edgeStyle: (edge) => ({ "--dr-graph-edge": messageTypeColor(types.get(edge.topic)) }),
			onNodeClick: (node) => node.kind === "module" ? onModule?.(node.name) : onTopic?.(node.topic),
			onBackgroundClick: () => onTopic?.(null),
			onHover: (node) => {
				const next = node ? node.kind === "module" ? { module: node.name } : { topic: node.topic } : null;
				setHovered(next);
				onHover?.(next);
			},
			renderNode: (node) => /* @__PURE__ */ jsxs(Fragment$1, { children: [
				/* @__PURE__ */ jsx("rect", {
					className: "box",
					width: node.w,
					height: node.h
				}),
				node.kind === "module" ? /* @__PURE__ */ jsxs(Fragment$1, { children: [
					/* @__PURE__ */ jsx("rect", {
						className: "bar",
						width: MODULE_BAR,
						height: node.h
					}),
					/* @__PURE__ */ jsx("text", {
						x: 20,
						y: node.h / 2,
						className: "tag",
						children: "MOD"
					}),
					/* @__PURE__ */ jsx("text", {
						x: 20 + node.tagW + TAG_GAP,
						y: node.h / 2,
						className: "name",
						children: node.label
					}),
					/* @__PURE__ */ jsx("text", {
						x: node.w - CHEV_W / 2 - 2,
						y: node.h / 2,
						className: "more",
						children: "›"
					})
				] }) : /* @__PURE__ */ jsxs(Fragment$1, { children: [/* @__PURE__ */ jsx("text", {
					x: PAD_X,
					y: hz(node.topic) ? 11 : node.h / 2,
					className: "name",
					children: node.topic
				}), /* @__PURE__ */ jsx("text", {
					x: PAD_X,
					y: 22,
					className: "rate",
					children: hz(node.topic) ? formatRate(hz(node.topic)) : ""
				})] }),
				[0, node.w].map((x) => /* @__PURE__ */ jsx("rect", {
					className: "port",
					x: x - PORT / 2,
					y: node.h / 2 - PORT / 2,
					width: PORT,
					height: PORT
				}, x))
			] }),
			children: [props.children, controls && /* @__PURE__ */ jsx(GraphControls, {
				graph: ownRef,
				layout,
				onLayoutChange: setLayout
			})]
		}), fullscreen && /* @__PURE__ */ jsx(Button, {
			size: "sm",
			className: "dr-bpgraph__fullscreen",
			icon: mode ? "fullscreen-exit" : "fullscreen",
			title: mode ? "Exit fullscreen (Esc)" : "Show the graph fullscreen",
			pressed: !!mode,
			onClick: toggle,
			children: mode ? "Exit fullscreen" : "Fullscreen"
		})]
	});
});
//#endregion
export { BlueprintGraph, GraphControls, GraphView, LAYOUTS, buildBlueprintGraph, flowPath, layered, layout, moduleClassName, overlaps, placeInOrder, separate, straightPath, textWidth, topicOf, useFullscreen, useNoPagePinch };

