/**
 * War-room board layout: the personal tweaks a user makes to the room's
 * board — which widgets they hide, in which order they see them and (for
 * the panels) in which column. The widgets themselves are the room's (set
 * by its writers, see board-widgets.ts); the layout only refers to them
 * by id. Stored per user and per room in the
 * `war_room_board_layout_<war room id>` preference; the older
 * `war_room_board_layout` preference (one layout for every room) is read
 * when a room has none.
 *
 * Widgets live in zones rendered top to bottom: the banner, the tiles
 * grid, then the panels split in a wide main column and a narrow side
 * column. Reordering stays within a zone (and, for the panels, within a
 * column). Ids the room no longer has are dropped and widgets missing
 * from a saved layout come back at their room place, so a widget added
 * to the room later is never hidden from anyone.
 */
import type { BoardPanelColumn, BoardWidgetZone } from '$lib/services/war-room-board.service';

export type { BoardPanelColumn, BoardWidgetZone };

export const BOARD_LAYOUT_LEGACY_PREF_KEY = 'war_room_board_layout';

export const boardLayoutPrefKey = (warRoomId: number): string =>
	`${BOARD_LAYOUT_LEGACY_PREF_KEY}_${warRoomId}`;

/** A widget of the room's board, in the room's order. */
export interface BoardSlot {
	id: string;
	zone: BoardWidgetZone;
	/** Panels only: the room's column. */
	column: BoardPanelColumn | null;
}

export interface BoardLayout {
	/** Every widget of the room, in display order. */
	order: string[];
	hidden: string[];
	/** Panel columns differing from the room's. */
	columns: Record<string, BoardPanelColumn>;
}

export const defaultBoardLayout = (slots: BoardSlot[]): BoardLayout => ({
	order: slots.map((s) => s.id),
	hidden: [],
	columns: {}
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const knownIds = (v: unknown, known: Set<string>): string[] =>
	Array.isArray(v)
		? [...new Set(v.filter((id): id is string => typeof id === 'string' && known.has(id)))]
		: [];

/** A saved (or garbage) value turned into a complete, valid layout. */
export function normalizeBoardLayout(raw: unknown, slots: BoardSlot[]): BoardLayout {
	if (!isRecord(raw)) return defaultBoardLayout(slots);
	const byId = new Map(slots.map((s) => [s.id, s]));
	const known = new Set(byId.keys());
	const order = knownIds(raw.order, known);
	// Missing widgets go back after the room widget preceding them.
	slots.forEach((slot, i) => {
		if (order.includes(slot.id)) return;
		let at = 0;
		for (let j = i - 1; j >= 0; j--) {
			const k = order.indexOf(slots[j].id);
			if (k !== -1) {
				at = k + 1;
				break;
			}
		}
		order.splice(at, 0, slot.id);
	});
	const columns: Record<string, BoardPanelColumn> = {};
	if (isRecord(raw.columns)) {
		for (const [id, col] of Object.entries(raw.columns)) {
			const slot = byId.get(id);
			if (slot?.zone === 'panel' && (col === 'main' || col === 'side') && col !== slot.column) {
				columns[id] = col;
			}
		}
	}
	return { order, hidden: knownIds(raw.hidden, known), columns };
}

export const panelColumn = (layout: BoardLayout, slot: BoardSlot): BoardPanelColumn =>
	layout.columns[slot.id] ?? slot.column ?? 'main';

/** Widgets of a zone (and panel column) in the user's order, hidden ones included. */
export function zoneWidgets(
	layout: BoardLayout,
	slots: BoardSlot[],
	zone: BoardWidgetZone,
	available: (slot: BoardSlot) => boolean = () => true,
	column?: BoardPanelColumn
): BoardSlot[] {
	const byId = new Map(slots.map((s) => [s.id, s]));
	return layout.order
		.map((id) => byId.get(id))
		.filter(
			(slot): slot is BoardSlot =>
				!!slot &&
				slot.zone === zone &&
				available(slot) &&
				(column === undefined || panelColumn(layout, slot) === column)
		);
}

/** Visible widgets of a zone (and panel column), in order. */
export const visibleWidgets = (
	layout: BoardLayout,
	slots: BoardSlot[],
	zone: BoardWidgetZone,
	available: (slot: BoardSlot) => boolean = () => true,
	column?: BoardPanelColumn
): BoardSlot[] =>
	zoneWidgets(layout, slots, zone, available, column).filter((s) => !layout.hidden.includes(s.id));

export function setWidgetVisible(layout: BoardLayout, id: string, visible: boolean): BoardLayout {
	const hidden = layout.hidden.filter((h) => h !== id);
	if (!visible) hidden.push(id);
	return { ...layout, hidden };
}

/**
 * Swap a widget with its previous (`-1`) or next (`1`) neighbour of the
 * same zone and column, skipping `skip` (e.g. widgets the user can't see).
 */
export function moveWidget(
	layout: BoardLayout,
	slots: BoardSlot[],
	id: string,
	delta: -1 | 1,
	skip: (id: string) => boolean = () => false
): BoardLayout {
	const byId = new Map(slots.map((s) => [s.id, s]));
	const self = byId.get(id);
	const order = [...layout.order];
	const from = order.indexOf(id);
	if (!self || from === -1) return layout;
	const sameGroup = (other: BoardSlot | undefined) =>
		!!other &&
		other.zone === self.zone &&
		(self.zone !== 'panel' || panelColumn(layout, self) === panelColumn(layout, other));
	for (let j = from + delta; j >= 0 && j < order.length; j += delta) {
		if (skip(order[j]) || !sameGroup(byId.get(order[j]))) continue;
		[order[from], order[j]] = [order[j], order[from]];
		return { ...layout, order };
	}
	return layout;
}

export function setPanelColumn(
	layout: BoardLayout,
	slot: BoardSlot,
	column: BoardPanelColumn
): BoardLayout {
	if (slot.zone !== 'panel') return layout;
	const columns = { ...layout.columns };
	if (column === slot.column) delete columns[slot.id];
	else columns[slot.id] = column;
	return { ...layout, columns };
}

/** The layout is the room's board as is (nothing worth saving). */
export function isDefaultBoardLayout(layout: BoardLayout, slots: BoardSlot[]): boolean {
	return (
		layout.hidden.length === 0 &&
		Object.keys(layout.columns).length === 0 &&
		layout.order.length === slots.length &&
		layout.order.every((id, i) => id === slots[i].id)
	);
}
