/**
 * Registers the browser decoder for a data-channel encoding the gateway runs (a Rust encoding the host application
 * added with `ServerBuilder::encoding`). Messages of subscriptions using that encoding on the data channel get
 * `msg.decoded = decoder(msg.bytes, msg)` (fields messages decode by themselves). Video and audio need no decoder.
 * Registering a different decoder under a name that already has one throws.
 */
export function registerEncoding(name: any, decoder: any): void;
/**
 * Gateway frame (little endian):
 * u16 keyLen | key | f64 timestampMs | u32 seq | u32 frameId | u32 chunkIndex | u32 chunkCount | u8 flags | chunk
 */
export function decodeFrame(buffer: any): {
    key: string;
    timestamp: number;
    seq: number;
    frameId: number;
    chunkIndex: number;
    chunkCount: number;
    flags: number;
    chunk: Uint8Array<any>;
};
/**
 * A fields message (SPEC "Fields") as an object of named values: scalar fields are numbers, text
 * fields strings, others typed arrays viewing the message (copied once if misaligned).
 */
export function decodeFields(message: any): {};
/** Video metadata frame (28 bytes) sent on a video subscription's channel per frame. */
export function decodeVideoFrameInfo(bytes: any): {
    keyframe: boolean;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    quality: number;
    encodedBytes: number;
};
/** Browser -> gateway put: f64 sentAtMs (browser clock) | payload (little endian). */
export function encodePut(payload: any, sentAtMs: any): Uint8Array<any>;
/** Connects to a zenoh-gateway server, e.g. `await connect("http://robot.local:7448")`. */
export function connect(url: any, options?: {}): Promise<ZenohGateway>;
/** zenoh priorities (lower = more important). */
export const Priority: Readonly<{
    REAL_TIME: 1;
    INTERACTIVE_HIGH: 2;
    INTERACTIVE_LOW: 3;
    DATA_HIGH: 4;
    DATA: 5;
    DATA_LOW: 6;
    BACKGROUND: 7;
}>;
export class Subscription extends Endpoint {
    constructor(owner: any, id: any, key: any, options: any, callback: any);
    options: any;
    callback: any;
    received: number;
    /** chunked messages dropped incomplete (lost chunk or abandoned for a newer message) */
    partialDropped: number;
    /** encoded payloads that failed to decode in this page */
    decodeErrors: number;
    /** video and audio channels: the track (also on each message as `mediaStream`) */
    mediaStream: null;
    /** what the messages travel on */
    channelName: any;
    /**
     * Changes the running subscription's options in place: same channel and track, no resubscribe; the gateway's
     * next frame uses them. Reconnects keep them too.
     */
    update(changes: any): Promise<void>;
    get state(): "connecting" | "open" | "closed" | "rejected";
    /** messages the gateway accepted for us but we never got whole (queue, age, maxHz, network) */
    get dropped(): number;
    attach(peer: any): void;
    #private;
}
export class Publisher extends Endpoint {
    constructor(owner: any, id: any, key: any, options: any);
    options: any;
    sent: number;
    dropped: number;
    tripped: boolean;
    /** why the deadman fired: "heartbeat" | "disconnected" | "shutdown" */
    tripReason: null;
    deadmanArmed: boolean;
    /** why the gateway is dropping this publisher's puts right now (another client's lease), else null */
    blocked: null;
    get state(): "connecting" | "open" | "closed" | "rejected" | "tripped";
    onTripped(listener: any): () => void;
    attach(peer: any): void;
    /** `timestamp`: when the value was produced, in this client's clock (`z.now()`); defaults to now. */
    /** A zenoh delete on this publisher's key (over the control channel; needs the `publish` grant). */
    delete(options?: {}): any;
    put(value: any, { timestamp }?: {}): void;
    /**
     * Stores `value` on the gateway; it is published once (REAL_TIME, reliable) if this frontend's
     * heartbeat stops, it disconnects, or the gateway shuts down. Then this publisher is tripped.
     */
    setDeadman(value: any): Promise<void>;
    clearDeadman(): Promise<void>;
    _trip(reason: any): void;
    #private;
}
/** An exclusive right to publish on a group of keys among this gateway's clients (SPEC "Leases"). */
export class Lease {
    constructor(owner: any, group: any, keys: any, expiresInMs: any);
    owner: any;
    group: any;
    keys: any;
    expiresInMs: any;
    /** why it ended: "heartbeat" | "maxSeconds" | "disconnected" | "force-expired by peer N" | "released" */
    lost: null;
    onLost(listener: any): () => void;
    release(): Promise<void>;
    _lose(reason: any): void;
    #private;
}
export class ZenohGateway {
    constructor(url: any, options?: {});
    state: string;
    /** per subscribed/published key expression */
    stats: {};
    /** latest round trip to the gateway (heartbeat, else control ping) */
    rttMs: null;
    /** gateway clock minus this client's clock, from the lowest-RTT recent sample */
    clockOffsetMs: null;
    /** gateway-side heartbeat, clock and bandwidth stats */
    gatewayStats: null;
    /** whether the link keeps up with the subscriptions, and what is dropped when it doesn't; null before the first stats poll */
    congestion: null;
    /** the message encodings the gateway runs, fetched on connect */
    encodings: any[];
    /** the ICE servers in use (the gateway's unless given) */
    iceServers: any[];
    /** leases held, by group */
    _leases: Map<any, any>;
    url: any;
    options: {
        reconnect: boolean;
        statsIntervalMs: number;
        heartbeatHz: number;
        heartbeatMisses: number;
    };
    /** this client's clock in ms; put timestamps and clock sync use it */
    now: any;
    onState(listener: any): () => void;
    /** Opens (or re-opens) the peer connection and every channel on it. */
    get _peer(): null;
    /**
     * A new recvonly transceiver bound to a gateway track of `channel`'s format, added through a renegotiation over
     * `control` (the gateway answers with a track for the new m-line). Never a reused one: Chrome stopped assembling
     * a reused receiver's frames after a few quick close-and-reopen switches.
     */
    _acquireTransceiver(peer: any, kind: any, channel: any): Promise<any>;
    /** A closed subscription's transceiver stops; the next renegotiation frees its m-line (Chrome reuses the slot). */
    _releaseTransceiver(peer: any, transceiver: any): void;
    _open(): Promise<void>;
    /** Stops sending heartbeats (the gateway then fires this frontend's deadmen); for testing deadman wiring. */
    pauseHeartbeat(): void;
    resumeHeartbeat(): void;
    _request(body: any, timeoutMs: any): Promise<any>;
    /** Options are checked by the gateway: a bad one rejects the subscription (`state`, `ready()`). */
    subscribe(key: any, options: any, callback: any): Subscription;
    publisher(key: any, options?: {}): Publisher;
    /** Stops re-attaching an endpoint on reconnect (closed, tripped or rejected). */
    _forget(endpoint: any): void;
    /** zenoh query: `key` may carry parameters after `?` (or pass `parameters`). */
    get(key: any, options?: {}): Promise<any>;
    /** Queries with fixed options, like zenoh's querier. */
    querier(key: any, options?: {}): Querier;
    /** One zenoh put (needs the `publish` grant). */
    put(key: any, value: any, options?: {}): Promise<void>;
    /** One zenoh delete (needs the `publish` grant). */
    delete(key: any, options?: {}): Promise<void>;
    /**
     * Answers zenoh queries on `key` from this page (needs the `queryable` grant). The callback gets
     * each query; reply with `query.reply(...)` (any number of times), then `query.finalize()`.
     */
    declareQueryable(key: any, options: any, callback: any): Promise<Queryable>;
    /** A liveliness token on `key`, alive until undeclared or this page goes (needs `liveliness`). */
    declareToken(key: any): Promise<LivelinessToken>;
    /** Tokens appearing (`alive: true`) and going under `key`; `history` also reports the ones already alive. */
    livelinessSubscribe(key: any, options: any, callback: any): Promise<LivelinessSubscriber>;
    /** The keys of the liveliness tokens alive under `key`. */
    livelinessGet(key: any, { timeoutMs }?: {
        timeoutMs?: number | undefined;
    }): Promise<any>;
    /** Whether a publisher ("subscribers") or a querier ("queryables") on `key` would reach anyone now. */
    matchingStatus(key: any, target?: string): Promise<boolean>;
    /** Called each time `matchingStatus(key, target)` changes. */
    matchingListener(key: any, target: any, callback: any): Promise<MatchingListener>;
    /** The gateway's zenoh session: its id, and the routers and peers it is connected to. */
    info(): Promise<{
        zid: string;
        routers: any;
        peers: any;
    }>;
    _route(event: any, id: any, handler: any): void;
    _unroute(event: any, id: any): void;
    _forgetHandle(handle: any): void;
    /**
     * Keys currently live on the zenoh network under `filter`, including ones never subscribed to.
     * See SPEC.md "Topic enumeration" for which kinds of keys can and can't be seen.
     * `probeMs: 0` lists liveliness tokens only, without subscribing to `filter`.
     */
    listTopics(filter?: string, { probeMs }?: {
        probeMs?: number | undefined;
    }): Promise<any>;
    /**
     * Takes (or renews) the exclusive right to publish on `group`'s keys among this gateway's clients: the
     * server's group, or `keys` for one it doesn't define. Needs a heartbeat; it ends when the heartbeat
     * stops, at `maxSeconds`, on disconnect, by `release()` or by force-expiry (`onLost` says which).
     */
    lease(group: any, { keys, maxSeconds }?: {}): Promise<Lease>;
    /** Ends another client's lease on `group` (needs the grant's forceExpire right). */
    expireLease(group: any): Promise<void>;
    /** Polls gateway stats (and, without a heartbeat, clock sync) once; also runs on a timer while connected. */
    pollStats(): Promise<void>;
    _startStats(): void;
    close(): void;
    #private;
}
/** Fixed-option queries on one key (`gateway.querier(key, options)`). */
export class Querier {
    constructor(owner: any, key: any, options: any);
    owner: any;
    key: any;
    options: any;
    /** A query with the querier's options, plus these per-call ones. */
    get(options?: {}): any;
    /** Whether a queryable would answer now. */
    matchingStatus(): any;
    matchingListener(callback: any): any;
}
/** A query this page's `Queryable` received. */
export class Query {
    constructor(owner: any, id: any, key: any, parameters: any, payload: any, encoding: any, attachment: any);
    owner: any;
    id: any;
    key: any;
    parameters: any;
    payload: any;
    encoding: any;
    attachment: any;
    /** Replies with a sample on `key` (default: the query's key). Any number of replies, then `finalize()`. */
    reply(value: any, options?: {}): Promise<void>;
    replyErr(value: any, options?: {}): Promise<void>;
    /** Replies that `key` (default: the query's key) was deleted. */
    replyDel(options?: {}): Promise<void>;
    /** No more replies: the asker's get completes. (The gateway finalizes forgotten queries after two minutes.) */
    finalize(): Promise<void>;
    #private;
}
/** Queries for this page to answer (`gateway.declareQueryable`). */
export class Queryable {
    constructor(owner: any, key: any, complete: any, callback: any);
    owner: any;
    key: any;
    complete: any;
    callback: any;
    _declare(): Promise<void>;
    undeclare(): Promise<void>;
    #private;
}
/** A liveliness token (`gateway.declareToken`). */
export class LivelinessToken {
    constructor(owner: any, key: any);
    owner: any;
    key: any;
    _declare(): Promise<void>;
    undeclare(): Promise<void>;
    #private;
}
/** Liveliness changes under a key (`gateway.livelinessSubscribe`). */
export class LivelinessSubscriber {
    constructor(owner: any, key: any, history: any, callback: any);
    owner: any;
    key: any;
    history: any;
    callback: any;
    _declare(): Promise<void>;
    undeclare(): Promise<void>;
    #private;
}
/** Matching changes (`gateway.matchingListener`). */
export class MatchingListener {
    constructor(owner: any, key: any, target: any, callback: any);
    owner: any;
    key: any;
    target: any;
    callback: any;
    _declare(): Promise<void>;
    undeclare(): Promise<void>;
    #private;
}
/** Common to subscriptions and publishers: a channel the gateway accepts or rejects. */
declare class Endpoint {
    constructor(owner: any, id: any, key: any);
    owner: any;
    id: any;
    key: any;
    channel: null;
    closed: boolean;
    rejectionReason: null;
    gatewayStats: null;
    acceptance: Acceptance;
    /** Resolves once the gateway accepted this channel; rejects with the gateway's reason otherwise. */
    ready(): Promise<any>;
    /** Starts a new attempt to get accepted (each attach, including reconnects). */
    beginAttempt(): Acceptance;
    watchChannel(channel: any, acceptance: any): void;
    _accepted(): void;
    _rejected(reason: any): void;
    close(): void;
}
/**
 * Settles once the channel is usable: the gateway accepted it AND it is open in this browser.
 * Both are needed because the gateway's `accepted` (control channel) can arrive before this
 * channel's own open (its DCEP ack travels on a different SCTP stream). Rejects if the gateway
 * rejects it or it fails to open.
 */
declare class Acceptance {
    promise: Promise<any>;
    settled: boolean;
    gatewayAccepted(): void;
    channelOpened(): void;
    reject(error: any): void;
    #private;
}
export {};
