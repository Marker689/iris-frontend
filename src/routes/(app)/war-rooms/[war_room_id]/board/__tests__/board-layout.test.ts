import { describe, expect, it } from 'vitest';
import {
	BOARD_WIDGETS,
	defaultBoardLayout,
	isDefaultBoardLayout,
	moveWidget,
	normalizeBoardLayout,
	panelColumn,
	setPanelColumn,
	setWidgetVisible,
	visibleWidgets
} from '../board-layout';

const ids = (defs: { id: string }[]) => defs.map((d) => d.id);

describe('normalizeBoardLayout', () => {
	it('falls back to the default layout on garbage', () => {
		expect(normalizeBoardLayout(null)).toEqual(defaultBoardLayout());
		expect(normalizeBoardLayout('x')).toEqual(defaultBoardLayout());
		expect(normalizeBoardLayout([1, 2])).toEqual(defaultBoardLayout());
		expect(isDefaultBoardLayout(normalizeBoardLayout(undefined))).toBe(true);
	});

	it('drops unknown and duplicate ids and puts missing widgets back in place', () => {
		const layout = normalizeBoardLayout({
			order: ['attention', 'nope', 'kpi_tasks', 'kpi_tasks', 'kpi_compromised'],
			hidden: ['flags', 'ghost', 42],
			columns: { cases: 'side', decisions: 'side', kpi_tasks: 'side', attention: 'up' }
		});
		expect(new Set(layout.order)).toEqual(new Set(BOARD_WIDGETS.map((w) => w.id)));
		expect(layout.order.length).toBe(BOARD_WIDGETS.length);
		// The saved relative order is kept.
		expect(layout.order.indexOf('kpi_tasks')).toBeLessThan(layout.order.indexOf('kpi_compromised'));
		// kpi_decisions (missing) follows kpi_compromised, its default predecessor.
		expect(layout.order.indexOf('kpi_decisions')).toBe(layout.order.indexOf('kpi_compromised') + 1);
		expect(layout.order[0]).toBe('ai_suggestions');
		expect(layout.hidden).toEqual(['flags']);
		// Only real panel moves are kept; defaults and invalid values are not.
		expect(layout.columns).toEqual({ cases: 'side' });
	});
});

describe('visibleWidgets', () => {
	it('filters by zone, visibility, availability and column', () => {
		let layout = setWidgetVisible(defaultBoardLayout(), 'kpi_exceptions', false);
		const noVulns = (d: { vulnerabilities?: boolean }) => !d.vulnerabilities;
		expect(ids(visibleWidgets(layout, 'tile', noVulns))).toEqual([
			'kpi_compromised',
			'kpi_decisions',
			'kpi_tasks',
			'flags'
		]);
		expect(ids(visibleWidgets(layout, 'panel', undefined, 'side'))).toEqual([
			'decisions',
			'attention'
		]);
		layout = setWidgetVisible(layout, 'kpi_exceptions', true);
		expect(layout.hidden).toEqual([]);
	});
});

describe('moveWidget', () => {
	it('swaps with the neighbour of the same zone and column', () => {
		const base = defaultBoardLayout();
		// The first tile can't move up into the banner zone.
		expect(moveWidget(base, 'kpi_compromised', -1)).toBe(base);
		const moved = moveWidget(base, 'kpi_decisions', -1);
		expect(ids(visibleWidgets(moved, 'tile')).slice(0, 2)).toEqual([
			'kpi_decisions',
			'kpi_compromised'
		]);
		// attention moves up past cases (main column) to decisions (side).
		const side = moveWidget(base, 'attention', -1);
		expect(ids(visibleWidgets(side, 'panel', undefined, 'side'))).toEqual([
			'attention',
			'decisions'
		]);
	});

	it('skips the widgets the caller says to skip', () => {
		const base = defaultBoardLayout();
		const moved = moveWidget(base, 'cases', -1, (id) => id.startsWith('vuln_'));
		expect(moved).toBe(base);
		const tile = moveWidget(base, 'vuln_open', -1);
		expect(tile.order.indexOf('vuln_open')).toBeLessThan(tile.order.indexOf('flags'));
	});
});

describe('setPanelColumn', () => {
	it('records only the moves away from the default column', () => {
		const side = setPanelColumn(defaultBoardLayout(), 'cases', 'side');
		expect(panelColumn(side, 'cases')).toBe('side');
		expect(side.columns).toEqual({ cases: 'side' });
		const back = setPanelColumn(side, 'cases', 'main');
		expect(back.columns).toEqual({});
		expect(isDefaultBoardLayout(back)).toBe(true);
		expect(setPanelColumn(back, 'flags', 'side')).toBe(back);
	});
});
