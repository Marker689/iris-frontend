import { describe, expect, it } from 'vitest';
import { hasStructuredHtml, htmlToMarkdown, imageHtml } from '../html-to-markdown';
import { buildMentionSpan } from '../mention-markup';

/** Roughly what VS Code puts on the clipboard: styled div / span soup. */
const VSCODE_PASTE =
	'<meta charset="utf-8"><div style="color: #d4d4d4;background-color: #1e1e1e;font-family: Menlo;">' +
	'<div><span style="color: #569cd6;">const</span><span style="color: #d4d4d4;"> x = </span>' +
	'<span style="color: #b5cea8;">1</span>;</div></div>';

describe('hasStructuredHtml', () => {
	it.each([
		['heading', '<h2>Title</h2>'],
		['bullet list', '<ul><li>a</li></ul>'],
		['ordered list', '<ol><li>a</li></ol>'],
		['table', '<table><tr><td>a</td></tr></table>'],
		['blockquote', '<blockquote>q</blockquote>'],
		['pre', '<pre>code</pre>'],
		['link', '<p>see <a href="https://example.com">here</a></p>'],
		['bold', '<p><b>bold</b></p>'],
		['strong', '<p><strong>bold</strong></p>'],
		['emphasis', '<p><em>it</em></p>'],
		['image', '<img src="https://example.com/a.png">'],
		['mention', buildMentionSpan('alert', 106, 'Alert #106')]
	])('is true for a %s', (_name, html) => {
		expect(hasStructuredHtml(html)).toBe(true);
	});

	it.each([
		['empty string', ''],
		['VS Code paste', VSCODE_PASTE],
		['plain paragraph', '<p>just text</p>'],
		['styled span', '<span style="color: red">red</span>'],
		['anchor without href', '<a name="x">anchor</a>'],
		['image without src', '<img alt="x">']
	])('is false for a %s', (_name, html) => {
		expect(hasStructuredHtml(html)).toBe(false);
	});
});

describe('htmlToMarkdown', () => {
	it('writes atx headings', () => {
		expect(htmlToMarkdown('<h1>One</h1><h3>Three</h3>')).toBe('# One\n\n### Three');
	});

	it('writes - bullets', () => {
		expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul>')).toMatch(/^-\s+a\n-\s+b$/);
	});

	it('writes bold, emphasis and links', () => {
		expect(
			htmlToMarkdown('<p><strong>b</strong> <em>i</em> <a href="https://x.org">x</a></p>')
		).toBe('**b** *i* [x](https://x.org)');
	});

	it('writes fenced code blocks', () => {
		expect(htmlToMarkdown('<pre><code>a = 1\nb = 2</code></pre>')).toBe('```\na = 1\nb = 2\n```');
	});

	it('writes GFM tables', () => {
		const md = htmlToMarkdown(
			'<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
		);
		const lines = md.split('\n');
		expect(lines).toHaveLength(3);
		expect(lines[0]).toMatch(/^\|\s*A\s*\|\s*B\s*\|$/);
		expect(lines[1]).toMatch(/^\|\s*-+\s*\|\s*-+\s*\|$/);
		expect(lines[2]).toMatch(/^\|\s*1\s*\|\s*2\s*\|$/);
	});

	it('drops meta, style, script and title', () => {
		expect(
			htmlToMarkdown(
				'<meta charset="utf-8"><title>t</title><style>p{color:red}</style><script>alert(1)</script><h2>Kept</h2>'
			)
		).toBe('## Kept');
	});

	it('writes a stored mention chip back unchanged', () => {
		const chip = buildMentionSpan('alert', 106, 'Alert #106');
		expect(htmlToMarkdown(`<p>From ${chip}.</p>`)).toBe(`From ${chip}.`);
	});

	it('writes a decorated preview chip in its stored form', () => {
		const decorated =
			'<span data-mention data-kind="ioc" data-id="12" data-label="1.2.3.4" ' +
			'class="mention-chip mention-chip-clickable bg-red-500/15" role="button" tabindex="0" title="1.2.3.4">' +
			'<svg viewBox="0 0 24 24" width="12" height="12"><path d="M1 1 L2 2"></path></svg>' +
			'<span class="mention-chip-label">1.2.3.4</span></span>';
		expect(htmlToMarkdown(`<p>IOC ${decorated}</p>`)).toBe(
			`IOC ${buildMentionSpan('ioc', '12', '1.2.3.4')}`
		);
	});

	it('takes the chip label from its text when data-label is missing', () => {
		expect(htmlToMarkdown('<span data-mention data-kind="user" data-id="3">@Jane Doe</span>')).toBe(
			buildMentionSpan('user', '3', 'Jane Doe')
		);
	});

	it('escapes the chip label like the backend', () => {
		expect(
			htmlToMarkdown(
				'<span data-mention data-kind="user" data-id="3" data-label="R&amp;D &quot;x&quot;">@R&amp;D</span>'
			)
		).toBe(buildMentionSpan('user', '3', 'R&D "x"'));
	});

	it('writes a plain image as markdown', () => {
		expect(htmlToMarkdown('<img src="https://x.org/a.png" alt="A">')).toBe(
			'![A](https://x.org/a.png)'
		);
	});

	it('keeps the width of a sized image as html', () => {
		expect(
			htmlToMarkdown('<p><img src="https://x.org/a.png" alt="A" width="320" class="x"></p>')
		).toBe('<img src="https://x.org/a.png" alt="A" width="320">');
	});
});

describe('imageHtml', () => {
	it('writes src, alt and width', () => {
		expect(imageHtml('a.png', 'A', 200)).toBe('<img src="a.png" alt="A" width="200">');
		expect(imageHtml('a.png', 'A', '50%')).toBe('<img src="a.png" alt="A" width="50%">');
	});

	it('omits an empty width', () => {
		expect(imageHtml('a.png', 'A', null)).toBe('<img src="a.png" alt="A">');
		expect(imageHtml('a.png', 'A', '')).toBe('<img src="a.png" alt="A">');
		expect(imageHtml('a.png', 'A', 0)).toBe('<img src="a.png" alt="A">');
	});

	it('escapes attribute values', () => {
		expect(imageHtml('a.png?x=1&y="2"', '<b>', '1"')).toBe(
			'<img src="a.png?x=1&amp;y=&quot;2&quot;" alt="&lt;b&gt;" width="1&quot;">'
		);
	});
});
