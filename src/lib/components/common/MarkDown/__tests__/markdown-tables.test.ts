import { describe, expect, it } from 'vitest';
import { applyTableOp, blankTable, splitTableRow, tableColumnAt } from '../markdown-tables';

const TABLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'];

describe('splitTableRow', () => {
	it('splits a piped row into trimmed cells', () => {
		expect(splitTableRow('|  a | b  |')).toEqual(['a', 'b']);
	});

	it('splits a row without outer pipes', () => {
		expect(splitTableRow('a | b')).toEqual(['a', 'b']);
	});

	it('keeps empty cells', () => {
		expect(splitTableRow('| a |  | c |')).toEqual(['a', '', 'c']);
		expect(splitTableRow('| a | |')).toEqual(['a', '']);
	});

	it('does not split on an escaped pipe', () => {
		expect(splitTableRow('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
	});

	it('does not split on a pipe inside backticks', () => {
		expect(splitTableRow('| `a|b` | c |')).toEqual(['`a|b`', 'c']);
	});

	it('keeps the delimiter cells with their colons', () => {
		expect(splitTableRow('| :--- | :---: | ---: |')).toEqual([':---', ':---:', '---:']);
	});

	it('returns one empty cell for an empty row', () => {
		expect(splitTableRow('')).toEqual(['']);
	});
});

describe('tableColumnAt', () => {
	const line = '| a | b | c |';

	it('is 0 on the opening pipe and in the first cell', () => {
		expect(tableColumnAt(line, 0)).toBe(0);
		expect(tableColumnAt(line, 2)).toBe(0);
	});

	it('counts the pipes before the caret', () => {
		expect(tableColumnAt(line, 6)).toBe(1);
		expect(tableColumnAt(line, 10)).toBe(2);
	});

	it('works without outer pipes', () => {
		expect(tableColumnAt('a | b', 0)).toBe(0);
		expect(tableColumnAt('a | b', 4)).toBe(1);
	});

	it('handles indentation before the opening pipe', () => {
		expect(tableColumnAt('  | a | b |', 1)).toBe(0);
		expect(tableColumnAt('  | a | b |', 8)).toBe(1);
	});

	it('ignores escaped pipes and pipes in code', () => {
		expect(tableColumnAt('| a \\| b | c |', 11)).toBe(1);
		expect(tableColumnAt('| `a|b` | c |', 11)).toBe(1);
	});
});

describe('applyTableOp', () => {
	it('adds a row after a body row', () => {
		expect(applyTableOp(TABLE, 2, 0, 'addRowAfter')).toEqual([
			'| A | B |',
			'| --- | --- |',
			'| 1 | 2 |',
			'|  |  |',
			'| 3 | 4 |'
		]);
	});

	it('adds a row on the header as the first body row', () => {
		const expected = ['| A | B |', '| --- | --- |', '|  |  |', '| 1 | 2 |', '| 3 | 4 |'];
		expect(applyTableOp(TABLE, 0, 0, 'addRowAfter')).toEqual(expected);
		expect(applyTableOp(TABLE, 1, 0, 'addRowAfter')).toEqual(expected);
	});

	it('deletes a body row', () => {
		expect(applyTableOp(TABLE, 3, 1, 'deleteRow')).toEqual([
			'| A | B |',
			'| --- | --- |',
			'| 1 | 2 |'
		]);
	});

	it('refuses to delete the header or delimiter row', () => {
		expect(applyTableOp(TABLE, 0, 0, 'deleteRow')).toBeNull();
		expect(applyTableOp(TABLE, 1, 0, 'deleteRow')).toBeNull();
	});

	it('adds a column after the caret column', () => {
		expect(applyTableOp(TABLE, 2, 0, 'addColumnAfter')).toEqual([
			'| A |  | B |',
			'| --- | --- | --- |',
			'| 1 |  | 2 |',
			'| 3 |  | 4 |'
		]);
	});

	it('deletes the caret column', () => {
		expect(applyTableOp(TABLE, 2, 0, 'deleteColumn')).toEqual([
			'| B |',
			'| --- |',
			'| 2 |',
			'| 4 |'
		]);
	});

	it('removes the table when its last column is deleted', () => {
		expect(applyTableOp(['| A |', '| --- |', '| 1 |'], 2, 0, 'deleteColumn')).toEqual([]);
	});

	it('clamps an out-of-range column', () => {
		expect(applyTableOp(TABLE, 2, 9, 'deleteColumn')).toEqual([
			'| A |',
			'| --- |',
			'| 1 |',
			'| 3 |'
		]);
		expect(applyTableOp(TABLE, 2, -3, 'deleteColumn')).toEqual([
			'| B |',
			'| --- |',
			'| 2 |',
			'| 4 |'
		]);
	});

	it('keeps the alignment colons of the delimiter row', () => {
		const table = ['| A | B | C |', '|:--|:-:|--:|', '| 1 | 2 | 3 |'];
		expect(applyTableOp(table, 2, 1, 'deleteColumn')).toEqual([
			'| A | C |',
			'| :-- | --: |',
			'| 1 | 3 |'
		]);
	});

	it('rewrites unaligned rows in the canonical form', () => {
		expect(applyTableOp(['A|B', '-|-', '1|2'], 2, 0, 'addRowAfter')).toEqual([
			'| A | B |',
			'| - | - |',
			'| 1 | 2 |',
			'|  |  |'
		]);
	});

	it('pads short rows, with --- in the delimiter row', () => {
		expect(applyTableOp(['| A | B | C |', '| --- |', '| 1 |'], 2, 0, 'addRowAfter')).toEqual([
			'| A | B | C |',
			'| --- | --- | --- |',
			'| 1 |  |  |',
			'|  |  |  |'
		]);
	});

	it('does not split escaped pipes or pipes in code', () => {
		const table = ['| A | B |', '| --- | --- |', '| a \\| b | `x|y` |'];
		expect(applyTableOp(table, 2, 0, 'addColumnAfter')).toEqual([
			'| A |  | B |',
			'| --- | --- | --- |',
			'| a \\| b |  | `x|y` |'
		]);
	});

	it('does not mutate its input', () => {
		const copy = [...TABLE];
		applyTableOp(TABLE, 2, 0, 'addColumnAfter');
		expect(TABLE).toEqual(copy);
	});
});

describe('blankTable', () => {
	it('builds a 3x2 table by default', () => {
		expect(blankTable()).toEqual([
			'| Column 1 | Column 2 | Column 3 |',
			'| --- | --- | --- |',
			'|  |  |  |',
			'|  |  |  |'
		]);
	});

	it('takes the column and body row counts', () => {
		expect(blankTable(1, 0)).toEqual(['| Column 1 |', '| --- |']);
		expect(blankTable(2, 3)).toHaveLength(5);
	});

	it('round-trips through splitTableRow', () => {
		expect(blankTable(2, 1).map(splitTableRow)).toEqual([
			['Column 1', 'Column 2'],
			['---', '---'],
			['', '']
		]);
	});
});
