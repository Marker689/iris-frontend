import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../render-markdown';

const render = (md: string) => {
	const div = document.createElement('div');
	div.innerHTML = renderMarkdown(md);
	return div;
};

describe('renderMarkdown', () => {
	it('opens a bare URL in a new tab', () => {
		const a = render('some text\nhttps://example.com').querySelector('a');
		expect(a?.getAttribute('href')).toBe('https://example.com');
		expect(a?.getAttribute('target')).toBe('_blank');
		expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('opens a markdown link in a new tab', () => {
		const a = render('[the case](/case/3)').querySelector('a');
		expect(a?.getAttribute('target')).toBe('_blank');
		expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('keeps an in-page anchor in the tab', () => {
		const a = render('[top](#top)').querySelector('a');
		expect(a?.getAttribute('target')).toBeNull();
	});

	it('still sanitizes', () => {
		const div = render('<img src=x onerror="alert(1)">[x](javascript:alert(1))');
		expect(div.innerHTML).not.toContain('onerror');
		expect(div.innerHTML).not.toContain('javascript:');
	});
});
