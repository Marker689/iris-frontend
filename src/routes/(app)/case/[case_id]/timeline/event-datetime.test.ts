import { describe, it, expect, vi, afterEach } from 'vitest';
import { normaliseEventTime, nowEventDateTime } from './event-datetime';

describe('nowEventDateTime', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('splits the local date, time and offset', () => {
		const now = new Date(2026, 9, 4, 8, 5, 3, 7);
		vi.spyOn(now, 'getTimezoneOffset').mockReturnValue(-120);

		expect(nowEventDateTime(now)).toEqual({
			date: '2026-10-04',
			time: '08:05:03.007',
			tz: '+02:00'
		});
	});

	it('writes offsets behind UTC with their minutes', () => {
		const now = new Date(2026, 0, 1, 0, 0, 0, 0);
		vi.spyOn(now, 'getTimezoneOffset').mockReturnValue(210);

		expect(nowEventDateTime(now).tz).toBe('-03:30');
	});
});

describe('normaliseEventTime', () => {
	it.each([
		['08:30', '08:30:00.000'],
		['08:30:15', '08:30:15.000'],
		['08:30:15.5', '08:30:15.500'],
		['08:30:15.123', '08:30:15.123'],
		['8:30:15.123456', '08:30:15.123456']
	])('%s becomes %s', (value, expected) => {
		expect(normaliseEventTime(value)).toBe(expected);
	});

	it('leaves what is not a time for the backend to refuse', () => {
		expect(normaliseEventTime('noon')).toBe('noon');
	});
});
