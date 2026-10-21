import type { LinkedCase } from '$lib/services/war-room-timelines.service';
import { caseNameWithoutNumber } from '$lib/utils/case-name';

/** Selection of the linked case timelines, summed up per case: drives the
 *  case row checkbox (checked / indeterminate / unchecked). */
export const caseSelectionState = (
	lc: LinkedCase,
	selected: ReadonlySet<number>
): 'all' | 'some' | 'none' => {
	const on = lc.timelines.filter((t) => selected.has(t.timeline_id)).length;
	if (on === 0) return 'none';
	return on === lc.timelines.length ? 'all' : 'some';
};

/** `selected` with every timeline of `cases` switched on or off. */
export const withCaseTimelines = (
	selected: ReadonlySet<number>,
	cases: readonly LinkedCase[],
	on: boolean
): Set<number> => {
	const next = new Set(selected);
	for (const lc of cases) {
		for (const t of lc.timelines) {
			if (on) next.add(t.timeline_id);
			else next.delete(t.timeline_id);
		}
	}
	return next;
};

/** Linked cases whose number or name contains `needle` (case-insensitive,
 *  a leading `#` is ignored). */
export const filterLinkedCases = (cases: readonly LinkedCase[], needle: string): LinkedCase[] => {
	const q = needle.trim().toLowerCase().replace(/^#/, '');
	if (!q) return [...cases];
	return cases.filter(
		(lc) =>
			String(lc.case_id).includes(q) ||
			caseNameWithoutNumber(lc.case_name).toLowerCase().includes(q)
	);
};
