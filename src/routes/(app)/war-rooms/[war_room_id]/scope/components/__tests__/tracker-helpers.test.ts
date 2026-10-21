import { describe, expect, it } from 'vitest';
import { describeTrackerEvent } from '../trackers/tracker-helpers';

describe('describeTrackerEvent', () => {
	const steps = [
		{ id: 3, name: 'Email sent', description: null, color: 'sky', icon: 'mail', sort_order: 0 }
	];

	it('names the step from the details, else from the war-room steps', () => {
		expect(
			describeTrackerEvent({ action: 'step_added', details: { step_id: 3, step_name: 'Old' } })
		).toBe('added step Old');
		expect(
			describeTrackerEvent({ action: 'step_removed', details: { step_id: 3 } }, { steps })
		).toBe('removed step Email sent');
		expect(describeTrackerEvent({ action: 'step_added', details: { step_id: 9 } })).toBe(
			'added step #9'
		);
	});

	it('describes value changes with the column label', () => {
		expect(
			describeTrackerEvent(
				{ action: 'value_changed', details: { column_key: 'c_owner', old: null, new: 'Bob' } },
				{ columns: [{ key: 'c_owner', label: 'Owner', type: 'text' }] }
			)
		).toBe('set Owner to "Bob"');
		expect(
			describeTrackerEvent({
				action: 'value_changed',
				details: { column_key: 'c_x', column_label: 'X', old: 'a', new: null }
			})
		).toBe('cleared X');
	});

	it('describes notes, labels and unknown actions', () => {
		expect(describeTrackerEvent({ action: 'note_changed', details: { new: '' } })).toBe(
			'cleared the note'
		);
		expect(describeTrackerEvent({ action: 'label_changed', details: { old: 'a', new: 'b' } })).toBe(
			'renamed "a" to "b"'
		);
		expect(describeTrackerEvent({ action: 'row_moved', details: null })).toBe('row moved');
	});
});
