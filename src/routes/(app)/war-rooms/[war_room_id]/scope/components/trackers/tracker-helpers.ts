/**
 * Small pure helpers of the tracker views (history wording, members).
 */
import type { RequestResponse } from '$lib/services/api.service';
import type {
	TrackerColumn,
	TrackerEvent,
	TrackerStep
} from '$lib/services/war-room-trackers.service';

/** The JSON body of a successful call, null on failure or a non-object body. */
export const okObject = <T extends object>(res: RequestResponse<T>): T | null =>
	res.ok && res.data !== null && typeof res.data === 'object' ? (res.data as T) : null;

/** A war-room member offered by `user` columns. */
export interface TrackerMemberOption {
	id: number;
	name: string;
}

/** The pseudo-column the note cell edits. */
export const TRACKER_NOTE_COLUMN: Pick<TrackerColumn, 'type' | 'label'> = {
	type: 'longtext',
	label: 'Note'
};

const short = (value: unknown, max = 80): string => {
	if (value === null || value === undefined || value === '') return '∅';
	const text = Array.isArray(value) ? value.join(', ') : String(value);
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** One line describing a history event ("added step Email sent"). */
export const describeTrackerEvent = (
	event: Pick<TrackerEvent, 'action' | 'details'>,
	context: { steps?: TrackerStep[]; columns?: TrackerColumn[] } = {}
): string => {
	const d = (event.details ?? {}) as Record<string, unknown>;
	const stepName = () => {
		if (typeof d.step_name === 'string' && d.step_name) return d.step_name;
		const step = context.steps?.find((s) => s.id === d.step_id);
		return step?.name ?? `#${String(d.step_id ?? '?')}`;
	};
	switch (event.action) {
		case 'created':
			return d.label ? `added the row "${short(d.label)}"` : 'added the row';
		case 'deleted':
			return d.label ? `removed the row "${short(d.label)}"` : 'removed the row';
		case 'step_added':
			return `added step ${stepName()}`;
		case 'step_removed':
			return `removed step ${stepName()}`;
		case 'note_changed':
			return d.new ? `set the note to "${short(d.new)}"` : 'cleared the note';
		case 'label_changed':
			return `renamed "${short(d.old)}" to "${short(d.new)}"`;
		case 'value_changed': {
			const label =
				(typeof d.column_label === 'string' && d.column_label) ||
				context.columns?.find((c) => c.key === d.column_key)?.label ||
				String(d.column_key ?? 'a column');
			return d.new === null || d.new === undefined || d.new === ''
				? `cleared ${label}`
				: `set ${label} to "${short(d.new)}"`;
		}
		default:
			return String(event.action).replace(/_/g, ' ');
	}
};
