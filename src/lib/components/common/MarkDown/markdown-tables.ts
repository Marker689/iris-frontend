/**
 * Row / column operations on a GFM pipe table, as text. The editor
 * finds the table around the caret and replaces its text with the
 * result; everything here is pure so it can be tested without a view.
 *
 * A table is rewritten in the canonical `| a | b |` form: cells are
 * trimmed and the delimiter row keeps its alignment colons.
 */

export type TableOp = 'addRowAfter' | 'deleteRow' | 'addColumnAfter' | 'deleteColumn';

const DELIMITER_CELL_RE = /^:?-+:?$/;

/** Cells of one row, split on the pipes that are neither escaped nor in code. */
export const splitTableRow = (line: string): string[] => {
	let text = line.trim();
	if (text.startsWith('|')) text = text.slice(1);
	const cells: string[] = [];
	let current = '';
	let inCode = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\\' && i + 1 < text.length) {
			current += ch + text[i + 1];
			i++;
			continue;
		}
		if (ch === '`') inCode = !inCode;
		if (ch === '|' && !inCode) {
			cells.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	// A trailing pipe closes the last cell rather than opening an empty one.
	if (current.trim() !== '' || cells.length === 0) cells.push(current.trim());
	return cells;
};

/** Index of the cell `column` (a character offset in `line`) falls in. */
export const tableColumnAt = (line: string, column: number): number => {
	const leading = line.length - line.trimStart().length;
	let pipes = 0;
	let inCode = false;
	for (let i = 0; i < Math.min(column, line.length); i++) {
		const ch = line[i];
		if (ch === '\\') {
			i++;
			continue;
		}
		if (ch === '`') inCode = !inCode;
		if (ch === '|' && !inCode) pipes++;
	}
	const opensWithPipe = line.trimStart().startsWith('|') && column > leading;
	return Math.max(0, pipes - (opensWithPipe ? 1 : 0));
};

const formatRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;

const isDelimiterRow = (cells: string[]): boolean =>
	cells.length > 0 && cells.every((cell) => DELIMITER_CELL_RE.test(cell.replace(/\s/g, '')));

/**
 * Apply `op` to the table `lines` with the caret on line `row`, in cell
 * `column`. Returns the new lines, `[]` when the table goes away, or
 * `null` when the operation does not apply (deleting the header row).
 */
export const applyTableOp = (
	lines: string[],
	row: number,
	column: number,
	op: TableOp
): string[] | null => {
	const rows = lines.map(splitTableRow);
	const width = Math.max(...rows.map((cells) => cells.length));
	const delimiterIndex = rows.findIndex(isDelimiterRow);
	rows.forEach((cells, i) => {
		while (cells.length < width) cells.push(i === delimiterIndex ? '---' : '');
	});
	const col = Math.min(Math.max(column, 0), width - 1);

	switch (op) {
		case 'addRowAfter': {
			// The header and the delimiter row stay together: a row added on
			// the header goes first in the body.
			const at = row <= delimiterIndex ? delimiterIndex + 1 : row + 1;
			rows.splice(at, 0, new Array(width).fill(''));
			break;
		}
		case 'deleteRow': {
			if (row <= delimiterIndex) return null;
			rows.splice(row, 1);
			break;
		}
		case 'addColumnAfter': {
			rows.forEach((cells, i) => cells.splice(col + 1, 0, i === delimiterIndex ? '---' : ''));
			break;
		}
		case 'deleteColumn': {
			if (width <= 1) return [];
			rows.forEach((cells) => cells.splice(col, 1));
			break;
		}
	}
	return rows.map(formatRow);
};

/** A blank table, header and two body rows. */
export const blankTable = (columns = 3, bodyRows = 2): string[] => {
	const header = Array.from({ length: columns }, (_, i) => `Column ${i + 1}`);
	return [
		formatRow(header),
		formatRow(new Array(columns).fill('---')),
		...Array.from({ length: bodyRows }, () => formatRow(new Array(columns).fill('')))
	];
};
