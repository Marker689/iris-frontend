import { beforeEach, describe, expect, it } from 'vitest';
import type { AiBlockDefinition } from '$lib/services/ai-workflows.service';
import {
	clipboardDecode,
	clipboardEncode,
	clipboardIsOwn,
	clipboardRemember,
	MAX_CLIPBOARD_CHARS
} from './clipboard';

const definition: AiBlockDefinition = {
	nodes: [
		{ id: 'a', type: 'ai_agent', label: 'A', position: { x: 0, y: 0 }, config: { prompt: 'x' } },
		{ id: 'b', type: 'suggest', label: 'B', position: { x: 200, y: 40 }, config: {} }
	],
	edges: [{ id: 'e1', source: 'a', target: 'b', source_port: 'out' }]
};

const raw = (data: unknown) => JSON.stringify(data);

describe('clipboardEncode / clipboardDecode', () => {
	it('round-trips the nodes and edges', () => {
		expect(clipboardDecode(clipboardEncode(definition))).toEqual(definition);
	});

	it('is null for anything else', () => {
		for (const text of [
			null,
			undefined,
			'',
			'hello',
			'{"iris_ai_workflow_nodes": 1',
			raw({ nodes: definition.nodes }),
			raw({ iris_ai_workflow_nodes: 2, nodes: definition.nodes }),
			raw({ iris_ai_workflow_nodes: 1, nodes: [] }),
			raw({ iris_ai_workflow_nodes: 1, nodes: 'a' }),
			raw({ iris_ai_workflow_nodes: 1, nodes: [{ id: 'a' }] }),
			raw({ iris_ai_workflow_nodes: 1, nodes: [{ id: 3, type: 'x' }] }),
			raw({ iris_ai_workflow_nodes: 1, nodes: [{ id: 'x'.repeat(129), type: 'x' }] }),
			raw([1, 2])
		]) {
			expect(clipboardDecode(text)).toBeNull();
		}
	});

	it('refuses oversized text', () => {
		const text = clipboardEncode({
			nodes: [{ ...definition.nodes[0], config: { prompt: 'x'.repeat(MAX_CLIPBOARD_CHARS) } }],
			edges: []
		});
		expect(clipboardDecode(text)).toBeNull();
	});

	it('normalises positions and configs', () => {
		const read = clipboardDecode(
			raw({
				iris_ai_workflow_nodes: 1,
				nodes: [
					{ id: 'a', type: 'delay', position: { x: 'no', y: Infinity }, config: [1] },
					{ id: 'b', type: 'delay' }
				]
			})
		);
		expect(read?.nodes.map((n) => [n.position, n.config])).toEqual([
			[{ x: 0, y: 0 }, {}],
			[{ x: 0, y: 0 }, {}]
		]);
		expect(read?.edges).toEqual([]);
	});

	it('drops the edges to nodes not copied and the malformed ones', () => {
		const read = clipboardDecode(
			raw({
				iris_ai_workflow_nodes: 1,
				nodes: definition.nodes,
				edges: [
					...definition.edges,
					{ id: 'e2', source: 'a', target: 'elsewhere' },
					{ id: 'e3', source: 'a' },
					'e4'
				]
			})
		);
		expect(read?.edges.map((e) => e.id)).toEqual(['e1']);
	});
});

describe('clipboardRemember / clipboardIsOwn', () => {
	beforeEach(() => localStorage.clear());

	it('knows the text this browser copied last only', () => {
		const first = clipboardEncode(definition);
		const second = clipboardEncode({ nodes: [definition.nodes[0]], edges: [] });
		expect(clipboardIsOwn(first)).toBe(false);
		clipboardRemember(first);
		expect(clipboardIsOwn(first)).toBe(true);
		expect(clipboardIsOwn(`${first} `)).toBe(false);
		clipboardRemember(second);
		expect(clipboardIsOwn(first)).toBe(false);
		expect(clipboardIsOwn(second)).toBe(true);
	});
});
