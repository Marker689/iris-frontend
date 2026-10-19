import { describe, expect, it } from 'vitest';
import type { AiGraphNode, AiWorkflowSummary } from '$lib/services/ai-workflows.service';
import { definitionReview, keyReferences, toolReferences, workflowMatchesSearch } from './ui';

const node = (id: string, type: string, config: Record<string, unknown> = {}): AiGraphNode => ({
	id,
	type,
	label: id,
	position: { x: 0, y: 0 },
	config
});

describe('keyReferences', () => {
	it('lists the keystore entries named anywhere, once and sorted', () => {
		expect(
			keyReferences({
				headers: { Authorization: 'Bearer {{ key("VT_TOKEN") }}' },
				list: ["{{ key('ABUSE') }}", '{{ key( "VT_TOKEN" ) }}'],
				other: 3
			})
		).toEqual(['ABUSE', 'VT_TOKEN']);
	});

	it('ignores what is not a key() call', () => {
		expect(keyReferences(['monkey("X")', 'key(X)', 'key("a\')'])).toEqual([]);
	});
});

describe('toolReferences', () => {
	it('lists the tools actions, agents and suggestions use', () => {
		expect(
			toolReferences([
				node('a', 'action', { tool: 'add_ioc' }),
				node('b', 'ai_agent', { tools: ['get_case', 3, 'add_ioc'] }),
				node('c', 'suggest', { proposed_action: { tool: 'close_case' } }),
				node('e', 'suggest', { actions: [{ tool: 'add_note' }, { tool: 4 }] }),
				node('d', 'delay', { tool: 'ignored' })
			])
		).toEqual(['add_ioc', 'add_note', 'close_case', 'get_case']);
	});
});

describe('definitionReview', () => {
	it('says what the nodes would do', () => {
		const review = definitionReview({
			nodes: [
				node('h1', 'http_request', { url: 'https://user:pw@api.example.com/x?k={{ key("API") }}' }),
				node('h2', 'http_request', {}),
				node('p', 'python', { code: 'print(1)' }),
				node('w', 'run_workflow', { workflow_id: 2 }),
				node('a', 'action', { tool: 'add_ioc' })
			],
			edges: []
		});
		expect(review).toEqual([
			'Calls: api.example.com, (no URL)',
			'Sends keystore entries: API',
			'Runs tools: add_ioc',
			'Runs 1 Python script',
			'Starts 1 other workflow'
		]);
	});

	it('takes the server requirements over its own reading', () => {
		const review = definitionReview(
			{ nodes: [node('a', 'action', { tool: 'add_ioc' })], edges: [] },
			{ keystore: ['SERVER_KEY'], tools: [] }
		);
		expect(review).toEqual(['Sends keystore entries: SERVER_KEY']);
	});

	it('is empty for harmless nodes', () => {
		expect(definitionReview({ nodes: [node('d', 'delay')], edges: [] })).toEqual([]);
	});
});

describe('workflowMatchesSearch', () => {
	const workflow = {
		id: 1,
		name: 'Phishing triage',
		description: 'Enrich reported mails',
		owner: { id: 3, login: 'jdoe', name: 'Jane Doe' },
		trigger_type: 'event',
		trigger_config: {},
		triggers: [
			{
				type: 'event',
				config: { hooks: ['on_postload_alert_create', 'on_postload_alert_update'] }
			},
			{ type: 'cron', config: { cron: '*/15 * * * *' } }
		]
	} as unknown as AiWorkflowSummary;

	it('matches everything on an empty or blank search', () => {
		expect(workflowMatchesSearch(workflow, '')).toBe(true);
		expect(workflowMatchesSearch(workflow, '   ')).toBe(true);
	});

	it('matches the name and description, case-insensitively', () => {
		expect(workflowMatchesSearch(workflow, 'PHISHING')).toBe(true);
		expect(workflowMatchesSearch(workflow, 'reported mail')).toBe(true);
	});

	it('matches the owner by name or login', () => {
		expect(workflowMatchesSearch(workflow, 'jane')).toBe(true);
		expect(workflowMatchesSearch(workflow, 'jdoe')).toBe(true);
	});

	it('matches every hook of an event trigger, not only the first', () => {
		expect(workflowMatchesSearch(workflow, 'alert_update')).toBe(true);
	});

	it('matches trigger labels and schedules', () => {
		expect(workflowMatchesSearch(workflow, 'schedule')).toBe(true);
		expect(workflowMatchesSearch(workflow, '*/15')).toBe(true);
	});

	it('rejects what appears nowhere', () => {
		expect(workflowMatchesSearch(workflow, 'ransomware')).toBe(false);
	});

	it('copes with a missing description and owner', () => {
		const bare = { ...workflow, description: null, owner: null };
		expect(workflowMatchesSearch(bare, 'phishing')).toBe(true);
		expect(workflowMatchesSearch(bare, 'jane')).toBe(false);
	});
});
