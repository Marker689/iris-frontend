/**
 * Socket.IO transport for a Yjs document.
 *
 * Yjs's reference network layer is `y-websocket`, which speaks its own
 * binary protocol over a bare WebSocket. We already run a Socket.IO
 * server for chat, notes, notifications, and now `/collab`, and reusing
 * it means we don't have to re-do auth, CORS, headers, or reconnection
 * strategy.
 *
 * This provider is intentionally minimal — Yjs handles all the merge
 * algebra client-side. Our job is:
 *
 *   1. `emit('join', ...)` on connect (or reconnect).
 *   2. Apply the server's `sync-init` reply to the local `Y.Doc`, then
 *      send back whatever the server is missing (see `resyncToServer`).
 *   3. On every local `Y.Doc` update, `emit('sync', ...)`.
 *   4. On inbound `sync`, apply the update to the local `Y.Doc`.
 *   5. Same round-trip for awareness (cursors + user identity).
 *
 * The provider does NOT own the socket — the caller passes an already-
 * connected Socket.IO client (namespace `/collab`). This lets one page
 * open multiple providers over a single connection if we ever need it.
 *
 * Payloads (Option A — server-authoritative Y.Doc):
 *   * outbound sync:      { doc, update: base64 }, acked with { ok }
 *   * outbound awareness: { doc, update: base64, client_id }
 *   * inbound  sync-init: { doc, y_state: base64, epoch, can_write, user }
 *   * inbound  sync:      { doc, update: base64, origin }
 *   * inbound  awareness: { doc, update: base64, origin }
 *
 * NOTE: no `content_md` on the wire in either direction — the server
 * owns markdown rendering server-side via `iris_engine/collab/render.py`.
 * The client only ever sends and receives opaque Yjs updates. This is
 * intentional: any earlier version that piggybacked markdown on syncs
 * produced content duplication because clients had two seeding paths
 * (markdown fallback + y_state replay) that fought each other.
 *
 * Yjs updates are binary; we base64 them because Socket.IO's default
 * transport (polling → websocket upgrade) doesn't handle raw ArrayBuffers
 * uniformly across all Engine.IO versions.
 */

import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';

type Base64 = string;

function toBase64(bytes: Uint8Array): Base64 {
	// btoa can't take a Uint8Array directly. Convert via a binary string.
	// String.fromCharCode.apply with a huge array crashes in older browsers,
	// so we walk it in chunks. Yjs updates are typically <64KB anyway.
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function fromBase64(b64: Base64): Uint8Array {
	const binary = atob(b64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

export interface SocketYjsProviderOptions {
	/** Already-connected socket on the `/collab` namespace. */
	socket: Socket;
	/** e.g. `note:42`, `case-summary:17`. Matches the server's doc-name schema. */
	docName: string;
	/** The Yjs document the provider syncs. Fresh or hydrated is fine. */
	ydoc: Y.Doc;
	/** Optional pre-existing awareness instance. One will be created if omitted. */
	awareness?: Awareness;
	/**
	 * Called after `sync-init` has been applied to the local Y.Doc. The
	 * editor uses this to know whether to mount read-only (`canWrite`)
	 * and to identify the authenticated user (for CollaborationCursor's
	 * local awareness state).
	 *
	 * We deliberately don't expose `hasYState` or `contentMd` here — the
	 * client MUST NOT seed the editor from a markdown fallback under any
	 * condition. That's the whole point of Option A: the Y.Doc is the
	 * only source of truth for editor content.
	 */
	onSyncInit?: (info: {
		docName: string;
		canWrite: boolean;
		user: { id: number; name: string | null };
	}) => void;
	/** Fired when the server rejects a message with `permission-denied`. */
	onPermissionDenied?: (info: { doc: string; reason: string }) => void;
	/** Fired when the server rejects a `join` with `resolution-error`. */
	onResolutionError?: (info: { doc: string; reason: string }) => void;
	/**
	 * Called whenever the server broadcasts a trusted identity for a Yjs
	 * clientID (typically one call per remote peer's outbound awareness).
	 * The editor uses this to override the (client-authored, hence
	 * untrusted) `user.name` label the awareness payload carries.
	 */
	onIdentityUpdate?: (info: {
		docName: string;
		clientId: number;
		name: string | null;
		userId: number;
	}) => void;
	/**
	 * Fired when some local edits switch between stored by the server
	 * (`false`) and not yet (`true`): sent but unacked, or held back while
	 * offline. Leaving the page in the `true` state loses them.
	 */
	onSyncStateChange?: (unsynced: boolean) => void;
	/** Fired on every local change of the Y.Doc. */
	onLocalEdit?: () => void;
	/**
	 * Fired once if the server's doc was replaced by an unrelated one (a
	 * re-seed, see `ensure_snapshot`). Our copy can't be merged into it
	 * anymore: the provider stops syncing, and only a reload recovers.
	 */
	onDocReplaced?: () => void;
}

type SyncAck = { ok?: boolean } | undefined;

// Rejoins after a rejected sync, each twice as late as the last.
const REJOIN_DELAY_MS = 1000;
const MAX_REJOINS = 5;

export class SocketYjsProvider {
	readonly socket: Socket;
	readonly docName: string;
	readonly ydoc: Y.Doc;
	readonly awareness: Awareness;

	private opts: SocketYjsProviderOptions;
	private destroyed = false;
	// Set by the first local edit. An editor that typed resends its state
	// on every (re)join: updates emitted just before a disconnect may never
	// have reached the server, and nothing else would ever tell us.
	private editedLocally = false;
	// Between a (re)connect and its `sync-init` the server rejects our
	// syncs, so local edits are held back until the rejoin resends them.
	private joined = false;
	// Lineage of the doc we hold, set by the first `sync-init`.
	private epoch: { value: unknown } | null = null;
	private replaced = false;
	// Unsynced bookkeeping. Acks are lost with the connection they were
	// sent on, so a disconnect turns the unacked syncs into a resync.
	private unacked = 0;
	private needsResync = false;
	private connection = 0;
	private unsynced = false;
	private rejoins = 0;
	private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
	// Trusted `clientID → authenticated user` mapping, populated from
	// server-side `awareness-identity` broadcasts. The label inside a
	// remote peer's awareness payload is client-authored and therefore
	// spoofable — callers that render cursor labels MUST look up here
	// instead of trusting the payload's `user.name` field.
	//
	// Public so the editor's `CollaborationCursor.render` callback can
	// consult it synchronously. It's cheap to expose (nothing sensitive
	// beyond names of users who already share a doc's read access).
	readonly identities = new Map<number, { name: string | null; userId: number }>();

	// Bound handlers so we can `off` them cleanly on destroy.
	private readonly onConnect = () => {
		this.joined = false;
		this.emitJoin();
	};
	private readonly onConnectError = (err: Error) => {
		// Kept as a real error so operators can see why collab is offline
		// (auth failure, namespace not registered, network drop) without
		// enabling verbose logging.
		console.error('[collab] connect_error for', this.docName, err?.message ?? err);
	};
	// Reconnecting is socket.io-client's job: the rejoin resyncs.
	private readonly onDisconnect = (_reason: string) => {
		this.joined = false;
		this.connection++;
		if (this.unacked > 0) this.needsResync = true;
		this.unacked = 0;
		this.reportSyncState();
	};
	private readonly onSyncInit = (data: any) => this.handleSyncInit(data);
	private readonly onRemoteSync = (data: any) => this.handleRemoteSync(data);
	private readonly onRemoteAwareness = (data: any) => this.handleRemoteAwareness(data);
	private readonly onAwarenessIdentity = (data: any) => this.handleAwarenessIdentity(data);
	private readonly onPermissionDenied = (data: any) => this.opts.onPermissionDenied?.(data);
	private readonly onResolutionError = (data: any) => this.opts.onResolutionError?.(data);
	private readonly onYUpdate = (update: Uint8Array, origin: unknown) => {
		if (origin === this) return; // ignore updates we applied from the network
		this.editedLocally = true;
		this.opts.onLocalEdit?.();
		this.emitSync(update);
	};
	private readonly onAwarenessUpdate = (
		{
			added,
			updated,
			removed
		}: {
			added: number[];
			updated: number[];
			removed: number[];
		},
		origin: unknown
	) => {
		if (origin === 'remote') return;
		const changedClients = added.concat(updated, removed);
		if (!changedClients.length) return;
		const update = encodeAwarenessUpdate(this.awareness, changedClients);
		this.emitAwareness(update);
	};

	constructor(opts: SocketYjsProviderOptions) {
		this.opts = opts;
		this.socket = opts.socket;
		this.docName = opts.docName;
		this.ydoc = opts.ydoc;
		this.awareness = opts.awareness ?? new Awareness(opts.ydoc);

		this.socket.on('connect', this.onConnect);
		this.socket.on('connect_error', this.onConnectError);
		this.socket.on('disconnect', this.onDisconnect);
		this.socket.on('sync-init', this.onSyncInit);
		this.socket.on('sync', this.onRemoteSync);
		this.socket.on('awareness', this.onRemoteAwareness);
		this.socket.on('awareness-identity', this.onAwarenessIdentity);
		this.socket.on('permission-denied', this.onPermissionDenied);
		this.socket.on('resolution-error', this.onResolutionError);

		this.ydoc.on('update', this.onYUpdate);
		this.awareness.on('update', this.onAwarenessUpdate);

		// If the socket is already connected when we're constructed (common
		// when we share one long-lived socket across editor mounts), the
		// `connect` handler above will never fire. Kick the join manually.
		if (this.socket.connected) {
			this.emitJoin();
		}
	}

	private emitJoin() {
		if (this.destroyed) return;
		// `format` tells the server this client edits the markdown source
		// (`Y.Text` 'markdown'); it refuses joins from editors that predate
		// it, which would write to the legacy tree nobody reads anymore.
		this.socket.emit('join', { doc: this.docName, format: 'markdown' });
	}

	private handleSyncInit(data: {
		doc: string;
		y_state: Base64 | null;
		epoch?: unknown;
		can_write: boolean;
		user: { id: number; name: string | null };
	}) {
		if (data.doc !== this.docName || this.replaced) return;

		if (!this.epoch) {
			this.epoch = { value: data.epoch };
		} else if (this.epoch.value !== data.epoch) {
			// Applying the new doc would show both contents, and resyncing
			// would store ours next to the new one.
			this.replaced = true;
			this.cancelRejoin();
			this.opts.onDocReplaced?.();
			return;
		}

		this.joined = true;
		if (data.y_state) {
			try {
				const serverState = fromBase64(data.y_state);
				Y.applyUpdate(this.ydoc, serverState, this);
				if (data.can_write) this.resyncToServer(serverState);
			} catch (err) {
				// Malformed snapshot — bail out; the editor stays empty
				// until a remote peer sends the next sync, which will
				// hydrate us. This is very rare in practice (implies a
				// wire-format mismatch between client and server).
				console.warn('collab: sync-init apply failed', err);
			}
		}
		this.reportSyncState();

		this.opts.onSyncInit?.({
			docName: data.doc,
			canWrite: !!data.can_write,
			user: data.user
		});
	}

	/**
	 * Send the server the part of our Y.Doc its `serverState` lacks — Yjs's
	 * "sync step 2", which a plain join does not do. Edits typed while the
	 * socket was down are dropped by `emitSync`, and the ones in flight when
	 * it died may be lost too: both reach the server here, on the rejoin.
	 * This also restores a server state that lost updates our doc holds.
	 *
	 * The diff always carries the whole delete set, so it is sent only when
	 * there may be something to restore: we edited, or we hold updates the
	 * server has not got. A mere visitor's join writes nothing.
	 */
	private resyncToServer(serverState: Uint8Array) {
		const serverVector = Y.encodeStateVectorFromUpdate(serverState);
		// Whatever was held back or unacked is in the diff
		this.needsResync = false;
		if (!this.editedLocally && !this.isAheadOf(Y.decodeStateVector(serverVector))) return;
		this.emitSync(Y.encodeStateAsUpdate(this.ydoc, serverVector));
	}

	private isAheadOf(serverVector: Map<number, number>) {
		for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVector(this.ydoc))) {
			if (clock > (serverVector.get(client) ?? 0)) return true;
		}
		return false;
	}

	private handleRemoteSync(data: { doc: string; update: Base64; origin?: string }) {
		if (data.doc !== this.docName || !data.update || this.replaced) return;
		try {
			Y.applyUpdate(this.ydoc, fromBase64(data.update), this);
		} catch (err) {
			console.warn('collab: remote sync apply failed', err);
		}
	}

	private handleRemoteAwareness(data: { doc: string; update: Base64; origin?: string }) {
		if (data.doc !== this.docName || !data.update) return;
		try {
			applyAwarenessUpdate(this.awareness, fromBase64(data.update), 'remote');
		} catch (err) {
			console.warn('collab: remote awareness apply failed', err);
			return;
		}
		// Overwrite the freshly-applied peer state with the server-
		// attested identity we already know for that clientID (if any).
		// Without this a peer could set `user.name = "Admin"` in their
		// own awareness payload and every viewer would see their cursor
		// labelled that way. See `overrideIdentities` for the rewrite
		// semantics.
		this.overrideIdentities();
	}

	private handleAwarenessIdentity(data: {
		doc: string;
		client_id: number;
		name: string | null;
		user_id: number;
	}) {
		if (data.doc !== this.docName || typeof data.client_id !== 'number') return;
		this.identities.set(data.client_id, {
			name: data.name ?? null,
			userId: data.user_id
		});
		// Rewrite any awareness state for this clientID that was applied
		// before we knew its trusted identity — a peer whose first sync
		// beats the server's identity broadcast would otherwise briefly
		// render with the spoofable label.
		this.overrideIdentities(data.client_id);
		this.opts.onIdentityUpdate?.({
			docName: data.doc,
			clientId: data.client_id,
			name: data.name ?? null,
			userId: data.user_id
		});
	}

	/**
	 * Force each peer's awareness `user.name` (and `user.userId`) to the
	 * server-attested value, discarding whatever the peer put there
	 * themselves. If `onlyClientId` is provided we rewrite that one entry;
	 * otherwise we walk the whole awareness store.
	 *
	 * This is the load-bearing anti-spoof step. The Yjs awareness protocol
	 * gives each peer full control over their own state blob — including
	 * the label that CollaborationCursor uses for decoration. Rewriting
	 * post-apply is our (transport-layer) way of saying "trust the server,
	 * not the peer" without having to rewrite the binary Yjs payload
	 * server-side.
	 *
	 * We DO NOT mark the update as coming from a local source, so this
	 * override never re-emits on the network — it's a purely local view
	 * mutation applied on every peer independently.
	 */
	private overrideIdentities(onlyClientId?: number) {
		// `awareness.states` is a `Map<clientId, state>`. Direct mutation
		// is technically undocumented but stable across every y-protocols
		// major we've shipped against; a version bump that changes this
		// contract will break loudly at test time.
		const states = (
			this.awareness as unknown as {
				states: Map<number, Record<string, unknown>>;
			}
		).states;
		const targets = onlyClientId != null ? [onlyClientId] : [...states.keys()];
		let changed = false;
		for (const clientId of targets) {
			const state = states.get(clientId);
			const trusted = this.identities.get(clientId);
			if (!state || !trusted) continue;
			const currentUser = (state.user as Record<string, unknown>) ?? {};
			// Only rewrite if the label diverges — spares CollaborationCursor
			// a needless redraw when the peer already sent the right value.
			if (currentUser.name === trusted.name && currentUser.userId === trusted.userId) {
				continue;
			}
			state.user = { ...currentUser, name: trusted.name, userId: trusted.userId };
			changed = true;
		}
		if (changed) {
			// Ping the awareness observer so downstream consumers
			// (CollaborationCursor) re-render with the trusted labels.
			// `emit` is exposed by the Observable base class; the
			// argument shape matches what applyAwarenessUpdate would
			// emit — no added/updated diff needed for a label rewrite.
			(
				this.awareness as unknown as {
					emit: (name: string, args: unknown[]) => void;
				}
			).emit('change', [{ added: [], updated: targets, removed: [] }, 'trusted-override']);
		}
	}

	/**
	 * Look up the server-attested name for a Yjs clientID. Returns
	 * `null` if the peer's identity hasn't been announced yet (unlikely
	 * — the server broadcasts on every awareness message).
	 */
	trustedNameFor(clientId: number): string | null {
		return this.identities.get(clientId)?.name ?? null;
	}

	private emitSync(update: Uint8Array) {
		if (this.destroyed) return;
		if (!this.socket.connected || !this.joined) {
			// Held back: `resyncToServer` sends it on the rejoin
			this.needsResync = true;
			this.reportSyncState();
			return;
		}
		const connection = this.connection;
		this.unacked++;
		// Only the opaque Yjs update travels — the server owns markdown
		// rendering (see `iris_engine/collab/render.py`) and will produce
		// its own markdown on flush from the merged authoritative Y.Doc.
		this.socket.emit('sync', { doc: this.docName, update: toBase64(update) }, (ack: SyncAck) =>
			this.handleSyncAck(connection, ack)
		);
		this.reportSyncState();
	}

	private handleSyncAck(connection: number, ack: SyncAck) {
		if (this.destroyed || connection !== this.connection) return;
		this.unacked = Math.max(0, this.unacked - 1);
		// A backend predating acks answers nothing: only an explicit
		// rejection counts
		if (ack?.ok === false) {
			// Later updates build on the rejected one: the server can't
			// render them until it is resent, which the rejoin does
			this.needsResync = true;
			this.scheduleRejoin();
		} else if (!this.needsResync) {
			this.rejoins = 0;
		}
		this.reportSyncState();
	}

	private scheduleRejoin() {
		if (this.rejoinTimer || this.rejoins >= MAX_REJOINS || this.replaced) return;
		const delay = REJOIN_DELAY_MS * 2 ** this.rejoins++;
		this.rejoinTimer = setTimeout(() => {
			this.rejoinTimer = null;
			if (this.socket.connected) this.emitJoin();
		}, delay);
	}

	private cancelRejoin() {
		if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
		this.rejoinTimer = null;
	}

	private reportSyncState() {
		const unsynced = this.needsResync || this.unacked > 0;
		if (unsynced === this.unsynced) return;
		this.unsynced = unsynced;
		this.opts.onSyncStateChange?.(unsynced);
	}

	private emitAwareness(update: Uint8Array) {
		if (this.destroyed || !this.socket.connected || !this.joined) return;
		// `client_id` tells the server which Yjs clientID this awareness
		// message belongs to. The server maps it to our authenticated
		// identity and broadcasts an `awareness-identity` companion so
		// peers can override the (untrusted) `user.name` in the awareness
		// payload with a server-attested label at render time.
		this.socket.emit('awareness', {
			doc: this.docName,
			update: toBase64(update),
			client_id: this.awareness.clientID
		});
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.cancelRejoin();
		// Best-effort leave. If the socket is already dead the server's
		// disconnect handler will do the cleanup instead.
		if (this.socket.connected) {
			this.socket.emit('leave', { doc: this.docName });
		}
		this.socket.off('connect', this.onConnect);
		this.socket.off('connect_error', this.onConnectError);
		this.socket.off('disconnect', this.onDisconnect);
		this.socket.off('sync-init', this.onSyncInit);
		this.socket.off('sync', this.onRemoteSync);
		this.socket.off('awareness', this.onRemoteAwareness);
		this.socket.off('awareness-identity', this.onAwarenessIdentity);
		this.socket.off('permission-denied', this.onPermissionDenied);
		this.socket.off('resolution-error', this.onResolutionError);
		this.ydoc.off('update', this.onYUpdate);
		this.awareness.off('update', this.onAwarenessUpdate);
	}
}
