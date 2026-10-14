/**
 * Date/time helpers for the event form, which splits an event's date
 * into a date, a time (`HH:MM:SS.mmm`) and a UTC offset (`+HH:MM`).
 */

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** The current local date, time and UTC offset, in the form's fields. */
export function nowEventDateTime(now: Date = new Date()): {
	date: string;
	time: string;
	tz: string;
} {
	// getTimezoneOffset() is minutes *behind* UTC: -120 for UTC+02:00
	const offset = -now.getTimezoneOffset();
	const sign = offset < 0 ? '-' : '+';
	const hours = Math.floor(Math.abs(offset) / 60);
	const minutes = Math.abs(offset) % 60;

	return {
		date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
		time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(
			now.getMilliseconds(),
			3
		)}`,
		tz: `${sign}${pad(hours)}:${pad(minutes)}`
	};
}

/**
 * A time as the backend reads it, `HH:MM:SS.mmm`. Time pickers leave
 * out the seconds and milliseconds when they are zero (`08:30`).
 */
export function normaliseEventTime(value: string): string {
	const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(value.trim());
	if (!match) return value;

	const [, hours, minutes, seconds = '00', fraction = ''] = match;
	return `${hours.padStart(2, '0')}:${minutes}:${seconds}.${fraction.padEnd(3, '0')}`;
}
