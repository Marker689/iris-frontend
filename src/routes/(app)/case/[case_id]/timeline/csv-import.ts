/**
 * Reading a CSV of timeline events: the columns of the timeline export
 * ("Date (UTC)", "Title", …) as well as the historical import ones
 * (`event_date(UTC)`, `event_title`, …), and dates in the usual
 * ISO-like shapes turned into what the events API expects.
 */
import Papa from 'papaparse';

export type TimelineCsvRow = {
	/** 1-based number of the event in the file (the header is not counted). */
	number: number;
	title: string;
	/** As written in the file; see `timelineCsvDates`. */
	date: string;
	/** The offset the date is in, `+00:00` when the file says nothing. */
	tz: string;
	/** True when `tz` comes from the file rather than the default. */
	tzGiven: boolean;
	description: string;
	/** Comma-separated, whatever the file separated them with (`,`, `|` or `;`). */
	tags: string;
	category: string;
	source: string;
	raw: string;
};

export type TimelineCsv = {
	rows: TimelineCsvRow[];
	/** Problems with the file as a whole (no date or title column, …). */
	errors: string[];
};

type Column =
	| 'title'
	| 'date'
	| 'dateUtc'
	| 'dateWithTz'
	| 'tz'
	| 'description'
	| 'tags'
	| 'category'
	| 'source'
	| 'raw';

// Headers compared lowercased and without spaces
const HEADERS: Record<string, Column> = {
	event_title: 'title',
	title: 'title',
	// The historical import column: read with the timezone of the row
	'event_date(utc)': 'date',
	event_date: 'date',
	date: 'date',
	// The export one: really UTC
	'date(utc)': 'dateUtc',
	'date(withtz)': 'dateWithTz',
	event_date_wtz: 'dateWithTz',
	event_tz: 'tz',
	timezone: 'tz',
	tz: 'tz',
	event_description: 'description',
	description: 'description',
	event_content: 'description',
	event_tags: 'tags',
	tags: 'tags',
	event_category: 'category',
	category: 'category',
	event_source: 'source',
	source: 'source',
	event_raw: 'raw',
	raw: 'raw'
};

const OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

/** `tz` as `±HH:MM`, or null when it is not an offset. */
export function normalizeTz(tz: string): string | null {
	const value = tz.trim();
	if (/^(z|utc|gmt)$/i.test(value)) return '+00:00';
	const match = OFFSET.exec(value);
	return match ? `${match[1]}${match[2]}:${match[3]}` : null;
}

const ISO_LIKE =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\s*(z|utc|gmt|[+-]\d{2}:?\d{2})?$/i;

/**
 * `value` (`2024-03-12 14:05`, `2024-03-12T14:05:00Z`,
 * `2024-03-12T14:05:00.123+02:00`, …) as the events API wants it: the
 * date `YYYY-MM-DDTHH:MM:SS.ffffff` and its offset. An offset in the
 * value wins over `tz`. Null for anything else.
 */
export function normalizeEventDate(value: string, tz: string): { date: string; tz: string } | null {
	const match = ISO_LIKE.exec(value.trim());
	if (!match) return null;
	const [, year, month, day, hour, minute, second = '00', fraction = '0', offset] = match;
	const zone = offset ? normalizeTz(offset) : tz;
	if (!zone) return null;
	return {
		date: `${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.slice(0, 6).padEnd(6, '0')}`,
		tz: zone
	};
}

/**
 * Whether `value` says which timezone it is in: an offset, Z, UTC or
 * GMT at its end, or a Unix timestamp (always UTC).
 */
export function hasOwnTz(value: string): boolean {
	const text = value.trim();
	return /^\d{10}(\d{3})?$/.test(text) || /(z|utc|gmt|[+-]\d{2}:?\d{2})\s*$/i.test(text);
}

/** Reads the CSV `text` of timeline events. */
export function parseTimelineCsv(text: string): TimelineCsv {
	const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
	const [header = [], ...records] = parsed.data;
	const index: Partial<Record<Column, number>> = {};
	header.forEach((name, i) => {
		const column = HEADERS[name.trim().toLowerCase().replaceAll(' ', '')];
		if (column && index[column] === undefined) index[column] = i;
	});

	const errors: string[] = [];
	if (index.title === undefined) errors.push('No title column ("Title" or "event_title")');
	if (index.date === undefined && index.dateUtc === undefined && index.dateWithTz === undefined) {
		errors.push('No date column ("Date (UTC)" or "event_date(UTC)")');
	}
	if (errors.length) return { rows: [], errors };

	const cell = (record: string[], column: Column) => {
		const i = index[column];
		return i === undefined ? '' : (record[i] ?? '').trim();
	};

	const rows = records.map((record, i) => {
		const tzCell = cell(record, 'tz');
		const withTz = cell(record, 'dateWithTz');
		const utc = cell(record, 'dateUtc');
		// The local date and its offset say the most; the export's UTC
		// date is right on its own; the import column is read in the
		// timezone of the row
		let date: string;
		let tz = tzCell;
		if (withTz && tzCell) {
			date = withTz;
		} else if (utc) {
			date = utc;
			tz = '+00:00';
		} else {
			date = cell(record, 'date') || withTz;
		}
		return {
			number: i + 1,
			title: cell(record, 'title'),
			date,
			tz: tz || '+00:00',
			tzGiven: Boolean(tz),
			description: cell(record, 'description').replaceAll(' - ', '\n'),
			tags: cell(record, 'tags')
				.split(/[,|;]/)
				.map((tag) => tag.trim())
				.filter(Boolean)
				.join(','),
			category: cell(record, 'category'),
			source: cell(record, 'source'),
			raw: cell(record, 'raw')
		};
	});
	return { rows, errors: [] };
}

export type TimelineCsvDated = { row: TimelineCsvRow; date: string; tz: string };
export type TimelineCsvRowError = { number: number; message: string };

/** What the server reads of a free-form date (`events/convert-date`). */
export type ConvertDate = (
	value: string
) => Promise<{ date: string; time: string; tz: string } | null>;

/**
 * The date and offset of each row for the events API, or why the row
 * cannot be imported. Dates of an unusual shape go through `convert`
 * (the magic date parse of the event dialog); a timezone column then
 * applies unless the date carries its own.
 */
export async function timelineCsvDates(
	rows: TimelineCsvRow[],
	convert: ConvertDate
): Promise<{ dated: TimelineCsvDated[]; errors: TimelineCsvRowError[] }> {
	const dated: TimelineCsvDated[] = [];
	const errors: TimelineCsvRowError[] = [];
	for (const row of rows) {
		if (row.title.length < 2) {
			errors.push({ number: row.number, message: 'The title needs at least 2 characters' });
			continue;
		}
		if (!row.date) {
			errors.push({ number: row.number, message: 'No date' });
			continue;
		}
		const tz = normalizeTz(row.tz);
		if (!tz) {
			errors.push({
				number: row.number,
				message: `Timezone "${row.tz}" is not an offset such as +02:00`
			});
			continue;
		}
		const local = normalizeEventDate(row.date, tz);
		if (local) {
			dated.push({ row, ...local });
			continue;
		}
		const converted = await convert(row.date);
		if (!converted) {
			errors.push({ number: row.number, message: `Unrecognised date "${row.date}"` });
			continue;
		}
		dated.push({
			row,
			date: `${converted.date}T${converted.time}`,
			tz: row.tzGiven && !hasOwnTz(row.date) ? tz : converted.tz
		});
	}
	return { dated, errors };
}
