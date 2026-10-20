import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { forceParsing } from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	activeFormats,
	deleteTable,
	insertAtCaret,
	insertTable,
	NO_ACTIVE_FORMATS,
	runTableOp,
	toggleCodeBlock,
	toggleHeading,
	toggleInlineMark,
	toggleLinePrefix,
	toggleLink
} from '../markdown-commands';
import { blankTable } from '../markdown-tables';

const views: EditorView[] = [];

const makeView = (
	doc: string,
	anchor = 0,
	head = anchor,
	extensions: Extension[] = []
): EditorView => {
	const view = new EditorView({
		state: EditorState.create({
			doc,
			selection: EditorSelection.single(anchor, head),
			extensions: [markdown({ base: markdownLanguage }), extensions]
		}),
		parent: document.body
	});
	forceParsing(view, view.state.doc.length, 1000);
	views.push(view);
	return view;
};

/** A view with the caret where `^` is in `marked` (one `^`), or the selection between two. */
const viewAt = (marked: string): EditorView => {
	const first = marked.indexOf('^');
	const second = marked.indexOf('^', first + 1);
	if (second < 0) return makeView(marked.slice(0, first) + marked.slice(first + 1), first);
	const doc = marked.slice(0, first) + marked.slice(first + 1, second) + marked.slice(second + 1);
	return makeView(doc, first, second - 1);
};

const text = (view: EditorView) => view.state.doc.toString();
const selection = (view: EditorView) => {
	const { from, to } = view.state.selection.main;
	return [from, to];
};
const reparse = (view: EditorView) => forceParsing(view, view.state.doc.length, 1000);

afterEach(() => {
	while (views.length) views.pop()?.destroy();
	document.body.replaceChildren();
});

describe('toggleInlineMark', () => {
	it('wraps the selection and keeps it selected', () => {
		const view = makeView('hello world', 6, 11);
		expect(toggleInlineMark(view, '**')).toBe(true);
		expect(text(view)).toBe('hello **world**');
		expect(selection(view)).toEqual([8, 13]);
	});

	it('inserts a pair of markers at an empty caret, the caret between them', () => {
		const view = makeView('ab', 1);
		toggleInlineMark(view, '*');
		expect(text(view)).toBe('a**b');
		expect(selection(view)).toEqual([2, 2]);
	});

	it('leaves the whitespace around the selection outside the markers', () => {
		const view = makeView('a  word  b', 1, 9);
		toggleInlineMark(view, '~~');
		expect(text(view)).toBe('a  ~~word~~  b');
	});

	it('unwraps bold around the caret', () => {
		const view = makeView('a **bold** b', 5);
		toggleInlineMark(view, '**');
		expect(text(view)).toBe('a bold b');
		expect(selection(view)).toEqual([3, 3]);
	});

	it('unwraps bold when the selection is its text', () => {
		const view = makeView('**bold**', 2, 6);
		toggleInlineMark(view, '**');
		expect(text(view)).toBe('bold');
		expect(selection(view)).toEqual([0, 4]);
	});

	it('unwraps bold when the selection is the whole construct', () => {
		const view = makeView('x **bold** y', 2, 10);
		toggleInlineMark(view, '**');
		expect(text(view)).toBe('x bold y');
	});

	it('unwraps italic, strikethrough and inline code', () => {
		const italic = makeView('*it*', 2);
		toggleInlineMark(italic, '*');
		expect(text(italic)).toBe('it');

		const strike = makeView('~~gone~~', 4);
		toggleInlineMark(strike, '~~');
		expect(text(strike)).toBe('gone');

		const code = makeView('`code`', 3);
		toggleInlineMark(code, '`');
		expect(text(code)).toBe('code');
	});

	it('wraps a selection reaching past the formatted run instead of unwrapping', () => {
		const view = makeView('**a** bc', 2, 8);
		toggleInlineMark(view, '**');
		expect(text(view)).toBe('****a** bc**');
	});

	it('handles every range of a multi-selection', () => {
		const view = makeView('one two', 0, 0, [EditorState.allowMultipleSelections.of(true)]);
		view.dispatch({
			selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)])
		});
		toggleInlineMark(view, '`');
		expect(text(view)).toBe('`one` `two`');
	});
});

describe('toggleHeading', () => {
	it('makes a plain line a heading', () => {
		const view = makeView('Title', 2);
		toggleHeading(view, 2);
		expect(text(view)).toBe('## Title');
	});

	it('removes the heading when it is already that level', () => {
		const view = makeView('## Title', 4);
		toggleHeading(view, 2);
		expect(text(view)).toBe('Title');
	});

	it('changes the level of a heading', () => {
		const view = makeView('## Title', 4);
		toggleHeading(view, 3);
		expect(text(view)).toBe('### Title');
	});

	it('keeps indentation and collapses extra spaces after the marks', () => {
		const view = makeView('  #   Title', 8);
		toggleHeading(view, 1);
		expect(text(view)).toBe('  Title');
	});

	it('does not take a hashtag for a heading', () => {
		const view = makeView('#tag', 1);
		toggleHeading(view, 1);
		expect(text(view)).toBe('# #tag');
	});

	it('applies to every selected line', () => {
		const view = makeView('a\n## b\nc', 0, 8);
		toggleHeading(view, 2);
		expect(text(view)).toBe('## a\nb\n## c');
	});
});

describe('toggleLinePrefix', () => {
	it('bullets the selected lines and takes the bullets away again', () => {
		const view = makeView('a\nb', 0, 3);
		toggleLinePrefix(view, 'bullet');
		expect(text(view)).toBe('- a\n- b');
		view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
		toggleLinePrefix(view, 'bullet');
		expect(text(view)).toBe('a\nb');
	});

	it('numbers the selected lines in order', () => {
		const view = makeView('a\nb\nc', 0, 5);
		toggleLinePrefix(view, 'ordered');
		expect(text(view)).toBe('1. a\n2. b\n3. c');
	});

	it('turns bullets into numbers and back, in place', () => {
		const view = makeView('- a\n- b', 0, 7);
		toggleLinePrefix(view, 'ordered');
		expect(text(view)).toBe('1. a\n2. b');
		view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
		toggleLinePrefix(view, 'bullet');
		expect(text(view)).toBe('- a\n- b');
	});

	it('only adds the prefix to lines missing it when the selection is mixed', () => {
		const view = makeView('- a\nb', 0, 5);
		toggleLinePrefix(view, 'bullet');
		expect(text(view)).toBe('- a\n- b');
	});

	it('skips blank lines of a multi-line selection', () => {
		const view = makeView('a\n\nb', 0, 4);
		toggleLinePrefix(view, 'ordered');
		expect(text(view)).toBe('1. a\n\n2. b');
	});

	it('prefixes an empty line on its own', () => {
		const view = makeView('', 0);
		expect(toggleLinePrefix(view, 'bullet')).toBe(true);
		expect(text(view)).toBe('- ');
	});

	it('keeps the indentation of a list item', () => {
		const view = makeView('  a', 3);
		toggleLinePrefix(view, 'bullet');
		expect(text(view)).toBe('  - a');
	});

	it('quotes and unquotes', () => {
		const view = makeView('a', 0);
		toggleLinePrefix(view, 'quote');
		expect(text(view)).toBe('> a');
		toggleLinePrefix(view, 'quote');
		expect(text(view)).toBe('a');
	});
});

describe('toggleCodeBlock', () => {
	it('opens an empty block on an empty line, the caret inside', () => {
		const view = makeView('', 0);
		toggleCodeBlock(view);
		expect(text(view)).toBe('```\n\n```');
		expect(selection(view)).toEqual([4, 4]);
	});

	it('fences the selected lines', () => {
		const view = makeView('a\nb', 0, 3);
		toggleCodeBlock(view);
		expect(text(view)).toBe('```\na\nb\n```');
	});

	it('fences the caret line', () => {
		const view = makeView('x\nabc\ny', 3);
		toggleCodeBlock(view);
		expect(text(view)).toBe('x\n```\nabc\n```\ny');
	});

	it('removes both fences of the block around the caret', () => {
		const view = makeView('```\ncode\n```', 5);
		toggleCodeBlock(view);
		expect(text(view)).toBe('code');
	});

	it('removes the info string with the opening fence and keeps what follows', () => {
		const view = makeView('before\n```js\ncode\n```\nafter', 14);
		toggleCodeBlock(view);
		expect(text(view)).toBe('before\ncode\nafter');
	});

	it('removes the opening fence of an unclosed block', () => {
		const view = makeView('```\ncode', 6);
		toggleCodeBlock(view);
		expect(text(view)).toBe('code');
	});

	it('round-trips', () => {
		const view = makeView('a\nb', 0, 3);
		toggleCodeBlock(view);
		reparse(view);
		view.dispatch({ selection: { anchor: 5 } });
		toggleCodeBlock(view);
		expect(text(view)).toBe('a\nb');
	});
});

describe('toggleLink', () => {
	it('links the selection and selects its text', () => {
		const view = makeView('see docs', 4, 8);
		expect(toggleLink(view, () => 'https://x.test')).toBe(true);
		expect(text(view)).toBe('see [docs](https://x.test)');
		expect(selection(view)).toEqual([5, 9]);
	});

	it('uses the URL as the text of an empty selection', () => {
		const view = makeView('', 0);
		toggleLink(view, () => ' https://x.test ');
		expect(text(view)).toBe('[https://x.test](https://x.test)');
	});

	it('wraps a URL with spaces or parentheses in angle brackets', () => {
		const view = makeView('doc', 0, 3);
		toggleLink(view, () => 'https://x.test/a b(c)');
		expect(text(view)).toBe('[doc](<https://x.test/a b(c)>)');
	});

	it('does nothing when no URL is given', () => {
		const cancelled = makeView('doc', 0, 3);
		expect(toggleLink(cancelled, () => null)).toBe(false);
		expect(text(cancelled)).toBe('doc');

		const blank = makeView('doc', 0, 3);
		expect(toggleLink(blank, () => '   ')).toBe(false);
		expect(text(blank)).toBe('doc');
	});

	it('unlinks the link around the caret without asking for a URL', () => {
		const askUrl = vi.fn(() => 'https://other.test');
		const view = makeView('a [docs](https://x.test) b', 4);
		expect(toggleLink(view, askUrl)).toBe(true);
		expect(text(view)).toBe('a docs b');
		expect(selection(view)).toEqual([2, 6]);
		expect(askUrl).not.toHaveBeenCalled();
	});
});

describe('insertAtCaret', () => {
	it('inserts at the caret and moves past the text', () => {
		const view = makeView('ac', 1);
		insertAtCaret(view, 'b');
		expect(text(view)).toBe('abc');
		expect(selection(view)).toEqual([2, 2]);
	});

	it('replaces the selection', () => {
		const view = makeView('a xyz c', 2, 5);
		insertAtCaret(view, 'b');
		expect(text(view)).toBe('a b c');
		expect(selection(view)).toEqual([3, 3]);
	});
});

describe('insertTable', () => {
	const table = blankTable().join('\n');

	it('fills an empty document, the caret in the first header cell', () => {
		const view = makeView('', 0);
		insertTable(view);
		expect(text(view)).toBe(table);
		expect(selection(view)).toEqual([2, 2]);
		expect(view.state.doc.sliceString(2, 10)).toBe('Column 1');
	});

	it('goes after a non-blank line, separated by a blank line', () => {
		const view = makeView('text', 2);
		insertTable(view);
		expect(text(view)).toBe(`text\n\n${table}`);
		expect(selection(view)).toEqual([8, 8]);
	});

	it('keeps a blank line before the text that follows', () => {
		const view = makeView('a\nb', 0);
		insertTable(view);
		expect(text(view)).toBe(`a\n\n${table}\n\nb`);
	});

	it('takes the place of a blank line', () => {
		const view = makeView('a\n\nb', 2);
		insertTable(view);
		expect(text(view)).toBe(`a\n${table}\n\nb`);
		expect(selection(view)).toEqual([4, 4]);
	});

	it('is parsed as a table', () => {
		const view = makeView('', 0);
		insertTable(view);
		reparse(view);
		expect(activeFormats(view.state).table).toBe(true);
	});
});

describe('runTableOp', () => {
	const TABLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
	// Offset of the `1` cell.
	const ROW_1 = TABLE.indexOf('1 |');

	it('adds a row after the caret row and moves the caret into it', () => {
		const view = makeView(`${TABLE}\n\nafter`, ROW_1);
		expect(runTableOp(view, 'addRowAfter')).toBe(true);
		expect(text(view)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |\n| 3 | 4 |\n\nafter');
		const caret = view.state.selection.main.head;
		const line = view.state.doc.lineAt(caret);
		expect(line.number).toBe(4);
		expect(caret - line.from).toBe(2);
	});

	it('deletes the caret row', () => {
		const view = makeView(TABLE, ROW_1);
		runTableOp(view, 'deleteRow');
		expect(text(view)).toBe('| A | B |\n| --- | --- |\n| 3 | 4 |');
	});

	it('refuses to delete the header row', () => {
		const view = makeView(TABLE, 2);
		expect(runTableOp(view, 'deleteRow')).toBe(false);
		expect(text(view)).toBe(TABLE);
	});

	it('adds and deletes a column at the caret column', () => {
		const view = makeView(TABLE, TABLE.indexOf('2 |'));
		runTableOp(view, 'addColumnAfter');
		expect(text(view)).toBe('| A | B |  |\n| --- | --- | --- |\n| 1 | 2 |  |\n| 3 | 4 |  |');

		const other = makeView(TABLE, ROW_1);
		runTableOp(other, 'deleteColumn');
		expect(text(other)).toBe('| B |\n| --- |\n| 2 |\n| 4 |');
	});

	it('deletes the table with its last column', () => {
		const view = makeView('| A |\n| --- |\n| 1 |\n\nafter', 2);
		expect(runTableOp(view, 'deleteColumn')).toBe(true);
		expect(text(view)).toBe('\nafter');
	});

	it('normalises the table it rewrites', () => {
		const view = makeView('|A|B|\n|-|-|\n|1|2|', 13);
		runTableOp(view, 'addRowAfter');
		expect(text(view)).toBe('| A | B |\n| - | - |\n| 1 | 2 |\n|  |  |');
	});

	it('does nothing outside a table', () => {
		const view = makeView(`para\n\n${TABLE}`, 1);
		expect(runTableOp(view, 'addRowAfter')).toBe(false);
		expect(text(view)).toBe(`para\n\n${TABLE}`);
	});
});

describe('deleteTable', () => {
	const TABLE = '| A |\n| --- |\n| 1 |';

	it('removes the table and the line break that ends it', () => {
		const view = makeView(`before\n\n${TABLE}\n\nafter`, 12);
		expect(deleteTable(view)).toBe(true);
		expect(text(view)).toBe('before\n\n\nafter');
	});

	it('removes a table that ends the document', () => {
		const view = makeView(`before\n\n${TABLE}`, 12);
		deleteTable(view);
		expect(text(view)).toBe('before\n\n');
	});

	it('does nothing outside a table', () => {
		const view = makeView(`before\n\n${TABLE}`, 1);
		expect(deleteTable(view)).toBe(false);
	});
});

describe('activeFormats', () => {
	const formatsAt = (marked: string) => activeFormats(viewAt(marked).state);

	it('reports nothing on a plain line', () => {
		expect(formatsAt('pl^ain')).toEqual(NO_ACTIVE_FORMATS);
	});

	it('reports inline formats around the caret', () => {
		expect(formatsAt('**b^old**').bold).toBe(true);
		expect(formatsAt('*it^alic*').italic).toBe(true);
		expect(formatsAt('~~str^ike~~').strike).toBe(true);
		expect(formatsAt('[li^nk](https://x.test)').link).toBe(true);
		expect(formatsAt('**b** pl^ain').bold).toBe(false);
	});

	it('reports nested inline formats', () => {
		const formats = formatsAt('**bold *bo^th* x**');
		expect(formats.bold).toBe(true);
		expect(formats.italic).toBe(true);
	});

	it('reports the heading level', () => {
		expect(formatsAt('### Ti^tle').heading).toBe(3);
		expect(formatsAt('#ta^g').heading).toBe(0);
	});

	it('reports lists and quotes', () => {
		expect(formatsAt('- it^em').bulletList).toBe(true);
		expect(formatsAt('1. it^em').orderedList).toBe(true);
		expect(formatsAt('> quo^te').blockquote).toBe(true);
	});

	it('reports a code block and nothing that only looks like markup in it', () => {
		const formats = formatsAt('```\n# not^ a heading\n- nor a list\n```');
		expect(formats.codeBlock).toBe(true);
		expect(formats.heading).toBe(0);
		expect(formatsAt('```\n- no^t a list\n```').bulletList).toBe(false);
	});

	it('reports a table', () => {
		expect(formatsAt('| A |\n| --- |\n| ^1 |').table).toBe(true);
	});
});
