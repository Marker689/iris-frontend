import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Socket } from 'socket.io-client';
import { SocketYjsProvider } from '../socket-yjs-provider';

const DOC = 'note:1';

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

type Payload = { doc: string; update?: string };
type Handler = (data?: unknown) => void;

class FakeSocket {
	connected = true;
	emitted: { event: string; data: Payload }[] = [];
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

	emit(event: string, data: Payload) {
		this.emitted.push({ event, data });
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

const setup = () => {
	const seed = new Y.Doc();
	seed.getText('t').insert(0, 'Seed. ');
	const serverState = Y.encodeStateAsUpdate(seed);
	const socket = new FakeSocket();
	const ydoc = new Y.Doc();
	const provider = new SocketYjsProvider({
		socket: socket as unknown as Socket,
		docName: DOC,
		ydoc
	});
	const syncInit = (state: Uint8Array, canWrite = true) =>
		socket.receive('sync-init', {
			doc: DOC,
			y_state: toB64(state),
			can_write: canWrite,
			user: { id: 1, name: 'analyst' }
		});
	syncInit(serverState);
	return { socket, ydoc, provider, serverState, syncInit };
};

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
		expect(socket.emitted.at(-1)).toEqual({ event: 'join', data: { doc: DOC } });
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
