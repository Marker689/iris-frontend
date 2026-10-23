/**
 * War-room board widgets as the room's writers set them: what each type
 * is called, the room's widget list turned into layout slots, what a
 * widget's settings amount to in a line, and the edits made to that list
 * in "Edit board" before it is saved (add, update, remove, move, drag to
 * a place, change column or type). The server validates the list again
 * on save (see `business/war_room_board_widgets.py`).
 */
import {
	BOARD_BUILTIN_TYPES,
	BOARD_TRACKER_TYPES,
	BOARD_WIDGET_PLACES,
	boardValueLabel,
	isBoardBuiltinType,
	type BoardConfigurableType,
	type BoardPanelColumn,
	type BoardWidgetConfig,
	type BoardWidgetType,
	type BoardWidgetZone,
	type WarRoomBoardWidget
} from '$lib/services/war-room-board.service';
import type { Tracker, TrackerColumn, TrackerStep } from '$lib/services/war-room-trackers.service';
import type { WarRoomTeam } from '$lib/services/war-room-teams.service';
import type { BoardSlot } from './board-layout';

/** Mirrors the server's limit. */
export const BOARD_MAX_WIDGETS = 40;

export interface BoardWidgetTypeInfo {
	label: string;
	description: string;
	/** Tile spanning two grid columns. */
	wide?: boolean;
	/** Needs `vulnerabilities_read` (the backend omits the data otherwise). */
	vulnerabilities?: boolean;
}

export const BOARD_WIDGET_TYPES: Record<BoardWidgetType, BoardWidgetTypeInfo> = {
	ai_suggestions: { label: 'AI suggestions', description: 'Open suggestions on this war room' },
	kpi_compromised: {
		label: 'Compromised',
		description: 'Compromised assets and the ones without a flag'
	},
	kpi_decisions: { label: 'Open decisions', description: 'Open, overdue and due-soon decisions' },
	kpi_exceptions: { label: 'Exceptions', description: 'Assets with an exception flag' },
	kpi_tasks: { label: 'Open tasks', description: 'Open war-room tasks' },
	flags: { label: 'Flags', description: 'Progress and assets by status flag', wide: true },
	vuln_open: {
		label: 'Open vulnerabilities',
		description: 'Open findings on case assets',
		vulnerabilities: true
	},
	vuln_exploited: {
		label: 'Exploited & open',
		description: 'Exploited findings not fixed yet',
		vulnerabilities: true
	},
	vuln_overdue: {
		label: 'Overdue vulnerabilities',
		description: 'Open findings past their due date',
		vulnerabilities: true
	},
	vuln_kev: {
		label: 'KEV open',
		description: 'Open findings listed in CISA KEV',
		vulnerabilities: true
	},
	vuln_assets: {
		label: 'Vulnerable assets',
		description: 'Assets with an open finding',
		vulnerabilities: true
	},
	cases: {
		label: 'Cases',
		description: 'One card per attached case, flagging the cases whose rows carry chosen steps'
	},
	decisions: { label: 'Open decisions list', description: 'The open decisions and their targets' },
	attention: { label: 'Needs attention', description: 'What needs a look now' },
	tracker_count: {
		label: 'Tracker count',
		description: 'How many rows of a tracker carry some steps, e.g. 10/20 contacted'
	},
	tracker_progress: {
		label: 'Tracker progress',
		description: 'Rows of a tracker per step, as bars, a donut or a funnel'
	},
	tracker_list: {
		label: 'Tracker rows',
		description: 'The rows of a tracker carrying some steps, e.g. the actions required'
	},
	tracker_breakdown: {
		label: 'Tracker breakdown',
		description: 'Rows of a tracker per value of a column and per step'
	},
	tasks: { label: 'Tasks', description: 'Open war-room tasks, the ones in progress first' },
	note: { label: 'Note', description: 'A markdown note for everyone' }
};

/** Configurable types, in the order "Add a widget" offers them. */
export const BOARD_ADDABLE_TYPES: readonly BoardConfigurableType[] = [
	'tracker_count',
	'tracker_progress',
	'tracker_list',
	'tracker_breakdown',
	'tasks',
	'note'
];

export const isTrackerWidget = (w: Pick<WarRoomBoardWidget, 'type'>): boolean =>
	BOARD_TRACKER_TYPES.includes(w.type);

/** Columns a breakdown can group by. */
export const breakdownColumns = (columns: TrackerColumn[]): TrackerColumn[] =>
	columns.filter((c) => c.type === 'select' || c.type === 'multiselect' || c.type === 'checkbox');

/** The room's widgets as layout slots, in the room's order. */
export const boardSlots = (widgets: WarRoomBoardWidget[]): BoardSlot[] =>
	widgets.map((w) => ({
		id: w.id,
		zone: BOARD_WIDGET_PLACES[w.type].zone,
		column: BOARD_WIDGET_PLACES[w.type].zone === 'panel' ? (w.column ?? 'main') : null
	}));

/** The title a widget shows: its own, else from its type (and tracker). */
export const boardWidgetTitle = (
	w: Pick<WarRoomBoardWidget, 'type' | 'title' | 'config'>,
	trackerName?: string | null
): string => {
	if (w.title) return w.title;
	if (isTrackerWidget(w) && trackerName) return trackerName;
	return BOARD_WIDGET_TYPES[w.type].label;
};

/** The settings a new widget starts with. */
export const newBoardWidgetConfig = (
	type: BoardConfigurableType,
	trackers: Pick<Tracker, 'id' | 'columns'>[]
): BoardWidgetConfig => {
	const tracker =
		type === 'tracker_breakdown'
			? (trackers.find((t) => breakdownColumns(t.columns ?? []).length) ?? trackers[0])
			: trackers[0];
	switch (type) {
		case 'tracker_count':
			return { tracker_id: tracker?.id, step_ids: [], of_total: true, filter: null };
		case 'tracker_progress':
			return { tracker_id: tracker?.id, step_ids: null, display: 'bars', filter: null };
		case 'tracker_list':
			return { tracker_id: tracker?.id, step_ids: [], filter: null };
		case 'tracker_breakdown':
			return {
				tracker_id: tracker?.id,
				column_key: breakdownColumns(tracker?.columns ?? [])[0]?.key,
				step_ids: null
			};
		case 'tasks':
			return { in_progress_only: false, team_ids: [] };
		case 'note':
			return { text: '' };
	}
};

/** A new widget of the room, not saved yet (the server keeps the id). */
export const newBoardWidget = (
	type: BoardWidgetType,
	trackers: Pick<Tracker, 'id' | 'columns'>[],
	taken: Iterable<string>
): WarRoomBoardWidget => {
	const place = BOARD_WIDGET_PLACES[type];
	let id: string = type;
	if (!isBoardBuiltinType(type)) {
		const used = new Set(taken);
		let n = 1;
		while (used.has(`w_new${n}`)) n++;
		id = `w_new${n}`;
	}
	return {
		id,
		type,
		title: null,
		column: place.column,
		config: isBoardBuiltinType(type)
			? type === 'cases'
				? { highlight_step_ids: [], tracker_ids: null }
				: {}
			: newBoardWidgetConfig(type, trackers)
	};
};

/** Tracker widgets, in the order "Show as" offers them. */
export const BOARD_TRACKER_KINDS: readonly BoardConfigurableType[] = [
	'tracker_count',
	'tracker_progress',
	'tracker_list',
	'tracker_breakdown'
];

/** What the "Add" of a zone offers: new widgets, then built-ins to put back. */
export function boardZoneAddable(
	zone: BoardWidgetZone,
	widgets: Pick<WarRoomBoardWidget, 'type'>[],
	available: (type: BoardWidgetType) => boolean
): { configurable: BoardConfigurableType[]; builtins: BoardWidgetType[] } {
	const inZone = (t: BoardWidgetType) => BOARD_WIDGET_PLACES[t].zone === zone;
	return {
		configurable: BOARD_ADDABLE_TYPES.filter(inZone),
		builtins: missingBuiltins(widgets).filter((t) => inZone(t) && available(t))
	};
}

/** Built-in widgets the room's board does not have (they can be added back). */
export const missingBuiltins = (widgets: Pick<WarRoomBoardWidget, 'type'>[]): BoardWidgetType[] => {
	const present = new Set(widgets.map((w) => w.type));
	return BOARD_BUILTIN_TYPES.filter((t) => !present.has(t));
};

/** Where a widget is drawn: its zone, and its column for a panel. */
const group = (w: WarRoomBoardWidget): string => {
	const { zone } = BOARD_WIDGET_PLACES[w.type];
	return zone === 'panel' ? `panel:${w.column ?? 'main'}` : zone;
};

/** Swap a widget with its previous (`-1`) or next (`1`) neighbour of the same group. */
export function moveBoardWidget(
	widgets: WarRoomBoardWidget[],
	id: string,
	delta: -1 | 1
): WarRoomBoardWidget[] {
	const from = widgets.findIndex((w) => w.id === id);
	if (from === -1) return widgets;
	const g = group(widgets[from]);
	for (let j = from + delta; j >= 0 && j < widgets.length; j += delta) {
		if (group(widgets[j]) !== g) continue;
		const out = [...widgets];
		[out[from], out[j]] = [out[j], out[from]];
		return out;
	}
	return widgets;
}

export const updateBoardWidget = (
	widgets: WarRoomBoardWidget[],
	id: string,
	patch: Partial<Omit<WarRoomBoardWidget, 'id' | 'type'>>
): WarRoomBoardWidget[] => widgets.map((w) => (w.id === id ? { ...w, ...patch } : w));

export const removeBoardWidget = (
	widgets: WarRoomBoardWidget[],
	id: string
): WarRoomBoardWidget[] => widgets.filter((w) => w.id !== id);

/** Move a panel to the other column, at the end of it. */
export function setBoardWidgetColumn(
	widgets: WarRoomBoardWidget[],
	id: string,
	column: BoardPanelColumn
): WarRoomBoardWidget[] {
	const w = widgets.find((x) => x.id === id);
	if (!w || BOARD_WIDGET_PLACES[w.type].zone !== 'panel' || w.column === column) return widgets;
	return [...widgets.filter((x) => x.id !== id), { ...w, column }];
}

/**
 * Move a widget just before `beforeId`, or to the end of its zone (and
 * column) when null; a panel can change column on the way. The list as
 * is when the place is not in the widget's zone or nothing changes.
 */
export function placeBoardWidget(
	widgets: WarRoomBoardWidget[],
	id: string,
	beforeId: string | null,
	column?: BoardPanelColumn
): WarRoomBoardWidget[] {
	const w = widgets.find((x) => x.id === id);
	if (!w || id === beforeId) return widgets;
	const moved =
		column && BOARD_WIDGET_PLACES[w.type].zone === 'panel' && (w.column ?? 'main') !== column
			? { ...w, column }
			: w;
	const g = group(moved);
	const rest = widgets.filter((x) => x.id !== id);
	let at: number;
	if (beforeId !== null) {
		at = rest.findIndex((x) => x.id === beforeId);
		if (at === -1 || group(rest[at]) !== g) return widgets;
	} else {
		const last = rest.map(group).lastIndexOf(g);
		at = last === -1 ? rest.length : last + 1;
	}
	const out = [...rest.slice(0, at), moved, ...rest.slice(at)];
	// Only the order within the zone (and column) shows.
	const order = (list: WarRoomBoardWidget[]) =>
		list
			.filter((x) => group(x) === g)
			.map((x) => x.id)
			.join();
	return moved === w && order(out) === order(widgets) ? widgets : out;
}

/**
 * Turn a tracker widget into another kind (e.g. a count into a progress),
 * keeping what still applies: the tracker, the steps picked, the filter.
 * A tile becoming a panel goes to the panel's usual column.
 */
export function changeBoardWidgetType(
	w: WarRoomBoardWidget,
	type: BoardConfigurableType,
	trackers: Pick<Tracker, 'id' | 'columns'>[]
): WarRoomBoardWidget {
	if (w.type === type) return w;
	const config: BoardWidgetConfig = { ...newBoardWidgetConfig(type, trackers) };
	const old = w.config;
	if ('tracker_id' in config && old.tracker_id !== undefined) config.tracker_id = old.tracker_id;
	// "Every row" ([]) and "the offered steps" (null) both mean no pick.
	if ('step_ids' in config && old.step_ids?.length) config.step_ids = [...old.step_ids];
	if ('filter' in config && old.filter) config.filter = { ...old.filter };
	if (type === 'tracker_breakdown') {
		const tracker = trackers.find((t) => t.id === config.tracker_id);
		config.column_key = breakdownColumns(tracker?.columns ?? [])[0]?.key;
	}
	const place = BOARD_WIDGET_PLACES[type];
	const wasPanel = BOARD_WIDGET_PLACES[w.type].zone === 'panel';
	return {
		...w,
		type,
		column: place.zone === 'panel' ? (wasPanel ? (w.column ?? place.column) : place.column) : null,
		config
	};
}

export interface BoardSummaryContext {
	trackers: Pick<Tracker, 'id' | 'name' | 'columns'>[];
	steps: Pick<TrackerStep, 'id' | 'name'>[];
	teams: Pick<WarRoomTeam, 'team_id' | 'name'>[];
}

/** What a widget's settings amount to, in a line (the editor's cards). */
export function boardWidgetSummary(w: WarRoomBoardWidget, ctx: BoardSummaryContext): string {
	const c = w.config;
	const stepNames = (ids: number[]) =>
		ids.map((id) => ctx.steps.find((s) => s.id === id)?.name ?? `#${id}`).join(', ');
	const tracker = ctx.trackers.find((t) => t.id === c.tracker_id);
	const filter = () => {
		const col = tracker?.columns?.find((x) => x.key === c.filter?.column_key);
		if (!c.filter || !col) return null;
		return `${col.label} is ${c.filter.values.map(boardValueLabel).join(' or ')}`;
	};
	const join = (...parts: (string | null | false | undefined)[]) =>
		parts.filter(Boolean).join(' · ');
	const name = tracker?.name ?? 'No tracker';
	switch (w.type) {
		case 'tracker_count':
			return join(
				name,
				c.step_ids?.length ? stepNames(c.step_ids) : 'every row',
				c.of_total !== false && 'out of all rows',
				filter()
			);
		case 'tracker_list':
			return join(name, c.step_ids?.length ? stepNames(c.step_ids) : 'every row', filter());
		case 'tracker_progress':
			return join(
				name,
				c.display === 'donut' ? 'donut' : c.display === 'funnel' ? 'funnel' : 'bars',
				c.step_ids == null ? 'offered steps' : stepNames(c.step_ids),
				filter()
			);
		case 'tracker_breakdown': {
			const col = tracker?.columns?.find((x) => x.key === c.column_key);
			return join(name, col ? `by ${col.label}` : 'no column');
		}
		case 'tasks': {
			const teams = (c.team_ids ?? [])
				.map((id) => ctx.teams.find((t) => t.team_id === id)?.name)
				.filter(Boolean)
				.join(', ');
			return join(c.in_progress_only ? 'In progress only' : 'Open tasks', teams || 'every team');
		}
		case 'note': {
			const line = (c.text ?? '')
				.split('\n')
				.map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
				.find(Boolean);
			return line ?? 'Empty note';
		}
		case 'cases':
			return c.highlight_step_ids?.length
				? `Flags ${stepNames(c.highlight_step_ids)}`
				: 'One card per attached case';
		default:
			return BOARD_WIDGET_TYPES[w.type].description;
	}
}

/**
 * The list to save: the data the board read attached is dropped and the
 * ids of the widgets added since the last save are left to the server.
 */
export const boardWidgetsBody = (widgets: WarRoomBoardWidget[]) =>
	widgets.map(({ id, type, title, column, config }) => ({
		...(id.startsWith('w_new') ? {} : { id }),
		type,
		title: title?.trim() || null,
		column,
		config
	}));

// Tailwind's 500 shades of the step palette, for the SVG donut (the
// palette classes only exist as backgrounds and borders).
const STEP_HEX: Record<string, string> = {
	slate: '#64748b',
	gray: '#6b7280',
	red: '#ef4444',
	orange: '#f97316',
	amber: '#f59e0b',
	yellow: '#eab308',
	lime: '#84cc16',
	green: '#22c55e',
	emerald: '#10b981',
	teal: '#14b8a6',
	cyan: '#06b6d4',
	sky: '#0ea5e9',
	blue: '#3b82f6',
	indigo: '#6366f1',
	violet: '#8b5cf6',
	purple: '#a855f7',
	fuchsia: '#d946ef',
	pink: '#ec4899',
	rose: '#f43f5e'
};

export const boardStepHex = (color: string | null | undefined): string =>
	(color && Object.hasOwn(STEP_HEX, color) ? STEP_HEX[color] : null) ?? STEP_HEX.slate;

export interface BoardDonutArc {
	/** Length of the arc along the circle. */
	length: number;
	/** `stroke-dashoffset` placing it after the previous arcs. */
	offset: number;
}

/**
 * Arcs of a donut sharing `circumference` between `values` (a row carrying
 * several steps counts in each, so the arcs are shares of the sum).
 */
export function boardDonutArcs(values: number[], circumference: number): BoardDonutArc[] {
	const sum = values.reduce((a, v) => a + Math.max(0, v), 0);
	let start = 0;
	return values.map((v) => {
		const length = sum > 0 ? (Math.max(0, v) / sum) * circumference : 0;
		const arc = { length, offset: -start };
		start += length;
		return arc;
	});
}

/** Why a widget cannot be saved as is, or null. */
export function boardWidgetProblem(
	w: WarRoomBoardWidget,
	trackers: Pick<Tracker, 'id' | 'columns'>[]
): string | null {
	if (!isTrackerWidget(w)) return null;
	const tracker = trackers.find((t) => t.id === w.config.tracker_id);
	if (!tracker) return 'Pick a tracker';
	if (w.type === 'tracker_breakdown') {
		if (!breakdownColumns(tracker.columns ?? []).some((c) => c.key === w.config.column_key)) {
			return 'Pick a select, multiselect or checkbox column';
		}
	}
	const filter = w.config.filter;
	if (
		filter &&
		(!filter.values.length || !tracker.columns?.some((c) => c.key === filter.column_key))
	) {
		return 'The filter needs a column and at least one value';
	}
	return null;
}
