/**
 * War-room board layout: which widgets a user shows, in which order, and
 * (for the panels) in which column. Stored per user in the
 * `war_room_board_layout` preference, so it applies to every war room.
 *
 * Widgets live in zones rendered top to bottom: the AI suggestions
 * banner, the KPI tiles grid, then the panels split in a wide main column
 * and a narrow side column. Reordering stays within a zone (and, for the
 * panels, within a column). Unknown ids from an older or newer client are
 * dropped and widgets missing from a saved layout come back at their
 * default place, so adding a widget later never hides it from anyone.
 */

export const BOARD_LAYOUT_PREF_KEY = 'war_room_board_layout';

export type BoardWidgetZone = 'banner' | 'tile' | 'panel';
export type BoardPanelColumn = 'main' | 'side';

export interface BoardWidgetDef {
	id: string;
	label: string;
	description: string;
	zone: BoardWidgetZone;
	/** Default column of a panel. */
	column?: BoardPanelColumn;
	/** Tile spanning two grid columns. */
	wide?: boolean;
	/** Needs `vulnerabilities_read` (the backend omits the data otherwise). */
	vulnerabilities?: boolean;
}

export const BOARD_WIDGETS: readonly BoardWidgetDef[] = [
	{
		id: 'ai_suggestions',
		label: 'AI suggestions',
		description: 'Open suggestions on this war room',
		zone: 'banner'
	},
	{
		id: 'kpi_compromised',
		label: 'Compromised',
		description: 'Compromised assets and the ones without a flag',
		zone: 'tile'
	},
	{
		id: 'kpi_decisions',
		label: 'Open decisions',
		description: 'Open, overdue and due-soon decisions',
		zone: 'tile'
	},
	{
		id: 'kpi_exceptions',
		label: 'Exceptions',
		description: 'Assets with an exception flag',
		zone: 'tile'
	},
	{ id: 'kpi_tasks', label: 'Open tasks', description: 'Open war-room tasks', zone: 'tile' },
	{
		id: 'flags',
		label: 'Flags',
		description: 'Progress and assets by status flag',
		zone: 'tile',
		wide: true
	},
	{
		id: 'vuln_open',
		label: 'Open vulnerabilities',
		description: 'Open findings on case assets',
		zone: 'tile',
		vulnerabilities: true
	},
	{
		id: 'vuln_exploited',
		label: 'Exploited & open',
		description: 'Exploited findings not fixed yet',
		zone: 'tile',
		vulnerabilities: true
	},
	{
		id: 'vuln_overdue',
		label: 'Overdue vulnerabilities',
		description: 'Open findings past their due date',
		zone: 'tile',
		vulnerabilities: true
	},
	{
		id: 'vuln_kev',
		label: 'KEV open',
		description: 'Open findings listed in CISA KEV',
		zone: 'tile',
		vulnerabilities: true
	},
	{
		id: 'vuln_assets',
		label: 'Vulnerable assets',
		description: 'Assets with an open finding',
		zone: 'tile',
		vulnerabilities: true
	},
	{
		id: 'cases',
		label: 'Cases',
		description: 'One card per attached case',
		zone: 'panel',
		column: 'main'
	},
	{
		id: 'decisions',
		label: 'Open decisions list',
		description: 'The open decisions and their target dates',
		zone: 'panel',
		column: 'side'
	},
	{
		id: 'attention',
		label: 'Needs attention',
		description: 'What needs a look now',
		zone: 'panel',
		column: 'side'
	}
];

const DEFS = new Map(BOARD_WIDGETS.map((w) => [w.id, w]));

export const boardWidget = (id: string): BoardWidgetDef | undefined => DEFS.get(id);

export interface BoardLayout {
	/** Every known widget, in display order. */
	order: string[];
	hidden: string[];
	/** Panel columns differing from the default. */
	columns: Record<string, BoardPanelColumn>;
}

export const defaultBoardLayout = (): BoardLayout => ({
	order: BOARD_WIDGETS.map((w) => w.id),
	hidden: [],
	columns: {}
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const knownIds = (v: unknown): string[] =>
	Array.isArray(v)
		? [...new Set(v.filter((id): id is string => typeof id === 'string' && DEFS.has(id)))]
		: [];

/** A saved (or garbage) value turned into a complete, valid layout. */
export function normalizeBoardLayout(raw: unknown): BoardLayout {
	if (!isRecord(raw)) return defaultBoardLayout();
	const order = knownIds(raw.order);
	// Missing widgets go back after the default widget preceding them.
	BOARD_WIDGETS.forEach((w, i) => {
		if (order.includes(w.id)) return;
		let at = 0;
		for (let j = i - 1; j >= 0; j--) {
			const k = order.indexOf(BOARD_WIDGETS[j].id);
			if (k !== -1) {
				at = k + 1;
				break;
			}
		}
		order.splice(at, 0, w.id);
	});
	const columns: Record<string, BoardPanelColumn> = {};
	if (isRecord(raw.columns)) {
		for (const [id, col] of Object.entries(raw.columns)) {
			const def = DEFS.get(id);
			if (def?.zone === 'panel' && (col === 'main' || col === 'side') && col !== def.column) {
				columns[id] = col;
			}
		}
	}
	return { order, hidden: knownIds(raw.hidden), columns };
}

export const panelColumn = (layout: BoardLayout, id: string): BoardPanelColumn =>
	layout.columns[id] ?? DEFS.get(id)?.column ?? 'main';

/** Visible widgets of a zone (and panel column), in order. */
export function visibleWidgets(
	layout: BoardLayout,
	zone: BoardWidgetZone,
	available: (def: BoardWidgetDef) => boolean = () => true,
	column?: BoardPanelColumn
): BoardWidgetDef[] {
	return layout.order
		.map((id) => DEFS.get(id))
		.filter(
			(def): def is BoardWidgetDef =>
				!!def &&
				def.zone === zone &&
				!layout.hidden.includes(def.id) &&
				available(def) &&
				(column === undefined || panelColumn(layout, def.id) === column)
		);
}

export function setWidgetVisible(layout: BoardLayout, id: string, visible: boolean): BoardLayout {
	const hidden = layout.hidden.filter((h) => h !== id);
	if (!visible) hidden.push(id);
	return { ...layout, hidden };
}

const sameGroup = (layout: BoardLayout, a: string, b: string): boolean => {
	const da = DEFS.get(a);
	const db = DEFS.get(b);
	if (!da || !db || da.zone !== db.zone) return false;
	return da.zone !== 'panel' || panelColumn(layout, a) === panelColumn(layout, b);
};

/**
 * Swap a widget with its previous (`-1`) or next (`1`) neighbour of the
 * same zone and column, skipping `skip` (e.g. widgets the user can't see).
 */
export function moveWidget(
	layout: BoardLayout,
	id: string,
	delta: -1 | 1,
	skip: (id: string) => boolean = () => false
): BoardLayout {
	const order = [...layout.order];
	const from = order.indexOf(id);
	if (from === -1) return layout;
	for (let j = from + delta; j >= 0 && j < order.length; j += delta) {
		if (skip(order[j]) || !sameGroup(layout, id, order[j])) continue;
		[order[from], order[j]] = [order[j], order[from]];
		return { ...layout, order };
	}
	return layout;
}

export function setPanelColumn(
	layout: BoardLayout,
	id: string,
	column: BoardPanelColumn
): BoardLayout {
	const def = DEFS.get(id);
	if (def?.zone !== 'panel') return layout;
	const columns = { ...layout.columns };
	if (column === def.column) delete columns[id];
	else columns[id] = column;
	return { ...layout, columns };
}

export function isDefaultBoardLayout(layout: BoardLayout): boolean {
	const def = defaultBoardLayout();
	return (
		layout.hidden.length === 0 &&
		Object.keys(layout.columns).length === 0 &&
		layout.order.length === def.order.length &&
		layout.order.every((id, i) => id === def.order[i])
	);
}
