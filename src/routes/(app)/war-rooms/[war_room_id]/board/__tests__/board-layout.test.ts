import { describe, expect, it } from 'vitest';
import {
	BOARD_LAYOUT_LEGACY_PREF_KEY,
	boardLayoutPrefKey,
	defaultBoardLayout,
	isDefaultBoardLayout,
	moveWidget,
	normalizeBoardLayout,
	panelColumn,
	setPanelColumn,
	setWidgetVisible,
	visibleWidgets,
	zoneWidgets,
	type BoardSlot
} from '../board-layout';

const ids = (slots: { id: string }[]) => slots.map((s) => s.id);

// A room board: a banner, three tiles, two main panels, two side panels.
const SLOTS: BoardSlot[] = [
	{ id: 'ai_suggestions', zone: 'banner', column: null },
	{ id: 'kpi_compromised', zone: 'tile', column: null },
	{ id: 'w_count', zone: 'tile', column: null },
	{ id: 'vuln_open', zone: 'tile', column: null },
	{ id: 'cases', zone: 'panel', column: 'main' },
	{ id: 'w_progress', zone: 'panel', column: 'main' },
	{ id: 'decisions', zone: 'panel', column: 'side' },
	{ id: 'w_note', zone: 'panel', column: 'side' }
];

describe('boardLayoutPrefKey', () => {
	it('is per war room, next to the legacy key', () => {
		expect(boardLayoutPrefKey(12)).toBe('war_room_board_layout_12');
		expect(BOARD_LAYOUT_LEGACY_PREF_KEY).toBe('war_room_board_layout');
	});
});

describe('normalizeBoardLayout', () => {
	it('falls back to the room layout on garbage', () => {
		for (const raw of [null, undefined, 'x', [1, 2], 3]) {
			expect(normalizeBoardLayout(raw, SLOTS)).toEqual(defaultBoardLayout(SLOTS));
		}
		expect(isDefaultBoardLayout(normalizeBoardLayout(null, SLOTS), SLOTS)).toBe(true);
	});

	it('follows the room order when the saved value has none', () => {
		const layout = normalizeBoardLayout({ hidden: [], columns: {} }, SLOTS);
		expect(layout.order).toEqual(ids(SLOTS));
		expect(isDefaultBoardLayout(layout, SLOTS)).toBe(true);
	});

	it('drops unknown and duplicate ids and puts missing widgets after their room neighbour', () => {
		const layout = normalizeBoardLayout(
			{
				order: ['w_count', 'gone', 'kpi_compromised', 'kpi_compromised', 'decisions', 'cases'],
				hidden: ['gone', 'w_note', 7],
				columns: {}
			},
			SLOTS
		);
		expect(layout.order).toEqual([
			'ai_suggestions',
			'w_count',
			'vuln_open',
			'kpi_compromised',
			'decisions',
			'w_note',
			'cases',
			'w_progress'
		]);
		expect(layout.hidden).toEqual(['w_note']);
	});

	it('reads a legacy layout made of built-in ids', () => {
		const layout = normalizeBoardLayout(
			{ order: ['decisions', 'trackers', 'cases'], hidden: ['trackers', 'vuln_open'] },
			SLOTS
		);
		expect(layout.order.indexOf('decisions')).toBeLessThan(layout.order.indexOf('cases'));
		expect(layout.hidden).toEqual(['vuln_open']);
		expect(layout.order).toHaveLength(SLOTS.length);
	});

	it('keeps only the column overrides that differ from the room', () => {
		const layout = normalizeBoardLayout(
			{ columns: { cases: 'side', decisions: 'side', kpi_compromised: 'main', w_note: 'up' } },
			SLOTS
		);
		expect(layout.columns).toEqual({ cases: 'side' });
	});
});

describe('visibleWidgets / zoneWidgets', () => {
	it('filters by zone, visibility, availability and column', () => {
		const layout = setWidgetVisible(defaultBoardLayout(SLOTS), 'w_count', false);
		const noVulns = (s: BoardSlot) => !s.id.startsWith('vuln_');
		expect(ids(visibleWidgets(layout, SLOTS, 'tile', noVulns))).toEqual(['kpi_compromised']);
		expect(ids(zoneWidgets(layout, SLOTS, 'tile', noVulns))).toEqual([
			'kpi_compromised',
			'w_count'
		]);
		expect(ids(visibleWidgets(layout, SLOTS, 'panel', undefined, 'side'))).toEqual([
			'decisions',
			'w_note'
		]);
		expect(ids(visibleWidgets(layout, SLOTS, 'tile'))).toContain('vuln_open');
	});

	it('honours the column overrides', () => {
		const layout = setPanelColumn(defaultBoardLayout(SLOTS), SLOTS[4], 'side');
		expect(panelColumn(layout, SLOTS[4])).toBe('side');
		expect(ids(visibleWidgets(layout, SLOTS, 'panel', undefined, 'main'))).toEqual(['w_progress']);
		expect(ids(visibleWidgets(layout, SLOTS, 'panel', undefined, 'side'))).toEqual([
			'cases',
			'decisions',
			'w_note'
		]);
		// Back to the room's column: no override left.
		expect(setPanelColumn(layout, SLOTS[4], 'main').columns).toEqual({});
		expect(setPanelColumn(layout, SLOTS[1], 'side')).toBe(layout);
	});
});

describe('moveWidget', () => {
	it('swaps with the neighbour of the same zone and column', () => {
		const base = defaultBoardLayout(SLOTS);
		// The first tile can't move up into the banner.
		expect(moveWidget(base, SLOTS, 'kpi_compromised', -1)).toBe(base);
		const moved = moveWidget(base, SLOTS, 'w_count', -1);
		expect(ids(visibleWidgets(moved, SLOTS, 'tile'))).toEqual([
			'w_count',
			'kpi_compromised',
			'vuln_open'
		]);
		const side = moveWidget(base, SLOTS, 'decisions', 1);
		expect(ids(visibleWidgets(side, SLOTS, 'panel', undefined, 'side'))).toEqual([
			'w_note',
			'decisions'
		]);
		expect(moveWidget(base, SLOTS, 'nope', 1)).toBe(base);
	});

	it('skips the widgets the caller says to skip', () => {
		const base = defaultBoardLayout(SLOTS);
		const moved = moveWidget(base, SLOTS, 'vuln_open', -1, (id) => id === 'w_count');
		expect(ids(visibleWidgets(moved, SLOTS, 'tile'))).toEqual([
			'vuln_open',
			'w_count',
			'kpi_compromised'
		]);
	});
});

describe('isDefaultBoardLayout', () => {
	it('is false once anything differs from the room', () => {
		const base = defaultBoardLayout(SLOTS);
		expect(isDefaultBoardLayout(base, SLOTS)).toBe(true);
		expect(isDefaultBoardLayout(setWidgetVisible(base, 'cases', false), SLOTS)).toBe(false);
		expect(isDefaultBoardLayout(moveWidget(base, SLOTS, 'w_count', -1), SLOTS)).toBe(false);
		expect(isDefaultBoardLayout(setPanelColumn(base, SLOTS[6], 'main'), SLOTS)).toBe(false);
		expect(isDefaultBoardLayout(base, SLOTS.slice(1))).toBe(false);
	});
});
