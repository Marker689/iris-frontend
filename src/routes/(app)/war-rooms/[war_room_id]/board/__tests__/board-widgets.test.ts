import { describe, expect, it } from 'vitest';
import type { WarRoomBoardWidget } from '$lib/services/war-room-board.service';
import type { Tracker } from '$lib/services/war-room-trackers.service';
import {
	BOARD_ADDABLE_TYPES,
	boardDonutArcs,
	boardSlots,
	boardStepHex,
	boardWidgetProblem,
	boardWidgetSummary,
	boardWidgetTitle,
	boardWidgetsBody,
	boardZoneAddable,
	breakdownColumns,
	changeBoardWidgetType,
	isTrackerWidget,
	missingBuiltins,
	moveBoardWidget,
	newBoardWidget,
	placeBoardWidget,
	removeBoardWidget,
	setBoardWidgetColumn,
	updateBoardWidget
} from '../board-widgets';

const TRACKERS: Pick<Tracker, 'id' | 'columns'>[] = [
	{ id: 1, columns: [{ key: 'notes', label: 'Notes', type: 'text' }] },
	{
		id: 2,
		columns: [
			{ key: 'sector', label: 'Sector', type: 'select', options: ['Energy', 'Health'] },
			{ key: 'ack', label: 'Acknowledged', type: 'checkbox' }
		]
	}
];

const widget = (over: Partial<WarRoomBoardWidget> & Pick<WarRoomBoardWidget, 'id' | 'type'>) =>
	({ title: null, column: null, config: {}, ...over }) as WarRoomBoardWidget;

const BOARD: WarRoomBoardWidget[] = [
	widget({ id: 'kpi_tasks', type: 'kpi_tasks' }),
	widget({ id: 'cases', type: 'cases', column: 'main' }),
	widget({ id: 'w_a', type: 'tracker_count', config: { tracker_id: 2, step_ids: [] } }),
	widget({ id: 'decisions', type: 'decisions', column: 'side' }),
	widget({ id: 'w_b', type: 'tracker_progress', column: 'main', config: { tracker_id: 1 } }),
	widget({ id: 'w_c', type: 'note', column: 'side', config: { text: 'hi' } })
];

describe('board widget types', () => {
	it('tells tracker widgets apart', () => {
		expect(isTrackerWidget({ type: 'tracker_list' })).toBe(true);
		expect(isTrackerWidget({ type: 'tasks' })).toBe(false);
		expect(BOARD_ADDABLE_TYPES).not.toContain('cases');
	});

	it('groups by option columns only', () => {
		expect(breakdownColumns(TRACKERS[1].columns).map((c) => c.key)).toEqual(['sector', 'ack']);
		expect(breakdownColumns(TRACKERS[0].columns)).toEqual([]);
	});
});

describe('boardSlots', () => {
	it('places each widget in its zone, panels in their column', () => {
		expect(boardSlots(BOARD)).toEqual([
			{ id: 'kpi_tasks', zone: 'tile', column: null },
			{ id: 'cases', zone: 'panel', column: 'main' },
			{ id: 'w_a', zone: 'tile', column: null },
			{ id: 'decisions', zone: 'panel', column: 'side' },
			{ id: 'w_b', zone: 'panel', column: 'main' },
			{ id: 'w_c', zone: 'panel', column: 'side' }
		]);
	});
});

describe('boardWidgetTitle', () => {
	it('prefers the title, then the tracker name, then the type label', () => {
		expect(boardWidgetTitle({ ...BOARD[2], title: 'Contacted' }, 'Entities')).toBe('Contacted');
		expect(boardWidgetTitle(BOARD[2], 'Entities')).toBe('Entities');
		expect(boardWidgetTitle(BOARD[2])).toBe('Tracker count');
		expect(boardWidgetTitle(BOARD[5], 'Entities')).toBe('Note');
	});
});

describe('newBoardWidget', () => {
	it('gives built-ins their type as id', () => {
		const w = newBoardWidget('attention', TRACKERS, []);
		expect(w).toEqual({
			id: 'attention',
			type: 'attention',
			title: null,
			column: 'side',
			config: {}
		});
		expect(newBoardWidget('cases', TRACKERS, []).config).toEqual({
			highlight_step_ids: [],
			tracker_ids: null
		});
	});

	it('gives new widgets a temporary id and their defaults', () => {
		const w = newBoardWidget('tracker_progress', TRACKERS, ['w_new1', 'x']);
		expect(w.id).toBe('w_new2');
		expect(w.column).toBe('main');
		expect(w.config).toEqual({ tracker_id: 1, step_ids: null, display: 'bars', filter: null });
		// A breakdown starts on a tracker it can group.
		expect(newBoardWidget('tracker_breakdown', TRACKERS, []).config).toEqual({
			tracker_id: 2,
			column_key: 'sector',
			step_ids: null
		});
		expect(newBoardWidget('tracker_count', [], []).config.tracker_id).toBeUndefined();
		expect(newBoardWidget('tasks', TRACKERS, []).config).toEqual({
			in_progress_only: false,
			team_ids: []
		});
		expect(newBoardWidget('note', TRACKERS, []).column).toBe('side');
	});
});

describe('missingBuiltins', () => {
	it('lists the built-ins the board lacks', () => {
		const missing = missingBuiltins(BOARD);
		expect(missing).toContain('attention');
		expect(missing).not.toContain('cases');
		expect(missing).not.toContain('tracker_count');
	});
});

describe('room list edits', () => {
	it('moves within the same zone and column only', () => {
		// w_a's previous tile is kpi_tasks, past the cases panel.
		expect(moveBoardWidget(BOARD, 'w_a', -1).map((w) => w.id)).toEqual([
			'w_a',
			'cases',
			'kpi_tasks',
			'decisions',
			'w_b',
			'w_c'
		]);
		// cases (main) has no main neighbour above it.
		expect(moveBoardWidget(BOARD, 'cases', -1)).toBe(BOARD);
		expect(moveBoardWidget(BOARD, 'decisions', 1).map((w) => w.id)).toEqual([
			'kpi_tasks',
			'cases',
			'w_a',
			'w_c',
			'w_b',
			'decisions'
		]);
		expect(moveBoardWidget(BOARD, 'nope', 1)).toBe(BOARD);
	});

	it('updates and removes', () => {
		const updated = updateBoardWidget(BOARD, 'w_c', { title: 'Brief' });
		expect(updated[5].title).toBe('Brief');
		expect(BOARD[5].title).toBeNull();
		expect(removeBoardWidget(BOARD, 'w_a').map((w) => w.id)).not.toContain('w_a');
	});

	it('moves a panel to the end of the other column', () => {
		const out = setBoardWidgetColumn(BOARD, 'cases', 'side');
		expect(out.map((w) => w.id)).toEqual(['kpi_tasks', 'w_a', 'decisions', 'w_b', 'w_c', 'cases']);
		expect(out[5].column).toBe('side');
		expect(setBoardWidgetColumn(BOARD, 'cases', 'main')).toBe(BOARD);
		expect(setBoardWidgetColumn(BOARD, 'w_a', 'side')).toBe(BOARD);
	});
});

describe('boardWidgetsBody', () => {
	it('drops the data and the temporary ids, trims the titles', () => {
		const body = boardWidgetsBody([
			{ ...BOARD[2], title: '  Contacted ', data: { count: 1, total: 2 } as never },
			widget({ id: 'w_new1', type: 'note', column: 'side', title: '  ', config: { text: '' } })
		]);
		expect(body).toEqual([
			{
				id: 'w_a',
				type: 'tracker_count',
				title: 'Contacted',
				column: null,
				config: { tracker_id: 2, step_ids: [] }
			},
			{ type: 'note', title: null, column: 'side', config: { text: '' } }
		]);
	});
});

describe('boardWidgetProblem', () => {
	it('wants a tracker, a groupable column and a complete filter', () => {
		expect(boardWidgetProblem(BOARD[5], TRACKERS)).toBeNull();
		expect(boardWidgetProblem(BOARD[2], TRACKERS)).toBeNull();
		expect(boardWidgetProblem({ ...BOARD[2], config: { tracker_id: 9 } }, TRACKERS)).toBe(
			'Pick a tracker'
		);
		const breakdown = widget({
			id: 'w_d',
			type: 'tracker_breakdown',
			config: { tracker_id: 1, column_key: 'notes' }
		});
		expect(boardWidgetProblem(breakdown, TRACKERS)).toBe(
			'Pick a select, multiselect or checkbox column'
		);
		expect(
			boardWidgetProblem({ ...breakdown, config: { tracker_id: 2, column_key: 'ack' } }, TRACKERS)
		).toBeNull();
		const filtered = (values: (string | boolean)[]) => ({
			...BOARD[2],
			config: { tracker_id: 2, filter: { column_key: 'sector', values } }
		});
		expect(boardWidgetProblem(filtered([]), TRACKERS)).toBe(
			'The filter needs a column and at least one value'
		);
		expect(boardWidgetProblem(filtered(['Energy']), TRACKERS)).toBeNull();
	});
});

describe('donut helpers', () => {
	it('maps the palette to hex, slate for anything else', () => {
		expect(boardStepHex('red')).toBe('#ef4444');
		expect(boardStepHex('nope')).toBe('#64748b');
		expect(boardStepHex(null)).toBe('#64748b');
		expect(boardStepHex('constructor')).toBe('#64748b');
	});

	it('shares the circumference between the values', () => {
		expect(boardDonutArcs([1, 3, 0], 100)).toEqual([
			{ length: 25, offset: -0 },
			{ length: 75, offset: -25 },
			{ length: 0, offset: -100 }
		]);
		expect(boardDonutArcs([0, 0], 100)).toEqual([
			{ length: 0, offset: -0 },
			{ length: 0, offset: -0 }
		]);
	});
});

describe('placeBoardWidget', () => {
	const ids = (list: WarRoomBoardWidget[]) => list.map((w) => w.id);

	it('drops a widget before another of its zone', () => {
		expect(ids(placeBoardWidget(BOARD, 'w_a', 'kpi_tasks'))).toEqual([
			'w_a',
			'kpi_tasks',
			'cases',
			'decisions',
			'w_b',
			'w_c'
		]);
		// A tile cannot land among the panels.
		expect(placeBoardWidget(BOARD, 'w_a', 'cases')).toBe(BOARD);
		expect(placeBoardWidget(BOARD, 'w_a', 'w_a')).toBe(BOARD);
		expect(placeBoardWidget(BOARD, 'nope', null)).toBe(BOARD);
	});

	it('moves a panel to the other column, before a widget or at its end', () => {
		const before = placeBoardWidget(BOARD, 'cases', 'w_c', 'side');
		expect(ids(before)).toEqual(['kpi_tasks', 'w_a', 'decisions', 'w_b', 'cases', 'w_c']);
		expect(before[4].column).toBe('side');
		const end = placeBoardWidget(BOARD, 'w_b', null, 'side');
		expect(ids(end)).toEqual(['kpi_tasks', 'cases', 'w_a', 'decisions', 'w_c', 'w_b']);
		expect(end[5].column).toBe('side');
		// Already the last of its column: nothing changes.
		expect(placeBoardWidget(BOARD, 'w_c', null, 'side')).toBe(BOARD);
	});
});

describe('changeBoardWidgetType', () => {
	it('keeps the tracker, the steps and the filter', () => {
		const count = widget({
			id: 'w_a',
			type: 'tracker_count',
			config: {
				tracker_id: 2,
				step_ids: [5],
				of_total: true,
				filter: { column_key: 'sector', values: ['Energy'] }
			}
		});
		const progress = changeBoardWidgetType(count, 'tracker_progress', TRACKERS);
		expect(progress).toMatchObject({ id: 'w_a', type: 'tracker_progress', column: 'main' });
		expect(progress.config).toEqual({
			tracker_id: 2,
			step_ids: [5],
			display: 'bars',
			filter: { column_key: 'sector', values: ['Energy'] }
		});
		const breakdown = changeBoardWidgetType(progress, 'tracker_breakdown', TRACKERS);
		expect(breakdown.config).toEqual({ tracker_id: 2, column_key: 'sector', step_ids: [5] });
		const back = changeBoardWidgetType(
			{ ...count, config: { tracker_id: 1 } },
			'tracker_list',
			TRACKERS
		);
		expect(back.config).toEqual({ tracker_id: 1, step_ids: [], filter: null });
		expect(changeBoardWidgetType(progress, 'tracker_count', TRACKERS).column).toBeNull();
		expect(changeBoardWidgetType(count, 'tracker_count', TRACKERS)).toBe(count);
	});

	it('keeps the column of a panel', () => {
		const list = widget({
			id: 'w_l',
			type: 'tracker_list',
			column: 'side',
			config: { tracker_id: 1 }
		});
		expect(changeBoardWidgetType(list, 'tracker_progress', TRACKERS).column).toBe('side');
	});
});

describe('boardZoneAddable', () => {
	it('offers the types of the zone and the built-ins it lacks', () => {
		expect(boardZoneAddable('tile', BOARD, () => true)).toEqual({
			configurable: ['tracker_count'],
			builtins: [
				'kpi_compromised',
				'kpi_decisions',
				'kpi_exceptions',
				'flags',
				'vuln_open',
				'vuln_exploited',
				'vuln_overdue',
				'vuln_kev',
				'vuln_assets'
			]
		});
		const panels = boardZoneAddable('panel', BOARD, (t) => t !== 'attention');
		expect(panels.configurable).toEqual([
			'tracker_progress',
			'tracker_list',
			'tracker_breakdown',
			'tasks',
			'note'
		]);
		expect(panels.builtins).toEqual([]);
		expect(boardZoneAddable('banner', BOARD, () => true).builtins).toEqual(['ai_suggestions']);
	});
});

describe('boardWidgetSummary', () => {
	const ctx = {
		trackers: [{ id: 2, name: 'Entities', columns: TRACKERS[1].columns }],
		steps: [
			{ id: 5, name: 'Contacted' },
			{ id: 6, name: 'Ack' }
		],
		teams: [{ team_id: 3, name: 'Blue' }]
	};
	const sum = (over: Partial<WarRoomBoardWidget> & Pick<WarRoomBoardWidget, 'type'>) =>
		boardWidgetSummary(widget({ id: 'x', ...over }), ctx);

	it('says what each widget shows', () => {
		expect(
			sum({ type: 'tracker_count', config: { tracker_id: 2, step_ids: [5, 6], of_total: true } })
		).toBe('Entities · Contacted, Ack · out of all rows');
		expect(
			sum({
				type: 'tracker_list',
				config: { tracker_id: 2, step_ids: [], filter: { column_key: 'ack', values: [true] } }
			})
		).toBe('Entities · every row · Acknowledged is Yes');
		expect(
			sum({ type: 'tracker_progress', config: { tracker_id: 9, display: 'donut', step_ids: null } })
		).toBe('No tracker · donut · offered steps');
		expect(
			sum({ type: 'tracker_breakdown', config: { tracker_id: 2, column_key: 'sector' } })
		).toBe('Entities · by Sector');
		expect(sum({ type: 'tasks', config: { in_progress_only: true, team_ids: [3] } })).toBe(
			'In progress only · Blue'
		);
		expect(sum({ type: 'note', config: { text: '\n## Brief\nmore' } })).toBe('Brief');
		expect(sum({ type: 'note', config: { text: '' } })).toBe('Empty note');
		expect(sum({ type: 'cases', config: { highlight_step_ids: [6] } })).toBe('Flags Ack');
		expect(sum({ type: 'decisions' })).toBe('The open decisions and their targets');
	});
});
