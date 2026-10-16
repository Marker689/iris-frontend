import { describe, expect, it } from 'vitest';
import { mergeSavedStreamLanes, warRoomActivityFamily } from '../war-room-stream';

describe('war-room stream', () => {
	it('reads the family off the activity slug', () => {
		expect(warRoomActivityFamily('folder.renamed')).toBe('folder');
		expect(warRoomActivityFamily('member.added')).toBe('member');
		expect(warRoomActivityFamily('team.member_added')).toBe('team');
	});

	it('files unknown or missing slugs under the war room', () => {
		expect(warRoomActivityFamily('room.other')).toBe('room');
		expect(warRoomActivityFamily('widget.created')).toBe('room');
		expect(warRoomActivityFamily(null)).toBe('room');
		expect(warRoomActivityFamily(undefined)).toBe('room');
	});

	const ALL = ['message', 'tasks', 'room_activity'];
	const LEGACY = ['message', 'tasks'];

	it('turns on a lane added after old preferences were saved', () => {
		expect(mergeSavedStreamLanes(['message'], undefined, ALL, LEGACY)).toEqual(
			new Set(['message', 'room_activity'])
		);
	});

	it('keeps a lane the operator turned off', () => {
		expect(mergeSavedStreamLanes(['message'], ALL, ALL, LEGACY)).toEqual(new Set(['message']));
	});

	it('drops lanes that no longer exist', () => {
		expect(mergeSavedStreamLanes(['message', 'gone'], ALL, ALL, LEGACY)).toEqual(
			new Set(['message'])
		);
	});
});
