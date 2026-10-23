import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '$lib/services/war-room-chat.service';
import {
	activityAnchorId,
	activityQuote,
	burstSummary,
	escapeMarkdownText,
	defaultLaneRoutes,
	defaultStreamSettings,
	feedKinds,
	foldBursts,
	isMutedEvent,
	isPlainTextKind,
	latestTime,
	muteTargetFor,
	parseStreamPrefs,
	serializeStreamPrefs,
	streamDestination,
	streamLane
} from '../activity-rail';

let nextId = 1;
const row = (fields: Partial<ChatMessage>) =>
	({
		message_id: nextId++,
		author_id: 1,
		author_login: 'alice',
		author_name: 'Alice',
		body: '',
		kind: 'message',
		ref_case_id: null,
		activity_type: null,
		created_at: '2026-10-22T10:00:00',
		deleted_at: null,
		...fields
	}) as ChatMessage;

const caseActivity = (caseId: number, activityType: string, body = 'did a thing') =>
	row({ kind: 'case_activity', ref_case_id: caseId, activity_type: activityType, body });

describe('lanes', () => {
	it('puts automatic kinds in a lane and leaves the conversation out', () => {
		expect(streamLane('case_activity')).toBe('case_activity');
		expect(streamLane('task_completed')).toBe('tasks');
		expect(streamLane('pin')).toBe('notes');
		expect(streamLane('case_detached')).toBe('case_link');
		expect(streamLane('message')).toBeNull();
		expect(streamLane('poll')).toBeNull();
		expect(streamLane('priority')).toBeNull();
	});

	it('keeps decisions, sitreps, notes and case links in the chat by default', () => {
		const routes = defaultLaneRoutes();
		expect(routes.decisions).toBe('chat');
		expect(routes.sitreps).toBe('chat');
		expect(routes.notes).toBe('chat');
		expect(routes.case_link).toBe('chat');
		expect(routes.case_activity).toBe('rail');
		expect(routes.room_activity).toBe('rail');
		expect(routes.tasks).toBe('rail');
	});
});

describe('feedKinds', () => {
	it('fetches the conversation and chat lanes for the chat, rail lanes for the rail', () => {
		const routes = defaultLaneRoutes();
		routes.system = 'off';
		routes.decisions = 'rail';
		const { chat, rail } = feedKinds(routes);
		expect(chat).toEqual(
			expect.arrayContaining(['message', 'poll', 'priority', 'note', 'pin', 'case_attached'])
		);
		expect(chat).not.toContain('decision');
		expect(rail).toEqual(expect.arrayContaining(['case_activity', 'tracker', 'decision']));
		expect([...chat, ...rail]).not.toContain('system');
	});

	it('leaves the rail nothing to fetch when every lane goes elsewhere', () => {
		const routes = defaultLaneRoutes();
		for (const key of Object.keys(routes) as (keyof typeof routes)[]) routes[key] = 'chat';
		expect(feedKinds(routes).rail).toEqual([]);
		expect(feedKinds(routes).chat).toContain('case_activity');
	});
});

describe('preferences', () => {
	it('falls back to the defaults on nothing or garbage', () => {
		expect(parseStreamPrefs(null)).toEqual(defaultStreamSettings());
		expect(parseStreamPrefs('nope')).toEqual(defaultStreamSettings());
		expect(parseStreamPrefs({ routes: { tasks: 'sideways' } }).routes.tasks).toBe('rail');
	});

	it('round-trips through the saved shape', () => {
		const s = defaultStreamSettings();
		s.routes.tasks = 'chat';
		s.routes.system = 'off';
		s.quietMode = true;
		s.foldBursts = false;
		s.railOpen = false;
		s.excludedCases = new Set([4]);
		s.excludedCaseActivities = { 7: new Set(['ioc.updated']) };
		s.excludedRoomActivities = new Set(['member']);
		const saved = JSON.parse(JSON.stringify(serializeStreamPrefs(s)));
		expect(parseStreamPrefs(saved)).toEqual(s);
	});

	it('keeps writing the pre-rail lanes for older clients', () => {
		const s = defaultStreamSettings();
		s.routes.system = 'off';
		const saved = serializeStreamPrefs(s);
		expect(saved.globalFilters).toContain('message');
		expect(saved.globalFilters).toContain('tasks');
		expect(saved.globalFilters).not.toContain('system');
		expect(saved.knownGlobalFilters).toContain('system');
	});

	it('turns lanes switched off before the rail existed off', () => {
		const s = parseStreamPrefs({
			globalFilters: ['message', 'tasks', 'notes'],
			knownGlobalFilters: [
				'message',
				'tasks',
				'sitreps',
				'notes',
				'trackers',
				'system',
				'case_link',
				'room_activity'
			],
			excludedCases: [3]
		});
		expect(s.routes.sitreps).toBe('off');
		expect(s.routes.trackers).toBe('off');
		expect(s.routes.room_activity).toBe('off');
		expect(s.routes.tasks).toBe('rail');
		expect(s.routes.notes).toBe('chat');
		// Never a pre-rail lane: keeps its default.
		expect(s.routes.decisions).toBe('chat');
		expect(s.excludedCases).toEqual(new Set([3]));
	});

	it('starts lanes added after an old save on', () => {
		// Saved before `knownGlobalFilters`: trackers and war-room activity
		// didn't exist yet.
		const s = parseStreamPrefs({ globalFilters: ['message', 'tasks'] });
		expect(s.routes.trackers).toBe('rail');
		expect(s.routes.room_activity).toBe('rail');
		expect(s.routes.system).toBe('off');
	});
});

describe('routing', () => {
	it('sends a row where its lane goes, the conversation always to the chat', () => {
		const s = defaultStreamSettings();
		s.routes.case_activity = 'off';
		expect(streamDestination(row({ kind: 'message' }), s)).toBe('chat');
		expect(streamDestination(row({ kind: 'poll' }), s)).toBe('chat');
		expect(streamDestination(row({ kind: 'decision' }), s)).toBe('chat');
		expect(streamDestination(row({ kind: 'tracker' }), s)).toBe('rail');
		expect(streamDestination(caseActivity(1, 'ioc.created'), s)).toBe('off');
	});

	it('hides muted cases, types and families wherever their lane goes', () => {
		const s = defaultStreamSettings();
		s.excludedCases = new Set([2]);
		s.excludedCaseActivities = { 1: new Set(['ioc.updated']) };
		s.excludedRoomActivities = new Set(['member']);
		expect(isMutedEvent(caseActivity(2, 'ioc.created'), s)).toBe(true);
		expect(isMutedEvent(caseActivity(1, 'ioc.updated'), s)).toBe(true);
		expect(isMutedEvent(caseActivity(1, 'ioc.created'), s)).toBe(false);
		expect(isMutedEvent(row({ kind: 'war_room_activity', activity_type: 'member.added' }), s)).toBe(
			true
		);
		expect(isMutedEvent(row({ kind: 'case_attached', ref_case_id: 2 }), s)).toBe(true);
		expect(streamDestination(row({ kind: 'case_attached', ref_case_id: 2 }), s)).toBe('off');
	});

	it('drops case updates in quiet mode only', () => {
		const s = defaultStreamSettings();
		expect(isMutedEvent(caseActivity(1, 'note.updated'), s)).toBe(false);
		s.quietMode = true;
		expect(isMutedEvent(caseActivity(1, 'note.updated'), s)).toBe(true);
		expect(isMutedEvent(caseActivity(1, 'note.created'), s)).toBe(false);
	});
});

describe('muteTargetFor', () => {
	it('mutes one type on one case for case activity', () => {
		expect(muteTargetFor(caseActivity(5, 'ioc.created'))).toEqual({
			type: 'case_activity',
			caseId: 5,
			slug: 'ioc.created',
			label: 'Mute “IOCs created” on case #5'
		});
	});

	it('mutes the family for war-room activity and the lane otherwise', () => {
		expect(
			muteTargetFor(row({ kind: 'war_room_activity', activity_type: 'member.added' }))
		).toMatchObject({ type: 'room_family', family: 'member' });
		expect(muteTargetFor(row({ kind: 'tracker' }))).toMatchObject({
			type: 'lane',
			lane: 'trackers'
		});
		expect(muteTargetFor(row({ kind: 'message' }))).toBeNull();
	});
});

describe('foldBursts', () => {
	it('folds three or more similar rows in a row', () => {
		const a = [1, 2, 3].map(() => caseActivity(1, 'ioc.created'));
		const b = caseActivity(1, 'asset.created');
		const entries = foldBursts([...a, b], true);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toEqual({ type: 'burst', items: a });
		expect(entries[1]).toEqual({ type: 'one', item: b });
	});

	it('leaves short runs, other authors and a disabled setting alone', () => {
		const pair = [caseActivity(1, 'ioc.created'), caseActivity(1, 'ioc.created')];
		const other = caseActivity(1, 'ioc.created');
		other.author_id = 2;
		expect(foldBursts([...pair, other], true).every((e) => e.type === 'one')).toBe(true);
		const run = [1, 2, 3].map(() => caseActivity(1, 'ioc.created'));
		expect(foldBursts(run, false)).toHaveLength(3);
	});
});

describe('burstSummary', () => {
	it('counts what the burst did', () => {
		const items = ['a', 'b', 'c'].map((v) => caseActivity(1, 'ioc.created', `added IOC ${v}`));
		expect(burstSummary(items)).toBe('added 3 IOCs');
		const removed = ['a', 'b', 'c'].map((v) => caseActivity(1, 'asset.deleted', `removed ${v}`));
		expect(burstSummary(removed)).toBe('deleted 3 assets');
	});

	it('returns null when every row says the same thing', () => {
		const items = [1, 2, 3].map(() => caseActivity(1, 'note.updated', 'updated note Triage'));
		expect(burstSummary(items)).toBeNull();
	});
});

describe('latestTime', () => {
	it('is the newest row, 0 for none', () => {
		expect(latestTime([])).toBe(0);
		const old = row({ created_at: '2026-10-22T09:00:00' });
		const recent = row({ created_at: '2026-10-22T11:00:00' });
		expect(latestTime([recent, old])).toBe(latestTime([recent]));
		expect(latestTime([old, recent])).toBeGreaterThan(latestTime([old]));
	});
});

describe('discuss in chat', () => {
	it('quotes the row with its case and a link back', () => {
		const m = caseActivity(4, 'ioc.created', 'added IOC\n`1.2.3.4`');
		m.message_id = -12;
		expect(activityQuote(m, '#4 Phishing')).toBe(
			'> **Alice** added IOC \\`1.2.3.4\\` · #4 Phishing · [Show in activity](#activity--12)'
		);
	});

	it('escapes the tool names and the actor of the quoted row', () => {
		const m = caseActivity(4, 'case.other', 'Mcp:iris_case_assets_update perm=standard_user');
		m.author_name = 'tines_bot';
		m.message_id = 7;
		expect(activityQuote(m)).toBe(
			'> **tines\\_bot** Mcp:iris\\_case\\_assets\\_update perm=standard\\_user · [Show in activity](#activity-7)'
		);
	});

	it('reads the row id back out of the link', () => {
		expect(activityAnchorId('#activity--12')).toBe(-12);
		expect(activityAnchorId('#activity-40')).toBe(40);
		expect(activityAnchorId('#activity-x')).toBeNull();
		expect(activityAnchorId('/case/4')).toBeNull();
		expect(activityAnchorId(null)).toBeNull();
	});
});

describe('plain-text rows', () => {
	it('shows the activity and tracker lines verbatim, the others as markdown', () => {
		expect(isPlainTextKind('case_activity')).toBe(true);
		expect(isPlainTextKind('war_room_activity')).toBe(true);
		expect(isPlainTextKind('tracker')).toBe(true);
		expect(isPlainTextKind('message')).toBe(false);
		expect(isPlainTextKind('decision')).toBe(false);
	});

	it('escapes what markdown would interpret', () => {
		expect(
			escapeMarkdownText('[ai-workflow:11] iris_case_assets_update *x* `y` #1 a|b ~z~ \\')
		).toBe(
			'\\[ai-workflow:11\\] iris\\_case\\_assets\\_update \\*x\\* \\`y\\` \\#1 a\\|b \\~z\\~ \\\\'
		);
		expect(escapeMarkdownText('plain words')).toBe('plain words');
	});
});
