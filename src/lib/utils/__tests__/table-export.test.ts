import { afterEach, describe, expect, it } from 'vitest';
import {
	csvCell,
	defaultColumnKeys,
	exportFilename,
	loadColumnKeys,
	pickColumns,
	rowsToCsv,
	rowsToTsv,
	saveColumnKeys,
	tsvCell,
	type ExportColumn
} from '../table-export';

type Row = { name: string; note: string | null };

const COLUMNS: ExportColumn<Row>[] = [
	{ key: 'name', header: 'Name', getter: (r) => r.name, defaultSelected: true },
	{ key: 'note', header: 'Note', getter: (r) => r.note ?? '' }
];

describe('csvCell() / tsvCell()', () => {
	it('quotes CSV cells holding a separator, a quote or a line break', () => {
		expect(csvCell('plain')).toBe('plain');
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
		expect(csvCell(null)).toBe('');
	});

	it('flattens tabs and line breaks in clipboard cells', () => {
		expect(tsvCell('a\tb\r\nc')).toBe('a b c');
		expect(tsvCell(undefined)).toBe('');
	});
});

describe('rowsToCsv() / rowsToTsv()', () => {
	const rows: Row[] = [
		{ name: 'host-1', note: 'x, y' },
		{ name: 'host-2', note: null }
	];

	it('writes a header line then one line per row', () => {
		expect(rowsToCsv(rows, COLUMNS)).toBe('Name,Note\nhost-1,"x, y"\nhost-2,');
		expect(rowsToTsv(rows, COLUMNS)).toBe('Name\tNote\nhost-1\tx, y\nhost-2\t');
	});

	it('is empty without any column', () => {
		expect(rowsToCsv(rows, [])).toBe('');
	});
});

describe('pickColumns() / defaultColumnKeys()', () => {
	it('keeps the column order, not the key order', () => {
		expect(pickColumns(COLUMNS, ['note', 'name']).map((c) => c.key)).toEqual(['name', 'note']);
	});

	it('lists the default selection', () => {
		expect(defaultColumnKeys(COLUMNS)).toEqual(['name']);
	});
});

describe('loadColumnKeys() / saveColumnKeys()', () => {
	afterEach(() => localStorage.clear());

	it('falls back to the defaults when nothing was saved', () => {
		expect(loadColumnKeys('grid', COLUMNS)).toEqual(['name']);
	});

	it('restores the saved keys still offered', () => {
		saveColumnKeys('grid', new Set(['note', 'gone']));
		expect(loadColumnKeys('grid', COLUMNS)).toEqual(['note']);
	});

	it('falls back to the defaults when no saved key is left or the value is unreadable', () => {
		saveColumnKeys('grid', ['gone']);
		expect(loadColumnKeys('grid', COLUMNS)).toEqual(['name']);
		localStorage.setItem('iris.export-columns.grid', '{not json');
		expect(loadColumnKeys('grid', COLUMNS)).toEqual(['name']);
	});
});

describe('exportFilename()', () => {
	it('slugs the name and appends the date', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		expect(exportFilename('War room 3 / IOCs', 'csv', now)).toBe('war-room-3-iocs-2026-10-22.csv');
		expect(exportFilename('***', 'csv', now)).toBe('export-2026-10-22.csv');
	});
});
