import { describe, expect, it } from 'vitest';
import type { AiEditorPresenceEvent } from '$lib/services/ai-workflows.service';
import {
	presenceApply,
	presenceByNode,
	presenceColor,
	presenceExpire,
	presenceInitials,
	presenceLockHolder,
	presenceUsers,
	type AiEditorPeers
} from './presence';

const event = (overrides: Partial<AiEditorPresenceEvent> = {}): AiEditorPresenceEvent => ({
	type: 'here',
	workflow_id: 7,
	peer_id: 'p1',
	user_id: 1,
	user_name: 'Ada Lovelace',
	node_id: null,
	focused_at: null,
	...overrides
});

const peersOf = (...events: AiEditorPresenceEvent[]): AiEditorPeers =>
	events.reduce<AiEditorPeers>((peers, e) => presenceApply(peers, e, 1000, 'me'), {});

describe('presenceApply', () => {
	it('adds and updates a peer from hello / here', () => {
		let peers = presenceApply({}, event({ type: 'hello' }), 1000, 'me');
		expect(peers.p1).toMatchObject({ userId: 1, name: 'Ada Lovelace', nodeId: null, seenAt: 1000 });
		peers = presenceApply(peers, event({ node_id: 'n1', focused_at: 5 }), 2000, 'me');
		expect(peers.p1).toMatchObject({ nodeId: 'n1', focusedAt: 5, seenAt: 2000 });
	});

	it('removes a peer on gone and ignores an unknown one', () => {
		const peers = peersOf(event());
		expect(presenceApply(peers, event({ type: 'gone' }), 1, 'me')).toEqual({});
		expect(presenceApply(peers, event({ type: 'gone', peer_id: 'x' }), 1, 'me')).toBe(peers);
	});

	it("ignores this tab's own events", () => {
		expect(presenceApply({}, event({ peer_id: 'me' }), 1, 'me')).toEqual({});
	});

	it('drops the focus time of a peer on no node', () => {
		expect(peersOf(event({ focused_at: 9 })).p1.focusedAt).toBeNull();
	});

	it('names a peer without a name', () => {
		expect(peersOf(event({ user_name: '' })).p1.name).toBe('User #1');
	});
});

describe('presenceExpire', () => {
	it('forgets the peers not heard from within the ttl', () => {
		const peers = peersOf(event(), event({ peer_id: 'p2' }));
		peers.p2 = { ...peers.p2, seenAt: 5000 };
		expect(Object.keys(presenceExpire(peers, 5500, 1000))).toEqual(['p2']);
		expect(presenceExpire(peers, 1500, 1000)).toBe(peers);
	});
});

describe('presenceLockHolder', () => {
	const peers = peersOf(
		event({ peer_id: 'a', node_id: 'n1', focused_at: 10 }),
		event({ peer_id: 'b', user_id: 2, node_id: 'n1', focused_at: 5 }),
		event({ peer_id: 'c', user_id: 3, node_id: 'n2', focused_at: 1 })
	);
	const self = { peerId: 'me', nodeId: null, focusedAt: null };

	it('is the peer who focused the node first', () => {
		expect(presenceLockHolder(peers, 'n1', self)?.peerId).toBe('b');
	});

	it('is nobody on a free node', () => {
		expect(presenceLockHolder(peers, 'n3', self)).toBeNull();
	});

	it('is this tab when it focused the node first', () => {
		expect(
			presenceLockHolder(peers, 'n1', { peerId: 'me', nodeId: 'n1', focusedAt: 2 })
		).toBeNull();
		expect(
			presenceLockHolder(peers, 'n1', { peerId: 'me', nodeId: 'n1', focusedAt: 7 })?.peerId
		).toBe('b');
	});

	it('is the peer until this tab focus is acknowledged', () => {
		expect(
			presenceLockHolder(peers, 'n2', { peerId: 'me', nodeId: 'n2', focusedAt: null })?.peerId
		).toBe('c');
	});

	it('breaks a tie on the peer id', () => {
		const tied = peersOf(event({ peer_id: 'z', node_id: 'n', focused_at: 3 }));
		expect(presenceLockHolder(tied, 'n', { peerId: 'a', nodeId: 'n', focusedAt: 3 })).toBeNull();
		expect(presenceLockHolder(tied, 'n', { peerId: 'zz', nodeId: 'n', focusedAt: 3 })?.peerId).toBe(
			'z'
		);
	});
});

describe('presence views', () => {
	const peers = peersOf(
		event({ peer_id: 'a', node_id: 'n1', focused_at: 1 }),
		event({ peer_id: 'b', node_id: 'n2', focused_at: 1 }),
		event({ peer_id: 'c', user_id: 2, user_name: 'Grace', node_id: 'n1', focused_at: 2 })
	);

	it('lists each user once', () => {
		expect(presenceUsers(peers).map((p) => p.userId)).toEqual([1, 2]);
	});

	it('groups the peers by node', () => {
		const byNode = presenceByNode(peers);
		expect(byNode.n1.map((p) => p.peerId)).toEqual(['a', 'c']);
		expect(byNode.n2.map((p) => p.peerId)).toEqual(['b']);
	});

	it('gives a stable colour per user and initials', () => {
		expect(presenceColor(3)).toBe(presenceColor(3));
		expect(presenceColor(1)).not.toBe(presenceColor(2));
		expect(presenceInitials('Ada  Lovelace')).toBe('AL');
		expect(presenceInitials('root')).toBe('RO');
		expect(presenceInitials(' ')).toBe('?');
	});
});
