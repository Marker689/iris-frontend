import { describe, expect, it } from 'vitest';
import { resolveStreamRef } from '../stream-ref';

describe('resolveStreamRef', () => {
	it('links war-room objects inside the war room', () => {
		expect(resolveStreamRef(3, 'sitrep', 9, null)?.href).toBe('/war-rooms/3/sitreps?sitrep=9');
		expect(resolveStreamRef(3, 'war_room_task', 9, null)?.href).toBe('/war-rooms/3/tasks#9');
		expect(resolveStreamRef(3, 'war_room_decision', 9, null)?.href).toBe(
			'/war-rooms/3/decisions?d=9'
		);
		expect(resolveStreamRef(3, 'war_room_note', 9, null)?.href).toBe('/war-rooms/3/notes/9');
	});

	it('links case activity to its case', () => {
		expect(resolveStreamRef(3, 'case', 12, null)?.href).toBe('/case/12');
		expect(resolveStreamRef(3, 'user_activity', 500, 12)?.href).toBe('/case/12');
	});

	it('gives no link for the war room itself and nothing for unknown refs', () => {
		expect(resolveStreamRef(3, 'war_room', 3, null)?.href).toBe('');
		expect(resolveStreamRef(3, null, null, null)).toBeNull();
		expect(resolveStreamRef(3, 'mystery', 1, null)).toBeNull();
	});
});
