import { describe, expect, it } from 'vitest';
import type { AiSuggestion } from '$lib/services/ai-suggestions.service';
import {
	aiSuggestionActionFields,
	aiSuggestionActions,
	aiSuggestionActionsSummary,
	aiSuggestionActionTargets,
	aiSuggestionActionTitle,
	aiSuggestionFieldLabel,
	aiSuggestionToolLabel
} from '../ai-suggestion-actions';

function suggestion(over: Partial<AiSuggestion> = {}): AiSuggestion {
	return { id: 1, status: 'open', proposed_action: null, ...over } as AiSuggestion;
}

describe('aiSuggestionToolLabel', () => {
	it('puts the verb first and the objects in the singular', () => {
		expect(aiSuggestionToolLabel('iris_case_notes_create')).toBe('Create case note');
		expect(aiSuggestionToolLabel('iris_cases_update')).toBe('Update case');
		expect(aiSuggestionToolLabel('iris_case_iocs_list')).toBe('Case ioc list');
	});
});

describe('aiSuggestionActionTargets', () => {
	it('lists the objects, the container last, including wrapped ones', () => {
		expect(
			aiSuggestionActionTargets({ case_identifier: 3537, payload: { note_id: 12 }, title: 'x' })
		).toEqual(['note #12', 'case #3537']);
	});

	it('ignores empty and non-scalar ids', () => {
		expect(aiSuggestionActionTargets({ case_id: '', alert_id: { a: 1 } })).toEqual([]);
	});
});

describe('aiSuggestionActionTitle', () => {
	it('names the target', () => {
		expect(aiSuggestionActionTitle('iris_cases_update', { case_identifier: 3537 })).toBe(
			'Update case #3537'
		);
		expect(aiSuggestionActionTitle('iris_case_notes_create', { case_identifier: 3537 })).toBe(
			'Create case note on case #3537'
		);
		expect(aiSuggestionActionTitle('iris_case_notes_create', {})).toBe('Create case note');
	});
});

describe('aiSuggestionActions', () => {
	it('lists the actions of a bundle', () => {
		const actions = aiSuggestionActions(
			suggestion({
				proposed_actions: [
					{
						id: 1,
						label: 'Save the review',
						tool: 'iris_case_notes_create',
						arguments: { case_identifier: 3 },
						status: 'done',
						tool_call_id: 7,
						error: null
					},
					{
						id: 2,
						label: '',
						tool: 'iris_cases_update',
						arguments: { case_identifier: 3 },
						status: 'pending',
						tool_call_id: null,
						error: 'Denied'
					}
				]
			})
		);
		expect(actions.map((a) => [a.id, a.label, a.status, a.error, a.bundled])).toEqual([
			[1, 'Save the review', 'done', null, true],
			[2, 'Update case #3', 'pending', 'Denied', true]
		]);
	});

	it('turns a single proposed action into action 0', () => {
		const [action] = aiSuggestionActions(
			suggestion({
				status: 'accepted',
				proposed_action: { tool: 'iris_cases_update', arguments: { case_identifier: 9 } }
			})
		);
		expect(action).toMatchObject({
			id: 0,
			label: 'Update case #9',
			status: 'done',
			bundled: false
		});
	});

	it('is empty without an action', () => {
		expect(aiSuggestionActions(suggestion())).toEqual([]);
	});
});

describe('aiSuggestionFieldLabel', () => {
	it('humanizes the key', () => {
		expect(aiSuggestionFieldLabel('case_description')).toBe('Case description');
		expect(aiSuggestionFieldLabel('severity_id')).toBe('Severity (id)');
		expect(aiSuggestionFieldLabel('tag_ids')).toBe('Tag (ids)');
	});
});

describe('aiSuggestionActionFields', () => {
	it('flattens wrappers, skips targets and classifies values', () => {
		const fields = aiSuggestionActionFields({
			case_identifier: 3,
			payload: {
				severity_id: 4,
				closed: false,
				tags: ['a', 'b'],
				description: `# Review\n${'x'.repeat(20)}`,
				owner: null,
				title: ' ',
				custom: { a: 1 }
			}
		});
		expect(fields.map((f) => [f.key, f.kind, f.kind === 'long' ? f.preview : f.text])).toEqual([
			['severity_id', 'text', '4'],
			['closed', 'text', 'No'],
			['tags', 'text', 'a, b'],
			['description', 'long', `Review ${'x'.repeat(20)}`],
			['owner', 'empty', 'None'],
			['title', 'empty', 'Empty'],
			['custom', 'json', '{\n  "a": 1\n}']
		]);
	});
});

describe('aiSuggestionActionsSummary', () => {
	it('names one action, counts several', () => {
		const a = (label: string) =>
			({ label }) as unknown as Parameters<typeof aiSuggestionActionsSummary>[0][number];
		expect(aiSuggestionActionsSummary([])).toBe('');
		expect(aiSuggestionActionsSummary([a('One')])).toBe('One');
		expect(aiSuggestionActionsSummary([a('One'), a('Two')])).toBe('2 actions: One · Two');
	});
});
