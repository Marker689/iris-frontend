/**
 * Turning on-screen grids into files and clipboard tables: one column
 * definition per exported field, CSV for downloads and tab-separated
 * text for the clipboard (it pastes as a table in spreadsheets, chat and
 * mail clients). The column choice of a grid is remembered per browser
 * so a quick copy reuses the columns of the last download.
 */

export interface ExportColumn<T> {
	key: string;
	header: string;
	getter: (row: T) => string;
	defaultSelected?: boolean;
}

/** Rows on screen (filters applied) or every row. */
export type ExportScope = 'visible' | 'all';

/** One CSV cell: quoted when it holds a separator, a quote or a line break. */
export const csvCell = (value: string | null | undefined): string => {
	if (value === null || value === undefined) return '';
	const text = String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One clipboard cell: tabs and line breaks would split it, flattened to spaces. */
export const tsvCell = (value: string | null | undefined): string =>
	value === null || value === undefined ? '' : String(value).replace(/[\t\r\n]+/g, ' ');

const toTable = <T>(
	rows: T[],
	columns: ExportColumn<T>[],
	cell: (value: string) => string,
	separator: string
): string => {
	if (columns.length === 0) return '';
	const lines = [columns.map((c) => cell(c.header)).join(separator)];
	for (const row of rows) lines.push(columns.map((c) => cell(c.getter(row))).join(separator));
	return lines.join('\n');
};

export const rowsToCsv = <T>(rows: T[], columns: ExportColumn<T>[]): string =>
	toTable(rows, columns, csvCell, ',');

export const rowsToTsv = <T>(rows: T[], columns: ExportColumn<T>[]): string =>
	toTable(rows, columns, tsvCell, '\t');

/** `columns` whose key is in `keys`, in the column order. */
export const pickColumns = <T>(
	columns: ExportColumn<T>[],
	keys: Iterable<string>
): ExportColumn<T>[] => {
	const wanted = new Set(keys);
	return columns.filter((c) => wanted.has(c.key));
};

/** Keys of the columns selected by default. */
export const defaultColumnKeys = <T>(columns: ExportColumn<T>[]): string[] =>
	columns.filter((c) => c.defaultSelected).map((c) => c.key);

const STORAGE_PREFIX = 'iris.export-columns.';

/**
 * The column keys last chosen for `grid`, limited to the ones still
 * offered; the default selection when none was saved (or none is left).
 */
export const loadColumnKeys = <T>(grid: string, columns: ExportColumn<T>[]): string[] => {
	try {
		const raw = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}${grid}`);
		const saved: unknown = raw ? JSON.parse(raw) : null;
		if (Array.isArray(saved)) {
			const offered = new Set(columns.map((c) => c.key));
			const keys = saved.filter((k): k is string => typeof k === 'string' && offered.has(k));
			if (keys.length > 0) return keys;
		}
	} catch {
		// Unreadable or blocked storage: fall back to the defaults.
	}
	return defaultColumnKeys(columns);
};

export const saveColumnKeys = (grid: string, keys: Iterable<string>): void => {
	try {
		globalThis.localStorage?.setItem(`${STORAGE_PREFIX}${grid}`, JSON.stringify([...keys]));
	} catch {
		// Not remembered, the export itself is unaffected.
	}
};

/** "case-12-iocs-2026-10-22.csv": the name plus today's date, filesystem-safe. */
export const exportFilename = (name: string, extension = 'csv', now = new Date()): string => {
	const safe = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${safe || 'export'}-${now.toISOString().slice(0, 10)}.${extension}`;
};

export const downloadText = (text: string, filename: string, type = 'text/csv;charset=utf-8') => {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
};

/** Resolves false when the browser refuses the clipboard (no permission, insecure origin). */
export const copyText = async (text: string): Promise<boolean> => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
};
