import { describe, it, expect, vi } from 'vitest';

vi.mock('svelte/transition', () => ({
	slide: vi.fn(() => ({ duration: 300 }))
}));

import { slide } from 'svelte/transition';
import { slideIfShown } from '../transitions';

const element = (rects: number) =>
	({ getClientRects: () => ({ length: rects }) }) as unknown as Element;

describe('slideIfShown', () => {
	it('slides an element that is laid out', () => {
		expect(slideIfShown(element(1), { duration: 300 })).toEqual({ duration: 300 });
		expect(slide).toHaveBeenCalledOnce();
	});

	it('does not animate a hidden element', () => {
		vi.mocked(slide).mockClear();
		expect(slideIfShown(element(0))).toEqual({ duration: 0 });
		expect(slide).not.toHaveBeenCalled();
	});
});
