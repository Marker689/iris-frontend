import { describe, expect, it } from 'vitest';
import { TUTORIAL_FILE_FORMAT, parseTutorialFile, tutorialFileName, tutorialToFile } from '../io';
import type { Tutorial } from '../types';

const tutorial: Omit<Tutorial, 'id'> = {
	title: 'Escalate a phishing alert',
	summary: 'Our way',
	duration: '~3 min',
	steps: [
		{
			title: 'Create',
			body: '',
			waitFor: { kind: 'api', method: 'POST', path: '/cases', capture: { caseId: 'case_id' } }
		}
	]
};

describe('tutorial files', () => {
	it('round-trips through JSON', () => {
		const file = tutorialToFile(tutorial);
		expect(file.format).toBe(TUTORIAL_FILE_FORMAT);
		expect(parseTutorialFile(JSON.stringify(file))).toEqual(tutorial);
	});

	it('refuses to export a regexp path', () => {
		expect(() =>
			tutorialToFile({
				...tutorial,
				steps: [{ title: 'R', body: '', waitFor: { kind: 'route', path: /^\/x$/ } }]
			})
		).toThrow('Step "R"');
	});

	it('names the file after the title', () => {
		expect(tutorialFileName('Escalate a phishing alert!')).toBe(
			'escalate-a-phishing-alert.tutorial.json'
		);
		expect(tutorialFileName('  ')).toBe('tutorial.tutorial.json');
	});

	it('accepts a file without a format and defaults what is missing', () => {
		expect(parseTutorialFile('{"title": "T", "steps": []}')).toEqual({
			title: 'T',
			summary: '',
			duration: '',
			steps: []
		});
	});

	it('explains what is wrong with a bad file', () => {
		expect(() => parseTutorialFile('nope')).toThrow('not JSON');
		expect(() => parseTutorialFile('[]')).toThrow('does not hold a tutorial');
		expect(() => parseTutorialFile('{"format": "x/9", "title": "T", "steps": []}')).toThrow(
			'Unsupported tutorial format "x/9"'
		);
		expect(() => parseTutorialFile('{"title": " ", "steps": []}')).toThrow('no title');
		expect(() => parseTutorialFile('{"title": "T"}')).toThrow('no steps');
	});
});
