import { describe, expect, it } from 'vitest';
import { converter, renderHardBreaks } from '../converter';

const html = (md: string) => converter.makeHtml(md).replace(/\n/g, '');

describe('renderHardBreaks', () => {
	it('turns a hard break into a <br> joining the lines', () => {
		expect(renderHardBreaks('one\\\ntwo')).toBe('one<br>two');
	});

	it('keeps every break of an empty line', () => {
		expect(renderHardBreaks('a\\\n\\\n\\\nb')).toBe('a<br><br><br>b');
	});

	it('keeps an escaped backslash ending a line', () => {
		expect(renderHardBreaks('path C:\\\\\nnext')).toBe('path C:\\\\\nnext');
		expect(renderHardBreaks('odd \\\\\\\nnext')).toBe('odd \\\\<br>next');
	});

	it('keeps a backslash ending a paragraph or the text', () => {
		expect(renderHardBreaks('a\\\n\nb')).toBe('a\\\n\nb');
		expect(renderHardBreaks('a\\')).toBe('a\\');
	});

	it('leaves fenced code alone', () => {
		const md = '```sh\nls \\\n  -la\n```\nafter\\\nline';
		expect(renderHardBreaks(md)).toBe('```sh\nls \\\n  -la\n```\nafter<br>line');
		expect(renderHardBreaks('~~~\na \\\nb\n~~~')).toBe('~~~\na \\\nb\n~~~');
	});

	it('does not join a line into a fence', () => {
		expect(renderHardBreaks('a\\\n```\ncode\n```')).toBe('a\\\n```\ncode\n```');
	});

	it('leaves a fence indented in a list or quoted alone', () => {
		const listed = '- c\n\n      ```\n      ls \\\n      -la\n      ```';
		expect(renderHardBreaks(listed)).toBe(listed);
		const quoted = '> ```\n> ls \\\n> -la\n> ```';
		expect(renderHardBreaks(quoted)).toBe(quoted);
	});

	it('closes a fence only on a bare fence line', () => {
		expect(renderHardBreaks('```js\nx \\\n```js\ny \\\n```')).toBe('```js\nx \\\n```js\ny \\\n```');
	});

	it('leaves indented code alone', () => {
		const md = 'para\n\n    ls \\\n      -la\n\nafter\\\nline';
		expect(renderHardBreaks(md)).toBe('para\n\n    ls \\\n      -la\n\nafter<br>line');
	});

	it('breaks an indented line of a list item', () => {
		expect(renderHardBreaks('- a\n\n    - c\\\n      cont')).toBe('- a\n\n    - c<br>      cont');
	});

	it('drops the quote markers of the joined line', () => {
		expect(renderHardBreaks('> quoted\\\n> more\\\n> end')).toBe('> quoted<br>more<br>end');
		expect(renderHardBreaks('> > a\\\n> > b')).toBe('> > a<br>b');
	});

	it('does not join a table header into its delimiter row', () => {
		expect(renderHardBreaks('| a | b \\\n|---|---|\n| 1 | 2 |')).toBe(
			'| a | b \n|---|---|\n| 1 | 2 |'
		);
	});
});

describe('converter', () => {
	it('shows no backslash for an empty line typed in the editor', () => {
		// Notes written by the previous (TipTap) editor stored line breaks this way.
		const md = 'confirmed.\\\n\\\n**Source**: x';
		expect(html(md)).toBe('<p>confirmed.<br><br><strong>Source</strong>: x</p>');
	});

	it('keeps a line break inside italics', () => {
		const md = '*discovered with a\\\nvalid record*';
		expect(html(md)).toBe('<p><em>discovered with a<br>valid record</em></p>');
	});

	it('keeps a line break in a quote', () => {
		const md = '> quoted\\\n> more';
		expect(html(md)).toBe('<blockquote>  <p>quoted<br>more</p></blockquote>');
	});

	it('keeps code in a nested list intact', () => {
		const md =
			'- a\n\n  - b\n\n    - c\\\n      cont\n\n      ```\n      ls \\\n      -la\n      ```';
		const out = converter.makeHtml(md);
		expect(out).toContain('c<br>      cont');
		expect(out).toMatch(/<code>\s*ls \\\n\s*-la\n<\/code>/);
	});

	it('still breaks plain newlines', () => {
		expect(html('one\ntwo')).toBe('<p>one<br />two</p>');
	});

	it('keeps shell continuations in code blocks', () => {
		expect(converter.makeHtml('```\nls \\\n  -la\n```')).toContain('ls \\\n  -la');
	});
});
