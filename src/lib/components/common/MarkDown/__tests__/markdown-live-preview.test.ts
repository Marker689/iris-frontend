import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, forceParsing } from '@codemirror/language';
import { EditorSelection, EditorState, type RangeSet, type RangeValue } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	enclosingNode,
	isInCode,
	isOpenableUrl,
	markdownLivePreview
} from '../markdown-live-preview';

const CHIP = '<span data-mention data-kind="user" data-id="1" data-label="Bob">@Bob</span>';

const parsed = (doc: string): EditorState => {
	const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
	ensureSyntaxTree(state, state.doc.length, 1000);
	return state;
};

const views: EditorView[] = [];

const makeView = (doc: string, anchor = 0): EditorView => {
	const view = new EditorView({
		state: EditorState.create({
			doc,
			selection: EditorSelection.cursor(anchor),
			extensions: [markdown({ base: markdownLanguage }), markdownLivePreview()]
		}),
		parent: document.body
	});
	forceParsing(view, view.state.doc.length, 1000);
	views.push(view);
	return view;
};

const focus = async (view: EditorView) => {
	view.focus();
	await vi.waitFor(() => expect(view.hasFocus).toBe(true));
};

/** The rendered text of line `n` (1-based). */
const lineText = (view: EditorView, n: number): string =>
	view.contentDOM.querySelectorAll('.cm-line')[n - 1]?.textContent ?? '';

const lineClasses = (view: EditorView): string[] =>
	[...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.className);

const atomicRanges = (view: EditorView): Array<[number, number]> => {
	const found: Array<[number, number]> = [];
	for (const source of view.state.facet(EditorView.atomicRanges)) {
		const set: RangeSet<RangeValue> = source(view);
		for (let it = set.iter(); it.value; it.next()) found.push([it.from, it.to]);
	}
	return found;
};

afterEach(() => {
	while (views.length) views.pop()?.destroy();
	document.body.replaceChildren();
});

describe('isInCode', () => {
	it('is true inside an inline code span, not on its edges', () => {
		const state = parsed('a `x` b');
		expect(isInCode(state, 3)).toBe(true);
		expect(isInCode(state, 2)).toBe(false);
		expect(isInCode(state, 5)).toBe(false);
		expect(isInCode(state, 0)).toBe(false);
	});

	it('is true inside a fenced block, including on its fences', () => {
		const doc = '```\ncode\n```\nafter';
		const state = parsed(doc);
		expect(isInCode(state, 1)).toBe(true);
		expect(isInCode(state, 6)).toBe(true);
		expect(isInCode(state, doc.indexOf('after') + 1)).toBe(false);
	});

	it('is true inside an unclosed fenced block up to the end of the document', () => {
		const state = parsed('```\n@b');
		expect(isInCode(state, 4)).toBe(true);
		expect(isInCode(state, 5)).toBe(true);
	});

	it('is true inside an indented code block', () => {
		const state = parsed('para\n\n    code here');
		expect(isInCode(state, 13)).toBe(true);
	});

	it('is true at the first character of an indented code block', () => {
		const state = parsed('para\n\n    @bo');
		expect(isInCode(state, 10)).toBe(true);
	});

	it('is false in plain text and other constructs', () => {
		const state = parsed('# Title\n\n**bold** [l](u)');
		for (let pos = 0; pos <= state.doc.length; pos++) expect(isInCode(state, pos)).toBe(false);
	});
});

describe('enclosingNode', () => {
	it('finds the innermost node of that name', () => {
		const state = parsed('a **bold** b');
		const node = enclosingNode(state, 5, 'StrongEmphasis');
		expect(node?.name).toBe('StrongEmphasis');
		expect([node?.from, node?.to]).toEqual([2, 10]);
	});

	it('finds it from either edge', () => {
		const state = parsed('a **bold** b');
		expect(enclosingNode(state, 2, 'StrongEmphasis')?.from).toBe(2);
		expect(enclosingNode(state, 10, 'StrongEmphasis')?.to).toBe(10);
	});

	it('walks up to an ancestor', () => {
		const state = parsed('> **bold**');
		const node = enclosingNode(state, 5, 'Blockquote');
		expect([node?.from, node?.to]).toEqual([0, 10]);
	});

	it('is null when there is no such node around', () => {
		const state = parsed('a **bold** b');
		expect(enclosingNode(state, 0, 'StrongEmphasis')).toBeNull();
		expect(enclosingNode(state, 5, 'Link')).toBeNull();
	});
});

describe('markdownLivePreview — mention chips', () => {
	it('draws a chip in place of its markup', () => {
		const doc = `hello ${CHIP} there`;
		const view = makeView(doc);
		const chip = view.contentDOM.querySelector('.mention-chip');
		expect(chip).not.toBeNull();
		expect(chip?.getAttribute('data-kind')).toBe('user');
		expect(chip?.getAttribute('data-id')).toBe('1');
		expect(chip?.getAttribute('data-label')).toBe('Bob');
		expect(chip?.hasAttribute('tabindex')).toBe(false);
		expect(lineText(view, 1)).toBe('hello Bob there');
		// Only the drawing changes.
		expect(view.state.doc.toString()).toBe(doc);
	});

	it('keeps drawing the chip with the caret on it while focused', async () => {
		const view = makeView(`a ${CHIP} b`, 3);
		await focus(view);
		expect(view.contentDOM.querySelector('.mention-chip')).not.toBeNull();
	});

	it('makes the chip atomic', () => {
		const doc = `a ${CHIP} b`;
		const view = makeView(doc);
		expect(atomicRanges(view)).toEqual([[2, 2 + CHIP.length]]);
	});

	it('leaves the markup as text inside a fenced block', () => {
		const view = makeView(`\`\`\`\n${CHIP}\n\`\`\``);
		expect(view.contentDOM.querySelector('.mention-chip')).toBeNull();
		expect(lineText(view, 2)).toBe(CHIP);
		expect(atomicRanges(view)).toEqual([]);
	});

	it('leaves the markup as text inside inline code', () => {
		const view = makeView(`a \`${CHIP}\` b`);
		expect(view.contentDOM.querySelector('.mention-chip')).toBeNull();
		expect(lineText(view, 1)).toContain(CHIP);
	});

	it('leaves the markup as text inside an indented code block', () => {
		const view = makeView(`para\n\n    ${CHIP}`);
		expect(view.contentDOM.querySelector('.mention-chip')).toBeNull();
	});

	it('draws a chip whose label looks like markup as one chip', () => {
		const chip = '<span data-mention data-kind="user" data-id="2" data-label="**x**">@**x**</span>';
		const view = makeView(`a ${chip} b`);
		const chips = view.contentDOM.querySelectorAll('.mention-chip');
		expect(chips).toHaveLength(1);
		expect(chips[0].getAttribute('data-label')).toBe('**x**');
	});

	it('draws a chip typed after the view was created', () => {
		const view = makeView('a ');
		view.dispatch({ changes: { from: 2, insert: CHIP } });
		expect(view.contentDOM.querySelector('.mention-chip')).not.toBeNull();
	});
});

describe('markdownLivePreview — headings', () => {
	it('hides the heading marks when unfocused, even with the caret on the heading', () => {
		const view = makeView('# Title\n\ntext', 3);
		expect(view.hasFocus).toBe(false);
		expect(lineText(view, 1)).toBe('Title');
		expect(lineClasses(view)[0]).toContain('cm-md-heading');
		expect(lineClasses(view)[0]).toContain('cm-md-h1');
	});

	it('shows the heading marks while focused with the caret on the heading', async () => {
		const view = makeView('## Title\n\ntext', 4);
		await focus(view);
		await vi.waitFor(() => expect(lineText(view, 1)).toBe('## Title'));
		expect(lineClasses(view)[0]).toContain('cm-md-h2');
	});

	it('hides the heading marks while focused with the caret on another line', async () => {
		const view = makeView('# Title\n\ntext', 12);
		await focus(view);
		expect(lineText(view, 1)).toBe('Title');
		view.dispatch({ selection: { anchor: 2 } });
		expect(lineText(view, 1)).toBe('# Title');
		view.dispatch({ selection: { anchor: 12 } });
		expect(lineText(view, 1)).toBe('Title');
	});

	it('hides them again when the editor loses focus', async () => {
		const view = makeView('# Title', 2);
		await focus(view);
		await vi.waitFor(() => expect(lineText(view, 1)).toBe('# Title'));
		view.contentDOM.blur();
		await vi.waitFor(() => expect(lineText(view, 1)).toBe('Title'));
	});
});

describe('markdownLivePreview — inline syntax', () => {
	it('hides emphasis marks away from the caret and shows them on it', async () => {
		const view = makeView('a **bold** *it* ~~s~~\n\nx', 23);
		expect(lineText(view, 1)).toBe('a bold it s');
		await focus(view);
		view.dispatch({ selection: { anchor: 5 } });
		expect(lineText(view, 1)).toBe('a **bold** it s');
	});

	it('styles inline code and hides its backticks', () => {
		const view = makeView('a `code` b');
		expect(view.contentDOM.querySelector('.cm-md-inline-code')).not.toBeNull();
		expect(lineText(view, 1)).toBe('a code b');
	});

	it('shows a link as its text', () => {
		const view = makeView('see [docs](https://x.test) now');
		expect(lineText(view, 1)).toBe('see docs now');
		expect(view.contentDOM.querySelector('.cm-md-link-text')?.textContent).toBe('docs');
	});

	it('draws a markdown image as an image', () => {
		const view = makeView('![alt text](https://x.test/a.png)');
		const img = view.contentDOM.querySelector('.cm-md-image img');
		expect(img?.getAttribute('src')).toBe('https://x.test/a.png');
		expect(img?.getAttribute('alt')).toBe('alt text');
		expect(view.contentDOM.querySelector('.cm-md-image-handle')).not.toBeNull();
	});

	it('draws an html image with its width', () => {
		const view = makeView('<img src="https://x.test/a.png" alt="a" width="120">');
		const img = view.contentDOM.querySelector<HTMLImageElement>('.cm-md-image img');
		expect(img?.style.width).toBe('120px');
	});

	it('does not draw an image inside code', () => {
		const view = makeView('```\n<img src="https://x.test/a.png">\n![a](https://x.test/a.png)\n```');
		expect(view.contentDOM.querySelector('.cm-md-image')).toBeNull();
	});
});

describe('markdownLivePreview — block lines', () => {
	it('marks the lines of a fenced block with its first and last', () => {
		const view = makeView('```\ncode\n```');
		const classes = lineClasses(view);
		expect(classes[0]).toContain('cm-md-codeblock-first');
		expect(classes[1]).toContain('cm-md-codeblock');
		expect(classes[1]).not.toContain('cm-md-codeblock-first');
		expect(classes[2]).toContain('cm-md-codeblock-last');
	});

	it('marks quote and table lines', () => {
		const view = makeView('> q\n> r\n\n| A |\n| --- |\n| 1 |');
		const classes = lineClasses(view);
		expect(classes[0]).toContain('cm-md-quote');
		expect(classes[1]).toContain('cm-md-quote');
		expect(classes[2]).not.toContain('cm-md-quote');
		expect(classes.slice(3).every((cls) => cls.includes('cm-md-table'))).toBe(true);
	});
});

describe('isOpenableUrl', () => {
	it.each([
		'https://example.com',
		'http://x.io/a?b',
		'mailto:a@b.c',
		'/case/1/notes',
		' HTTPS://X'
	])('opens %s', (url) => {
		expect(isOpenableUrl(url)).toBe(true);
	});

	it.each([
		'javascript:alert(1)',
		' JavaScript:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'vbscript:x',
		'//evil.example',
		'file:///etc/passwd'
	])('refuses %s', (url) => {
		expect(isOpenableUrl(url)).toBe(false);
	});
});

describe('markdownLivePreview — escapes', () => {
	it('hides the backslash of escapes and hard breaks away from the caret', () => {
		const view = makeView('C:\\\\srv\\_x\\\nnext');
		expect(lineText(view, 1)).toBe('C:\\srv_x');
		expect(lineText(view, 2)).toBe('next');
	});

	it('shows them while the caret is on them', async () => {
		const view = makeView('a\\_b', 2);
		await focus(view);
		await vi.waitFor(() => expect(lineText(view, 1)).toBe('a\\_b'));
	});

	it('leaves backslashes in code alone', () => {
		const view = makeView('`a\\_b`\n\n```\nc\\_d\n```');
		expect(lineText(view, 1)).toBe('a\\_b');
		expect(lineText(view, 4)).toBe('c\\_d');
	});
});
