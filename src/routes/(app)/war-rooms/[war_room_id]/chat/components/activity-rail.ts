import type { ChatMessage, ChatMessageKind } from '$lib/services/war-room-chat.service';
import { parseServerDate } from '$lib/utils/time-formatter';
import {
	WAR_ROOM_ACTIVITY_FAMILIES,
	mergeSavedStreamLanes,
	warRoomActivityFamily
} from '$lib/utils/war-room-stream';

/**
 * War-room stream split: people talk in the chat, IRIS posts in the
 * Activity rail.
 *
 * Every automatic row belongs to a lane, and each lane is routed by the
 * operator to the rail, inline in the chat, or nowhere. Messages, polls
 * and priority banners have no lane: they are the conversation and
 * always stay in the chat.
 */

export type LaneRoute = 'rail' | 'chat' | 'off';

export const STREAM_LANES = [
	{ key: 'case_activity', label: 'Case activity', kinds: ['case_activity'], route: 'rail' },
	{ key: 'room_activity', label: 'War-room activity', kinds: ['war_room_activity'], route: 'rail' },
	{ key: 'tasks', label: 'Tasks', kinds: ['task_assigned', 'task_completed'], route: 'rail' },
	{ key: 'trackers', label: 'Trackers', kinds: ['tracker'], route: 'rail' },
	{ key: 'system', label: 'System', kinds: ['system'], route: 'rail' },
	{ key: 'notes', label: 'Notes / Pins', kinds: ['note', 'pin'], route: 'chat' },
	{ key: 'decisions', label: 'Decisions', kinds: ['decision'], route: 'chat' },
	{ key: 'sitreps', label: 'SitReps', kinds: ['sitrep_published'], route: 'chat' },
	{
		key: 'case_link',
		label: 'Case attached / detached',
		kinds: ['case_attached', 'case_detached'],
		route: 'chat'
	}
] as const satisfies readonly {
	key: string;
	label: string;
	kinds: readonly ChatMessageKind[];
	route: LaneRoute;
}[];

export type StreamLaneKey = (typeof STREAM_LANES)[number]['key'];
export type LaneRoutes = Record<StreamLaneKey, LaneRoute>;

const ROUTES: readonly LaneRoute[] = ['rail', 'chat', 'off'];

export const streamLane = (kind: ChatMessageKind): StreamLaneKey | null => {
	for (const lane of STREAM_LANES) {
		if ((lane.kinds as readonly string[]).includes(kind)) return lane.key;
	}
	return null;
};

export const laneLabel = (key: StreamLaneKey): string =>
	STREAM_LANES.find((l) => l.key === key)?.label ?? key;

export const defaultLaneRoutes = (): LaneRoutes =>
	Object.fromEntries(STREAM_LANES.map((l) => [l.key, l.route])) as LaneRoutes;

// Case activity types, grouped so the per-case settings stay short.
export const ACTIVITY_GROUPS: {
	key: string;
	label: string;
	slugs: { slug: string; label: string }[];
}[] = [
	{
		key: 'notes',
		label: 'Notes',
		slugs: [
			{ slug: 'note.created', label: 'Created' },
			{ slug: 'note.updated', label: 'Updated' },
			{ slug: 'note.deleted', label: 'Deleted' },
			{ slug: 'directory.created', label: 'Folder created' },
			{ slug: 'directory.updated', label: 'Folder updated' },
			{ slug: 'directory.deleted', label: 'Folder deleted' }
		]
	},
	{
		key: 'iocs',
		label: 'IOCs',
		slugs: [
			{ slug: 'ioc.created', label: 'Created' },
			{ slug: 'ioc.updated', label: 'Updated' },
			{ slug: 'ioc.deleted', label: 'Deleted' }
		]
	},
	{
		key: 'assets',
		label: 'Assets',
		slugs: [
			{ slug: 'asset.created', label: 'Created' },
			{ slug: 'asset.updated', label: 'Updated' },
			{ slug: 'asset.deleted', label: 'Deleted' }
		]
	},
	{
		key: 'evidence',
		label: 'Evidence',
		slugs: [
			{ slug: 'evidence.created', label: 'Added' },
			{ slug: 'evidence.updated', label: 'Updated' },
			{ slug: 'evidence.deleted', label: 'Deleted' }
		]
	},
	{
		key: 'tasks',
		label: 'Tasks',
		slugs: [
			{ slug: 'task.created', label: 'Added' },
			{ slug: 'task.updated', label: 'Updated' },
			{ slug: 'task.deleted', label: 'Deleted' }
		]
	},
	{
		key: 'events',
		label: 'Timeline events',
		slugs: [
			{ slug: 'event.created', label: 'Added' },
			{ slug: 'event.updated', label: 'Updated' },
			{ slug: 'event.deleted', label: 'Deleted' }
		]
	},
	{
		key: 'case',
		label: 'Case lifecycle',
		slugs: [
			{ slug: 'case.created', label: 'Created' },
			{ slug: 'case.closed', label: 'Closed' },
			{ slug: 'case.reopened', label: 'Re-opened' },
			{ slug: 'case.updated', label: 'Updated' },
			{ slug: 'case.reviewer_changed', label: 'Reviewer changed' },
			{ slug: 'alert.linked', label: 'Alert linked / unlinked' }
		]
	},
	{
		key: 'other',
		label: 'Other',
		slugs: [{ slug: 'case.other', label: 'Uncategorised' }]
	}
];

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

/** Case activity slug of a row; rows the backend didn't classify are `case.other`. */
export const caseActivitySlug = (m: ChatMessage): string => m.activity_type ?? 'case.other';

/** "IOCs created" for `ioc.created`, the raw slug for one we don't know. */
export const caseActivityLabel = (slug: string): string => {
	for (const g of ACTIVITY_GROUPS) {
		const s = g.slugs.find((x) => x.slug === slug);
		if (s) return g.key === 'other' ? s.label : `${g.label} ${s.label.toLowerCase()}`;
	}
	return slug;
};

// --- Preferences ------------------------------------------------------

/**
 * Saved under the user's `war_room_stream` preference, the same for every
 * war room. `globalFilters` / `knownGlobalFilters` are the pre-rail
 * on/off lanes: still read when `routes` is missing, and still written so
 * an older UI keeps the lanes the operator switched off.
 */
export type StreamPrefs = {
	routes?: Partial<Record<string, LaneRoute>>;
	foldBursts?: boolean;
	quietMode?: boolean;
	railOpen?: boolean;
	globalFilters?: string[];
	knownGlobalFilters?: string[];
	excludedCases?: number[];
	excludedCaseActivities?: Record<string, string[]>;
	excludedRoomActivities?: string[];
};

export type StreamSettings = {
	routes: LaneRoutes;
	foldBursts: boolean;
	quietMode: boolean;
	railOpen: boolean;
	excludedCases: Set<number>;
	excludedCaseActivities: Record<number, Set<string>>;
	excludedRoomActivities: Set<string>;
};

// The on/off lanes of the pre-rail stream, and the ones it knew before
// it saved `knownGlobalFilters`.
const LEGACY_LANE_KEYS = [
	'message',
	'tasks',
	'sitreps',
	'notes',
	'trackers',
	'system',
	'case_link',
	'room_activity'
];
const LEGACY_LANES_BEFORE_KNOWN = ['message', 'tasks', 'sitreps', 'notes', 'system', 'case_link'];

export const defaultStreamSettings = (): StreamSettings => ({
	routes: defaultLaneRoutes(),
	foldBursts: true,
	quietMode: false,
	railOpen: true,
	excludedCases: new Set(),
	excludedCaseActivities: {},
	excludedRoomActivities: new Set()
});

const isRoute = (v: unknown): v is LaneRoute => ROUTES.includes(v as LaneRoute);

/** Settings out of a saved preference; anything missing or malformed is the default. */
export const parseStreamPrefs = (value: unknown): StreamSettings => {
	const out = defaultStreamSettings();
	if (!value || typeof value !== 'object') return out;
	const saved = value as StreamPrefs;

	if (saved.routes && typeof saved.routes === 'object') {
		for (const lane of STREAM_LANES) {
			const route = saved.routes[lane.key];
			if (isRoute(route)) out.routes[lane.key] = route;
		}
	} else if (Array.isArray(saved.globalFilters)) {
		// Pre-rail preferences: a lane switched off stays off, the rest
		// take the new default route.
		const on = mergeSavedStreamLanes(
			saved.globalFilters,
			saved.knownGlobalFilters,
			LEGACY_LANE_KEYS,
			LEGACY_LANES_BEFORE_KNOWN
		);
		for (const lane of STREAM_LANES) {
			if (LEGACY_LANE_KEYS.includes(lane.key) && !on.has(lane.key)) out.routes[lane.key] = 'off';
		}
	}
	if (typeof saved.foldBursts === 'boolean') out.foldBursts = saved.foldBursts;
	if (typeof saved.quietMode === 'boolean') out.quietMode = saved.quietMode;
	if (typeof saved.railOpen === 'boolean') out.railOpen = saved.railOpen;
	if (Array.isArray(saved.excludedCases)) {
		out.excludedCases = new Set(saved.excludedCases.filter((id) => Number.isFinite(id)));
	}
	if (saved.excludedCaseActivities && typeof saved.excludedCaseActivities === 'object') {
		for (const [k, v] of Object.entries(saved.excludedCaseActivities)) {
			const caseId = Number(k);
			if (Number.isFinite(caseId) && Array.isArray(v))
				out.excludedCaseActivities[caseId] = new Set(v);
		}
	}
	if (Array.isArray(saved.excludedRoomActivities)) {
		out.excludedRoomActivities = new Set(saved.excludedRoomActivities);
	}
	return out;
};

export const serializeStreamPrefs = (s: StreamSettings): StreamPrefs => ({
	routes: { ...s.routes },
	foldBursts: s.foldBursts,
	quietMode: s.quietMode,
	railOpen: s.railOpen,
	globalFilters: LEGACY_LANE_KEYS.filter(
		(key) => key === 'message' || s.routes[key as StreamLaneKey] !== 'off'
	),
	knownGlobalFilters: LEGACY_LANE_KEYS,
	excludedCases: Array.from(s.excludedCases),
	excludedCaseActivities: Object.fromEntries(
		Object.entries(s.excludedCaseActivities)
			.filter(([, v]) => v.size > 0)
			.map(([k, v]) => [k, Array.from(v)])
	),
	excludedRoomActivities: Array.from(s.excludedRoomActivities)
});

// --- Routing ----------------------------------------------------------

/**
 * Whether the operator's mutes hide an automatic row wherever its lane is
 * routed: a muted case, a muted activity type on that case, quiet mode on
 * case `*.updated` rows, a muted war-room activity family.
 */
export const isMutedEvent = (m: ChatMessage, s: StreamSettings): boolean => {
	if (m.kind === 'case_activity') {
		if (m.ref_case_id == null) return false;
		if (s.excludedCases.has(m.ref_case_id)) return true;
		const slug = caseActivitySlug(m);
		if (s.excludedCaseActivities[m.ref_case_id]?.has(slug)) return true;
		return s.quietMode && slug.endsWith('.updated');
	}
	if (m.kind === 'war_room_activity') {
		return s.excludedRoomActivities.has(warRoomActivityFamily(m.activity_type));
	}
	if (m.kind === 'case_attached' || m.kind === 'case_detached') {
		return m.ref_case_id != null && s.excludedCases.has(m.ref_case_id);
	}
	return false;
};

/** Where a row shows up: the chat, the Activity rail, or nowhere. */
export const streamDestination = (m: ChatMessage, s: StreamSettings): LaneRoute => {
	const lane = streamLane(m.kind);
	if (lane == null) return 'chat';
	if (s.routes[lane] === 'off' || isMutedEvent(m, s)) return 'off';
	return s.routes[lane];
};

/** What the rail's "Mute this kind" action switches off for a row. */
export type MuteTarget =
	| { type: 'case_activity'; caseId: number; slug: string; label: string }
	| { type: 'room_family'; family: string; label: string }
	| { type: 'lane'; lane: StreamLaneKey; label: string };

export const muteTargetFor = (m: ChatMessage): MuteTarget | null => {
	if (m.kind === 'case_activity' && m.ref_case_id != null) {
		const slug = caseActivitySlug(m);
		return {
			type: 'case_activity',
			caseId: m.ref_case_id,
			slug,
			label: `Mute “${caseActivityLabel(slug)}” on case #${m.ref_case_id}`
		};
	}
	if (m.kind === 'war_room_activity') {
		const family = warRoomActivityFamily(m.activity_type);
		const label = WAR_ROOM_ACTIVITY_FAMILIES.find((f) => f.key === family)?.label ?? family;
		return { type: 'room_family', family, label: `Mute war-room activity: ${label}` };
	}
	const lane = streamLane(m.kind);
	if (lane == null) return null;
	return { type: 'lane', lane, label: `Turn off “${laneLabel(lane)}”` };
};

// --- Rail list --------------------------------------------------------

export const messageTime = (m: ChatMessage): number =>
	parseServerDate(m.created_at)?.getTime() ?? 0;

/** Newest timestamp of a list of rows, 0 when empty. */
export const latestTime = (items: readonly ChatMessage[]): number =>
	items.reduce((max, m) => Math.max(max, messageTime(m)), 0);

export type RailEntry =
	| { type: 'one'; item: ChatMessage }
	| { type: 'burst'; items: ChatMessage[] };

const burstKey = (m: ChatMessage): string =>
	[m.author_id ?? m.author_login ?? '', m.kind, m.ref_case_id ?? '', m.activity_type ?? ''].join(
		'|'
	);

/**
 * Fold runs of `min`+ consecutive similar rows (same author, kind, case
 * and activity type) into one burst entry. Order is kept, so a list
 * sorted newest first gives bursts sorted newest first.
 */
export const foldBursts = (
	items: readonly ChatMessage[],
	enabled: boolean,
	min = 3
): RailEntry[] => {
	if (!enabled) return items.map((item) => ({ type: 'one', item }));
	const out: RailEntry[] = [];
	for (let i = 0; i < items.length; ) {
		const key = burstKey(items[i]);
		let j = i + 1;
		while (j < items.length && burstKey(items[j]) === key) j++;
		if (j - i >= min) out.push({ type: 'burst', items: items.slice(i, j) });
		else for (const item of items.slice(i, j)) out.push({ type: 'one', item });
		i = j;
	}
	return out;
};

const CASE_NOUNS: Record<string, string> = {
	note: 'notes',
	directory: 'note folders',
	ioc: 'IOCs',
	asset: 'assets',
	evidence: 'evidence files',
	task: 'tasks',
	event: 'timeline events',
	case: 'case changes',
	alert: 'alert links'
};

const VERBS: Record<string, string> = { created: 'added' };

/**
 * One line for a folded burst, e.g. "added 5 IOCs". `null` when every row
 * says the same thing (the same note saved again and again): the caller
 * shows that body once with the count.
 */
export const burstSummary = (items: readonly ChatMessage[]): string | null => {
	const n = items.length;
	if (items.every((m) => m.body === items[0].body)) return null;
	const first = items[0];
	const [family, verb = ''] = (first.activity_type ?? '').split('.', 2);
	if (first.kind === 'case_activity' && CASE_NOUNS[family]) {
		return `${VERBS[verb] ?? verb.replace(/_/g, ' ')} ${n} ${CASE_NOUNS[family]}`.trim();
	}
	if (first.kind === 'war_room_activity' && verb) {
		const label = WAR_ROOM_ACTIVITY_FAMILIES.find((f) => f.key === family)?.label;
		if (label) return `${VERBS[verb] ?? verb.replace(/_/g, ' ')} ${n} ${label.toLowerCase()}`;
	}
	const lane = streamLane(first.kind);
	return `${n} ${lane ? laneLabel(lane).toLowerCase() : 'similar'} events`;
};

// --- Discuss in chat --------------------------------------------------

/** In-page link a quoted activity carries back to its rail row. */
export const ACTIVITY_ANCHOR_PREFIX = '#activity-';

export const activityAnchorId = (href: string | null): number | null => {
	if (!href?.startsWith(ACTIVITY_ANCHOR_PREFIX)) return null;
	const id = Number(href.slice(ACTIVITY_ANCHOR_PREFIX.length));
	return Number.isInteger(id) ? id : null;
};

/**
 * Markdown block quoting an activity row at the top of a chat message:
 * who did what, the case it happened on and a link back to the row.
 */
export const activityQuote = (m: ChatMessage, caseLabel: string | null = null): string => {
	const actor = m.author_name ?? m.author_login;
	const text = (m.body ?? '').replace(/\s+/g, ' ').trim();
	const parts = [actor ? `**${actor}** ${text}` : text];
	if (caseLabel) parts.push(caseLabel);
	parts.push(`[Show in activity](${ACTIVITY_ANCHOR_PREFIX}${m.message_id})`);
	return `> ${parts.join(' · ')}`;
};
