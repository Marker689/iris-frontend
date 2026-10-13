import { describe, expect, it, vi } from 'vitest';
import {
	hasOwnTz,
	normalizeEventDate,
	normalizeTz,
	parseTimelineCsv,
	timelineCsvDates,
	type TimelineCsvRow
} from './csv-import';

describe('normalizeEventDate', () => {
	it.each([
		['2024-03-12T14:05:00.000', '2024-03-12T14:05:00.000000', '+00:00'],
		['2024-03-12T14:05:00.000000', '2024-03-12T14:05:00.000000', '+00:00'],
		['2024-03-12T14:05:00', '2024-03-12T14:05:00.000000', '+00:00'],
		['2024-03-12 14:05', '2024-03-12T14:05:00.000000', '+00:00'],
		['2024-03-12T14:05:00,5', '2024-03-12T14:05:00.500000', '+00:00'],
		['2024-03-12T14:05:00.123456789', '2024-03-12T14:05:00.123456', '+00:00'],
		['2024-03-12T14:05:00Z', '2024-03-12T14:05:00.000000', '+00:00'],
		['2024-03-12T14:05:00.1+02:00', '2024-03-12T14:05:00.100000', '+02:00'],
		['2024-03-12 14:05:00 -0530', '2024-03-12T14:05:00.000000', '-05:30']
	])('reads %s', (value, date, tz) => {
		expect(normalizeEventDate(value, '+00:00')).toEqual({ date, tz });
	});

	it('uses the given offset when the value has none', () => {
		expect(normalizeEventDate('2024-03-12 14:05', '+02:00')?.tz).toBe('+02:00');
		expect(normalizeEventDate('2024-03-12 14:05Z', '+02:00')?.tz).toBe('+00:00');
	});

	it.each(['12/03/2024 14:05', 'Mar 12 14:05:00', '1710252300', ''])('leaves %s', (value) => {
		expect(normalizeEventDate(value, '+00:00')).toBeNull();
	});
});

describe('normalizeTz', () => {
	it.each([
		['+02:00', '+02:00'],
		['-0530', '-05:30'],
		['Z', '+00:00'],
		['UTC', '+00:00'],
		['Europe/Paris', null],
		['+2', null]
	])('reads %s', (tz, expected) => {
		expect(normalizeTz(tz)).toBe(expected);
	});
});

describe('hasOwnTz', () => {
	it.each([
		['2024-03-12 14:05 UTC', true],
		['Tue, 12 Mar 2024 14:05:00 +0100', true],
		['1710252300', true],
		['1710252300000', true],
		['12/03/2024 14:05', false]
	])('%s', (value, expected) => {
		expect(hasOwnTz(value)).toBe(expected);
	});
});

describe('parseTimelineCsv', () => {
	it('reads the historical import columns', () => {
		const text =
			'event_title,event_date(UTC),event_tz,event_description,event_tags\r\n' +
			'"Mail received",2024-03-12T14:05:00.000,+02:00,"Reported - Fake O365 page","phishing,mail"\r\n';
		const { rows, errors } = parseTimelineCsv(text);
		expect(errors).toEqual([]);
		expect(rows).toEqual([
			{
				number: 1,
				title: 'Mail received',
				date: '2024-03-12T14:05:00.000',
				tz: '+02:00',
				tzGiven: true,
				description: 'Reported\nFake O365 page',
				tags: 'phishing,mail',
				category: '',
				source: '',
				raw: ''
			}
		]);
	});

	it('reads what the timeline export writes', () => {
		const text =
			'﻿Date (UTC),Title,Description,Category,Tags\n' +
			'2024-03-12T12:05:00.000000,Mail received,"Line one\nLine two",Initial Access,\n';
		const [row] = parseTimelineCsv(text).rows;
		expect(row).toMatchObject({
			date: '2024-03-12T12:05:00.000000',
			tz: '+00:00',
			title: 'Mail received',
			description: 'Line one\nLine two',
			category: 'Initial Access',
			tags: ''
		});
	});

	it('prefers the local date and its timezone of an export', () => {
		const text =
			'Date (UTC),Title,Timezone,Date (with TZ)\n' +
			'2024-03-12T12:05:00.000000,X1,+02:00,2024-03-12T14:05:00.000000\n';
		expect(parseTimelineCsv(text).rows[0]).toMatchObject({
			date: '2024-03-12T14:05:00.000000',
			tz: '+02:00'
		});
	});

	it('reads the export UTC date as UTC even with a timezone column', () => {
		const text = 'Date (UTC),Title,Timezone\n2024-03-12T12:05:00.000000,X1,+02:00\n';
		expect(parseTimelineCsv(text).rows[0]).toMatchObject({
			date: '2024-03-12T12:05:00.000000',
			tz: '+00:00'
		});
	});

	it('reads a file of the IRIS v2 timeline columns', () => {
		const text =
			'event_date,event_tz,event_title,event_category,event_content,event_raw,event_source,event_assets,event_iocs,event_tags\n' +
			'"2026-09-25T06:33:01.000","+00:00","Potential human-operated malicious activity","Unspecified","Related alert already triaged Merged/.","","IRIS alert 101145","dd;lpw03mrv3ch2","","alert-101145|precedent"\n';
		const { rows, errors } = parseTimelineCsv(text);
		expect(errors).toEqual([]);
		expect(rows[0]).toEqual({
			number: 1,
			title: 'Potential human-operated malicious activity',
			date: '2026-09-25T06:33:01.000',
			tz: '+00:00',
			tzGiven: true,
			description: 'Related alert already triaged Merged/.',
			tags: 'alert-101145,precedent',
			category: 'Unspecified',
			source: 'IRIS alert 101145',
			raw: ''
		});
		expect(normalizeEventDate(rows[0].date, rows[0].tz)).toEqual({
			date: '2026-09-25T06:33:01.000000',
			tz: '+00:00'
		});
	});

	it('keeps empty cells in their column', () => {
		const text = 'event_title,event_date(UTC),event_tz,event_tags\nXY,2024-03-12 14:05,,tag\n';
		expect(parseTimelineCsv(text).rows[0]).toMatchObject({
			tz: '+00:00',
			tzGiven: false,
			tags: 'tag'
		});
	});

	it('skips blank lines', () => {
		const text = 'Title,Date (UTC)\nA1,2024-03-12 14:05\n\n  \nB2,2024-03-12 15:05\n';
		expect(parseTimelineCsv(text).rows.map((r) => [r.number, r.title])).toEqual([
			[1, 'A1'],
			[2, 'B2']
		]);
	});

	it('refuses a file without a title or date column', () => {
		expect(parseTimelineCsv('Name,When\nx,y\n').errors).toHaveLength(2);
		expect(parseTimelineCsv('').errors).toHaveLength(2);
	});
});

function row(overrides: Partial<TimelineCsvRow>): TimelineCsvRow {
	return {
		number: 1,
		title: 'Event',
		date: '2024-03-12 14:05',
		tz: '+00:00',
		tzGiven: false,
		description: '',
		tags: '',
		category: '',
		source: '',
		raw: '',
		...overrides
	};
}

describe('timelineCsvDates', () => {
	it('dates the ISO-like rows without the server', async () => {
		const convert = vi.fn();
		const { dated, errors } = await timelineCsvDates(
			[row({ tz: '+0200', tzGiven: true })],
			convert
		);
		expect(errors).toEqual([]);
		expect(dated[0]).toMatchObject({ date: '2024-03-12T14:05:00.000000', tz: '+02:00' });
		expect(convert).not.toHaveBeenCalled();
	});

	it('asks the server for the other shapes', async () => {
		const convert = vi
			.fn()
			.mockResolvedValue({ date: '2024-03-12', time: '14:05:00.000', tz: '+00:00' });
		const { dated } = await timelineCsvDates(
			[
				row({ number: 1, date: '12/03/2024 14:05', tz: '+02:00', tzGiven: true }),
				row({ number: 2, date: '1710252300', tz: '+02:00', tzGiven: true }),
				row({ number: 3, date: '12/03/2024 14:05' })
			],
			convert
		);
		expect(dated.map((d) => [d.date, d.tz])).toEqual([
			// The timezone column applies to a date without its own…
			['2024-03-12T14:05:00.000', '+02:00'],
			// …not to a Unix timestamp
			['2024-03-12T14:05:00.000', '+00:00'],
			['2024-03-12T14:05:00.000', '+00:00']
		]);
	});

	it('tells why a row cannot be imported', async () => {
		const convert = vi.fn().mockResolvedValue(null);
		const { dated, errors } = await timelineCsvDates(
			[
				row({ number: 1, title: 'X' }),
				row({ number: 2, date: '' }),
				row({ number: 3, tz: 'Europe/Paris', tzGiven: true }),
				row({ number: 4, date: 'yesterday' })
			],
			convert
		);
		expect(dated).toEqual([]);
		expect(errors.map((e) => e.number)).toEqual([1, 2, 3, 4]);
		expect(errors[2].message).toContain('Europe/Paris');
		expect(errors[3].message).toContain('yesterday');
	});
});
