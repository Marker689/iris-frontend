import { describe, expect, it, vi } from 'vitest';
import DOMPurify from 'dompurify';
import { converter } from '../converter';
import { highlightCodeBlocks } from '../highlight-code-blocks';
import { codeHighlightStyle } from '../markdown-theme';

const render = (md: string): HTMLDivElement => {
	const container = document.createElement('div');
	container.innerHTML = DOMPurify.sanitize(converter.makeHtml(md));
	document.body.appendChild(container);
	return container;
};

const PYTHON = '```python\n# test\ndef function(test):\n  salut=super()\n```';

describe('highlightCodeBlocks', () => {
	it('colours a fenced block in its language, keeping its text', async () => {
		const container = render(PYTHON);
		const code = container.querySelector('pre > code') as HTMLElement;
		const text = code.textContent;
		highlightCodeBlocks(container);
		await vi.waitFor(() => expect(code.querySelector('span')).not.toBeNull());
		expect(code.textContent).toBe(text);
		const def = [...code.querySelectorAll('span')].find((s) => s.textContent === 'def');
		expect(def?.className).toBeTruthy();
	});

	it('mounts the colour rules, for pages without an editor', () => {
		highlightCodeBlocks(render(PYTHON));
		const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('');
		const rules = codeHighlightStyle.module?.getRules() ?? '';
		expect(rules).not.toBe('');
		expect(css).toContain(rules);
	});

	it('leaves blocks without a known language alone', async () => {
		const container = render('```\nplain <b>\n```\n\n```nosuchlang\nx = 1\n```');
		highlightCodeBlocks(container);
		await new Promise((r) => setTimeout(r, 50));
		expect(container.querySelectorAll('pre span')).toHaveLength(0);
		expect(container.querySelector('code')?.textContent).toBe('plain <b>\n');
	});

	it('does not touch a block re-rendered before its language loaded', async () => {
		const container = render(PYTHON);
		const code = container.querySelector('pre > code') as HTMLElement;
		highlightCodeBlocks(container);
		code.textContent = 'replaced';
		await new Promise((r) => setTimeout(r, 100));
		expect(code.innerHTML).toBe('replaced');
	});
});
