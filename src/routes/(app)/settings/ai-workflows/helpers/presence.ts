import type { AiEditorPresenceEvent } from '$lib/services/ai-workflows.service';

/**
 * Who else has a workflow's editor open, built from the room's
 * `ai_workflow_editor` events: the server keeps no list, each tab keeps
 * its own from the `hello` / `here` / `gone` it receives, and forgets a
 * peer whose heartbeat stopped.
 */
export interface AiEditorPeer {
	peerId: string;
	userId: number;
	name: string;
	/** The node they configure, null for none. */
	nodeId: string | null;
	/** When they focused it (server epoch seconds): the earliest holds the lock. */
	focusedAt: number | null;
	/** Last event received from them (local ms). */
	seenAt: number;
	color: string;
}

export type AiEditorPeers = Record<string, AiEditorPeer>;

/** This tab, as the server knows it. */
export interface AiEditorSelf {
	peerId: string | null;
	nodeId: string | null;
	focusedAt: number | null;
}

export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_TTL_MS = 75_000;

const COLORS = [
	'#2563eb',
	'#db2777',
	'#16a34a',
	'#ea580c',
	'#7c3aed',
	'#0891b2',
	'#ca8a04',
	'#dc2626'
];

/** A stable colour per user. */
export function presenceColor(userId: number): string {
	return COLORS[Math.abs(userId) % COLORS.length];
}

/** The peers once `event` is applied; this tab's own events are ignored. */
export function presenceApply(
	peers: AiEditorPeers,
	event: AiEditorPresenceEvent,
	now: number,
	selfPeerId: string | null
): AiEditorPeers {
	if (!event?.peer_id || event.peer_id === selfPeerId) return peers;
	if (event.type === 'gone') {
		if (!(event.peer_id in peers)) return peers;
		const next = { ...peers };
		delete next[event.peer_id];
		return next;
	}
	return {
		...peers,
		[event.peer_id]: {
			peerId: event.peer_id,
			userId: event.user_id,
			name: event.user_name || `User #${event.user_id}`,
			nodeId: event.node_id ?? null,
			focusedAt: event.node_id ? (event.focused_at ?? null) : null,
			seenAt: now,
			color: presenceColor(event.user_id)
		}
	};
}

/** The peers heard from within `ttl` ms. */
export function presenceExpire(
	peers: AiEditorPeers,
	now: number,
	ttl = PRESENCE_TTL_MS
): AiEditorPeers {
	const kept = Object.values(peers).filter((p) => now - p.seenAt <= ttl);
	if (kept.length === Object.keys(peers).length) return peers;
	return Object.fromEntries(kept.map((p) => [p.peerId, p]));
}

const before = (
	a: { focusedAt: number; peerId: string },
	b: { focusedAt: number; peerId: string }
) => a.focusedAt < b.focusedAt || (a.focusedAt === b.focusedAt && a.peerId < b.peerId);

/**
 * The peer holding `nodeId`, or null when this tab may edit it: the one
 * who focused it first. Until this tab's own focus is acknowledged, any
 * peer on the node holds it.
 */
export function presenceLockHolder(
	peers: AiEditorPeers,
	nodeId: string,
	self: AiEditorSelf
): AiEditorPeer | null {
	let holder: (AiEditorPeer & { focusedAt: number }) | null = null;
	for (const peer of Object.values(peers)) {
		if (peer.nodeId !== nodeId || peer.focusedAt == null) continue;
		const candidate = peer as AiEditorPeer & { focusedAt: number };
		if (!holder || before(candidate, holder)) holder = candidate;
	}
	if (!holder) return null;
	const mine =
		self.nodeId === nodeId && self.focusedAt != null && self.peerId
			? { focusedAt: self.focusedAt, peerId: self.peerId }
			: null;
	return mine && before(mine, holder) ? null : holder;
}

/** One entry per user (a user may have several tabs open), in arrival order. */
export function presenceUsers(peers: AiEditorPeers): AiEditorPeer[] {
	const seen = new Set<number>();
	const users: AiEditorPeer[] = [];
	for (const peer of Object.values(peers)) {
		if (seen.has(peer.userId)) continue;
		seen.add(peer.userId);
		users.push(peer);
	}
	return users;
}

/** The peers on each node, for the canvas rings. */
export function presenceByNode(peers: AiEditorPeers): Record<string, AiEditorPeer[]> {
	const byNode: Record<string, AiEditorPeer[]> = {};
	for (const peer of Object.values(peers)) {
		if (!peer.nodeId) continue;
		(byNode[peer.nodeId] ??= []).push(peer);
	}
	return byNode;
}

export function presenceInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
