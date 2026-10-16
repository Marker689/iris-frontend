import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { converter, renderHardBreaks } from '../converter';

const html = (md: string) => converter.makeHtml(md).replace(/\n/g, '');

/** Markdown TipTap saves for `content` (same Markdown options as the editor). */
const tiptapMarkdown = (content: string) => {
	const editor = new Editor({
		extensions: [StarterKit, Markdown.configure({ breaks: true })],
		content
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const md = (editor.storage as any).markdown.getMarkdown() as string;
	editor.destroy();
	return md;
};

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
});

describe('converter', () => {
	it('shows no backslash for an empty line typed in the editor', () => {
		const md = tiptapMarkdown('<p>confirmed.<br><br><strong>Source</strong>: x</p>');
		expect(md).toBe('confirmed.\\\n\\\n**Source**: x');
		expect(html(md)).toBe('<p>confirmed.<br><br><strong>Source</strong>: x</p>');
	});

	it('keeps a line break inside italics', () => {
		const md = tiptapMarkdown('<p><em>discovered with a<br>valid record</em></p>');
		expect(html(md)).toBe('<p><em>discovered with a<br>valid record</em></p>');
	});

	it('still breaks plain newlines', () => {
		expect(html('one\ntwo')).toBe('<p>one<br />two</p>');
	});

	it('keeps shell continuations in code blocks', () => {
		expect(converter.makeHtml('```\nls \\\n  -la\n```')).toContain('ls \\\n  -la');
	});
});
