import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Socket } from 'socket.io-client';
import { SocketYjsProvider } from '../socket-yjs-provider';

const DOC = 'note:1';

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

type Payload = { doc: string; update?: string };
type Handler = (data?: unknown) => void;
type Ack = (response?: { ok: boolean }) => void;

class FakeSocket {
	connected = true;
	emitted: { event: string; data: Payload; ack?: Ack }[] = [];
	private handlers = new Map<string, Handler[]>();

	on(event: string, handler: Handler) {
		this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
	}

	off(event: string, handler: Handler) {
		this.handlers.set(
			event,
			(this.handlers.get(event) ?? []).filter((h) => h !== handler)
		);
	}

	emit(event: string, data: Payload, ack?: Ack) {
		this.emitted.push({ event, data, ack });
	}

	/** Answer every pending sync ack. */
	ackSyncs(response?: { ok: boolean }) {
		for (const e of this.emitted.filter((e) => e.event === 'sync' && e.ack)) {
			const ack = e.ack!;
			e.ack = undefined;
			ack(response);
		}
	}

	reconnect() {
		this.connected = false;
		this.receive('disconnect', 'transport close');
		this.connected = true;
		this.receive('connect');
	}

	joins() {
		return this.emitted.filter((e) => e.event === 'join').length;
	}

	receive(event: string, data?: unknown) {
		for (const handler of this.handlers.get(event) ?? []) handler(data);
	}

	syncs() {
		return this.emitted.filter((e) => e.event === 'sync').map((e) => fromB64(e.data.update ?? ''));
	}
}

/** The server's authoritative state: what it was seeded with plus every `sync` it received. */
const serverText = (state: Uint8Array, syncs: Uint8Array[]) => {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, Y.mergeUpdates([state, ...syncs]));
	return doc.getText('t').toString();
};

const seeded = (text: string) => {
	const seed = new Y.Doc();
	seed.getText('t').insert(0, text);
	return Y.encodeStateAsUpdate(seed);
};

const setup = () => {
	const serverState = seeded('Seed. ');
	const socket = new FakeSocket();
	const ydoc = new Y.Doc();
	const states: boolean[] = [];
	const onDocReplaced = vi.fn();
	const provider = new SocketYjsProvider({
		socket: socket as unknown as Socket,
		docName: DOC,
		ydoc,
		onSyncStateChange: (unsynced) => states.push(unsynced),
		onDocReplaced
	});
	const syncInit = (state: Uint8Array, canWrite = true, epoch = 4) =>
		socket.receive('sync-init', {
			doc: DOC,
			y_state: toB64(state),
			epoch,
			can_write: canWrite,
			user: { id: 1, name: 'analyst' }
		});
	syncInit(serverState);
	return { socket, ydoc, provider, serverState, syncInit, states, onDocReplaced };
};

afterEach(() => {
	vi.useRealTimers();
});

describe('SocketYjsProvider resync on join', () => {
	it('sends nothing when a visitor joins', () => {
		const { socket } = setup();
		expect(socket.syncs()).toHaveLength(0);
	});

	it('sends the edits typed while disconnected on the rejoin', () => {
		const { socket, ydoc, serverState, syncInit } = setup();
		socket.connected = false;
		ydoc.getText('t').insert(6, 'Typed offline.');
		expect(socket.syncs()).toHaveLength(0);

		socket.connected = true;
		socket.receive('connect');
		expect(socket.emitted.at(-1)).toEqual({
			event: 'join',
			data: { doc: DOC, format: 'markdown' }
		});
		syncInit(serverState);

		expect(serverText(serverState, socket.syncs())).toBe('Seed. Typed offline.');
	});

	it('restores updates the server lost, even without local edits', () => {
		const { socket, ydoc, serverState, syncInit } = setup();
		const peer = new Y.Doc();
		Y.applyUpdate(peer, serverState);
		const peerUpdates: Uint8Array[] = [];
		peer.on('update', (update: Uint8Array) => peerUpdates.push(update));
		peer.getText('t').insert(6, 'Hello ');
		peer.getText('t').insert(12, 'world');
		for (const update of peerUpdates) socket.receive('sync', { doc: DOC, update: toB64(update) });
		expect(ydoc.getText('t').toString()).toBe('Seed. Hello world');

		// The server kept only the second update, which builds on the
		// first: it renders neither
		const lostState = Y.mergeUpdates([serverState, peerUpdates[1]]);
		expect(serverText(lostState, [])).toBe('Seed. ');
		syncInit(lostState);

		expect(serverText(lostState, socket.syncs())).toBe('Seed. Hello world');
	});

	it('sends nothing to a read-only join', () => {
		const { socket, ydoc, serverState, syncInit } = setup();
		socket.connected = false;
		ydoc.getText('t').insert(6, 'Typed offline.');
		socket.connected = true;
		syncInit(serverState, false);
		expect(socket.syncs()).toHaveLength(0);
	});
});

describe('SocketYjsProvider sync state', () => {
	it('holds edits back between a reconnect and its sync-init', () => {
		const { socket, ydoc, serverState, syncInit } = setup();
		socket.reconnect();
		ydoc.getText('t').insert(6, 'Typed early.');
		// The server would reject them, and lock the editor read-only
		expect(socket.syncs()).toHaveLength(0);

		syncInit(serverState);
		expect(serverText(serverState, socket.syncs())).toBe('Seed. Typed early.');
	});

	it('reports the edits unsynced until the server acks them', () => {
		const { socket, ydoc, states } = setup();
		ydoc.getText('t').insert(6, 'A');
		ydoc.getText('t').insert(7, 'B');
		expect(states).toEqual([true]);
		socket.ackSyncs({ ok: true });
		expect(states).toEqual([true, false]);
	});

	it('takes a missing ack as stored, as a backend predating acks sends none', () => {
		const { socket, ydoc, states } = setup();
		ydoc.getText('t').insert(6, 'A');
		socket.ackSyncs(undefined);
		expect(states).toEqual([true, false]);
	});

	it('resends the edits whose ack the disconnect lost', () => {
		const { socket, ydoc, serverState, syncInit, states } = setup();
		ydoc.getText('t').insert(6, 'Lost in flight.');
		socket.reconnect();
		expect(states).toEqual([true]);

		const before = socket.syncs().length;
		syncInit(serverState);
		expect(serverText(serverState, socket.syncs().slice(before))).toBe('Seed. Lost in flight.');
		socket.ackSyncs({ ok: true });
		expect(states).toEqual([true, false]);
	});

	it('rejoins to resend a rejected sync', () => {
		vi.useFakeTimers();
		const { socket, ydoc, serverState, syncInit, states } = setup();
		ydoc.getText('t').insert(6, 'Rejected.');
		socket.ackSyncs({ ok: false });
		expect(states).toEqual([true]);
		expect(socket.joins()).toBe(1);

		vi.advanceTimersByTime(1000);
		expect(socket.joins()).toBe(2);
		const before = socket.syncs().length;
		syncInit(serverState);
		expect(serverText(serverState, socket.syncs().slice(before))).toBe('Seed. Rejected.');
		socket.ackSyncs({ ok: true });
		expect(states).toEqual([true, false]);
	});

	it('gives up rejoining after repeated rejections, still unsynced', () => {
		vi.useFakeTimers();
		const { socket, ydoc, serverState, syncInit, states } = setup();
		ydoc.getText('t').insert(6, 'Rejected.');
		for (let i = 0; i < 10; i++) {
			socket.ackSyncs({ ok: false });
			vi.advanceTimersByTime(60_000);
			syncInit(serverState);
		}
		expect(socket.joins()).toBe(6);
		expect(states.at(-1)).toBe(true);
	});
});

describe('SocketYjsProvider doc replaced', () => {
	it('stops syncing when the server doc is from another epoch', () => {
		const { socket, ydoc, syncInit, onDocReplaced, states } = setup();
		socket.reconnect();
		ydoc.getText('t').insert(6, 'Typed offline.');
		const reseeded = seeded('Seed. Typed offline.');
		syncInit(reseeded, true, 5);

		expect(onDocReplaced).toHaveBeenCalledOnce();
		// Merging would duplicate the content, on screen and on the server
		expect(ydoc.getText('t').toString()).toBe('Seed. Typed offline.');
		expect(socket.syncs()).toHaveLength(0);
		socket.receive('sync', { doc: DOC, update: toB64(reseeded) });
		expect(ydoc.getText('t').toString()).toBe('Seed. Typed offline.');
		expect(states.at(-1)).toBe(true);
	});
});
