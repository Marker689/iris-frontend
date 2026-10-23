import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	WarRoomBoardService,
	boardBreakdownData,
	boardCountData,
	boardCountText,
	boardFlagCounts,
	boardListData,
	boardMissing,
	boardProgressData,
	boardStepBars,
	boardTasksData,
	boardTrackerRowHref,
	boardValueLabel,
	boardVulnerabilityHref,
	boardVulnerabilityHrefFor,
	boardVulnerabilityKpis,
	sortBoardCases,
	type WarRoomBoardCase,
	type WarRoomBoardKpis
} from '../war-room-board.service';
import type { TrackerStep } from '../war-room-trackers.service';
import type { AssetFlag } from '../asset-flags.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

const flag = (id: number, name: string, color: string, sort_order: number): AssetFlag => ({
	id,
	name,
	description: null,
	color,
	icon: 'unplug',
	kind: 'status',
	sort_order,
	requires_reason: false,
	requires_decision: false
});

describe('WarRoomBoardService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('get()', () => {
		it('GETs /war-rooms/:id/board with default options', async () => {
			const res = { ok: true, status: 200, data: { kpis: {} } };
			mock('get').mockResolvedValueOnce(res);
			const out = await WarRoomBoardService.get(3);
			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/board', {});
			expect(out).toBe(res);
		});

		it('forwards options', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: {} });
			const opts = { skipTokenRefresh: true };
			await WarRoomBoardService.get(3, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/board', opts);
		});
	});

	describe('getWidgets() / setWidgets()', () => {
		it('GETs the room widgets', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { widgets: [] } });
			await WarRoomBoardService.getWidgets(3);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/board/widgets', {});
		});

		it('PUTs the widgets, null for the default board', async () => {
			mock('put').mockResolvedValue({ ok: true, data: {} });
			const widgets = [{ type: 'note' as const, title: null, column: 'side' as const, config: {} }];
			await WarRoomBoardService.setWidgets(3, widgets);
			expect(ApiService.put).toHaveBeenCalledWith('/war-rooms/3/board/widgets', { widgets }, {});
			await WarRoomBoardService.setWidgets(3, null);
			expect(ApiService.put).toHaveBeenLastCalledWith(
				'/war-rooms/3/board/widgets',
				{ widgets: null },
				{}
			);
		});
	});
});

describe('boardFlagCounts()', () => {
	const flags = [flag(1, 'Isolated', 'blue', 0), flag(2, 'Patched', 'violet', 1)];

	it('returns nothing for an empty or missing map, or without assets', () => {
		expect(boardFlagCounts(undefined, flags, 5)).toEqual([]);
		expect(boardFlagCounts({}, flags, 5)).toEqual([]);
		expect(boardFlagCounts({ '1': 0, none: 0 }, flags, 5)).toEqual([]);
		expect(boardFlagCounts({ '1': 2 }, flags, 0)).toEqual([]);
	});

	it('orders rows by flag, then unknown, then unflagged', () => {
		const out = boardFlagCounts({ none: 2, '2': 1, '1': 3, '99': 2 }, flags, 8);
		expect(out.map((s) => s.key)).toEqual(['1', '2', 'other', 'none']);
		expect(out.map((s) => s.count)).toEqual([3, 1, 2, 2]);
		expect(out[0]).toMatchObject({ label: 'Isolated', color: 'blue', icon: 'unplug' });
		expect(out[3]).toMatchObject({ label: 'No flag', color: null });
	});

	it('gives each flag its share of the assets, overlaps included', () => {
		// 4 assets: 3 isolated, 2 patched (some carry both).
		const out = boardFlagCounts({ '1': 3, '2': 2 }, flags, 4);
		expect(out.map((s) => s.pct)).toEqual([75, 50]);
	});
});

describe('boardVulnerabilityHref()', () => {
	it('links vulnerability items to the case asset tab, focused on the finding', () => {
		expect(
			boardVulnerabilityHref({
				type: 'vulnerability_exploited_open',
				case_id: 4,
				asset_id: 7,
				finding_id: 9
			})
		).toBe('/case/4/assets/7?tab=vulnerabilities&finding=9');
		expect(boardVulnerabilityHref({ type: 'vulnerability_overdue', case_id: 4, asset_id: 7 })).toBe(
			'/case/4/assets/7?tab=vulnerabilities'
		);
	});

	it('falls back to the case assets list without an asset', () => {
		expect(boardVulnerabilityHref({ type: 'vulnerability_overdue', case_id: 4 })).toBe(
			'/case/4/assets'
		);
	});

	it('ignores other item types and items without a case', () => {
		expect(boardVulnerabilityHref({ type: 'compromised_unflagged', case_id: 4 })).toBeNull();
		expect(boardVulnerabilityHref({ type: 'vulnerability_overdue', case_id: null })).toBeNull();
	});
});

describe('boardVulnerabilityHrefFor()', () => {
	const item = { type: 'vulnerability_overdue', case_id: 4, asset_id: 7 };
	it('links only for readers', () => {
		expect(boardVulnerabilityHrefFor(item, true)).toBe('/case/4/assets/7?tab=vulnerabilities');
		expect(boardVulnerabilityHrefFor(item, false)).toBeNull();
	});
});

describe('boardVulnerabilityKpis()', () => {
	const base = {
		cases: 1,
		cases_accessible: 1,
		assets: 3,
		compromised: 0,
		flagged: 0,
		done: 0,
		exceptions: 0,
		unflagged: 0,
		decisions_open: 0,
		decisions_overdue: 0,
		decisions_due_24h: 0,
		tasks_open: 0
	} as WarRoomBoardKpis;

	it('returns null when the fields are omitted', () => {
		expect(boardVulnerabilityKpis(base, true)).toBeNull();
		expect(boardVulnerabilityKpis(null, true)).toBeNull();
	});

	it('returns null without read even when the fields are present', () => {
		expect(boardVulnerabilityKpis({ ...base, vulnerabilities_open: 2 }, false)).toBeNull();
	});

	it('maps the fields, defaulting missing siblings to 0', () => {
		expect(
			boardVulnerabilityKpis(
				{ ...base, vulnerabilities_open: 2, vulnerabilities_kev_open: 1, vulnerable_assets: 2 },
				true
			)
		).toEqual({ open: 2, exploitedOpen: 0, overdue: 0, kevOpen: 1, vulnerableAssets: 2 });
	});
});

const step = (id: number, name: string): TrackerStep => ({
	id,
	name,
	description: null,
	color: 'slate',
	icon: null,
	sort_order: id
});

describe('boardStepBars()', () => {
	const steps = [step(1, 'Contacted'), step(2, 'Ack'), step(3, 'Action required')];

	it('gives each step its share of the rows and drops deleted steps', () => {
		const bars = boardStepBars(
			{
				rows_total: 20,
				steps: [
					{ step_id: 1, count: 10 },
					{ step_id: 2, count: 4 },
					{ step_id: 3, count: 2 },
					{ step_id: 9, count: 1 }
				]
			},
			steps
		);
		expect(bars.map((b) => [b.step.name, b.count, b.pct])).toEqual([
			['Contacted', 10, 50],
			['Ack', 4, 20],
			['Action required', 2, 10]
		]);
	});

	it('has no share without rows', () => {
		const bars = boardStepBars({ rows_total: 0, steps: [{ step_id: 1, count: 0 }] }, steps);
		expect(bars[0].pct).toBe(0);
	});
});

describe('boardCountText() / boardValueLabel()', () => {
	it('shows the total only when asked', () => {
		expect(boardCountText({ count: 10, total: 20 }, true)).toBe('10/20');
		expect(boardCountText({ count: 10, total: 20 }, false)).toBe('10');
	});

	it('reads checkbox and empty values', () => {
		expect(boardValueLabel(true)).toBe('Yes');
		expect(boardValueLabel(false)).toBe('No');
		expect(boardValueLabel(null)).toBe('Not set');
		expect(boardValueLabel('Energy')).toBe('Energy');
		expect(boardValueLabel(3)).toBe('3');
	});
});

describe('widget data narrowers', () => {
	const tracker = { id: 1, name: 'Entities', icon: null, source: 'room' } as never;
	const progress = { tracker, truncated: false, rows_total: 2, rows_without_step: 0, steps: [] };
	const count = { tracker, truncated: false, count: 1, total: 2 };
	const list = { tracker, truncated: false, rows: [], total: 0 };
	const tasks = { tasks: [], total: 0, in_progress: 0, overdue: 0 };

	it('keeps the data of the expected shape only', () => {
		expect(boardProgressData(progress)).toBe(progress);
		expect(boardProgressData(count)).toBeUndefined();
		expect(boardCountData(count)).toBe(count);
		expect(boardListData(list)).toBe(list);
		expect(boardListData(tasks)).toBeUndefined();
		expect(boardTasksData(tasks)).toBe(tasks);
		expect(boardBreakdownData(undefined)).toBeUndefined();
	});

	it('tells what was deleted', () => {
		expect(boardMissing({ missing: 'column' })).toBe('column');
		expect(boardBreakdownData({ missing: 'column' })).toBeUndefined();
		expect(boardMissing(count)).toBeNull();
		expect(boardMissing(undefined)).toBeNull();
	});
});

describe('boardTrackerRowHref()', () => {
	it('opens the case of a single-case row, else the tracker tab', () => {
		expect(boardTrackerRowHref(7, 4, { case_ids: [12] })).toBe('/case/12');
		expect(boardTrackerRowHref(7, 4, { case_ids: [] })).toBe('/war-rooms/7/scope?tab=tracker-4');
		expect(boardTrackerRowHref(7, 4, { case_ids: [1, 2] })).toBe(
			'/war-rooms/7/scope?tab=tracker-4'
		);
	});
});

describe('sortBoardCases()', () => {
	const card = (case_id: number, extra: Partial<WarRoomBoardCase> = {}): WarRoomBoardCase => ({
		case_id,
		accessible: true,
		...extra
	});

	it('puts the cases with highlighted steps first, then the most compromised, locked last', () => {
		const cases = [
			card(1, { assets_compromised: 5 }),
			card(2, { accessible: false }),
			card(3, { highlights: [{ step_id: 3, count: 1 }] }),
			card(4, { highlights: [{ step_id: 3, count: 2 }] }),
			card(5, { assets_compromised: 1 })
		];
		expect(sortBoardCases(cases).map((c) => c.case_id)).toEqual([4, 3, 1, 5, 2]);
		expect(cases[0].case_id).toBe(1);
	});
});
