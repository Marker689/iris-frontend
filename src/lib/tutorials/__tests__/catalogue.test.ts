import { describe, expect, it } from 'vitest';
import { TUTORIALS, tutorialById } from '..';
import { lintTutorial } from '../lint';

describe('tutorial catalogue', () => {
	it('has unique ids', () => {
		const ids = TUTORIALS.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(tutorialById(ids[0])).toBe(TUTORIALS[0]);
		expect(tutorialById('nope')).toBeUndefined();
	});

	it('keeps built-in ids clear of administrator-written ones', () => {
		expect(TUTORIALS.filter((t) => t.id.startsWith('custom-'))).toEqual([]);
	});

	for (const tutorial of TUTORIALS) {
		it(`${tutorial.id}: passes the tutorial checks`, () => {
			expect(lintTutorial(tutorial)).toEqual([]);
		});
	}
});
