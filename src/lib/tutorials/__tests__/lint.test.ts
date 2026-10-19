import { describe, expect, it } from 'vitest';
import { lintTutorial } from '../lint';
import type { TutorialStep } from '../types';

const lint = (steps: TutorialStep[], title = 'T') => lintTutorial({ title, steps });

describe('lintTutorial', () => {
	it('needs a title and a step', () => {
		expect(lint([], ' ').map((i) => i.message)).toEqual([
			'The tutorial has no title.',
			'Add at least one step.'
		]);
	});

	it('accepts variables captured or bound by earlier steps', () => {
		expect(
			lint([
				{
					title: 'Create',
					body: '',
					waitFor: { kind: 'api', method: 'POST', path: '/cases', capture: { caseId: 'case_id' } }
				},
				{ title: 'Open', body: '', waitFor: { kind: 'route', path: '/alerts/{alertId}' } },
				{ title: 'Use', body: 'Case {caseId}, alert {alertId}', goTo: '/case/{caseId}' }
			])
		).toEqual([]);
	});

	it('flags variables used before they are known, including by the step that binds them', () => {
		expect(
			lint([
				{ title: 'Open', body: 'Case {caseId}', waitFor: { kind: 'route', path: '/case/{caseId}' } }
			])
		).toEqual([{ step: 0, message: '{caseId} is not known yet: capture it in an earlier step.' }]);
	});

	it('flags paths leaving the app, prefixed API paths and broken selectors', () => {
		const messages = lint([
			{
				title: 'S',
				body: '',
				goTo: 'https://example.com',
				anchor: 'div[',
				waitFor: { kind: 'api', method: 'POST', path: '/api/v2/cases' }
			}
		]).map((i) => i.message);
		expect(messages).toEqual([
			'"Take me there" must be a path inside IRIS, starting with /.',
			'"div[" is not a valid CSS selector.',
			'API paths start after /api/v2, e.g. /cases.'
		]);
	});
});
