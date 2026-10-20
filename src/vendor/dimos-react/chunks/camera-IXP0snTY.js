import { F as Select, O as IconButton, V as TextInput, W as Icon, Y as useEscape, i as Menu, mt as themeColors, y as Button, yt as cx } from "./nav-D57o5csA.js";
import { Component, createContext, createElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { createPortal } from "react-dom";
//#region src/vendor/dim-app/topic.js
/** `<topic…>` chunks the relay accepts (letters, digits, `-`, `_`, `.`); `*` / `**` allowed for subscribing. */
function checkTopic(topic, { wildcards = false } = {}) {
	const chunk = wildcards ? /^([A-Za-z0-9_.-]+|\*|\*\*)$/ : /^[A-Za-z0-9_.-]+$/;
	if (typeof topic !== "string" || !topic.split("/").every((part) => chunk.test(part))) throw new TypeError(`dim-app: bad topic ${JSON.stringify(topic)} (chunks of letters, digits, - _ .)`);
	return topic;
}
//#endregion
//#region src/vendor/dim-app/zenoh.js
var SHARED = Symbol.for("dim-app.zenoh");
var RETRY_MIN_MS = 500;
var RETRY_MAX_MS = 1e4;
/**
* Desktop's base URL and the app's install name, from a page URL: `<origin><prefix>/apps/<name>/…` → base
* `<origin><prefix>/`, app `<name>`; a page outside /apps/ → base `<origin>/`, app null.
* @param {string} href
* @returns {{ base: string, app: string | null }}
*/
function appBase(href) {
	const url = new URL(href);
	const match = url.pathname.match(/^(.*?)\/apps\/([^/]+)\//);
	if (!match) return {
		base: `${url.origin}/`,
		app: null
	};
	return {
		base: `${url.origin}${match[1]}/`,
		app: decodeURIComponent(match[2])
	};
}
/**
* `options` with `changes` applied as zenoh-gateway's `Subscription.update` applies them: `null` removes an option (back
* to the gateway's default), `encodeOptions` merges.
*/
function updatedOptions(options, changes) {
	const merged = { ...options };
	for (const [name, value] of Object.entries(changes ?? {})) if (name === "encodeOptions" && value !== null) merged.encodeOptions = {
		...options.encodeOptions,
		...value
	};
	else if (value === null) delete merged[name];
	else merged[name] = value;
	return merged;
}
var decoder$1 = new TextDecoder();
/** A sample's payload: JSON (default; a sample that isn't JSON is skipped), "text" or "bytes". */
function parsePayload(message, parse) {
	if (parse === "bytes") return {
		ok: true,
		value: message.bytes
	};
	const text = decoder$1.decode(message.bytes);
	if (parse === "text") return {
		ok: true,
		value: text
	};
	try {
		return {
			ok: true,
			value: JSON.parse(text)
		};
	} catch {
		console.debug(`[dim-app] zenoh: ${message.key} isn't JSON; skipped`);
		return { ok: false };
	}
}
var AppZenoh = class {
	/** @type {any} the discovery answer ({ namespace, desktop, dimos, apps, zenohPrefix?, zenohGatewayUrl, client, up }) */
	info = null;
	/** @type {any} the zenoh-gateway client (ZenohGateway) once connected */
	client = null;
	/** @type {"connecting" | "connected" | "degraded" | "lost"} */
	state = "connecting";
	/** @type {Map<string, { key: (info: any) => string, options: object, callbacks: Set<(message: any) => void>, handle: any }>} */
	#subscriptions = /* @__PURE__ */ new Map();
	#stateListeners = /* @__PURE__ */ new Set();
	#reconnectListeners = /* @__PURE__ */ new Set();
	#wasLost = false;
	#options;
	#closed = false;
	constructor(options = {}) {
		const href = options.href ?? globalThis.location?.href;
		const found = href ? appBase(href) : {
			base: null,
			app: null
		};
		this.#options = options;
		/** Desktop's base URL ("<origin>/"), or null outside a browser with no `href` */
		this.base = options.base ?? found.base;
		/** the app's install name, or null on a page that isn't an app's */
		this.app = options.app ?? found.app;
		/** resolves once connected the first time */
		this.ready = this.#start();
		this.ready.catch(() => {});
	}
	/** `<ns>`, once discovered */
	get namespace() {
		return this.info?.namespace ?? null;
	}
	/** `<ns>/apps/<name>`, once discovered (null on a page that isn't an app's) */
	get prefix() {
		return this.info?.zenohPrefix ?? null;
	}
	async #retry(what, attempt) {
		let delay = RETRY_MIN_MS;
		for (;;) try {
			return await attempt();
		} catch (error) {
			if (this.#closed) throw error;
			console.debug(`[dim-app] zenoh: ${what} failed (${error?.message ?? error}); retrying in ${delay} ms`);
			await new Promise((resolve) => setTimeout(resolve, delay));
			delay = Math.min(delay * 2, RETRY_MAX_MS);
		}
	}
	async #start() {
		const fetchImpl = this.#options.fetch ?? globalThis.fetch;
		const discovery = new URL("api/desktop/zenoh", this.base);
		if (this.app) discovery.searchParams.set("app", this.app);
		this.info = await this.#retry("discovery", async () => {
			const response = await fetchImpl(discovery.href);
			if (!response.ok) throw new Error(`GET ${discovery.pathname}: HTTP ${response.status}`);
			return await response.json();
		});
		const connect = this.#options.connect ?? (await import("./zenoh_gateway-BBDs-j4j.js")).connect;
		const gateway = this.#options.zenohGatewayUrl ?? this.info.zenohGatewayUrl ?? "/zenoh-gateway";
		const url = /^[a-z]+:\/\//i.test(gateway) ? gateway : new URL(gateway.replace(/^\/+/, ""), this.base).href;
		this.client = await this.#retry("connecting to zenoh-gateway", () => connect(url, this.#options.connectOptions ?? {}));
		this.client.onState((state) => this.#setState(state));
		this.#setState(this.client.state ?? "connected");
		for (const entry of this.#subscriptions.values()) this.#open(entry);
		return this;
	}
	#setState(state) {
		if (state === this.state) return;
		this.state = state;
		for (const listener of [...this.#stateListeners]) try {
			listener(state);
		} catch (error) {
			console.error("[dim-app] zenoh: onState listener threw", error);
		}
		if (state === "lost") this.#wasLost = true;
		else if (state === "connected" && this.#wasLost) {
			this.#wasLost = false;
			for (const listener of [...this.#reconnectListeners]) try {
				listener();
			} catch (error) {
				console.error("[dim-app] zenoh: onReconnect listener threw", error);
			}
		}
	}
	#open(entry) {
		const key = entry.key(this.info);
		entry.handle = this.client.subscribe(key, entry.options, (message) => {
			for (const callback of [...entry.callbacks]) try {
				callback(message);
			} catch (error) {
				console.error(`[dim-app] zenoh: subscriber of ${key} threw`, error);
			}
		});
	}
	/**
	* A raw subscription on the shared connection: `callback(message)` with zenoh-gateway's `{ key, bytes, timestamp, … }`.
	* `key` is a key expression, or a function of the discovery answer (for keys under `<ns>`). Subscriptions to the
	* same key with the same options share one zenoh-gateway channel.
	*
	* The returned function unsubscribes; it also has `.unsubscribe()` and `.update(changes)`, which changes the running
	* channel's options in place (zenoh-gateway's `Subscription.update`: maxHz, minQuality, qualityToHzTradeoff,
	* bandwidthPriority, maxBitrate, minResolutionScale, maxResolution, playoutDelay, encodeOptions.quality; `null` puts
	* one back to its default; the gateway refuses anything else). A channel shared with other subscribers isn't
	* changed under them: this subscriber moves to a channel with the new options instead.
	* @returns {(() => void) & { unsubscribe(): void, update(changes: object): Promise<void> }}
	*/
	subscribe(key, options, callback) {
		const keyOf = typeof key === "function" ? key : () => key;
		const id = typeof key === "function" ? `${key.dimAppKey ?? key}` : key;
		const entryIdOf = (options) => `${id}\u0000${JSON.stringify(options ?? {})}`;
		const join = (options) => {
			const entryId = entryIdOf(options);
			let entry = this.#subscriptions.get(entryId);
			if (!entry) {
				entry = {
					id: entryId,
					key: keyOf,
					options: options ?? {},
					callbacks: /* @__PURE__ */ new Set(),
					handle: null
				};
				this.#subscriptions.set(entryId, entry);
				if (this.client) this.#open(entry);
			}
			entry.callbacks.add(own);
			return entry;
		};
		const leave = (entry) => {
			entry.callbacks.delete(own);
			if (entry.callbacks.size === 0 && this.#subscriptions.get(entry.id) === entry) {
				this.#subscriptions.delete(entry.id);
				entry.handle?.close();
			}
		};
		const own = (message) => callback(message);
		let entry = join(options);
		let closed = false;
		const unsubscribe = () => {
			closed = true;
			leave(entry);
		};
		unsubscribe.unsubscribe = unsubscribe;
		unsubscribe.update = async (changes) => {
			if (closed) throw new Error(`[dim-app] zenoh: update on a closed subscription to ${id}`);
			const next = updatedOptions(entry.options, changes);
			const nextId = entryIdOf(next);
			if (nextId === entry.id) return;
			if (entry.callbacks.size > 1 || this.#subscriptions.has(nextId)) {
				const from = entry;
				entry = join(next);
				leave(from);
				return;
			}
			const rekey = (target, id, options) => {
				this.#subscriptions.delete(target.id);
				Object.assign(target, {
					id,
					options
				});
				this.#subscriptions.set(id, target);
			};
			const [target, previousId, previousOptions] = [
				entry,
				entry.id,
				entry.options
			];
			rekey(target, nextId, next);
			try {
				await target.handle?.update(changes);
			} catch (error) {
				if (target.id === nextId && !this.#subscriptions.has(previousId)) rekey(target, previousId, previousOptions);
				throw error;
			}
		};
		return unsubscribe;
	}
	#subscribeUnder(describe, keyOf, callback, { parse = "json", delivery = "reliable", ...rest } = {}) {
		keyOf.dimAppKey = describe;
		return this.subscribe(keyOf, {
			delivery,
			...rest
		}, (message) => {
			const payload = parsePayload(message, parse);
			if (payload.ok) callback(payload.value, message);
		});
	}
	/**
	* This app's frontend topic `<ns>/apps/<name>/frontend/<topic>` (`*`, `**` allowed): `callback(payload, message)`,
	* payload parsed as JSON by default (`parse: "text" | "bytes"` otherwise). Reliable delivery by default; pass
	* `delivery: "latest"` for state that replaces itself (frames, poses).
	* @returns {() => void} unsubscribe
	*/
	subscribeFrontend(topic, callback, options = {}) {
		checkTopic(topic, { wildcards: true });
		if (!this.app && !this.#options.app) console.warn("[dim-app] zenoh: subscribeFrontend on a page that isn't under /apps/<name>/; pass getZenoh({ app })");
		return this.#subscribeUnder(`frontend:${topic}`, (info) => `${info.zenohPrefix ?? `${info.apps}/${this.app}`}/frontend/${topic}`, callback, options);
	}
	/** Desktop's events `<ns>/desktop/events/<type>` ("*" = every type): `callback(event)`. */
	subscribeDesktop(type, callback, options = {}) {
		const chunk = type === "*" ? "**" : checkTopic(type);
		return this.#subscribeUnder(`desktop:${chunk}`, (info) => `${info.desktop ?? `${info.namespace}/desktop`}/events/${chunk}`, callback, options);
	}
	/** The dimos server's events `<ns>/dimos/events/<type>` ("*" = every type): `callback(event)`. */
	subscribeDimos(type, callback, options = {}) {
		const chunk = type === "*" ? "**" : checkTopic(type);
		return this.#subscribeUnder(`dimos:${chunk}`, (info) => `${info.dimos ?? `${info.namespace}/dimos`}/events/${chunk}`, callback, options);
	}
	/** A Desktop job's output `<ns>/desktop/jobs/<jobId>`: `{type:"line", n, line}` … `{type:"done", ok, error, lines}`. */
	subscribeJob(jobId, callback, options = {}) {
		checkTopic(String(jobId));
		return this.#subscribeUnder(`job:${jobId}`, (info) => `${info.desktop ?? `${info.namespace}/desktop`}/jobs/${jobId}`, callback, options);
	}
	/**
	* zenoh-gateway ≥ 0.5.16's lease, once connected: while held, only this page publishes on `publish` and subscribes to
	* `subscribe` among the gateway's pages; other pages' subscriptions there end ("rejected") and are refused. Take it
	* before subscribing to those keys. `allowTakeover: true` lets a newer page take it, `onLost(reason)` then gets
	* "takenOver". Needs `connectOptions: { heartbeatHz, heartbeatMisses }` (misses / hz ≤ 60 s); leases end on
	* disconnect and are not re-taken after a reconnect.
	* @param {{ group?: string, publish?: string[], subscribe?: string[], allowTakeover?: boolean, maxSeconds?: number,
	*   timeoutMs?: number, onLost?: (reason: string) => void }} options
	*/
	async lease(options) {
		await this.ready;
		return await this.client.lease(options);
	}
	/** `listener(state)` on every connection state change ("connecting" | "connected" | "degraded" | "lost"). */
	onState(listener) {
		this.#stateListeners.add(listener);
		return () => this.#stateListeners.delete(listener);
	}
	/** `listener()` when the connection is back after being lost: re-GET what you show (snapshot + live). */
	onReconnect(listener) {
		this.#reconnectListeners.add(listener);
		return () => this.#reconnectListeners.delete(listener);
	}
	/** Close the connection (tests; a page never needs to). The next getZenoh() makes a new one. */
	close() {
		this.#closed = true;
		for (const entry of this.#subscriptions.values()) entry.handle?.close();
		this.#subscriptions.clear();
		this.client?.close?.();
		if (globalThis[SHARED] === this) delete globalThis[SHARED];
	}
};
/**
* The page's one zenoh-gateway connection (created on the first call; later calls' options are ignored).
* @param {{ app?: string, href?: string, base?: string, connect?: (url: string, options: object) => Promise<any>,
*   connectOptions?: object, zenohGatewayUrl?: string, fetch?: typeof fetch }} [options]
*   `app`: the install name (default: from /apps/<name>/ in the URL); `connect`: a zenoh-gateway client's connect
*   (default: the vendored vendor/zenoh-gateway/zenoh_gateway.js); `connectOptions`: passed to it (e.g. `{ heartbeatHz: 10 }` for deadman publishers)
* @returns {AppZenoh}
*/
function getZenoh(options = {}) {
	globalThis[SHARED] ??= new AppZenoh(options);
	return globalThis[SHARED];
}
//#endregion
//#region src/lcm.ts
/** The dimos_lcm schemas: type name (e.g. "nav_msgs.Odometry") → its fields in wire order. */
var schemas = {
	"actionlib_msgs.GoalID": [{
		"name": "stamp",
		"type": "std_msgs.Time",
		"dims": []
	}, {
		"name": "id",
		"type": "string",
		"dims": []
	}],
	"actionlib_msgs.GoalStatus": [
		{
			"name": "goal_id",
			"type": "actionlib_msgs.GoalID",
			"dims": []
		},
		{
			"name": "status",
			"type": "byte",
			"dims": []
		},
		{
			"name": "text",
			"type": "string",
			"dims": []
		}
	],
	"actionlib_msgs.GoalStatusArray": [
		{
			"name": "status_list_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "status_list",
			"type": "actionlib_msgs.GoalStatus",
			"dims": ["status_list_length"]
		}
	],
	"builtin_interfaces.Duration": [{
		"name": "sec",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "nanosec",
		"type": "int32_t",
		"dims": []
	}],
	"builtin_interfaces.Time": [{
		"name": "sec",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "nanosec",
		"type": "int32_t",
		"dims": []
	}],
	"diagnostic_msgs.DiagnosticArray": [
		{
			"name": "status_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "status",
			"type": "diagnostic_msgs.DiagnosticStatus",
			"dims": ["status_length"]
		}
	],
	"diagnostic_msgs.DiagnosticStatus": [
		{
			"name": "values_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "level",
			"type": "int8_t",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "message",
			"type": "string",
			"dims": []
		},
		{
			"name": "hardware_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "values",
			"type": "diagnostic_msgs.KeyValue",
			"dims": ["values_length"]
		}
	],
	"diagnostic_msgs.KeyValue": [{
		"name": "key",
		"type": "string",
		"dims": []
	}, {
		"name": "value",
		"type": "string",
		"dims": []
	}],
	"foxglove_msgs.ArrowPrimitive": [
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "shaft_length",
			"type": "double",
			"dims": []
		},
		{
			"name": "shaft_diameter",
			"type": "double",
			"dims": []
		},
		{
			"name": "head_length",
			"type": "double",
			"dims": []
		},
		{
			"name": "head_diameter",
			"type": "double",
			"dims": []
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		}
	],
	"foxglove_msgs.CameraCalibration": [
		{
			"name": "d_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "distortion_model",
			"type": "string",
			"dims": []
		},
		{
			"name": "d",
			"type": "double",
			"dims": ["d_length"]
		},
		{
			"name": "k",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "r",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "p",
			"type": "double",
			"dims": [12]
		}
	],
	"foxglove_msgs.CircleAnnotation": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "position",
			"type": "foxglove_msgs.Point2",
			"dims": []
		},
		{
			"name": "diameter",
			"type": "double",
			"dims": []
		},
		{
			"name": "thickness",
			"type": "double",
			"dims": []
		},
		{
			"name": "fill_color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "outline_color",
			"type": "foxglove_msgs.Color",
			"dims": []
		}
	],
	"foxglove_msgs.Color": [
		{
			"name": "r",
			"type": "double",
			"dims": []
		},
		{
			"name": "g",
			"type": "double",
			"dims": []
		},
		{
			"name": "b",
			"type": "double",
			"dims": []
		},
		{
			"name": "a",
			"type": "double",
			"dims": []
		}
	],
	"foxglove_msgs.CompressedImage": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		},
		{
			"name": "format",
			"type": "string",
			"dims": []
		}
	],
	"foxglove_msgs.CompressedVideo": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		},
		{
			"name": "format",
			"type": "string",
			"dims": []
		}
	],
	"foxglove_msgs.CubePrimitive": [
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "size",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		}
	],
	"foxglove_msgs.CylinderPrimitive": [
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "size",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "bottom_scale",
			"type": "double",
			"dims": []
		},
		{
			"name": "top_scale",
			"type": "double",
			"dims": []
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		}
	],
	"foxglove_msgs.FrameTransform": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "parent_frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "child_frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "translation",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "rotation",
			"type": "geometry_msgs.Quaternion",
			"dims": []
		}
	],
	"foxglove_msgs.FrameTransforms": [{
		"name": "transforms_length",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "transforms",
		"type": "foxglove_msgs.FrameTransform",
		"dims": ["transforms_length"]
	}],
	"foxglove_msgs.GeoJSON": [{
		"name": "geojson",
		"type": "string",
		"dims": []
	}],
	"foxglove_msgs.Grid": [
		{
			"name": "fields_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "column_count",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "cell_size",
			"type": "foxglove_msgs.Vector2",
			"dims": []
		},
		{
			"name": "row_stride",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "cell_stride",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "fields",
			"type": "foxglove_msgs.PackedElementField",
			"dims": ["fields_length"]
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"foxglove_msgs.ImageAnnotations": [
		{
			"name": "circles_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "texts_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "circles",
			"type": "foxglove_msgs.CircleAnnotation",
			"dims": ["circles_length"]
		},
		{
			"name": "points",
			"type": "foxglove_msgs.PointsAnnotation",
			"dims": ["points_length"]
		},
		{
			"name": "texts",
			"type": "foxglove_msgs.TextAnnotation",
			"dims": ["texts_length"]
		}
	],
	"foxglove_msgs.KeyValuePair": [{
		"name": "key",
		"type": "string",
		"dims": []
	}, {
		"name": "value",
		"type": "string",
		"dims": []
	}],
	"foxglove_msgs.LaserScan": [
		{
			"name": "ranges_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "intensities_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "start_angle",
			"type": "double",
			"dims": []
		},
		{
			"name": "end_angle",
			"type": "double",
			"dims": []
		},
		{
			"name": "ranges",
			"type": "double",
			"dims": ["ranges_length"]
		},
		{
			"name": "intensities",
			"type": "double",
			"dims": ["intensities_length"]
		}
	],
	"foxglove_msgs.LinePrimitive": [
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "colors_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "indices_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "thickness",
			"type": "double",
			"dims": []
		},
		{
			"name": "scale_invariant",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "points",
			"type": "geometry_msgs.Point",
			"dims": ["points_length"]
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "colors",
			"type": "foxglove_msgs.Color",
			"dims": ["colors_length"]
		},
		{
			"name": "indices",
			"type": "int32_t",
			"dims": ["indices_length"]
		}
	],
	"foxglove_msgs.LocationFix": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "latitude",
			"type": "double",
			"dims": []
		},
		{
			"name": "longitude",
			"type": "double",
			"dims": []
		},
		{
			"name": "altitude",
			"type": "double",
			"dims": []
		},
		{
			"name": "position_covariance",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "position_covariance_type",
			"type": "byte",
			"dims": []
		}
	],
	"foxglove_msgs.Log": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "level",
			"type": "byte",
			"dims": []
		},
		{
			"name": "message",
			"type": "string",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "file",
			"type": "string",
			"dims": []
		},
		{
			"name": "line",
			"type": "int32_t",
			"dims": []
		}
	],
	"foxglove_msgs.ModelPrimitive": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "scale",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "override_color",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "url",
			"type": "string",
			"dims": []
		},
		{
			"name": "media_type",
			"type": "string",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"foxglove_msgs.PackedElementField": [
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "offset",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "type",
			"type": "byte",
			"dims": []
		}
	],
	"foxglove_msgs.Point2": [{
		"name": "x",
		"type": "double",
		"dims": []
	}, {
		"name": "y",
		"type": "double",
		"dims": []
	}],
	"foxglove_msgs.PointCloud": [
		{
			"name": "fields_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "point_stride",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "fields",
			"type": "foxglove_msgs.PackedElementField",
			"dims": ["fields_length"]
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"foxglove_msgs.PointsAnnotation": [
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "outline_colors_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "points",
			"type": "foxglove_msgs.Point2",
			"dims": ["points_length"]
		},
		{
			"name": "outline_color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "outline_colors",
			"type": "foxglove_msgs.Color",
			"dims": ["outline_colors_length"]
		},
		{
			"name": "fill_color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "thickness",
			"type": "double",
			"dims": []
		}
	],
	"foxglove_msgs.PoseInFrame": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		}
	],
	"foxglove_msgs.PosesInFrame": [
		{
			"name": "poses_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "poses",
			"type": "geometry_msgs.Pose",
			"dims": ["poses_length"]
		}
	],
	"foxglove_msgs.RawAudio": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		},
		{
			"name": "format",
			"type": "string",
			"dims": []
		},
		{
			"name": "sample_rate",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "number_of_channels",
			"type": "int32_t",
			"dims": []
		}
	],
	"foxglove_msgs.RawImage": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "encoding",
			"type": "string",
			"dims": []
		},
		{
			"name": "step",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"foxglove_msgs.SceneEntity": [
		{
			"name": "metadata_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "arrows_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "cubes_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "spheres_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "cylinders_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "lines_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "triangles_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "texts_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "models_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "id",
			"type": "string",
			"dims": []
		},
		{
			"name": "lifetime",
			"type": "builtin_interfaces.Duration",
			"dims": []
		},
		{
			"name": "frame_locked",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "metadata",
			"type": "foxglove_msgs.KeyValuePair",
			"dims": ["metadata_length"]
		},
		{
			"name": "arrows",
			"type": "foxglove_msgs.ArrowPrimitive",
			"dims": ["arrows_length"]
		},
		{
			"name": "cubes",
			"type": "foxglove_msgs.CubePrimitive",
			"dims": ["cubes_length"]
		},
		{
			"name": "spheres",
			"type": "foxglove_msgs.SpherePrimitive",
			"dims": ["spheres_length"]
		},
		{
			"name": "cylinders",
			"type": "foxglove_msgs.CylinderPrimitive",
			"dims": ["cylinders_length"]
		},
		{
			"name": "lines",
			"type": "foxglove_msgs.LinePrimitive",
			"dims": ["lines_length"]
		},
		{
			"name": "triangles",
			"type": "foxglove_msgs.TriangleListPrimitive",
			"dims": ["triangles_length"]
		},
		{
			"name": "texts",
			"type": "foxglove_msgs.TextPrimitive",
			"dims": ["texts_length"]
		},
		{
			"name": "models",
			"type": "foxglove_msgs.ModelPrimitive",
			"dims": ["models_length"]
		}
	],
	"foxglove_msgs.SceneEntityDeletion": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "id",
			"type": "string",
			"dims": []
		}
	],
	"foxglove_msgs.SceneUpdate": [
		{
			"name": "deletions_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "entities_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "deletions",
			"type": "foxglove_msgs.SceneEntityDeletion",
			"dims": ["deletions_length"]
		},
		{
			"name": "entities",
			"type": "foxglove_msgs.SceneEntity",
			"dims": ["entities_length"]
		}
	],
	"foxglove_msgs.SpherePrimitive": [
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "size",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		}
	],
	"foxglove_msgs.TextAnnotation": [
		{
			"name": "timestamp",
			"type": "builtin_interfaces.Time",
			"dims": []
		},
		{
			"name": "position",
			"type": "foxglove_msgs.Point2",
			"dims": []
		},
		{
			"name": "text",
			"type": "string",
			"dims": []
		},
		{
			"name": "font_size",
			"type": "double",
			"dims": []
		},
		{
			"name": "text_color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "background_color",
			"type": "foxglove_msgs.Color",
			"dims": []
		}
	],
	"foxglove_msgs.TextPrimitive": [
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "billboard",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "font_size",
			"type": "double",
			"dims": []
		},
		{
			"name": "scale_invariant",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "text",
			"type": "string",
			"dims": []
		}
	],
	"foxglove_msgs.TriangleListPrimitive": [
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "colors_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "indices_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "points",
			"type": "geometry_msgs.Point",
			"dims": ["points_length"]
		},
		{
			"name": "color",
			"type": "foxglove_msgs.Color",
			"dims": []
		},
		{
			"name": "colors",
			"type": "foxglove_msgs.Color",
			"dims": ["colors_length"]
		},
		{
			"name": "indices",
			"type": "int32_t",
			"dims": ["indices_length"]
		}
	],
	"foxglove_msgs.Vector2": [{
		"name": "x",
		"type": "double",
		"dims": []
	}, {
		"name": "y",
		"type": "double",
		"dims": []
	}],
	"geometry_msgs.Accel": [{
		"name": "linear",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}, {
		"name": "angular",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}],
	"geometry_msgs.AccelStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "accel",
		"type": "geometry_msgs.Accel",
		"dims": []
	}],
	"geometry_msgs.AccelWithCovariance": [{
		"name": "accel",
		"type": "geometry_msgs.Accel",
		"dims": []
	}, {
		"name": "covariance",
		"type": "double",
		"dims": [36]
	}],
	"geometry_msgs.AccelWithCovarianceStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "accel",
		"type": "geometry_msgs.AccelWithCovariance",
		"dims": []
	}],
	"geometry_msgs.Inertia": [
		{
			"name": "m",
			"type": "double",
			"dims": []
		},
		{
			"name": "com",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "ixx",
			"type": "double",
			"dims": []
		},
		{
			"name": "ixy",
			"type": "double",
			"dims": []
		},
		{
			"name": "ixz",
			"type": "double",
			"dims": []
		},
		{
			"name": "iyy",
			"type": "double",
			"dims": []
		},
		{
			"name": "iyz",
			"type": "double",
			"dims": []
		},
		{
			"name": "izz",
			"type": "double",
			"dims": []
		}
	],
	"geometry_msgs.InertiaStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "inertia",
		"type": "geometry_msgs.Inertia",
		"dims": []
	}],
	"geometry_msgs.Point": [
		{
			"name": "x",
			"type": "double",
			"dims": []
		},
		{
			"name": "y",
			"type": "double",
			"dims": []
		},
		{
			"name": "z",
			"type": "double",
			"dims": []
		}
	],
	"geometry_msgs.Point32": [
		{
			"name": "x",
			"type": "float",
			"dims": []
		},
		{
			"name": "y",
			"type": "float",
			"dims": []
		},
		{
			"name": "z",
			"type": "float",
			"dims": []
		}
	],
	"geometry_msgs.PointStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "point",
		"type": "geometry_msgs.Point",
		"dims": []
	}],
	"geometry_msgs.Polygon": [{
		"name": "points_length",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "points",
		"type": "geometry_msgs.Point32",
		"dims": ["points_length"]
	}],
	"geometry_msgs.PolygonStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "polygon",
		"type": "geometry_msgs.Polygon",
		"dims": []
	}],
	"geometry_msgs.Pose": [{
		"name": "position",
		"type": "geometry_msgs.Point",
		"dims": []
	}, {
		"name": "orientation",
		"type": "geometry_msgs.Quaternion",
		"dims": []
	}],
	"geometry_msgs.Pose2D": [
		{
			"name": "x",
			"type": "double",
			"dims": []
		},
		{
			"name": "y",
			"type": "double",
			"dims": []
		},
		{
			"name": "theta",
			"type": "double",
			"dims": []
		}
	],
	"geometry_msgs.PoseArray": [
		{
			"name": "poses_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "poses",
			"type": "geometry_msgs.Pose",
			"dims": ["poses_length"]
		}
	],
	"geometry_msgs.PoseStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "pose",
		"type": "geometry_msgs.Pose",
		"dims": []
	}],
	"geometry_msgs.PoseWithCovariance": [{
		"name": "pose",
		"type": "geometry_msgs.Pose",
		"dims": []
	}, {
		"name": "covariance",
		"type": "double",
		"dims": [36]
	}],
	"geometry_msgs.PoseWithCovarianceStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "pose",
		"type": "geometry_msgs.PoseWithCovariance",
		"dims": []
	}],
	"geometry_msgs.Quaternion": [
		{
			"name": "x",
			"type": "double",
			"dims": []
		},
		{
			"name": "y",
			"type": "double",
			"dims": []
		},
		{
			"name": "z",
			"type": "double",
			"dims": []
		},
		{
			"name": "w",
			"type": "double",
			"dims": []
		}
	],
	"geometry_msgs.QuaternionStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "quaternion",
		"type": "geometry_msgs.Quaternion",
		"dims": []
	}],
	"geometry_msgs.Transform": [{
		"name": "translation",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}, {
		"name": "rotation",
		"type": "geometry_msgs.Quaternion",
		"dims": []
	}],
	"geometry_msgs.TransformStamped": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "child_frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "transform",
			"type": "geometry_msgs.Transform",
			"dims": []
		}
	],
	"geometry_msgs.Twist": [{
		"name": "linear",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}, {
		"name": "angular",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}],
	"geometry_msgs.TwistStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "twist",
		"type": "geometry_msgs.Twist",
		"dims": []
	}],
	"geometry_msgs.TwistWithCovariance": [{
		"name": "twist",
		"type": "geometry_msgs.Twist",
		"dims": []
	}, {
		"name": "covariance",
		"type": "double",
		"dims": [36]
	}],
	"geometry_msgs.TwistWithCovarianceStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "twist",
		"type": "geometry_msgs.TwistWithCovariance",
		"dims": []
	}],
	"geometry_msgs.Vector3": [
		{
			"name": "x",
			"type": "double",
			"dims": []
		},
		{
			"name": "y",
			"type": "double",
			"dims": []
		},
		{
			"name": "z",
			"type": "double",
			"dims": []
		}
	],
	"geometry_msgs.Vector3Stamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "vector",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}],
	"geometry_msgs.Wrench": [{
		"name": "force",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}, {
		"name": "torque",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}],
	"geometry_msgs.WrenchStamped": [{
		"name": "header",
		"type": "std_msgs.Header",
		"dims": []
	}, {
		"name": "wrench",
		"type": "geometry_msgs.Wrench",
		"dims": []
	}],
	"nav_msgs.GridCells": [
		{
			"name": "cells_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "cell_width",
			"type": "float",
			"dims": []
		},
		{
			"name": "cell_height",
			"type": "float",
			"dims": []
		},
		{
			"name": "cells",
			"type": "geometry_msgs.Point",
			"dims": ["cells_length"]
		}
	],
	"nav_msgs.MapMetaData": [
		{
			"name": "map_load_time",
			"type": "std_msgs.Time",
			"dims": []
		},
		{
			"name": "resolution",
			"type": "float",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "origin",
			"type": "geometry_msgs.Pose",
			"dims": []
		}
	],
	"nav_msgs.OccupancyGrid": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "info",
			"type": "nav_msgs.MapMetaData",
			"dims": []
		},
		{
			"name": "data",
			"type": "int8_t",
			"dims": ["data_length"]
		}
	],
	"nav_msgs.Odometry": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "child_frame_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.PoseWithCovariance",
			"dims": []
		},
		{
			"name": "twist",
			"type": "geometry_msgs.TwistWithCovariance",
			"dims": []
		}
	],
	"nav_msgs.Path": [
		{
			"name": "poses_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "poses",
			"type": "geometry_msgs.PoseStamped",
			"dims": ["poses_length"]
		}
	],
	"sensor_msgs.BatteryState": [
		{
			"name": "cell_voltage_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "cell_temperature_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "voltage",
			"type": "float",
			"dims": []
		},
		{
			"name": "temperature",
			"type": "float",
			"dims": []
		},
		{
			"name": "current",
			"type": "float",
			"dims": []
		},
		{
			"name": "charge",
			"type": "float",
			"dims": []
		},
		{
			"name": "capacity",
			"type": "float",
			"dims": []
		},
		{
			"name": "design_capacity",
			"type": "float",
			"dims": []
		},
		{
			"name": "percentage",
			"type": "float",
			"dims": []
		},
		{
			"name": "power_supply_status",
			"type": "byte",
			"dims": []
		},
		{
			"name": "power_supply_health",
			"type": "byte",
			"dims": []
		},
		{
			"name": "power_supply_technology",
			"type": "byte",
			"dims": []
		},
		{
			"name": "present",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "cell_voltage",
			"type": "float",
			"dims": ["cell_voltage_length"]
		},
		{
			"name": "cell_temperature",
			"type": "float",
			"dims": ["cell_temperature_length"]
		},
		{
			"name": "location",
			"type": "string",
			"dims": []
		},
		{
			"name": "serial_number",
			"type": "string",
			"dims": []
		}
	],
	"sensor_msgs.CameraInfo": [
		{
			"name": "D_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "distortion_model",
			"type": "string",
			"dims": []
		},
		{
			"name": "D",
			"type": "double",
			"dims": ["D_length"]
		},
		{
			"name": "K",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "R",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "P",
			"type": "double",
			"dims": [12]
		},
		{
			"name": "binning_x",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "binning_y",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "roi",
			"type": "sensor_msgs.RegionOfInterest",
			"dims": []
		}
	],
	"sensor_msgs.ChannelFloat32": [
		{
			"name": "values_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "values",
			"type": "float",
			"dims": ["values_length"]
		}
	],
	"sensor_msgs.CompressedImage": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "format",
			"type": "string",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"sensor_msgs.FluidPressure": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "fluid_pressure",
			"type": "double",
			"dims": []
		},
		{
			"name": "variance",
			"type": "double",
			"dims": []
		}
	],
	"sensor_msgs.Illuminance": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "illuminance",
			"type": "double",
			"dims": []
		},
		{
			"name": "variance",
			"type": "double",
			"dims": []
		}
	],
	"sensor_msgs.Image": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "encoding",
			"type": "string",
			"dims": []
		},
		{
			"name": "is_bigendian",
			"type": "byte",
			"dims": []
		},
		{
			"name": "step",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"sensor_msgs.Imu": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "orientation",
			"type": "geometry_msgs.Quaternion",
			"dims": []
		},
		{
			"name": "orientation_covariance",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "angular_velocity",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "angular_velocity_covariance",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "linear_acceleration",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "linear_acceleration_covariance",
			"type": "double",
			"dims": [9]
		}
	],
	"sensor_msgs.JointState": [
		{
			"name": "name_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "position_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "velocity_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "effort_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": ["name_length"]
		},
		{
			"name": "position",
			"type": "double",
			"dims": ["position_length"]
		},
		{
			"name": "velocity",
			"type": "double",
			"dims": ["velocity_length"]
		},
		{
			"name": "effort",
			"type": "double",
			"dims": ["effort_length"]
		}
	],
	"sensor_msgs.Joy": [
		{
			"name": "axes_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "buttons_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "axes",
			"type": "float",
			"dims": ["axes_length"]
		},
		{
			"name": "buttons",
			"type": "int32_t",
			"dims": ["buttons_length"]
		}
	],
	"sensor_msgs.JoyFeedback": [
		{
			"name": "type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "id",
			"type": "byte",
			"dims": []
		},
		{
			"name": "intensity",
			"type": "float",
			"dims": []
		}
	],
	"sensor_msgs.JoyFeedbackArray": [{
		"name": "array_length",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "array",
		"type": "sensor_msgs.JoyFeedback",
		"dims": ["array_length"]
	}],
	"sensor_msgs.LaserEcho": [{
		"name": "echoes_length",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "echoes",
		"type": "float",
		"dims": ["echoes_length"]
	}],
	"sensor_msgs.LaserScan": [
		{
			"name": "ranges_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "intensities_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "angle_min",
			"type": "float",
			"dims": []
		},
		{
			"name": "angle_max",
			"type": "float",
			"dims": []
		},
		{
			"name": "angle_increment",
			"type": "float",
			"dims": []
		},
		{
			"name": "time_increment",
			"type": "float",
			"dims": []
		},
		{
			"name": "scan_time",
			"type": "float",
			"dims": []
		},
		{
			"name": "range_min",
			"type": "float",
			"dims": []
		},
		{
			"name": "range_max",
			"type": "float",
			"dims": []
		},
		{
			"name": "ranges",
			"type": "float",
			"dims": ["ranges_length"]
		},
		{
			"name": "intensities",
			"type": "float",
			"dims": ["intensities_length"]
		}
	],
	"sensor_msgs.MagneticField": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "magnetic_field",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "magnetic_field_covariance",
			"type": "double",
			"dims": [9]
		}
	],
	"sensor_msgs.MultiDOFJointState": [
		{
			"name": "joint_names_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "transforms_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "twist_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "wrench_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "joint_names",
			"type": "string",
			"dims": ["joint_names_length"]
		},
		{
			"name": "transforms",
			"type": "geometry_msgs.Transform",
			"dims": ["transforms_length"]
		},
		{
			"name": "twist",
			"type": "geometry_msgs.Twist",
			"dims": ["twist_length"]
		},
		{
			"name": "wrench",
			"type": "geometry_msgs.Wrench",
			"dims": ["wrench_length"]
		}
	],
	"sensor_msgs.MultiEchoLaserScan": [
		{
			"name": "ranges_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "intensities_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "angle_min",
			"type": "float",
			"dims": []
		},
		{
			"name": "angle_max",
			"type": "float",
			"dims": []
		},
		{
			"name": "angle_increment",
			"type": "float",
			"dims": []
		},
		{
			"name": "time_increment",
			"type": "float",
			"dims": []
		},
		{
			"name": "scan_time",
			"type": "float",
			"dims": []
		},
		{
			"name": "range_min",
			"type": "float",
			"dims": []
		},
		{
			"name": "range_max",
			"type": "float",
			"dims": []
		},
		{
			"name": "ranges",
			"type": "sensor_msgs.LaserEcho",
			"dims": ["ranges_length"]
		},
		{
			"name": "intensities",
			"type": "sensor_msgs.LaserEcho",
			"dims": ["intensities_length"]
		}
	],
	"sensor_msgs.NavSatFix": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "status",
			"type": "sensor_msgs.NavSatStatus",
			"dims": []
		},
		{
			"name": "latitude",
			"type": "double",
			"dims": []
		},
		{
			"name": "longitude",
			"type": "double",
			"dims": []
		},
		{
			"name": "altitude",
			"type": "double",
			"dims": []
		},
		{
			"name": "position_covariance",
			"type": "double",
			"dims": [9]
		},
		{
			"name": "position_covariance_type",
			"type": "byte",
			"dims": []
		}
	],
	"sensor_msgs.NavSatStatus": [{
		"name": "status",
		"type": "int8_t",
		"dims": []
	}, {
		"name": "service",
		"type": "int16_t",
		"dims": []
	}],
	"sensor_msgs.PointCloud": [
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "channels_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "points",
			"type": "geometry_msgs.Point32",
			"dims": ["points_length"]
		},
		{
			"name": "channels",
			"type": "sensor_msgs.ChannelFloat32",
			"dims": ["channels_length"]
		}
	],
	"sensor_msgs.PointCloud2": [
		{
			"name": "fields_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "fields",
			"type": "sensor_msgs.PointField",
			"dims": ["fields_length"]
		},
		{
			"name": "is_bigendian",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "point_step",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "row_step",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		},
		{
			"name": "is_dense",
			"type": "boolean",
			"dims": []
		}
	],
	"sensor_msgs.PointField": [
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "offset",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "datatype",
			"type": "byte",
			"dims": []
		},
		{
			"name": "count",
			"type": "int32_t",
			"dims": []
		}
	],
	"sensor_msgs.Range": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "radiation_type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "field_of_view",
			"type": "float",
			"dims": []
		},
		{
			"name": "min_range",
			"type": "float",
			"dims": []
		},
		{
			"name": "max_range",
			"type": "float",
			"dims": []
		},
		{
			"name": "range",
			"type": "float",
			"dims": []
		}
	],
	"sensor_msgs.RegionOfInterest": [
		{
			"name": "x_offset",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "y_offset",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "height",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "width",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "do_rectify",
			"type": "boolean",
			"dims": []
		}
	],
	"sensor_msgs.RelativeHumidity": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "relative_humidity",
			"type": "double",
			"dims": []
		},
		{
			"name": "variance",
			"type": "double",
			"dims": []
		}
	],
	"sensor_msgs.Temperature": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "temperature",
			"type": "double",
			"dims": []
		},
		{
			"name": "variance",
			"type": "double",
			"dims": []
		}
	],
	"sensor_msgs.TimeReference": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "time_ref",
			"type": "std_msgs.Time",
			"dims": []
		},
		{
			"name": "source",
			"type": "string",
			"dims": []
		}
	],
	"shape_msgs.Mesh": [
		{
			"name": "triangles_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "vertices_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "triangles",
			"type": "shape_msgs.MeshTriangle",
			"dims": ["triangles_length"]
		},
		{
			"name": "vertices",
			"type": "geometry_msgs.Point",
			"dims": ["vertices_length"]
		}
	],
	"shape_msgs.MeshTriangle": [{
		"name": "vertex_indices",
		"type": "int32_t",
		"dims": [3]
	}],
	"shape_msgs.Plane": [{
		"name": "coef",
		"type": "double",
		"dims": [4]
	}],
	"shape_msgs.SolidPrimitive": [
		{
			"name": "dimensions_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "dimensions",
			"type": "double",
			"dims": ["dimensions_length"]
		}
	],
	"std_msgs.Bool": [{
		"name": "data",
		"type": "boolean",
		"dims": []
	}],
	"std_msgs.Byte": [{
		"name": "data",
		"type": "int8_t",
		"dims": []
	}],
	"std_msgs.ByteMultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int8_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.Char": [{
		"name": "data",
		"type": "byte",
		"dims": []
	}],
	"std_msgs.ColorRGBA": [
		{
			"name": "r",
			"type": "float",
			"dims": []
		},
		{
			"name": "g",
			"type": "float",
			"dims": []
		},
		{
			"name": "b",
			"type": "float",
			"dims": []
		},
		{
			"name": "a",
			"type": "float",
			"dims": []
		}
	],
	"std_msgs.Duration": [{
		"name": "sec",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "nsec",
		"type": "int32_t",
		"dims": []
	}],
	"std_msgs.Empty": [],
	"std_msgs.Float32": [{
		"name": "data",
		"type": "float",
		"dims": []
	}],
	"std_msgs.Float32MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "float",
			"dims": ["data_length"]
		}
	],
	"std_msgs.Float64": [{
		"name": "data",
		"type": "double",
		"dims": []
	}],
	"std_msgs.Float64MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "double",
			"dims": ["data_length"]
		}
	],
	"std_msgs.Header": [
		{
			"name": "seq",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "stamp",
			"type": "std_msgs.Time",
			"dims": []
		},
		{
			"name": "frame_id",
			"type": "string",
			"dims": []
		}
	],
	"std_msgs.Int16": [{
		"name": "data",
		"type": "int16_t",
		"dims": []
	}],
	"std_msgs.Int16MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int16_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.Int32": [{
		"name": "data",
		"type": "int32_t",
		"dims": []
	}],
	"std_msgs.Int32MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int32_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.Int64": [{
		"name": "data",
		"type": "int64_t",
		"dims": []
	}],
	"std_msgs.Int64MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int64_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.Int8": [{
		"name": "data",
		"type": "int8_t",
		"dims": []
	}],
	"std_msgs.Int8MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int8_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.MultiArrayDimension": [
		{
			"name": "label",
			"type": "string",
			"dims": []
		},
		{
			"name": "size",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "stride",
			"type": "int32_t",
			"dims": []
		}
	],
	"std_msgs.MultiArrayLayout": [
		{
			"name": "dim_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "dim",
			"type": "std_msgs.MultiArrayDimension",
			"dims": ["dim_length"]
		},
		{
			"name": "data_offset",
			"type": "int32_t",
			"dims": []
		}
	],
	"std_msgs.String": [{
		"name": "data",
		"type": "string",
		"dims": []
	}],
	"std_msgs.Time": [{
		"name": "sec",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "nsec",
		"type": "int32_t",
		"dims": []
	}],
	"std_msgs.UInt16": [{
		"name": "data",
		"type": "int16_t",
		"dims": []
	}],
	"std_msgs.UInt16MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int16_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.UInt32": [{
		"name": "data",
		"type": "int32_t",
		"dims": []
	}],
	"std_msgs.UInt32MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int32_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.UInt64": [{
		"name": "data",
		"type": "int64_t",
		"dims": []
	}],
	"std_msgs.UInt64MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "int64_t",
			"dims": ["data_length"]
		}
	],
	"std_msgs.UInt8": [{
		"name": "data",
		"type": "byte",
		"dims": []
	}],
	"std_msgs.UInt8MultiArray": [
		{
			"name": "data_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "layout",
			"type": "std_msgs.MultiArrayLayout",
			"dims": []
		},
		{
			"name": "data",
			"type": "byte",
			"dims": ["data_length"]
		}
	],
	"stereo_msgs.DisparityImage": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "image",
			"type": "sensor_msgs.Image",
			"dims": []
		},
		{
			"name": "f",
			"type": "float",
			"dims": []
		},
		{
			"name": "T",
			"type": "float",
			"dims": []
		},
		{
			"name": "valid_window",
			"type": "sensor_msgs.RegionOfInterest",
			"dims": []
		},
		{
			"name": "min_disparity",
			"type": "float",
			"dims": []
		},
		{
			"name": "max_disparity",
			"type": "float",
			"dims": []
		},
		{
			"name": "delta_d",
			"type": "float",
			"dims": []
		}
	],
	"tf2_msgs.TF2Error": [{
		"name": "error",
		"type": "byte",
		"dims": []
	}, {
		"name": "error_string",
		"type": "string",
		"dims": []
	}],
	"tf2_msgs.TFMessage": [{
		"name": "transforms_length",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "transforms",
		"type": "geometry_msgs.TransformStamped",
		"dims": ["transforms_length"]
	}],
	"trajectory_msgs.JointTrajectory": [
		{
			"name": "joint_names_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "joint_names",
			"type": "string",
			"dims": ["joint_names_length"]
		},
		{
			"name": "points",
			"type": "trajectory_msgs.JointTrajectoryPoint",
			"dims": ["points_length"]
		}
	],
	"trajectory_msgs.JointTrajectoryPoint": [
		{
			"name": "positions_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "velocities_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "accelerations_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "effort_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "positions",
			"type": "double",
			"dims": ["positions_length"]
		},
		{
			"name": "velocities",
			"type": "double",
			"dims": ["velocities_length"]
		},
		{
			"name": "accelerations",
			"type": "double",
			"dims": ["accelerations_length"]
		},
		{
			"name": "effort",
			"type": "double",
			"dims": ["effort_length"]
		},
		{
			"name": "time_from_start",
			"type": "std_msgs.Duration",
			"dims": []
		}
	],
	"trajectory_msgs.MultiDOFJointTrajectory": [
		{
			"name": "joint_names_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "joint_names",
			"type": "string",
			"dims": ["joint_names_length"]
		},
		{
			"name": "points",
			"type": "trajectory_msgs.MultiDOFJointTrajectoryPoint",
			"dims": ["points_length"]
		}
	],
	"trajectory_msgs.MultiDOFJointTrajectoryPoint": [
		{
			"name": "transforms_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "velocities_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "accelerations_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "transforms",
			"type": "geometry_msgs.Transform",
			"dims": ["transforms_length"]
		},
		{
			"name": "velocities",
			"type": "geometry_msgs.Twist",
			"dims": ["velocities_length"]
		},
		{
			"name": "accelerations",
			"type": "geometry_msgs.Twist",
			"dims": ["accelerations_length"]
		},
		{
			"name": "time_from_start",
			"type": "std_msgs.Duration",
			"dims": []
		}
	],
	"vision_msgs.BoundingBox2D": [
		{
			"name": "center",
			"type": "vision_msgs.Pose2D",
			"dims": []
		},
		{
			"name": "size_x",
			"type": "double",
			"dims": []
		},
		{
			"name": "size_y",
			"type": "double",
			"dims": []
		}
	],
	"vision_msgs.BoundingBox2DArray": [
		{
			"name": "boxes_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "boxes",
			"type": "vision_msgs.BoundingBox2D",
			"dims": ["boxes_length"]
		}
	],
	"vision_msgs.BoundingBox3D": [{
		"name": "center",
		"type": "geometry_msgs.Pose",
		"dims": []
	}, {
		"name": "size",
		"type": "geometry_msgs.Vector3",
		"dims": []
	}],
	"vision_msgs.BoundingBox3DArray": [
		{
			"name": "boxes_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "boxes",
			"type": "vision_msgs.BoundingBox3D",
			"dims": ["boxes_length"]
		}
	],
	"vision_msgs.Classification": [
		{
			"name": "results_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "results",
			"type": "vision_msgs.ObjectHypothesis",
			"dims": ["results_length"]
		}
	],
	"vision_msgs.Detection2D": [
		{
			"name": "results_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "results",
			"type": "vision_msgs.ObjectHypothesisWithPose",
			"dims": ["results_length"]
		},
		{
			"name": "bbox",
			"type": "vision_msgs.BoundingBox2D",
			"dims": []
		},
		{
			"name": "id",
			"type": "string",
			"dims": []
		}
	],
	"vision_msgs.Detection2DArray": [
		{
			"name": "detections_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "detections",
			"type": "vision_msgs.Detection2D",
			"dims": ["detections_length"]
		}
	],
	"vision_msgs.Detection3D": [
		{
			"name": "results_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "results",
			"type": "vision_msgs.ObjectHypothesisWithPose",
			"dims": ["results_length"]
		},
		{
			"name": "bbox",
			"type": "vision_msgs.BoundingBox3D",
			"dims": []
		},
		{
			"name": "id",
			"type": "string",
			"dims": []
		}
	],
	"vision_msgs.Detection3DArray": [
		{
			"name": "detections_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "detections",
			"type": "vision_msgs.Detection3D",
			"dims": ["detections_length"]
		}
	],
	"vision_msgs.LabelInfo": [
		{
			"name": "class_map_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "class_map",
			"type": "vision_msgs.VisionClass",
			"dims": ["class_map_length"]
		},
		{
			"name": "threshold",
			"type": "float",
			"dims": []
		}
	],
	"vision_msgs.ObjectHypothesis": [{
		"name": "class_id",
		"type": "string",
		"dims": []
	}, {
		"name": "score",
		"type": "double",
		"dims": []
	}],
	"vision_msgs.ObjectHypothesisWithPose": [{
		"name": "hypothesis",
		"type": "vision_msgs.ObjectHypothesis",
		"dims": []
	}, {
		"name": "pose",
		"type": "geometry_msgs.PoseWithCovariance",
		"dims": []
	}],
	"vision_msgs.Point2D": [{
		"name": "x",
		"type": "double",
		"dims": []
	}, {
		"name": "y",
		"type": "double",
		"dims": []
	}],
	"vision_msgs.Pose2D": [{
		"name": "position",
		"type": "vision_msgs.Point2D",
		"dims": []
	}, {
		"name": "theta",
		"type": "double",
		"dims": []
	}],
	"vision_msgs.VisionClass": [{
		"name": "class_id",
		"type": "int16_t",
		"dims": []
	}, {
		"name": "class_name",
		"type": "string",
		"dims": []
	}],
	"vision_msgs.VisionInfo": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "method",
			"type": "string",
			"dims": []
		},
		{
			"name": "database_location",
			"type": "string",
			"dims": []
		},
		{
			"name": "database_version",
			"type": "int32_t",
			"dims": []
		}
	],
	"visualization_msgs.ImageMarker": [
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "outline_colors_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "ns",
			"type": "string",
			"dims": []
		},
		{
			"name": "id",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "type",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "action",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "position",
			"type": "geometry_msgs.Point",
			"dims": []
		},
		{
			"name": "scale",
			"type": "float",
			"dims": []
		},
		{
			"name": "outline_color",
			"type": "std_msgs.ColorRGBA",
			"dims": []
		},
		{
			"name": "filled",
			"type": "byte",
			"dims": []
		},
		{
			"name": "fill_color",
			"type": "std_msgs.ColorRGBA",
			"dims": []
		},
		{
			"name": "lifetime",
			"type": "std_msgs.Duration",
			"dims": []
		},
		{
			"name": "points",
			"type": "geometry_msgs.Point",
			"dims": ["points_length"]
		},
		{
			"name": "outline_colors",
			"type": "std_msgs.ColorRGBA",
			"dims": ["outline_colors_length"]
		}
	],
	"visualization_msgs.InteractiveMarker": [
		{
			"name": "menu_entries_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "controls_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "description",
			"type": "string",
			"dims": []
		},
		{
			"name": "scale",
			"type": "float",
			"dims": []
		},
		{
			"name": "menu_entries",
			"type": "visualization_msgs.MenuEntry",
			"dims": ["menu_entries_length"]
		},
		{
			"name": "controls",
			"type": "visualization_msgs.InteractiveMarkerControl",
			"dims": ["controls_length"]
		}
	],
	"visualization_msgs.InteractiveMarkerControl": [
		{
			"name": "markers_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": []
		},
		{
			"name": "orientation",
			"type": "geometry_msgs.Quaternion",
			"dims": []
		},
		{
			"name": "orientation_mode",
			"type": "byte",
			"dims": []
		},
		{
			"name": "interaction_mode",
			"type": "byte",
			"dims": []
		},
		{
			"name": "always_visible",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "markers",
			"type": "visualization_msgs.Marker",
			"dims": ["markers_length"]
		},
		{
			"name": "independent_marker_orientation",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "description",
			"type": "string",
			"dims": []
		}
	],
	"visualization_msgs.InteractiveMarkerFeedback": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "client_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "marker_name",
			"type": "string",
			"dims": []
		},
		{
			"name": "control_name",
			"type": "string",
			"dims": []
		},
		{
			"name": "event_type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "menu_entry_id",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "mouse_point",
			"type": "geometry_msgs.Point",
			"dims": []
		},
		{
			"name": "mouse_point_valid",
			"type": "boolean",
			"dims": []
		}
	],
	"visualization_msgs.InteractiveMarkerInit": [
		{
			"name": "markers_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "server_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "seq_num",
			"type": "int64_t",
			"dims": []
		},
		{
			"name": "markers",
			"type": "visualization_msgs.InteractiveMarker",
			"dims": ["markers_length"]
		}
	],
	"visualization_msgs.InteractiveMarkerPose": [
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "name",
			"type": "string",
			"dims": []
		}
	],
	"visualization_msgs.InteractiveMarkerUpdate": [
		{
			"name": "markers_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "poses_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "erases_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "server_id",
			"type": "string",
			"dims": []
		},
		{
			"name": "seq_num",
			"type": "int64_t",
			"dims": []
		},
		{
			"name": "type",
			"type": "byte",
			"dims": []
		},
		{
			"name": "markers",
			"type": "visualization_msgs.InteractiveMarker",
			"dims": ["markers_length"]
		},
		{
			"name": "poses",
			"type": "visualization_msgs.InteractiveMarkerPose",
			"dims": ["poses_length"]
		},
		{
			"name": "erases",
			"type": "string",
			"dims": ["erases_length"]
		}
	],
	"visualization_msgs.Marker": [
		{
			"name": "points_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "colors_length",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "header",
			"type": "std_msgs.Header",
			"dims": []
		},
		{
			"name": "ns",
			"type": "string",
			"dims": []
		},
		{
			"name": "id",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "type",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "action",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "pose",
			"type": "geometry_msgs.Pose",
			"dims": []
		},
		{
			"name": "scale",
			"type": "geometry_msgs.Vector3",
			"dims": []
		},
		{
			"name": "color",
			"type": "std_msgs.ColorRGBA",
			"dims": []
		},
		{
			"name": "lifetime",
			"type": "std_msgs.Duration",
			"dims": []
		},
		{
			"name": "frame_locked",
			"type": "boolean",
			"dims": []
		},
		{
			"name": "points",
			"type": "geometry_msgs.Point",
			"dims": ["points_length"]
		},
		{
			"name": "colors",
			"type": "std_msgs.ColorRGBA",
			"dims": ["colors_length"]
		},
		{
			"name": "text",
			"type": "string",
			"dims": []
		},
		{
			"name": "mesh_resource",
			"type": "string",
			"dims": []
		},
		{
			"name": "mesh_use_embedded_materials",
			"type": "boolean",
			"dims": []
		}
	],
	"visualization_msgs.MarkerArray": [{
		"name": "markers_length",
		"type": "int32_t",
		"dims": []
	}, {
		"name": "markers",
		"type": "visualization_msgs.Marker",
		"dims": ["markers_length"]
	}],
	"visualization_msgs.MenuEntry": [
		{
			"name": "id",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "parent_id",
			"type": "int32_t",
			"dims": []
		},
		{
			"name": "title",
			"type": "string",
			"dims": []
		},
		{
			"name": "command",
			"type": "string",
			"dims": []
		},
		{
			"name": "command_type",
			"type": "byte",
			"dims": []
		}
	]
};
var textDecoder = new TextDecoder();
var textEncoder = new TextEncoder();
var Reader = class {
	offset;
	view;
	bytes;
	constructor(bytes, offset) {
		this.bytes = bytes;
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.offset = offset;
	}
	primitive(type) {
		const view = this.view;
		const at = this.offset;
		switch (type) {
			case "int8_t":
				this.offset += 1;
				return view.getInt8(at);
			case "byte":
				this.offset += 1;
				return view.getUint8(at);
			case "boolean":
				this.offset += 1;
				return view.getInt8(at) !== 0;
			case "int16_t":
				this.offset += 2;
				return view.getInt16(at);
			case "int32_t":
				this.offset += 4;
				return view.getInt32(at);
			case "int64_t":
				this.offset += 8;
				return Number(view.getBigInt64(at));
			case "float":
				this.offset += 4;
				return view.getFloat32(at);
			case "double":
				this.offset += 8;
				return view.getFloat64(at);
			case "string": {
				const length = view.getInt32(at);
				this.offset += 4 + length;
				return textDecoder.decode(this.bytes.subarray(at + 4, at + 4 + Math.max(0, length - 1)));
			}
		}
		throw new Error(`lcm: unknown primitive ${type}`);
	}
	struct(type) {
		const fields = schemas[type];
		if (!fields) throw new Error(`lcm: no schema for ${type}`);
		const out = {};
		for (const field of fields) out[field.name] = this.value(field.type, field.dims, 0, out);
		return out;
	}
	value(type, dims, depth, scope) {
		if (depth === dims.length) return type in schemas ? this.struct(type) : this.primitive(type);
		const dim = dims[depth];
		const length = typeof dim === "number" ? dim : Number(scope[dim]);
		if ((type === "byte" || type === "int8_t") && depth === dims.length - 1) {
			const view = this.bytes.subarray(this.offset, this.offset + length);
			this.offset += length;
			return type === "byte" ? view : new Int8Array(view.buffer, view.byteOffset, view.byteLength);
		}
		const items = new Array(length);
		for (let index = 0; index < length; index++) items[index] = this.value(type, dims, depth + 1, scope);
		return items;
	}
};
/** Decodes a dimos payload (fingerprint + struct) of `type`, e.g. "nav_msgs.Odometry"; a different type's bytes throw. */
function decode(type, bytes) {
	const expected = fingerprint(type);
	for (let index = 0; index < 8; index++) if (bytes[index] !== expected[index]) throw new Error(`not a ${type} (fingerprint mismatch)`);
	return new Reader(bytes, 8).struct(type);
}
/** Reads just the header's frame_id off a stamped message without decoding the rest (clouds, images). */
function headerFrameId(type, bytes) {
	const fields = schemas[type];
	if (!fields) return null;
	const reader = new Reader(bytes, 8);
	for (const field of fields) {
		if (field.name === "header" && field.type === "std_msgs.Header") return reader.struct("std_msgs.Header").frame_id;
		if (field.dims.length || field.type in schemas) return null;
		reader.primitive(field.type);
	}
	return null;
}
var MASK = (1n << 64n) - 1n;
function hashUpdate(value, char) {
	const signed = BigInt.asIntN(64, value);
	return BigInt.asIntN(64, (signed << 8n ^ signed >> 55n) + BigInt(char > 127 ? char - 256 : char));
}
function hashString(value, text) {
	value = hashUpdate(value, text.length);
	for (const char of textEncoder.encode(text)) value = hashUpdate(value, char);
	return value;
}
function baseHash(type) {
	let value = 305419896n;
	for (const field of schemas[type]) {
		value = hashString(value, field.name);
		if (!(field.type in schemas)) value = hashString(value, field.type);
		value = hashUpdate(value, field.dims.length);
		for (const dim of field.dims) {
			value = hashUpdate(value, typeof dim === "number" ? 0 : 1);
			value = hashString(value, String(dim));
		}
	}
	return value;
}
function recursiveHash(type, parents) {
	if (parents.includes(type)) return 0n;
	let value = BigInt.asUintN(64, baseHash(type));
	for (const field of schemas[type]) if (field.type in schemas) value = value + recursiveHash(field.type, [...parents, type]) & MASK;
	return (value << 1n & MASK) + (value >> 63n) & MASK;
}
var fingerprints = /* @__PURE__ */ new Map();
/** The 8 bytes every top-level LCM message of `type` starts with. */
function fingerprint(type) {
	let bytes = fingerprints.get(type);
	if (!bytes) {
		bytes = /* @__PURE__ */ new Uint8Array(8);
		new DataView(bytes.buffer).setBigUint64(0, recursiveHash(type, []));
		fingerprints.set(type, bytes);
	}
	return bytes;
}
var Writer = class {
	chunks = [];
	view = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
	push(count) {
		for (let index = 0; index < count; index++) this.chunks.push(this.view.getUint8(index));
	}
	primitive(type, value) {
		const view = this.view;
		switch (type) {
			case "int8_t":
				view.setInt8(0, value ?? 0);
				return this.push(1);
			case "byte":
				view.setUint8(0, value ?? 0);
				return this.push(1);
			case "boolean":
				view.setInt8(0, value ? 1 : 0);
				return this.push(1);
			case "int16_t":
				view.setInt16(0, value ?? 0);
				return this.push(2);
			case "int32_t":
				view.setInt32(0, value ?? 0);
				return this.push(4);
			case "int64_t":
				view.setBigInt64(0, BigInt(Math.trunc(value ?? 0)));
				return this.push(8);
			case "float":
				view.setFloat32(0, value ?? 0);
				return this.push(4);
			case "double":
				view.setFloat64(0, value ?? 0);
				return this.push(8);
			case "string": {
				const bytes = textEncoder.encode(value ?? "");
				view.setInt32(0, bytes.length + 1);
				this.push(4);
				this.chunks.push(...bytes, 0);
				return;
			}
		}
		throw new Error(`lcm: unknown primitive ${type}`);
	}
	struct(type, value) {
		const scope = { ...value };
		for (const field of schemas[type]) for (const dim of field.dims) if (typeof dim === "string" && scope[dim] === void 0) scope[dim] = (value[field.name] ?? []).length;
		for (const field of schemas[type]) this.value(field.type, field.dims, 0, scope[field.name]);
	}
	value(type, dims, depth, value) {
		if (depth === dims.length) return type in schemas ? this.struct(type, value ?? {}) : this.primitive(type, value);
		for (const item of value ?? []) this.value(type, dims, depth + 1, item);
	}
};
/** Encodes `value` as a dimos payload of `type` (missing fields are zero). */
function encode(type, value) {
	const writer = new Writer();
	writer.struct(type, value);
	const out = new Uint8Array(8 + writer.chunks.length);
	out.set(fingerprint(type));
	out.set(writer.chunks, 8);
	return out;
}
//#endregion
//#region src/data.ts
var decoder = new TextDecoder();
var encoder = new TextEncoder();
/** `dimos/<name>/<type>` → `{ key, name: "/<name>", type }`; anything else → null. */
function parseKey(key) {
	const parts = String(key).split("/");
	if (parts.length < 3 || parts[0] !== "dimos" || key.includes("*")) return null;
	const type = parts[parts.length - 1];
	if (!/^\w+\.\w+$/.test(type)) return null;
	return {
		key,
		name: "/" + parts.slice(1, -1).join("/"),
		type
	};
}
/** The zenoh key dimos uses for a topic of a type: dimosKey("/odom", "nav_msgs.Odometry"). */
var dimosKey = (topic, type) => `dimos/${String(topic).replace(/^\/+/, "")}/${type}`;
/** zenoh key-expression matching (`*` = one chunk, `**` = any number of chunks). */
function keyMatches(pattern, key) {
	const want = pattern.split("/");
	const have = key.split("/");
	const match = (i, j) => {
		if (i === want.length) return j === have.length;
		if (want[i] === "**") {
			for (let k = j; k <= have.length; k++) if (match(i + 1, k)) return true;
			return false;
		}
		return j < have.length && (want[i] === "*" || want[i] === have[j]) && match(i + 1, j + 1);
	};
	return match(0, 0);
}
/**
* Turns a message into a value: "lcm" (dimos LCM, the type from the key or `type`), "json", "text", "bytes", or a
* function `(message) => value`. A message the gateway already decoded (an encoding like dimos_lcm_pointcloud2)
* keeps `message.decoded`.
*/
function decodeMessage(message, how = "auto", type) {
	if (typeof how === "function") return how(message);
	if (message.decoded !== void 0 && (how === "auto" || how === "decoded")) return message.decoded;
	if (message.value !== void 0 && how === "auto") return message.value;
	const kind = how === "auto" ? type || parseKey(message.key)?.type ? "lcm" : "json" : how;
	if (kind === "bytes") return message.bytes;
	if (kind === "text") return decoder.decode(message.bytes);
	if (kind === "json") return JSON.parse(decoder.decode(message.bytes));
	return decode(type ?? parseKey(message.key).type, message.bytes);
}
/**
* The live source: the page's one zenoh-gateway connection (dim-app's getZenoh(), shared with everything else on the
* page). `options` go to getZenoh on first use (app, connectOptions, …).
*/
function zenohSource(options = {}) {
	let zenoh = null;
	const get = () => zenoh ??= getZenoh(options);
	return {
		kind: "zenoh",
		get zenoh() {
			return get();
		},
		subscribe: (key, subscribeOptions, onMessage) => get().subscribe(key, subscribeOptions ?? {}, onMessage),
		subscribeFrontend: (topic, callback, frontendOptions) => get().subscribeFrontend(topic, callback, frontendOptions),
		listTopics: async (filter = "dimos/**", { probeMs = 800 } = {}) => {
			return (await (await get().ready).client.listTopics(filter, { probeMs })).map((topic) => ({ ...topic }));
		},
		get state() {
			return get().state;
		},
		onState: (listener) => get().onState(listener),
		onReconnect: (listener) => get().onReconnect(listener),
		now: () => {
			const client = get().client;
			return client?.now ? client.now() + (client.clockOffsetMs ?? 0) : Date.now();
		}
	};
}
/**
* An in-page source: whatever calls `publish` is the data (tests, demos, a replay app feeding recorded messages).
* `publish(key, payload)` takes bytes (LCM etc.), or any value (delivered as `message.value`, decoded as itself).
* A replay passes `clock` (the playhead, ms: `now()` returns it), calls `seek()` when the playhead jumps and may pass
* `route(key)` (a pose topic's whole recorded route) so the 3D view can draw it.
*/
function memorySource({ topics = [], state = "connected", clock, route } = {}) {
	const subscribers = /* @__PURE__ */ new Set();
	const frontend = /* @__PURE__ */ new Set();
	const stateListeners = /* @__PURE__ */ new Set();
	const topicListeners = /* @__PURE__ */ new Set();
	const seekListeners = /* @__PURE__ */ new Set();
	let known = new Map(topics.map((key) => [key, { key }]));
	const source = {
		kind: "memory",
		state,
		/** a replay: `now()` is the playhead, so staleness, fading and lifetimes follow it (not the wall clock) */
		replay: !!clock,
		subscribe(key, _options, onMessage) {
			const entry = {
				key,
				onMessage
			};
			subscribers.add(entry);
			const off = () => subscribers.delete(entry);
			return Object.assign(off, {
				unsubscribe: off,
				update: async () => {}
			});
		},
		subscribeFrontend(topic, callback) {
			const entry = {
				topic,
				callback
			};
			frontend.add(entry);
			return () => frontend.delete(entry);
		},
		listTopics: (filter = "**") => Promise.resolve([...known.values()].filter((topic) => keyMatches(filter, topic.key))),
		onState(listener) {
			stateListeners.add(listener);
			return () => stateListeners.delete(listener);
		},
		onReconnect: () => () => {},
		onTopics(listener) {
			topicListeners.add(listener);
			return () => topicListeners.delete(listener);
		},
		now: clock ?? (() => Date.now()),
		/** A replay's playhead jumped (seek, scrub, loop): layers drop what they gathered over time. */
		seek() {
			seekListeners.forEach((listener) => listener());
		},
		onSeek(listener) {
			seekListeners.add(listener);
			return () => seekListeners.delete(listener);
		},
		/**
		* A pose topic's whole route, when the source knows it up front (a recording):
		* `Promise<{ frame, points: [tSeconds, x, y, z][] } | null>`.
		*/
		route: route ?? null,
		/** Delivers a message to every subscriber whose key expression matches `key`. */
		publish(key, payload, { timestamp = source.now() } = {}) {
			if (!known.has(key)) {
				known.set(key, { key });
				topicListeners.forEach((listener) => listener());
			}
			const message = payload instanceof Uint8Array ? {
				key,
				bytes: payload,
				timestamp
			} : {
				key,
				value: payload,
				bytes: encoder.encode(JSON.stringify(payload ?? null)),
				timestamp
			};
			for (const entry of [...subscribers]) if (keyMatches(entry.key, key)) entry.onMessage(message);
		},
		/** What the app backend's publishFrontend(topic, payload) does: JSON to `subscribeFrontend(topic)` listeners. */
		publishFrontend(topic, payload) {
			for (const entry of [...frontend]) if (keyMatches(entry.topic, topic)) entry.callback(payload, {
				key: topic,
				timestamp: Date.now()
			});
		},
		setTopics(keys) {
			known = new Map(keys.map((key) => [key, { key }]));
			topicListeners.forEach((listener) => listener());
		},
		setState(next) {
			source.state = next;
			stateListeners.forEach((listener) => listener(next));
		}
	};
	return source;
}
var DataSourceContext = createContext(null);
var defaultSource = null;
/** Makes `source` the data source of everything below. */
function DataSourceProvider({ source, children }) {
	return createElement(DataSourceContext.Provider, { value: source }, children);
}
/** DataSourceProvider with the live zenoh-gateway source (props go to getZenoh on first use). */
function ZenohProvider({ children, ...options }) {
	const source = useMemo(() => zenohSource(options), []);
	return createElement(DataSourceContext.Provider, { value: source }, children);
}
/** The data source in effect: the nearest provider's, else the page's zenoh-gateway connection. */
function useDataSource() {
	return useContext(DataSourceContext) ?? (defaultSource ??= zenohSource());
}
/** The zenoh connection behind the source (dim-app's AppZenoh), or null for a non-zenoh source. */
function useZenoh() {
	const source = useDataSource();
	return source.kind === "zenoh" ? source.zenoh : null;
}
/**
* Calls `onMessage(value, message)` for every message on `key` (null key: nothing). The callback may change freely.
* @param key a zenoh key expression
*/
function useSubscription(key, onMessage, options = {}) {
	const source = useDataSource();
	const callback = useRef(onMessage);
	callback.current = onMessage;
	const { decode = "auto", type, ...subscribeOptions } = options;
	const optionsKey = JSON.stringify(subscribeOptions);
	useEffect(() => {
		if (!key) return;
		const off = source.subscribe(key, {
			delivery: "latest",
			...JSON.parse(optionsKey)
		}, (message) => {
			let value;
			try {
				value = decodeMessage(message, decode, type);
			} catch (error) {
				console.debug(`[dimos-react] ${message.key}: cannot decode (${error?.message ?? error})`);
				return;
			}
			callback.current(value, message);
		});
		return () => off();
	}, [
		source,
		key,
		optionsKey,
		typeof decode === "string" ? decode : "fn",
		type
	]);
}
/** The latest message on a topic, re-rendered per message (throttle with `maxHz`). */
function useTopic(key, options = {}) {
	const [latest, setLatest] = useState({
		value: options.initial,
		message: null,
		timestamp: null,
		count: 0
	});
	useEffect(() => setLatest({
		value: options.initial,
		message: null,
		timestamp: null,
		count: 0
	}), [key]);
	useSubscription(key, (value, message) => {
		setLatest((old) => ({
			value,
			message,
			timestamp: message.timestamp ?? Date.now(),
			count: old.count + 1
		}));
	}, options);
	return latest;
}
/**
* The dimos topics on the bus (`[{ key, name, type }]`, sorted), re-listed every `intervalMs`. A topic stays listed
* `forgetMs` after it was last seen (slow publishers miss a probe now and then).
*/
function useTopicList({ filter = "dimos/**", intervalMs = 2e3, forgetMs = 2e4, types } = {}) {
	const source = useDataSource();
	const [topics, setTopics] = useState([]);
	const typesKey = types ? types.join(",") : "";
	useEffect(() => {
		let live = true;
		let timer;
		const lastSeen = /* @__PURE__ */ new Map();
		const round = async () => {
			try {
				const found = await source.listTopics(filter);
				const now = Date.now();
				for (const item of found) {
					const topic = parseKey(item.key);
					if (topic && (!typesKey || typesKey.split(",").includes(topic.type))) lastSeen.set(topic.key, {
						topic,
						at: now
					});
				}
				for (const [key, seen] of lastSeen) if (now - seen.at > forgetMs) lastSeen.delete(key);
				const next = [...lastSeen.values()].map((seen) => seen.topic).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
				if (live) setTopics((old) => old.length === next.length && old.every((topic, index) => topic.key === next[index].key) ? old : next);
			} catch {}
			if (live) timer = setTimeout(round, intervalMs);
		};
		round();
		const offTopics = source.onTopics?.(() => {
			clearTimeout(timer);
			round();
		});
		return () => {
			live = false;
			clearTimeout(timer);
			offTopics?.();
		};
	}, [
		source,
		filter,
		intervalMs,
		forgetMs,
		typesKey
	]);
	return topics;
}
/** The source's connection state: "connecting" | "connected" | "degraded" | "lost". */
function useConnectionState() {
	const source = useDataSource();
	const [state, setState] = useState(() => source.state ?? "connecting");
	useEffect(() => {
		setState(source.state ?? "connecting");
		return source.onState((next) => setState(next));
	}, [source]);
	return state;
}
/**
* The app backend's events (dim-app's publishEvent / publishFrontend("events", …)): `onEvent(event)` per event.
* `onReconnect` runs when the link comes back (events sent while it was down are gone: re-GET what you show).
*/
function useBackendEvents(onEvent, { topic = "events", onReconnect } = {}) {
	const source = useDataSource();
	const handler = useRef(onEvent);
	handler.current = onEvent;
	const reconnect = useRef(onReconnect);
	reconnect.current = onReconnect;
	useEffect(() => {
		const off = source.subscribeFrontend(topic, (event) => handler.current(event));
		const offReconnect = source.onReconnect?.(() => reconnect.current?.());
		return () => {
			off();
			offReconnect?.();
		};
	}, [source, topic]);
}
/**
* Snapshot + live backend state (dim-app's convention): GET `api/state/<key>` (or `url`), then re-GET whenever the
* backend's stateChanged(key) announces a change on the frontend topic `state/<key>`, and after a reconnect.
*/
function useBackendState(key, { url, topic, initial, debounceMs = 100, fetch: fetchImpl } = {}) {
	const source = useDataSource();
	const [snapshot, setSnapshot] = useState({
		data: initial,
		loading: true,
		error: null
	});
	const href = url ?? `api/state/${key}`;
	const generation = useRef(0);
	const refresh = useCallback(async () => {
		const mine = ++generation.current;
		try {
			const response = await (fetchImpl ?? globalThis.fetch)(new URL(href, globalThis.location?.href).href);
			if (!response.ok) throw new Error(`GET ${href}: HTTP ${response.status}`);
			const data = await response.json();
			if (mine === generation.current) setSnapshot({
				data,
				loading: false,
				error: null
			});
		} catch (error) {
			if (mine === generation.current) setSnapshot((old) => ({
				...old,
				loading: false,
				error
			}));
		}
	}, [href, fetchImpl]);
	useEffect(() => {
		if (!key && !url) return;
		refresh();
		let timer;
		const later = () => {
			clearTimeout(timer);
			timer = setTimeout(refresh, debounceMs);
		};
		const off = source.subscribeFrontend(topic ?? `state/${key}`, later);
		const offReconnect = source.onReconnect?.(later);
		return () => {
			clearTimeout(timer);
			off();
			offReconnect?.();
		};
	}, [
		source,
		key,
		href,
		topic,
		debounceMs,
		refresh
	]);
	return [snapshot.data, {
		loading: snapshot.loading,
		error: snapshot.error,
		refresh
	}];
}
//#endregion
//#region src/components/feedback.tsx
var TONE_ICONS = {
	info: "info",
	ok: "check-circle",
	warn: "warn",
	danger: "x-circle"
};
/**
* An inline notice. `tone`: "info" | "ok" | "warn" | "danger"; `title`; `actions` (buttons); `onClose` adds an ✕.
*/
function Alert({ tone = "info", title, icon, actions, onClose, className, children, ...rest }) {
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-alert", `dr-alert--${tone}`, className),
		role: tone === "danger" || tone === "warn" ? "alert" : "status",
		...rest,
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "dr-alert-icon",
				children: /* @__PURE__ */ jsx(Icon, {
					name: icon ?? TONE_ICONS[tone] ?? "info",
					size: 16
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "dr-alert-body",
				children: [
					title ? /* @__PURE__ */ jsx("div", {
						className: "dr-alert-title",
						children: title
					}) : null,
					children ? /* @__PURE__ */ jsx("div", {
						className: "dr-alert-text",
						children
					}) : null,
					actions ? /* @__PURE__ */ jsx("div", {
						className: "dr-alert-actions",
						children: actions
					}) : null
				]
			}),
			onClose ? /* @__PURE__ */ jsx(IconButton, {
				icon: "close",
				label: "Dismiss",
				size: "sm",
				onClick: onClose
			}) : null
		]
	});
}
var toasts = [];
var toastId = 0;
var toastListeners = /* @__PURE__ */ new Set();
var emitToasts = () => toastListeners.forEach((listener) => listener());
/**
* Shows a toast; returns its id. `toast("Saved")`, `toast({ title, message, tone, durationMs, action: { label, onClick } })`.
* `durationMs: 0` keeps it until dismissed. Shown by the nearest <ToastViewport> (AppProvider/ToastProvider add one).
*/
function toast(input) {
	const options = typeof input === "string" ? { message: input } : input;
	const id = options.id ?? ++toastId;
	const entry = {
		tone: "info",
		durationMs: options.tone === "danger" ? 8e3 : 4e3,
		...options,
		id
	};
	toasts = [...toasts.filter((other) => other.id !== id), entry].slice(-6);
	emitToasts();
	return id;
}
toast.ok = (message, options) => toast({
	...options,
	message,
	tone: "ok"
});
toast.warn = (message, options) => toast({
	...options,
	message,
	tone: "warn"
});
toast.error = (message, options) => toast({
	...options,
	message,
	tone: "danger"
});
toast.info = (message, options) => toast({
	...options,
	message,
	tone: "info"
});
/** Removes a toast (all of them without an id). */
function dismissToast(id) {
	toasts = id === void 0 ? [] : toasts.filter((entry) => entry.id !== id);
	emitToasts();
}
function useToasts() {
	return useSyncExternalStore((listener) => {
		toastListeners.add(listener);
		return () => toastListeners.delete(listener);
	}, () => toasts, () => toasts);
}
function ToastItem({ entry }) {
	useEffect(() => {
		if (!entry.durationMs) return;
		const timer = setTimeout(() => dismissToast(entry.id), entry.durationMs);
		return () => clearTimeout(timer);
	}, [entry.id, entry.durationMs]);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-toast", `dr-toast--${entry.tone}`),
		role: entry.tone === "danger" ? "alert" : "status",
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "dr-toast-icon",
				children: /* @__PURE__ */ jsx(Icon, {
					name: TONE_ICONS[entry.tone ?? ""] ?? "info",
					size: 16
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "dr-toast-body",
				children: [entry.title ? /* @__PURE__ */ jsx("div", {
					className: "dr-toast-title",
					children: entry.title
				}) : null, entry.message ? /* @__PURE__ */ jsx("div", {
					className: "dr-toast-text",
					children: entry.message
				}) : null]
			}),
			entry.action ? /* @__PURE__ */ jsx(Button, {
				size: "sm",
				variant: "ghost",
				onClick: () => {
					entry.action?.onClick?.();
					dismissToast(entry.id);
				},
				children: entry.action.label
			}) : null,
			/* @__PURE__ */ jsx(IconButton, {
				icon: "close",
				label: "Dismiss",
				size: "sm",
				onClick: () => dismissToast(entry.id)
			})
		]
	});
}
/**
* Where toasts appear (bottom-right, above Desktop's dock). `position`: "bottom-right" | "bottom" | "top-right" | "top".
*/
function ToastViewport({ position = "bottom-right" }) {
	const list = useToasts();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	if (!mounted) return null;
	return createPortal(/* @__PURE__ */ jsx("div", {
		className: cx("dr-toasts", `dr-toasts--${position}`),
		"aria-live": "polite",
		children: list.map((entry) => /* @__PURE__ */ jsx(ToastItem, { entry }, entry.id))
	}), document.body);
}
var ToastContext = createContext(toast);
/** Adds a ToastViewport; `useToast()` below it returns toast(). */
function ToastProvider({ position, children }) {
	return /* @__PURE__ */ jsxs(ToastContext.Provider, {
		value: toast,
		children: [children, /* @__PURE__ */ jsx(ToastViewport, { position })]
	});
}
/** The toast() function (toast.ok / .warn / .error / .info). */
function useToast() {
	return useContext(ToastContext);
}
/**
* A modal dialog over a scrim. `open` + `onClose`; `title`, `footer` (buttons); `size` "sm" | "md" | "lg";
* `dismissable` (default true): Escape and a scrim click close it.
*/
function Modal({ open, onClose, title, footer, size = "md", dismissable = true, className, children, ...rest }) {
	const titleId = useId();
	const panel = useRef(null);
	useEscape(() => dismissable && onClose?.(), !!open);
	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement;
		(panel.current?.querySelector("[autofocus], input, select, textarea, button:not(.dr-modal-close)") ?? panel.current)?.focus?.();
		return () => previous?.focus?.();
	}, [open]);
	if (!open || typeof document === "undefined") return null;
	return createPortal(/* @__PURE__ */ jsx("div", {
		className: "dr-scrim",
		onMouseDown: (event) => {
			if (event.target === event.currentTarget && dismissable) onClose?.();
		},
		children: /* @__PURE__ */ jsxs("div", {
			ref: panel,
			className: cx("dr-modal", `dr-modal--${size}`, className),
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": title ? titleId : void 0,
			tabIndex: -1,
			...rest,
			children: [
				title || dismissable ? /* @__PURE__ */ jsxs("header", {
					className: "dr-modal-head",
					children: [/* @__PURE__ */ jsx("div", {
						id: titleId,
						className: "dr-modal-title",
						children: title
					}), dismissable ? /* @__PURE__ */ jsx(IconButton, {
						icon: "close",
						label: "Close",
						size: "sm",
						className: "dr-modal-close",
						onClick: onClose
					}) : null]
				}) : null,
				/* @__PURE__ */ jsx("div", {
					className: "dr-modal-body",
					children
				}),
				footer ? /* @__PURE__ */ jsx("footer", {
					className: "dr-modal-foot",
					children: footer
				}) : null
			]
		})
	}), document.body);
}
var DialogContext = createContext(null);
/** Hosts useConfirm / usePrompt dialogs (AppProvider includes it). */
function DialogProvider({ children }) {
	const [dialog, setDialog] = useState(null);
	const [text, setText] = useState("");
	const open = useCallback((kind, options) => new Promise((resolve) => {
		setText(options.defaultValue ?? "");
		setDialog({
			kind,
			options,
			resolve
		});
	}), []);
	const close = (result) => {
		dialog?.resolve(result);
		setDialog(null);
	};
	const options = dialog?.options ?? {};
	const isPrompt = dialog?.kind === "prompt";
	const submit = () => close(isPrompt ? text : true);
	return /* @__PURE__ */ jsxs(DialogContext.Provider, {
		value: open,
		children: [children, /* @__PURE__ */ jsxs(Modal, {
			open: !!dialog,
			size: "sm",
			title: options.title ?? (isPrompt ? "Enter a value" : "Are you sure?"),
			onClose: () => close(isPrompt ? null : false),
			footer: [/* @__PURE__ */ jsx(Button, {
				onClick: () => close(isPrompt ? null : false),
				children: options.cancelLabel ?? "Cancel"
			}, "cancel"), /* @__PURE__ */ jsx(Button, {
				variant: options.danger ? "danger" : "primary",
				onClick: submit,
				disabled: isPrompt && options.required !== false && !text.trim(),
				children: options.confirmLabel ?? (isPrompt ? "OK" : "Confirm")
			}, "ok")],
			children: [options.message ? /* @__PURE__ */ jsx("p", {
				className: "dr-modal-message",
				children: options.message
			}) : null, isPrompt ? /* @__PURE__ */ jsx(TextInput, {
				value: text,
				onChange: setText,
				onEnter: submit,
				placeholder: options.placeholder,
				autoFocus: true
			}) : null]
		})]
	});
}
function useDialog() {
	const open = useContext(DialogContext);
	if (!open) throw new Error("dimos-react: useConfirm/usePrompt need a <DialogProvider> (or <AppProvider>) above them");
	return open;
}
/** `const confirm = useConfirm(); if (await confirm({ title, message, danger, confirmLabel })) …` → true/false. */
function useConfirm() {
	const open = useDialog();
	return useCallback((options = {}) => open("confirm", typeof options === "string" ? { message: options } : options), [open]);
}
/** `const prompt = usePrompt(); const name = await prompt({ title, defaultValue, placeholder })` → string or null. */
function usePrompt() {
	const open = useDialog();
	return useCallback((options = {}) => open("prompt", typeof options === "string" ? { title: options } : options), [open]);
}
/** A spinning ring; `label` for screen readers. */
function Spinner({ size = 18, label = "Loading", className, ...rest }) {
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-spinner", className),
		style: {
			width: size,
			height: size
		},
		role: "status",
		"aria-label": label,
		...rest
	});
}
/** A bar: `value` 0..1, or none for an indeterminate one. `tone` colors it. */
function Progress({ value, tone = "primary", label, className, ...rest }) {
	const known = typeof value === "number" && Number.isFinite(value);
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-progress", !known && "dr-progress--indeterminate", tone !== "primary" && `dr-progress--${tone}`, className),
		role: "progressbar",
		"aria-valuemin": 0,
		"aria-valuemax": 100,
		"aria-valuenow": known ? Math.round(value * 100) : void 0,
		"aria-label": label,
		...rest,
		children: /* @__PURE__ */ jsx("div", {
			className: "dr-progress-fill",
			style: known ? { width: `${Math.min(1, Math.max(0, value)) * 100}%` } : void 0
		})
	});
}
/** A ring: `value` 0..1 (uploads, downloads); shows the percent inside unless `children` replace it. */
function ProgressRing({ value = 0, size = 44, stroke = 4, tone = "primary", className, children, ...rest }) {
	const radius = (size - stroke) / 2;
	const length = 2 * Math.PI * radius;
	const clamped = Math.min(1, Math.max(0, value));
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-ring", tone !== "primary" && `dr-ring--${tone}`, className),
		style: {
			width: size,
			height: size
		},
		role: "progressbar",
		"aria-valuenow": Math.round(clamped * 100),
		...rest,
		children: [/* @__PURE__ */ jsxs("svg", {
			width: size,
			height: size,
			viewBox: `0 0 ${size} ${size}`,
			children: [/* @__PURE__ */ jsx("circle", {
				className: "dr-ring-track",
				cx: size / 2,
				cy: size / 2,
				r: radius,
				strokeWidth: stroke,
				fill: "none"
			}), /* @__PURE__ */ jsx("circle", {
				className: "dr-ring-fill",
				cx: size / 2,
				cy: size / 2,
				r: radius,
				strokeWidth: stroke,
				fill: "none",
				strokeDasharray: length,
				strokeDashoffset: length * (1 - clamped),
				transform: `rotate(-90 ${size / 2} ${size / 2})`
			})]
		}), /* @__PURE__ */ jsx("span", {
			className: "dr-ring-label",
			children: children ?? `${Math.round(clamped * 100)}%`
		})]
	});
}
/** A loading placeholder block. */
function Skeleton({ width = "100%", height = 14, className, style, ...rest }) {
	return /* @__PURE__ */ jsx("span", {
		className: cx("dr-skeleton", className),
		style: {
			width,
			height,
			...style
		},
		...rest
	});
}
/** A first-run / empty / error message with next steps. `layer` centers it over a whole view (a canvas, a 3D scene). */
function EmptyState({ icon = "info", title, message, actions, tone, layer = false, variant = "centered", label, busy = false, className, children, ...rest }) {
	if (variant === "notice") return /* @__PURE__ */ jsx("div", {
		className: cx("dr-empty", "dr-empty--notice", layer && "dr-empty--layer", className),
		...rest,
		children: /* @__PURE__ */ jsxs("div", {
			className: cx("dr-empty-inner", tone && `dr-empty-inner--${tone}`, busy && "dr-empty-inner--busy"),
			role: "status",
			children: [
				label ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-label",
					children: label
				}) : null,
				title ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-title",
					children: title
				}) : null,
				message ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-text",
					children: message
				}) : null,
				children,
				actions ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-actions",
					children: actions
				}) : null
			]
		})
	});
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-empty", layer && "dr-empty--layer", tone && `dr-empty--${tone}`, className),
		...rest,
		children: /* @__PURE__ */ jsxs("div", {
			className: "dr-empty-inner",
			children: [
				icon ? /* @__PURE__ */ jsx("span", {
					className: "dr-empty-icon",
					children: /* @__PURE__ */ jsx(Icon, {
						name: icon,
						size: 28,
						strokeWidth: 1.5
					})
				}) : null,
				title ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-title",
					children: title
				}) : null,
				message ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-text",
					children: message
				}) : null,
				children,
				actions ? /* @__PURE__ */ jsx("div", {
					className: "dr-empty-actions",
					children: actions
				}) : null
			]
		})
	});
}
/** `error.message` when the thrown value has one, else the value itself. */
var errorText = (error) => String((typeof error === "object" && error !== null && "message" in error ? error.message : void 0) ?? error);
/**
* Catches render errors below it and shows `fallback` (an element, or `({ error, reset }) => element`); reports via
* `onError(error, info)`.
*/
var ErrorBoundary = class extends Component {
	reset;
	constructor(props) {
		super(props);
		this.state = { error: null };
		this.reset = () => this.setState({ error: null });
	}
	static getDerivedStateFromError(error) {
		return { error };
	}
	componentDidCatch(error, info) {
		this.props.onError?.(error, info);
	}
	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		const { fallback } = this.props;
		if (typeof fallback === "function") return fallback({
			error,
			reset: this.reset
		});
		return fallback ?? /* @__PURE__ */ jsx(EmptyState, {
			icon: "warn",
			tone: "danger",
			title: "Something went wrong",
			message: errorText(error),
			actions: /* @__PURE__ */ jsx(Button, {
				size: "sm",
				onClick: this.reset,
				children: "Try again"
			})
		});
	}
};
//#endregion
//#region src/components/input_devices.tsx
/** Pointer offset from a circle's center → stick value in -1..1 (y up), clamped to the unit circle. */
function stickValue(dx, dy, radius) {
	let x = dx / radius;
	let y = -dy / radius;
	const length = Math.hypot(x, y);
	if (length > 1) {
		x /= length;
		y /= length;
	}
	return {
		x,
		y
	};
}
/** A virtual joystick: `onChange({ x, y })` (-1..1, y up) on every move while held, `{0, 0}` on release. */
function Joystick({ onChange, onStart, onEnd, size = 132, disabled, label, className, style, ...rest }) {
	const base = useRef(null);
	const [knob, setKnob] = useState({
		x: 0,
		y: 0,
		active: false
	});
	const radius = size / 2 - size * .18;
	const update = (event) => {
		const rect = base.current.getBoundingClientRect();
		const value = stickValue(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2), radius);
		setKnob({
			...value,
			active: true
		});
		onChange?.(value);
	};
	const release = () => {
		setKnob({
			x: 0,
			y: 0,
			active: false
		});
		onChange?.({
			x: 0,
			y: 0
		});
		onEnd?.();
	};
	return /* @__PURE__ */ jsxs("div", {
		ref: base,
		className: cx("dr-joystick", knob.active && "dr-joystick--active", disabled && "dr-joystick--disabled", className),
		style: {
			width: size,
			height: size,
			touchAction: "none",
			...style
		},
		role: "application",
		"aria-label": typeof label === "string" ? label : "Joystick",
		onPointerDown: (event) => {
			if (disabled) return;
			event.currentTarget.setPointerCapture?.(event.pointerId);
			onStart?.();
			update(event);
		},
		onPointerMove: (event) => {
			if (knob.active && !disabled) update(event);
		},
		onPointerUp: () => knob.active && release(),
		onPointerCancel: () => knob.active && release(),
		onLostPointerCapture: () => knob.active && release(),
		...rest,
		children: [
			/* @__PURE__ */ jsx("span", { className: "dr-joystick__ring" }),
			/* @__PURE__ */ jsx("span", { className: "dr-joystick__cross" }),
			/* @__PURE__ */ jsx("span", {
				className: "dr-joystick__knob",
				style: {
					width: size * .36,
					height: size * .36,
					transform: `translate(calc(-50% + ${knob.x * radius}px), calc(-50% + ${-knob.y * radius}px))`
				}
			}),
			label ? /* @__PURE__ */ jsx("span", {
				className: "dr-joystick__label",
				children: label
			}) : null
		]
	});
}
/**
* A small read-only stick: a ring with a dot where a stick is (x, y in -1..1, y up), e.g. a gamepad's or a policy's
* sticks. `value` null shows it idle.
*/
function StickIndicator({ value, size = 22, label = "stick", className, ...rest }) {
	const x = value?.x ?? 0;
	const y = value?.y ?? 0;
	return /* @__PURE__ */ jsxs("svg", {
		className: cx("dr-stick-indicator", value && (x || y) && "dr-stick-indicator--live", className),
		width: size,
		height: size,
		viewBox: "-1.2 -1.2 2.4 2.4",
		role: "img",
		"aria-label": `${label} ${x.toFixed(2)}, ${y.toFixed(2)}`,
		...rest,
		children: [
			/* @__PURE__ */ jsx("circle", {
				r: 1,
				className: "dr-stick-indicator__ring"
			}),
			/* @__PURE__ */ jsx("line", {
				x1: 0,
				y1: 0,
				x2: x,
				y2: -y,
				className: "dr-stick-indicator__arm"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: x,
				cy: -y,
				r: .28,
				className: "dr-stick-indicator__dot"
			})
		]
	});
}
var DIRECTIONS = [
	["up", "arrow-up"],
	["left", "arrow-left"],
	["center", null],
	["right", "arrow-right"],
	["down", "arrow-down"]
];
/**
* A D-pad: `onPress(dir)` when a direction goes down, `onRelease(dir)` when it comes up ("up" | "down" | "left" |
* "right" | "center"). Holds while the pointer is down.
*/
function DPad({ onPress, onRelease, size = 132, center, disabled, held = [], className, style, ...rest }) {
	const [down, setDown] = useState(null);
	const press = (dir, event) => {
		if (disabled) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		setDown(dir);
		onPress?.(dir);
	};
	const release = (dir) => {
		if (down === dir) {
			setDown(null);
			onRelease?.(dir);
		}
	};
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-dpad", disabled && "dr-dpad--disabled", className),
		style: {
			width: size,
			height: size,
			...style
		},
		...rest,
		children: DIRECTIONS.map(([dir, icon]) => {
			if (dir === "center" && center === void 0) return /* @__PURE__ */ jsx("span", { className: "dr-dpad__hub" }, dir);
			return /* @__PURE__ */ jsx("button", {
				type: "button",
				"aria-label": dir,
				"aria-pressed": down === dir || held.includes(dir),
				disabled,
				className: cx("dr-dpad__btn", `dr-dpad__btn--${dir}`),
				style: { touchAction: "none" },
				onPointerDown: (event) => press(dir, event),
				onPointerUp: () => release(dir),
				onPointerCancel: () => release(dir),
				onLostPointerCapture: () => release(dir),
				onContextMenu: (event) => event.preventDefault(),
				children: icon ? /* @__PURE__ */ jsx(Icon, {
					name: icon,
					size: Math.round(size * .15)
				}) : center
			}, dir);
		})
	});
}
/** A drop zone that also opens the file picker on click. */
function FileDrop({ onFiles, accept, multiple = false, disabled, title = "Drop a file here", hint = "or click to choose", icon = "upload", children, className, style, ...rest }) {
	const input = useRef(null);
	const [over, setOver] = useState(false);
	const accepts = (file) => {
		if (!accept) return true;
		return accept.split(",").map((part) => part.trim().toLowerCase()).some((rule) => rule.startsWith(".") ? file.name.toLowerCase().endsWith(rule) : rule.endsWith("/*") ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule);
	};
	const take = (list) => {
		const files = [...list ?? []].filter(accepts);
		if (files.length) onFiles?.(multiple ? files : files.slice(0, 1));
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-filedrop", over && "dr-filedrop--over", disabled && "dr-filedrop--disabled", className),
		style,
		role: "button",
		tabIndex: disabled ? -1 : 0,
		onClick: () => !disabled && input.current?.click(),
		onKeyDown: (event) => {
			if (!disabled && (event.key === "Enter" || event.key === " ")) {
				event.preventDefault();
				input.current?.click();
			}
		},
		onDragOver: (event) => {
			if (disabled) return;
			event.preventDefault();
			setOver(true);
		},
		onDragLeave: () => setOver(false),
		onDrop: (event) => {
			event.preventDefault();
			setOver(false);
			if (!disabled) take(event.dataTransfer?.files);
		},
		...rest,
		children: [/* @__PURE__ */ jsx("input", {
			ref: input,
			type: "file",
			accept,
			multiple,
			hidden: true,
			onChange: (event) => {
				take(event.target.files);
				event.target.value = "";
			}
		}), children ?? [
			/* @__PURE__ */ jsx(Icon, {
				name: icon,
				size: 24,
				className: "dr-filedrop__icon"
			}, "i"),
			/* @__PURE__ */ jsx("div", {
				className: "dr-filedrop__title",
				children: title
			}, "t"),
			hint ? /* @__PURE__ */ jsx("div", {
				className: "dr-filedrop__hint",
				children: hint
			}, "h") : null
		]]
	});
}
/** A color picker swatch (the color is user data: a layer's color, a path's color), with optional presets. */
function ColorSwatch({ value, onChange, presets, disabled, label = "Color", className, ...rest }) {
	return /* @__PURE__ */ jsxs("span", {
		className: cx("dr-swatch", className),
		...rest,
		children: [/* @__PURE__ */ jsxs("label", {
			className: cx("dr-swatch__pick", disabled && "dr-swatch__pick--disabled"),
			title: value,
			children: [/* @__PURE__ */ jsx("span", {
				className: "dr-swatch__color",
				style: { background: value }
			}), /* @__PURE__ */ jsx("input", {
				type: "color",
				className: "dr-sr-only",
				"aria-label": label,
				value,
				disabled,
				onChange: (event) => onChange?.(event.target.value)
			})]
		}), presets?.map((preset) => /* @__PURE__ */ jsx("button", {
			type: "button",
			disabled,
			title: preset,
			"aria-label": `${label} ${preset}`,
			"aria-pressed": preset.toLowerCase() === String(value).toLowerCase(),
			className: "dr-swatch__preset",
			style: { background: preset },
			onClick: () => onChange?.(preset)
		}, preset))]
	});
}
/** Key hints for a HUD: `[[["W", "A", "S", "D"], "drive"], [["Space"], "stop"]]` (a string key list works too: "W A S D"). */
function KeyHints({ hints = [], vertical = false, className, ...rest }) {
	return /* @__PURE__ */ jsx("div", {
		className: cx("dr-keyhints", vertical && "dr-keyhints--vertical", className),
		...rest,
		children: hints.map(([keys, label], index) => /* @__PURE__ */ jsxs("span", {
			className: "dr-keyhints__item",
			children: [(Array.isArray(keys) ? keys : String(keys).split(" ")).map((key, keyIndex) => /* @__PURE__ */ jsx("kbd", {
				className: "dr-kbd",
				children: key
			}, keyIndex)), /* @__PURE__ */ jsx("span", {
				className: "dr-keyhints__label",
				children: label
			})]
		}, index))
	});
}
/** Keeps calling `onTick(value)` at `hz` while `value` is non-zero (a joystick held still still drives). */
function useRepeatWhileHeld(value, onTick, hz = 10) {
	const latest = useRef(onTick);
	latest.current = onTick;
	const active = value && (value.x || value.y);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => latest.current(value), 1e3 / hz);
		return () => clearInterval(timer);
	}, [
		active,
		value?.x,
		value?.y,
		hz
	]);
}
//#endregion
//#region src/colormaps.ts
/** Stops as [position 0..1, "#rrggbb"]; piecewise-linear in sRGB. */
var RAMPS = {
	memworld: [
		[0, "#6f15b3"],
		[1 / 3, "#1b54f8"],
		[2 / 3, "#1cd0f2"],
		[1, "#90f690"]
	],
	turbo: [
		[0, "#3e5fd8"],
		[.2, "#4675ed"],
		[.3, "#39a2fc"],
		[.4, "#1bcfd4"],
		[.5, "#24eca6"],
		[.6, "#61fc6c"],
		[.7, "#a4fc3b"],
		[.8, "#d1e834"],
		[.9, "#f3c63a"],
		[1, "#fe9b2d"]
	],
	viridis: [
		[0, "#440154"],
		[.25, "#3b528b"],
		[.5, "#21918c"],
		[.75, "#5ec962"],
		[1, "#fde725"]
	],
	magma: [
		[0, "#000004"],
		[.25, "#51127c"],
		[.5, "#b73779"],
		[.75, "#fc8961"],
		[1, "#fcfdbf"]
	],
	plasma: [
		[0, "#0d0887"],
		[.25, "#7e03a8"],
		[.5, "#cc4778"],
		[.75, "#f89540"],
		[1, "#f0f921"]
	],
	ice: [
		[0, "#0b1d3a"],
		[.35, "#1f5f9e"],
		[.7, "#7fc8f8"],
		[1, "#f4fbff"]
	],
	sunset: [
		[0, "#1a1046"],
		[.3, "#7b2d7a"],
		[.6, "#e0565b"],
		[.85, "#f6a04d"],
		[1, "#fde39b"]
	],
	grayscale: [[0, "#1a1a1a"], [1, "#f2f2f2"]]
};
var GRADIENTS = Object.keys(RAMPS);
var DEFAULT_GRADIENT = "memworld";
function hexToRgb(hex) {
	const value = parseInt(hex.slice(1), 16);
	return [
		value >> 16 & 255,
		value >> 8 & 255,
		value & 255
	];
}
/** Soft neon palettes (bright enough to glow on a dark scene); linear in sRGB between evenly spaced stops. */
var PALETTES = {
	aurora: {
		label: "Aurora (purple → blue → cyan → green)",
		colors: [
			"#a05cf0",
			"#5a86f2",
			"#3ed4e0",
			"#6ee68c"
		]
	},
	ember: {
		label: "Ember (gold → orange → red)",
		colors: [
			"#f2c64e",
			"#f08c4c",
			"#e8565e"
		]
	},
	rose: {
		label: "Rose (pink → blush → white)",
		colors: [
			"#f264b0",
			"#f2a6cc",
			"#f6e8ee"
		]
	}
};
var PALETTE_NAMES = Object.keys(PALETTES);
var DEFAULT_PALETTE = "aurora";
/** meters of height one full up-and-back cycle spans */
var DEFAULT_PERIOD = 9;
/** True for a repeating palette's name (PALETTES), false for a ramp (RAMPS). */
function isPalette(name) {
	return Object.hasOwn(PALETTES, name);
}
/** Where in its cycle a height is, 0 (inclusive) to 1 (exclusive); negative heights wrap the same way. */
function cyclePhase(height, period = 9) {
	const turns = height / Math.max(1e-6, period);
	return turns - Math.floor(turns);
}
/** A palette's color at a phase (0..1, wrapping) as 0..255 rgb: first color at 0, last at 0.5, first again at 1. */
function paletteAt(name, phase) {
	const colors = (PALETTES[name] ?? PALETTES["aurora"]).colors.map(hexToRgb);
	const wrapped = phase - Math.floor(phase);
	const along = (1 - Math.abs(2 * wrapped - 1)) * (colors.length - 1);
	const index = Math.min(colors.length - 2, Math.floor(along));
	const mix = along - index;
	const [a, b] = [colors[index], colors[index + 1]];
	return [
		a[0] + (b[0] - a[0]) * mix,
		a[1] + (b[1] - a[1]) * mix,
		a[2] + (b[2] - a[2]) * mix
	];
}
/** A palette's color for a height. */
function heightColor(name, height, period = 9) {
	return paletteAt(name, cyclePhase(height, period));
}
/** The palette for another cloud beside one drawn in `taken`: the next one, so the two never match. */
function otherPalette(taken) {
	return PALETTE_NAMES[(PALETTE_NAMES.indexOf(taken) + 1) % PALETTE_NAMES.length];
}
/** The ramp's color at t (0..1) as 0..255 rgb (a palette's: at phase t). */
function sampleGradient(name, t) {
	if (isPalette(name)) return paletteAt(name, t);
	const stops = RAMPS[name] ?? RAMPS["memworld"];
	const clamped = Math.min(1, Math.max(0, t));
	for (let index = 1; index < stops.length; index++) {
		const [position, hex] = stops[index];
		if (clamped <= position) {
			const [lastPosition, lastHex] = stops[index - 1];
			const mix = (clamped - lastPosition) / (position - lastPosition || 1);
			const a = hexToRgb(lastHex);
			const b = hexToRgb(hex);
			return [
				a[0] + (b[0] - a[0]) * mix,
				a[1] + (b[1] - a[1]) * mix,
				a[2] + (b[2] - a[2]) * mix
			];
		}
	}
	return hexToRgb(stops[stops.length - 1][1]);
}
//#endregion
//#region src/components/media.tsx
var DEPTH_COLORMAPS = [
	"turbo",
	"magma",
	"plasma",
	"memworld",
	"viridis",
	"grayscale"
];
/** Raw depth units → meters: 32FC1 is meters, 16UC1 (and mono16) millimetres. */
var depthScale = (encoding) => encoding === "32FC1" ? 1 : .001;
var RAW_BYTES = {
	mono8: 1,
	"8uc1": 1,
	rgb8: 3,
	bgr8: 3,
	rgba8: 4,
	bgra8: 4
};
/**
* A frame (whatever form it arrives in) → `{ kind: "image" | "depth", width, height, encoding, data }`, or an
* `{ kind: "encoded", format, data }` for jpeg/png/webp. Takes a pre-decoded frame (a replay's), a decoded
* sensor_msgs.Image or sensor_msgs.CompressedImage.
*/
function normalizeFrame(value) {
	if (!value) return null;
	if (value.kind === "image" || value.kind === "depth") {
		if ([
			"jpeg",
			"png",
			"webp"
		].includes(value.encoding)) return {
			kind: "encoded",
			format: value.encoding,
			data: value.data,
			frame: value.frame
		};
		return value;
	}
	if (value.format !== void 0 && value.data) return {
		kind: "encoded",
		format: /png/i.test(value.format) ? "png" : /webp/i.test(value.format) ? "webp" : "jpeg",
		data: value.data,
		frame: value.header?.frame_id
	};
	if (value.encoding !== void 0 && value.data) return {
		kind: [
			"16UC1",
			"32FC1",
			"mono16"
		].includes(value.encoding) ? "depth" : "image",
		width: value.width,
		height: value.height,
		encoding: value.encoding,
		step: value.step,
		data: value.data,
		frame: value.header?.frame_id
	};
	return null;
}
/** Raw pixels → RGBA ImageData (null for an encoding it can't read). */
function rawToImageData(frame) {
	const { width, height, data } = frame;
	const bpp = RAW_BYTES[frame.encoding] ?? 0;
	if (!width || !height || !bpp) return null;
	const out = new ImageData(width, height);
	const pixels = out.data;
	const stride = frame.step || Math.floor(data.byteLength / height);
	const bgr = frame.encoding.startsWith("bgr");
	for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
		const at = row * stride + column * bpp;
		const o = (row * width + column) * 4;
		if (bpp === 1) pixels[o] = pixels[o + 1] = pixels[o + 2] = data[at];
		else {
			pixels[o] = data[at + (bgr ? 2 : 0)];
			pixels[o + 1] = data[at + 1];
			pixels[o + 2] = data[at + (bgr ? 0 : 2)];
		}
		pixels[o + 3] = 255;
	}
	return out;
}
/** The depth values of a depth frame as numbers (meters after `depthScale`). */
function depthValues(frame) {
	const bytes = frame.data;
	const copy = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
	return frame.encoding === "32FC1" ? new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4)) : new Uint16Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 2));
}
/**
* A depth frame → colormapped ImageData (near = the ramp's end, far = its start; no return = transparent), and the
* range it used: `near`/`far` in meters, or null for automatic (2nd–98th percentile, eased by `previous`).
*/
function colorizeDepth(frame, { colormap = "turbo", near = null, far = null, previous = null } = {}) {
	const values = depthValues(frame);
	const scale = depthScale(frame.encoding);
	let range = [near ?? 0, far ?? 1];
	if (near === null || far === null) {
		const step = Math.max(1, Math.floor(values.length / 4096));
		const samples = [];
		for (let index = 0; index < values.length; index += step) {
			const value = values[index];
			if (value > 0 && Number.isFinite(value)) samples.push(value * scale);
		}
		if (samples.length) {
			samples.sort((a, b) => a - b);
			const low = samples[Math.floor(samples.length * .02)];
			const high = samples[Math.floor(samples.length * .98)];
			range = previous ? [previous[0] + (low - previous[0]) * .2, previous[1] + (high - previous[1]) * .2] : [low, high];
		}
		range = [near ?? range[0], far ?? range[1]];
	}
	const lut = /* @__PURE__ */ new Uint8Array(768);
	for (let index = 0; index < 256; index++) {
		const [r, g, b] = sampleGradient(colormap, 1 - index / 255);
		lut[index * 3] = r;
		lut[index * 3 + 1] = g;
		lut[index * 3 + 2] = b;
	}
	const { width, height } = frame;
	const out = new ImageData(width, height);
	const pixels = out.data;
	const span = Math.max(1e-6, range[1] - range[0]);
	const count = Math.min(width * height, values.length);
	for (let index = 0; index < count; index++) {
		const value = values[index];
		if (!(value > 0) || !Number.isFinite(value)) continue;
		const slot = Math.round(Math.min(1, Math.max(0, (value * scale - range[0]) / span)) * 255) * 3;
		const o = index * 4;
		pixels[o] = lut[slot];
		pixels[o + 1] = lut[slot + 1];
		pixels[o + 2] = lut[slot + 2];
		pixels[o + 3] = 255;
	}
	return {
		image: out,
		range
	};
}
/** A stable, distinct color per name (HSL), for boxes of one class. */
function nameColor(name) {
	let hash = 0;
	for (const char of String(name)) hash = hash * 31 + char.charCodeAt(0) | 0;
	return `hsl(${(hash >>> 0) % 360} 75% 60%)`;
}
/** vision_msgs.Detection2DArray / Detection2D / BoundingBox2DArray drawn over an image (pixel coordinates). */
function drawDetections2D(context, message) {
	const boxes = message?.detections ?? message?.boxes?.map((bbox) => ({ bbox })) ?? [message];
	const theme = themeColors();
	context.lineWidth = Math.max(2, context.canvas.width / 400);
	context.font = `${Math.max(12, context.canvas.width / 60)}px ${theme.sans || "sans-serif"}`;
	context.textBaseline = "bottom";
	for (const detection of boxes) {
		const box = detection?.bbox ?? {};
		const center = box.center?.position ?? box.center ?? {
			x: 0,
			y: 0
		};
		const left = center.x - (box.size_x ?? 0) / 2;
		const top = center.y - (box.size_y ?? 0) / 2;
		const best = [...detection?.results ?? []].sort((a, b) => (b.hypothesis?.score ?? 0) - (a.hypothesis?.score ?? 0))[0];
		const name = best?.hypothesis?.class_id || detection?.id || "";
		const color = nameColor(name || "box");
		context.strokeStyle = color;
		context.strokeRect(left, top, box.size_x ?? 0, box.size_y ?? 0);
		if (name) {
			const text = best?.hypothesis?.score !== void 0 ? `${name} ${(best.hypothesis.score * 100).toFixed(0)}%` : name;
			const width = context.measureText(text).width + 8;
			const height = parseFloat(context.font) + 4;
			context.fillStyle = color;
			context.fillRect(left, top - height, width, height);
			context.fillStyle = theme.bg || "black";
			context.fillText(text, left + 4, top - 2);
		}
	}
}
/** Message types an ImageView can draw over its image. */
var IMAGE_OVERLAY_TYPES = [
	"vision_msgs.Detection2DArray",
	"vision_msgs.Detection2D",
	"vision_msgs.BoundingBox2DArray"
];
/**
* A camera / image view: the latest frame of an image topic (sensor_msgs.Image, CompressedImage, or a source's
* pre-decoded frames), or `frame` as a prop. Depth images (16UC1 / 32FC1) are drawn through a colormap.
*/
function ImageView({ topic, frame, encoding, maxHz = 30, depth, colormap = "turbo", near = null, far = null, fit = "contain", overlayTopic, onInfo, className, style, children, ...rest }) {
	const source = useDataSource();
	const canvas = useRef(null);
	const overlay = useRef(null);
	const state = useRef({
		ticket: 0,
		newest: 0,
		frames: 0,
		since: 0,
		fps: 0,
		range: null,
		info: ""
	});
	const settings = useRef({});
	settings.current = {
		depth,
		colormap,
		near,
		far,
		onInfo
	};
	const lastDepth = useRef(null);
	const [empty, setEmpty] = useState(true);
	const report = (width, height, quality, isDepth) => {
		const s = state.current;
		s.frames++;
		const now = performance.now();
		if (!s.since) s.since = now;
		else if (now - s.since > 1e3) {
			s.fps = Math.round(s.frames * 1e3 / (now - s.since));
			s.frames = 0;
			s.since = now;
		}
		const info = {
			width,
			height,
			fps: s.fps,
			quality,
			depth: isDepth,
			range: isDepth ? s.range : null
		};
		const signature = JSON.stringify(info);
		if (signature !== s.info) {
			s.info = signature;
			settings.current.onInfo?.(info);
		}
	};
	const show = async (value, quality = "full") => {
		const element = canvas.current;
		const normalized = normalizeFrame(value);
		if (!element || !normalized) return;
		const s = state.current;
		const mine = ++s.ticket;
		const { depth: forceDepth, colormap, near, far } = settings.current;
		let drawable;
		let isDepth = false;
		if (normalized.kind === "encoded") try {
			drawable = await createImageBitmap(new Blob([normalized.data], { type: `image/${normalized.format}` }));
		} catch {
			return;
		}
		else if (normalized.kind === "depth" || forceDepth) {
			isDepth = true;
			lastDepth.current = {
				frame: normalized,
				quality
			};
			const result = colorizeDepth(normalized, {
				colormap,
				near,
				far,
				previous: s.range
			});
			s.range = result.range;
			drawable = result.image;
		} else drawable = rawToImageData(normalized);
		if (!drawable || mine < s.newest) {
			if (drawable && "close" in drawable) drawable.close?.();
			return;
		}
		s.newest = mine;
		if (element.width !== drawable.width || element.height !== drawable.height) {
			element.width = drawable.width;
			element.height = drawable.height;
		}
		const context = element.getContext("2d");
		if (drawable instanceof ImageData) context.putImageData(drawable, 0, 0);
		else {
			context.drawImage(drawable, 0, 0);
			drawable.close?.();
		}
		element.dataset.quality = String(quality);
		setEmpty(false);
		report(element.width, element.height, quality, isDepth);
	};
	useEffect(() => {
		if (lastDepth.current) show(lastDepth.current.frame, lastDepth.current.quality);
	}, [
		colormap,
		near,
		far
	]);
	useEffect(() => {
		if (frame) show(frame);
	}, [frame]);
	useEffect(() => {
		if (!topic) return;
		setEmpty(true);
		state.current.range = null;
		const type = parseKey(topic)?.type;
		const off = source.subscribe(topic, {
			delivery: "latest",
			maxHz,
			...encoding ? { encoding } : {}
		}, (message) => {
			let value;
			try {
				value = decodeMessage(message, "auto", type);
			} catch {
				return;
			}
			show(value, message.quality ?? "full");
		});
		return () => off();
	}, [
		source,
		topic,
		encoding,
		maxHz
	]);
	useEffect(() => {
		const element = overlay.current;
		const clear = () => element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
		if (!overlayTopic || !element) {
			clear();
			return;
		}
		const type = parseKey(overlayTopic)?.type;
		const off = source.subscribe(overlayTopic, {
			delivery: "latest",
			maxHz: 30
		}, (message) => {
			let value;
			try {
				value = decodeMessage(message, "auto", type);
			} catch {
				return;
			}
			const image = canvas.current;
			const width = image?.width || element.width;
			const height = image?.height || element.height;
			if (element.width !== width || element.height !== height) {
				element.width = width;
				element.height = height;
			}
			clear();
			drawDetections2D(element.getContext("2d"), value);
		});
		return () => {
			off();
			clear();
		};
	}, [source, overlayTopic]);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-image", `dr-image--${fit}`, empty && "dr-image--empty", className),
		style,
		...rest,
		children: [
			/* @__PURE__ */ jsx("canvas", {
				ref: canvas,
				className: "dr-image__media"
			}),
			/* @__PURE__ */ jsx("canvas", {
				ref: overlay,
				className: "dr-image__media dr-image__overlay"
			}),
			empty ? /* @__PURE__ */ jsx("div", {
				className: "dr-image__waiting",
				children: /* @__PURE__ */ jsx(Icon, {
					name: "camera",
					size: 22
				})
			}) : null,
			children
		]
	});
}
/** 83.4 → "1:23.4"; over an hour "1:02:03". */
function playbackClock(seconds) {
	const sign = seconds < 0 ? "-" : "";
	const value = Math.abs(seconds);
	const hours = Math.floor(value / 3600);
	const minutes = Math.floor(value % 3600 / 60);
	const rest = value % 60;
	if (hours) return `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(Math.floor(rest)).padStart(2, "0")}`;
	return `${sign}${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}
function LaneTicks({ ticks, view }) {
	const canvas = useRef(null);
	useEffect(() => {
		const element = canvas.current;
		if (!element) return;
		const draw = () => {
			const ratio = globalThis.devicePixelRatio || 1;
			const width = Math.max(1, Math.round(element.clientWidth * ratio));
			const height = Math.max(1, Math.round(element.clientHeight * ratio));
			element.width = width;
			element.height = height;
			const context = element.getContext("2d");
			context.clearRect(0, 0, width, height);
			if (!ticks) return;
			context.fillStyle = getComputedStyle(element).color;
			const range = Math.max(1e-9, view.to - view.from);
			if (ticks.times) {
				context.globalAlpha = .9;
				for (const t of ticks.times) if (t >= view.from && t <= view.to) context.fillRect(Math.round((t - view.from) / range * width), height * .2, ratio, height * .6);
			} else if (ticks.counts?.length) {
				const most = Math.max(1, ...ticks.counts);
				const slice = width / ticks.counts.length;
				ticks.counts.forEach((count, bin) => {
					if (count) {
						context.globalAlpha = .35 + .65 * Math.min(1, count / most);
						context.fillRect(Math.floor(bin * slice), height * .2, Math.max(ratio, Math.ceil(slice)), height * .6);
					}
				});
			}
			context.globalAlpha = 1;
		};
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(element);
		return () => observer.disconnect();
	}, [
		ticks,
		view.from,
		view.to
	]);
	return /* @__PURE__ */ jsx("canvas", {
		ref: canvas,
		className: "dr-playback__ticks"
	});
}
/**
* A recording player's bar: play / pause, the time, speed, loop, a scrubber that zooms (ctrl/⌘ + wheel; any wheel
* over the lanes) and pans (horizontal scroll), and, expanded, a lane per stream with a tick per message on the same
* axis. Dragging anywhere on the axis scrubs: `onScrubStart`, `onSeek(t)` per move, `onScrubEnd`.
*/
function PlaybackBar({ start, end, value, playing = false, onPlayPause, onSeek, onScrubStart, onScrubEnd, scrubbing = false, speed, speeds = [
	.1,
	.25,
	.5,
	1,
	2,
	4,
	8,
	16
], onSpeedChange, loop, onLoopChange, format, lanes, lanesLabel = "Streams", expanded = false, onExpandedChange, view: givenView, onViewChange, keyboard = false, controls, className, style, ...rest }) {
	const [innerView, setInnerView] = useState({
		from: start,
		to: end
	});
	const view = givenView ?? innerView;
	const setView = (next) => {
		if (!givenView) setInnerView(next);
		onViewChange?.(next);
	};
	useEffect(() => {
		if (!givenView) setInnerView({
			from: start,
			to: end
		});
	}, [start, end]);
	const show = format ?? ((t) => playbackClock(t - start));
	const span = Math.max(1e-6, end - start);
	const zoomed = view.from > start + 1e-6 || view.to < end - 1e-6;
	const [hover, setHover] = useState(null);
	const endScrub = useRef(null);
	const latest = useRef({
		value,
		playing,
		onSeek,
		onPlayPause,
		onScrubStart,
		onScrubEnd,
		start,
		end
	});
	latest.current = {
		value,
		playing,
		onSeek,
		onPlayPause,
		onScrubStart,
		onScrubEnd,
		start,
		end
	};
	useEffect(() => () => endScrub.current?.(), []);
	useEffect(() => {
		if (!keyboard) return;
		const typing = (target) => target?.closest?.("input, select, textarea, [contenteditable]");
		const onKey = (event) => {
			if (typing(event.target) || event.metaKey || event.ctrlKey) return;
			const { value, playing, onSeek, onPlayPause, start, end } = latest.current;
			if (event.code === "Space") {
				event.preventDefault();
				onPlayPause?.(!playing);
			} else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				const step = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1);
				onSeek?.(Math.min(end, Math.max(start, value + step)));
			} else if (event.key === "Home") onSeek?.(start);
			else if (event.key === "End") onSeek?.(end);
		};
		const onKeyUp = (event) => {
			if (event.code === "Space" && !typing(event.target)) event.preventDefault();
		};
		addEventListener("keydown", onKey);
		addEventListener("keyup", onKeyUp);
		return () => {
			removeEventListener("keydown", onKey);
			removeEventListener("keyup", onKeyUp);
		};
	}, [keyboard]);
	const timeAt = (lane, clientX) => {
		const box = lane.getBoundingClientRect();
		const fraction = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width)));
		return view.from + fraction * (view.to - view.from);
	};
	const axis = (zoomAlways) => ({
		onPointerDown: (event) => {
			if (event.button !== 0 || !onSeek) return;
			endScrub.current?.();
			const lane = event.currentTarget;
			try {
				lane.setPointerCapture(event.pointerId);
			} catch {}
			latest.current.onScrubStart?.();
			latest.current.onSeek?.(timeAt(lane, event.clientX));
			const move = (moved) => latest.current.onSeek?.(timeAt(lane, moved.clientX));
			const stop = () => {
				endScrub.current = null;
				removeEventListener("pointermove", move);
				removeEventListener("pointerup", stop);
				removeEventListener("pointercancel", stop);
				latest.current.onScrubEnd?.();
			};
			addEventListener("pointermove", move);
			addEventListener("pointerup", stop);
			addEventListener("pointercancel", stop);
			endScrub.current = stop;
		},
		onPointerMove: (event) => {
			const lane = event.currentTarget;
			setHover({
				x: event.clientX - lane.getBoundingClientRect().left,
				t: timeAt(lane, event.clientX)
			});
		},
		onPointerLeave: () => setHover(null),
		onWheel: (event) => {
			if (!zoomAlways && !event.ctrlKey && !event.metaKey) return;
			const lane = event.currentTarget;
			const width = view.to - view.from;
			if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
				const shift = event.deltaX / Math.max(1, lane.clientWidth) * width;
				const from = Math.min(end - width, Math.max(start, view.from + shift));
				setView({
					from,
					to: from + width
				});
				return;
			}
			const at = timeAt(lane, event.clientX);
			const next = Math.min(span, Math.max(.05, width * Math.exp(event.deltaY * .002)));
			const from = Math.min(end - next, Math.max(start, at - (at - view.from) / width * next));
			setView({
				from,
				to: from + next
			});
		}
	});
	const percent = (t) => `${(t - view.from) / Math.max(1e-9, view.to - view.from) * 100}%`;
	const inView = value >= view.from && value <= view.to;
	const hasLanes = !!lanes?.length || !!onExpandedChange;
	return /* @__PURE__ */ jsxs("section", {
		className: cx("dr-playback", expanded && "dr-playback--expanded", className),
		style,
		"aria-label": "Playback",
		...rest,
		children: [/* @__PURE__ */ jsxs("div", {
			className: "dr-playback__bar",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "dr-playback__controls",
				children: [
					onPlayPause ? /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "dr-timeline__play",
						title: playing ? "Pause (space)" : "Play (space)",
						"aria-label": playing ? "Pause" : "Play",
						"data-testid": "play",
						onClick: () => onPlayPause(!playing),
						children: /* @__PURE__ */ jsx(Icon, {
							name: playing ? "pause" : "play",
							size: 16
						})
					}) : null,
					/* @__PURE__ */ jsxs("span", {
						className: "dr-playback__time",
						"data-testid": "time",
						title: "position / length",
						children: [/* @__PURE__ */ jsx("span", {
							className: "dr-playback__now",
							children: show(value)
						}), /* @__PURE__ */ jsx("span", {
							className: "dr-playback__length",
							children: ` / ${show(end)}`
						})]
					}),
					onSpeedChange ? /* @__PURE__ */ jsx(Select, {
						size: "sm",
						className: "dr-playback__speed",
						"aria-label": "Speed",
						title: "Playback speed",
						value: speed,
						options: speeds.map((option) => [option, `${option}×`]),
						onChange: onSpeedChange
					}) : null,
					onLoopChange ? /* @__PURE__ */ jsx(IconButton, {
						icon: "refresh",
						size: "sm",
						label: "Loop: start over at the end",
						"aria-pressed": !!loop,
						className: cx(loop && "dr-playback__on"),
						onClick: () => onLoopChange(!loop)
					}) : null,
					hasLanes && onExpandedChange ? /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: cx("dr-playback__expand", expanded && "dr-playback__on"),
						"aria-expanded": expanded,
						title: expanded ? `Hide the ${lanesLabel.toLowerCase()}` : `Show a row per ${lanesLabel.toLowerCase().replace(/s$/, "")}`,
						"data-testid": "expand",
						onClick: () => onExpandedChange(!expanded),
						children: [/* @__PURE__ */ jsx(Icon, {
							name: expanded ? "chevron-down" : "chevron-up",
							size: 14
						}), /* @__PURE__ */ jsx("span", { children: lanesLabel })]
					}) : null,
					zoomed ? /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "dr-playback__expand",
						title: "Show the whole recording",
						onClick: () => setView({
							from: start,
							to: end
						}),
						children: "Fit"
					}) : null,
					controls
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "dr-playback__lane dr-playback__track",
				"data-testid": "scrubber",
				...axis(false),
				children: [
					/* @__PURE__ */ jsx("div", { className: "dr-timeline__rail" }),
					inView ? /* @__PURE__ */ jsx("div", {
						className: "dr-timeline__done",
						style: { width: percent(value) }
					}) : null,
					inView ? /* @__PURE__ */ jsx("div", {
						className: cx("dr-timeline__thumb", scrubbing && "dr-playback__thumb--active"),
						style: { left: percent(value) }
					}) : null,
					hover ? /* @__PURE__ */ jsx("span", {
						className: "dr-playback__hover",
						style: { left: hover.x },
						children: show(hover.t)
					}) : null,
					zoomed ? /* @__PURE__ */ jsx("span", {
						className: "dr-playback__window",
						children: `${show(view.from)} – ${show(view.to)}`
					}) : null
				]
			})]
		}), expanded && lanes?.length ? /* @__PURE__ */ jsx("div", {
			className: "dr-playback__rows",
			"data-testid": "stream-rows",
			children: lanes.map((lane) => /* @__PURE__ */ jsxs("div", {
				className: cx("dr-playback__row", lane.active && "dr-playback__row--active", lane.busy && "dr-playback__row--busy"),
				"data-lane": lane.id,
				children: [/* @__PURE__ */ jsxs("div", {
					className: "dr-playback__name",
					children: [
						lane.leading ?? /* @__PURE__ */ jsx("span", { className: "dr-playback__leading" }),
						/* @__PURE__ */ jsx("span", {
							className: "dr-playback__label",
							title: lane.title,
							children: lane.label
						}),
						lane.meta !== void 0 ? /* @__PURE__ */ jsx("span", {
							className: "dr-playback__meta",
							children: lane.meta
						}) : null,
						lane.count !== void 0 ? /* @__PURE__ */ jsx("span", {
							className: "dr-playback__count",
							children: lane.count
						}) : null,
						lane.menu?.length ? /* @__PURE__ */ jsx(Menu, {
							placement: "top-end",
							items: lane.menu,
							trigger: /* @__PURE__ */ jsx(IconButton, {
								icon: "more-horizontal",
								size: "sm",
								label: `${lane.id} actions`,
								"data-testid": `stream-menu-${lane.id}`
							})
						}) : null
					]
				}), /* @__PURE__ */ jsxs("div", {
					className: "dr-playback__lane",
					...axis(true),
					children: [/* @__PURE__ */ jsx(LaneTicks, {
						ticks: lane.ticks,
						view
					}), inView ? /* @__PURE__ */ jsx("div", {
						className: "dr-playback__cursor",
						style: { left: percent(value) }
					}) : null]
				})]
			}, lane.id))
		}) : null]
	});
}
//#endregion
//#region src/three/store.ts
var Store = class {
	#value;
	#listeners = /* @__PURE__ */ new Set();
	constructor(value) {
		this.#value = value;
	}
	get() {
		return this.#value;
	}
	set(value) {
		this.#value = value;
		for (const listener of [...this.#listeners]) listener();
	}
	update(patch) {
		this.set({
			...this.#value,
			...patch
		});
	}
	subscribe = (listener) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};
};
/** The store's current value, re-rendered on every change. */
function useStore(store) {
	return useSyncExternalStore(store.subscribe, () => store.get(), () => store.get());
}
/**
* localStorage JSON, or the fallback (private windows and blocked storage throw or return nothing). The saved JSON is
* trusted to have the fallback's shape.
*/
function readLocal$1(key, fallback) {
	try {
		const raw = globalThis.localStorage?.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}
/** Saves JSON to localStorage; without storage the value lasts for this page only. */
function writeLocal$1(key, value) {
	try {
		globalThis.localStorage?.setItem(key, JSON.stringify(value));
	} catch {}
}
/**
* A Store saved in localStorage under `key` (fields missing from what's saved come from `defaults`). Apps that keep
* settings elsewhere (a backend) pass their own `persist(key, defaults)` to the components that take one.
*/
function localStore(key, defaults) {
	const saved = readLocal$1(key, null);
	const store = new Store(saved && typeof saved === "object" && !Array.isArray(saved) ? {
		...defaults,
		...saved
	} : defaults);
	store.subscribe(() => writeLocal$1(key, store.get()));
	return store;
}
//#endregion
//#region src/components/camera.tsx
var VIDEO_PRESETS = [
	{
		id: "latency",
		label: "Low latency",
		about: "fits 640×360 at the gateway's default bits per pixel; small frames arrive and decode soonest, the rate kept when the link is squeezed",
		options: {
			maxResolution: [640, 360],
			qualityToHzTradeoff: 1
		}
	},
	{
		id: "balanced",
		label: "Balanced",
		about: "the gateway picks size and bitrate for the bandwidth, at the camera's rate",
		options: {}
	},
	{
		id: "quality",
		label: "High quality",
		about: "full size, never shrunk, up to 6 Mbit/s (at least 30% of it); drops frames before detail when the link is squeezed, and the browser buffers 100-400 ms to play frames out evenly",
		options: {
			minResolutionScale: 1,
			maxBitrate: 6e6,
			minQuality: .3,
			qualityToHzTradeoff: 0,
			playoutDelay: [100, 400]
		}
	}
];
var RENAMED = {
	auto: "balanced",
	smooth: "latency",
	sharp: "quality"
};
/** A preset by id (old names map to the nearest one; unknown → Balanced). */
var videoPreset = (id) => VIDEO_PRESETS.find((preset) => preset.id === (RENAMED[id ?? ""] ?? id)) ?? VIDEO_PRESETS[1];
/** What `Subscription.update` needs to go from one preset to another: the new values, null for what only `from` set. */
function videoPresetChanges(from, to) {
	const changes = {};
	for (const name of Object.keys(from.options)) changes[name] = null;
	return {
		...changes,
		...to.options
	};
}
/** Whether options keep the browser in low-latency rendering (playoutDelay min 0, max <= 500 ms; default [0, 0]). */
function lowLatencyRendering(options) {
	const [min, max] = options.playoutDelay ?? [0, 0];
	return min === 0 && max <= 500;
}
/**
* Whether a change can't be made in place: back to low-latency rendering from a buffered playout. Firefox freezes a
* receiver for good once its render time drops back to 0, so that takes a fresh subscription (a new receiver).
*/
var needsNewReceiver = (from, to) => !lowLatencyRendering(from) && lowLatencyRendering(to);
var isImageTopic = (topic) => topic.type === "sensor_msgs.Image" || topic.type === "sensor_msgs.CompressedImage";
var isDepthTopic = (topic) => /depth/i.test(topic.name);
/** The camera to show first: `preferred` topic names in order, else the first color image, else any image. */
function pickCamera(preferred, topics, exclude = /* @__PURE__ */ new Set()) {
	const images = topics.filter((topic) => isImageTopic(topic) && !exclude.has(topic.key));
	for (const name of preferred ?? []) {
		const found = images.find((topic) => topic.name === name);
		if (found) return found;
	}
	return images.find((topic) => !isDepthTopic(topic)) ?? images[0] ?? null;
}
/**
* Panels (`{ key, picked? }`) pointed at what the bus has: a panel's picked topic when it's back, else a panel whose
* topic isn't on the bus moves to a default camera no other panel shows. Null when nothing changes.
*/
function retargetCameras(panels, topics, preferred) {
	const onBus = new Set(topics.filter(isImageTopic).map((topic) => topic.key));
	const used = new Set(panels.filter((panel) => onBus.has(panel.key)).map((panel) => panel.key));
	let changed = false;
	const next = panels.map((panel) => {
		if (panel.picked && panel.picked !== panel.key && onBus.has(panel.picked)) {
			changed = true;
			used.add(panel.picked);
			return {
				...panel,
				key: panel.picked
			};
		}
		if (onBus.has(panel.key)) return panel;
		const fallback = pickCamera(preferred, topics, used);
		if (!fallback) return panel;
		changed = true;
		used.add(fallback.key);
		return {
			...panel,
			key: fallback.key
		};
	});
	return changed ? next : null;
}
/** Every image topic as a tab (`{ topic, label, depth }`), color first then depth, labeled by what tells them apart. */
function cameraTabs(topics) {
	const images = topics.filter(isImageTopic).sort((a, b) => Number(isDepthTopic(a)) - Number(isDepthTopic(b)) || a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
	const split = images.map((topic) => topic.name.split("/").filter(Boolean));
	let shared = 0;
	if (split.length > 1) while (split.every((parts) => shared < parts.length - 1 && parts[shared] === split[0][shared])) shared++;
	let tail = 0;
	if (split.length > 1) {
		const at = (parts) => parts[parts.length - 1 - tail];
		while (split.every((parts) => parts.length - shared - tail > 1 && at(parts) === at(split[0]))) tail++;
	}
	const labels = split.map((parts) => parts.slice(shared, parts.length - tail).join("/"));
	return images.map((topic, index) => {
		return {
			topic,
			label: labels.some((label, other) => other !== index && label === labels[index]) ? `${labels[index]} (${topic.type.split(".").pop()})` : labels[index],
			depth: isDepthTopic(topic)
		};
	});
}
/** The CameraInfo topic for an image topic: `overrides[name]`, else the one sharing the longest leading part of the name. */
function cameraInfoFor(image, topics, overrides = {}) {
	const infos = topics.filter((topic) => topic.type === "sensor_msgs.CameraInfo");
	const wanted = overrides[image.name];
	if (wanted) return infos.find((topic) => topic.name === wanted) ?? null;
	const parts = image.name.split("/");
	let best = null;
	let bestScore = -1;
	for (const info of infos) {
		const other = info.name.split("/");
		let shared = 0;
		while (shared < Math.min(parts.length, other.length) - 1 && parts[shared] === other[shared]) shared++;
		const score = shared * 10 + (/color|rgb/i.test(image.name) === /color|rgb/i.test(info.name) ? 1 : 0);
		if (score > bestScore) {
			best = info;
			bestScore = score;
		}
	}
	return best;
}
var readLocal = (key, fallback) => {
	try {
		const raw = globalThis.localStorage?.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
};
var writeLocal = (key, value) => {
	try {
		globalThis.localStorage?.setItem(key, JSON.stringify(value));
	} catch {}
};
/**
* The page's camera subscriptions over a data source, shared and counted: `acquire(topic)` → `{ video, depth, quality }`
* stores (video: `{ stream, width, height, fps }`, depth: `{ image }`), `release(topic)`, `setQuality(topic, id)`
* (this viewer's preset per topic, in localStorage under `storageKey`), `element(handle)` (a playing <video> for
* textures). A source that delivers images itself (a replay) sends `{ width, height, encoding, data }` (depth),
* `{ bitmap | image, width, height }` (color), a frame (`{ kind, width, height, encoding, data }`, jpeg/png/webp or raw
* pixels), a decoded sensor_msgs.Image / CompressedImage, or the LCM bytes of one: frames are decoded here (newest wins)
* into `video.image` (an ImageBitmap or ImageData).
*/
var CameraStreams = class {
	#sources = /* @__PURE__ */ new Map();
	storageKey;
	source;
	constructor(source, { storageKey = "dr.video.quality" } = {}) {
		this.source = source;
		this.storageKey = storageKey;
	}
	qualityOf(key) {
		return videoPreset(readLocal(this.storageKey, {})[key]).id;
	}
	acquire(topic) {
		let handle = this.#sources.get(topic.key);
		if (handle) {
			handle.users++;
			return handle;
		}
		handle = {
			users: 1,
			stop: () => {},
			video: new Store({
				stream: null,
				image: null,
				width: 0,
				height: 0,
				fps: 0
			}),
			depth: new Store({ image: null }),
			quality: new Store({ quality: isDepthTopic(topic) ? "balanced" : this.qualityOf(topic.key) }),
			element: null,
			ticket: 0,
			newest: 0
		};
		this.#open(topic, handle);
		this.#sources.set(topic.key, handle);
		return handle;
	}
	#open(topic, handle) {
		const { video, depth } = handle;
		const prefix = topic.type === "sensor_msgs.CompressedImage" ? "dimos_lcm_compressed_" : "dimos_lcm_";
		let frames = 0;
		let since = performance.now();
		const fpsNow = (state) => {
			frames++;
			const now = performance.now();
			if (now - since > 1e3) {
				const fps = Math.round(frames * 1e3 / (now - since));
				frames = 0;
				since = now;
				return fps;
			}
			return state.fps;
		};
		if (isDepthTopic(topic)) {
			handle.stop = this.source.subscribe(topic.key, {
				delivery: "latest",
				maxHz: 15,
				encoding: `${prefix}depth`
			}, (message) => {
				const image = message.decoded ?? message.value ?? lcmValue(message, topic.type);
				if (image?.data) depth.set({ image });
			});
			return;
		}
		handle.stop = this.source.subscribe(topic.key, {
			delivery: "latest",
			...videoPreset(handle.quality.get().quality).options,
			encoding: `${prefix}image`
		}, async (received) => {
			const message = received;
			let decoded = message.decoded ?? message.value ?? (message.mediaStream ? null : lcmValue(message, topic.type));
			if (!message.mediaStream && decoded && !decoded.bitmap && !decoded.image) {
				const mine = ++handle.ticket;
				const picture = await framePicture(decoded);
				if (!picture || mine < handle.newest) return;
				handle.newest = mine;
				decoded = {
					image: picture,
					width: picture.width,
					height: picture.height
				};
			}
			const state = video.get();
			const picture = decoded?.bitmap ?? decoded?.image ?? null;
			const width = message.video?.width ?? decoded?.width ?? state.width;
			const height = message.video?.height ?? decoded?.height ?? state.height;
			const fps = fpsNow(state);
			const stream = message.mediaStream ?? state.stream;
			if (stream !== state.stream || picture !== state.image || width !== state.width || height !== state.height || fps !== state.fps) video.set({
				stream,
				image: picture,
				width,
				height,
				fps
			});
		});
	}
	/**
	* Another preset for a color topic: saved for this viewer, and the running subscription takes it in place; a
	* gateway that refuses, or a change back to low-latency rendering, gets a fresh subscription instead.
	*/
	setQuality(topic, quality) {
		writeLocal(this.storageKey, {
			...readLocal(this.storageKey, {}),
			[topic.key]: quality
		});
		const handle = this.#sources.get(topic.key);
		const previous = handle?.quality.get().quality;
		if (!handle || isDepthTopic(topic) || previous === quality) return;
		handle.quality.set({ quality });
		const subscription = handle.stop;
		const reopen = () => {
			if (handle.stop === subscription && handle.quality.get().quality === quality) {
				subscription();
				this.#open(topic, handle);
			}
		};
		const from = videoPreset(previous);
		const to = videoPreset(quality);
		if (!subscription.update || needsNewReceiver(from.options, to.options)) return reopen();
		subscription.update(videoPresetChanges(from, to)).catch((error) => {
			console.warn(`[dimos-react] ${topic.name}: the gateway refused a preset update (${error?.message ?? error})`);
			reopen();
		});
	}
	/** A muted, playing <video> of the stream (not in the document), e.g. for a three.js VideoTexture. */
	element(handle) {
		if (!handle.element) {
			const element = document.createElement("video");
			element.muted = true;
			element.playsInline = true;
			element.autoplay = true;
			element.setAttribute("disablepictureinpicture", "");
			element.setAttribute("disableremoteplayback", "");
			const attach = () => {
				const stream = handle.video.get().stream;
				if (stream && element.srcObject !== stream) {
					element.srcObject = stream;
					element.play().catch(() => {});
				}
			};
			handle.video.subscribe(attach);
			attach();
			handle.element = element;
		}
		return handle.element;
	}
	release(topic) {
		const handle = this.#sources.get(topic.key);
		if (!handle || --handle.users > 0) return;
		handle.stop();
		handle.element?.pause();
		if (handle.element) handle.element.srcObject = null;
		this.#sources.delete(topic.key);
	}
};
/** A message's LCM payload decoded as `type` (null when it isn't one). */
function lcmValue(message, type) {
	if (!message.bytes || !type) return null;
	try {
		return decode(type, message.bytes);
	} catch {
		return null;
	}
}
/** A frame → ImageBitmap (jpeg/png/webp) or ImageData (raw pixels), or null. */
async function framePicture(value) {
	const frame = normalizeFrame(value);
	if (!frame || frame.kind === "depth") return null;
	if (frame.kind === "encoded") try {
		return await createImageBitmap(new Blob([frame.data], { type: `image/${frame.format}` }));
	} catch {
		return null;
	}
	return rawToImageData(frame);
}
var StreamsContext = createContext(null);
var sharedStreams = /* @__PURE__ */ new WeakMap();
/** The shared CameraStreams of a data source (what useCameraStreams gives without a provider; the 3D view's too). */
function cameraStreamsFor(source) {
	let streams = sharedStreams.get(source);
	if (!streams) {
		streams = new CameraStreams(source);
		sharedStreams.set(source, streams);
	}
	return streams;
}
/** Makes `streams` (a CameraStreams, e.g. with the app's own storageKey) the one every CameraView below uses. */
function CameraStreamsProvider({ streams, children }) {
	return /* @__PURE__ */ jsx(StreamsContext.Provider, {
		value: streams,
		children
	});
}
/** The page's CameraStreams for the current data source (the nearest CameraStreamsProvider's, else one per source). */
function useCameraStreams() {
	const given = useContext(StreamsContext);
	const source = useDataSource();
	return useMemo(() => {
		return given ?? cameraStreamsFor(source);
	}, [given, source]);
}
/** A topic's stream handle while mounted (null topic: none). */
function useCameraStream(topic) {
	const streams = useCameraStreams();
	const [handle, setHandle] = useState(null);
	useEffect(() => {
		if (!topic) {
			setHandle(null);
			return;
		}
		const acquired = streams.acquire(topic);
		setHandle(acquired);
		return () => streams.release(topic);
	}, [streams, topic?.key]);
	return handle;
}
var idleStore = new Store({ quality: "balanced" });
/** A color topic's preset as the shared stream has it, and a setter (saved for this viewer). */
function useVideoQuality(topic) {
	const streams = useCameraStreams();
	const { quality } = useStore(useCameraStream(topic && !isDepthTopic(topic) ? topic : null)?.quality ?? idleStore);
	return [quality, (next) => topic && streams.setQuality(topic, next)];
}
/**
* A camera topic's live picture filling its positioned parent. On Desktop's zenoh-gateway a color topic is the
* gateway's video track (this viewer's latency ↔ quality preset, `useVideoQuality`); a depth topic, or any topic from
* another source (a replay delivering frames), is drawn by ImageView (depth through a colormap). `overlay`: a 2D
* detection topic drawn over it; `fill` crops to cover instead of letterboxing; `depthLook` `{ colormap, near, far }`
* (null near/far = automatic); `onInfo({ width, height, fps, range })`.
*/
function CameraView({ topic, overlay, fill = false, depthLook = {}, onInfo, className, children }) {
	const source = useDataSource();
	const depth = topic ? isDepthTopic(topic) : false;
	const video = source.kind === "zenoh" && topic && !depth;
	if (!topic) return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-camera", className),
		children: [/* @__PURE__ */ jsx("div", {
			className: "dr-camera-empty",
			children: "no camera"
		}), children]
	});
	if (!video) {
		const prefix = topic.type === "sensor_msgs.CompressedImage" ? "dimos_lcm_compressed_" : "dimos_lcm_";
		return /* @__PURE__ */ jsx(ImageView, {
			topic: topic.key,
			encoding: source.kind === "zenoh" ? `${prefix}depth` : void 0,
			maxHz: depth ? 15 : 30,
			depth: depth || void 0,
			colormap: depthLook.colormap ?? "turbo",
			near: depthLook.near ?? null,
			far: depthLook.far ?? null,
			fit: fill ? "cover" : "contain",
			overlayTopic: overlay && IMAGE_OVERLAY_TYPES.includes(overlay.type) ? overlay.key : null,
			onInfo: onInfo ? (info) => onInfo({
				width: info.width,
				height: info.height,
				fps: info.fps,
				range: info.range
			}) : void 0,
			className: cx("dr-camera", className),
			children
		}, topic.key);
	}
	return /* @__PURE__ */ jsx(VideoView, {
		topic,
		overlay,
		fill,
		onInfo,
		className,
		children
	});
}
function VideoView({ topic, overlay, fill, onInfo, className, children }) {
	const source = useDataSource();
	const handle = useCameraStream(topic);
	const video = useRef(null);
	const overlayCanvas = useRef(null);
	const info = useRef({
		width: 0,
		height: 0,
		fps: 0,
		range: null
	});
	const report = useRef(onInfo);
	report.current = onInfo;
	useEffect(() => {
		if (!handle) return;
		const apply = () => {
			const state = handle.video.get();
			if (video.current && state.stream && video.current.srcObject !== state.stream) {
				video.current.srcObject = state.stream;
				video.current.play().catch(() => {});
			}
			const old = info.current;
			if (state.width !== old.width || state.height !== old.height || state.fps !== old.fps) {
				info.current = {
					width: state.width,
					height: state.height,
					fps: state.fps,
					range: null
				};
				report.current?.(info.current);
			}
		};
		apply();
		const unsubscribe = handle.video.subscribe(apply);
		return () => {
			unsubscribe();
		};
	}, [handle]);
	useEffect(() => {
		const canvas = overlayCanvas.current;
		const clear = () => canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
		if (!overlay || !canvas || !IMAGE_OVERLAY_TYPES.includes(overlay.type)) {
			clear();
			return;
		}
		const off = source.subscribe(overlay.key, {
			delivery: "latest",
			maxHz: 30
		}, (message) => {
			const width = info.current.width || canvas.width;
			const height = info.current.height || canvas.height;
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			clear();
			try {
				drawDetections2D(canvas.getContext("2d"), message.value ?? decode(overlay.type, message.bytes));
			} catch {}
		});
		return () => {
			off();
			clear();
		};
	}, [source, overlay?.key]);
	return /* @__PURE__ */ jsxs("div", {
		className: cx("dr-camera", fill && "dr-camera--fill", className),
		children: [
			/* @__PURE__ */ jsx("video", {
				ref: video,
				className: "dr-camera-media",
				muted: true,
				playsInline: true,
				autoPlay: true,
				disablePictureInPicture: true,
				disableRemotePlayback: true
			}),
			/* @__PURE__ */ jsx("canvas", {
				ref: overlayCanvas,
				className: "dr-camera-overlay"
			}),
			children
		]
	});
}
/**
* Tabs for the image topics on the bus (a panel header's camera picker). `value`: the shown topic key; `gone`: a
* label for a picked topic that isn't on the bus.
*/
function CameraTabs({ topics, value, onChange, gone, className }) {
	const tabs = cameraTabs(topics);
	const row = useRef(null);
	useEffect(() => {
		const tab = row.current?.querySelector("[aria-selected=true]");
		const element = row.current;
		if (tab && element && (tab.offsetLeft < element.scrollLeft || tab.offsetLeft + tab.offsetWidth > element.scrollLeft + element.clientWidth)) element.scrollLeft = tab.offsetLeft - 6;
	}, [value, topics.length]);
	return /* @__PURE__ */ jsxs("div", {
		ref: row,
		className: cx("dr-camera-tabs", className),
		role: "tablist",
		"aria-label": "Cameras",
		onWheel: (event) => event.currentTarget.scrollLeft += event.deltaY,
		children: [
			gone ? /* @__PURE__ */ jsx("span", {
				className: "dr-camera-tab dr-camera-tab--gone",
				title: gone,
				children: gone
			}) : null,
			tabs.map((tab) => /* @__PURE__ */ jsx("button", {
				type: "button",
				role: "tab",
				"aria-selected": tab.topic.key === value,
				className: cx("dr-camera-tab", tab.depth && "dr-camera-tab--depth"),
				title: `${tab.topic.name} (${tab.topic.type})`,
				onClick: () => onChange(tab.topic),
				children: tab.label
			}, tab.topic.key)),
			!tabs.length && !gone ? /* @__PURE__ */ jsx("span", {
				className: "dr-camera-tab dr-camera-tab--gone",
				children: "no camera on the bus"
			}) : null
		]
	});
}
//#endregion
export { StickIndicator as $, depthScale as A, useTopic as At, PALETTE_NAMES as B, useStore as C, memorySource as Ct, ImageView as D, useConnectionState as Dt, IMAGE_OVERLAY_TYPES as E, useBackendState as Et, DEFAULT_GRADIENT as F, encode as Ft, otherPalette as G, cyclePhase as H, DEFAULT_PALETTE as I, fingerprint as It, ColorSwatch as J, paletteAt as K, DEFAULT_PERIOD as L, headerFrameId as Lt, normalizeFrame as M, useZenoh as Mt, playbackClock as N, zenohSource as Nt, PlaybackBar as O, useDataSource as Ot, rawToImageData as P, decode as Pt, KeyHints as Q, GRADIENTS as R, schemas as Rt, readLocal$1 as S, keyMatches as St, DEPTH_COLORMAPS as T, useBackendEvents as Tt, heightColor as U, RAMPS as V, isPalette as W, FileDrop as X, DPad as Y, Joystick as Z, useVideoQuality as _, useToast as _t, VIDEO_PRESETS as a, ErrorBoundary as at, Store as b, decodeMessage as bt, cameraTabs as c, ProgressRing as ct, lowLatencyRendering as d, ToastProvider as dt, stickValue as et, needsNewReceiver as f, ToastViewport as ft, useCameraStreams as g, usePrompt as gt, useCameraStream as h, useConfirm as ht, CameraView as i, EmptyState as it, drawDetections2D as j, useTopicList as jt, colorizeDepth as k, useSubscription as kt, isDepthTopic as l, Skeleton as lt, retargetCameras as m, toast as mt, CameraStreamsProvider as n, Alert as nt, cameraInfoFor as o, Modal as ot, pickCamera as p, dismissToast as pt, sampleGradient as q, CameraTabs as r, DialogProvider as rt, cameraStreamsFor as s, Progress as st, CameraStreams as t, useRepeatWhileHeld as tt, isImageTopic as u, Spinner as ut, videoPreset as v, DataSourceProvider as vt, writeLocal$1 as w, parseKey as wt, localStore as x, dimosKey as xt, videoPresetChanges as y, ZenohProvider as yt, PALETTES as z };

