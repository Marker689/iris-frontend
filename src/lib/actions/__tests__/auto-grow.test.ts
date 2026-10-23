import { describe, expect, it } from 'vitest';
import { autoGrow } from '../auto-grow';

const textarea = (scrollHeight: { value: number }) => {
	const el = document.createElement('textarea');
	Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight.value });
	return el;
};

describe('autoGrow', () => {
	it('fits the content, then scrolls past the maximum', async () => {
		const height = { value: 40 };
		const el = textarea(height);
		const action = autoGrow(el, { max: 100 });
		expect(el.style.height).toBe('40px');
		expect(el.style.overflowY).toBe('hidden');

		height.value = 160;
		el.dispatchEvent(new Event('input'));
		expect(el.style.height).toBe('100px');
		expect(el.style.overflowY).toBe('auto');

		// A value set from code refits on update.
		height.value = 20;
		action.update({ value: '', max: 100 });
		await Promise.resolve();
		expect(el.style.height).toBe('20px');

		action.destroy();
		height.value = 80;
		el.dispatchEvent(new Event('input'));
		expect(el.style.height).toBe('20px');
	});
});
