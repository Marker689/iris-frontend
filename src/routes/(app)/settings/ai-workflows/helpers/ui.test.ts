import { describe, expect, it } from 'vitest';
import type { AiGraphNode } from '$lib/services/ai-workflows.service';
import { definitionReview, keyReferences, toolReferences } from './ui';

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
				node('d', 'delay', { tool: 'ignored' })
			])
		).toEqual(['add_ioc', 'close_case', 'get_case']);
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
