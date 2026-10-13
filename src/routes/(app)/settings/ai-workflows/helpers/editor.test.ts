import { describe, expect, it } from 'vitest';
import type { AiWorkflow, AiWorkflowGraph } from '$lib/services/ai-workflows.service';
import {
	bodyFromForm,
	emptyWorkflowForm,
	formFromWorkflow,
	graphFromWorkflow,
	graphTriggers,
	triggerOfNode,
	workflowFromJson,
	workflowJson,
	type WorkflowForm
} from './editor';

const graph: AiWorkflowGraph = {
	nodes: [
		{ id: 'trigger', type: 'trigger', label: 'Start', config: {}, position: { x: 0, y: 0 } },
		{ id: 'notify', type: 'notify', label: 'Tell', config: {}, position: { x: 0, y: 120 } }
	],
	edges: [{ id: 'e1', source: 'trigger', target: 'notify', source_port: 'out' }]
} as unknown as AiWorkflowGraph;

const typed: AiWorkflowGraph = {
	nodes: [
		{
			id: 't1',
			type: 'trigger',
			label: 'New alert',
			config: { trigger_type: 'event', hooks: ['on_x'], condition: '', dedup_minutes: 10 },
			position: { x: 0, y: 0 }
		},
		{
			id: 't2',
			type: 'trigger',
			label: 'Hourly',
			config: { trigger_type: 'cron', cron: '0 * * * *', target: 'none', max_targets: '5' },
			position: { x: 0, y: 120 }
		},
		{ id: 'notify', type: 'notify', label: 'Tell', config: {}, position: { x: 240, y: 0 } }
	],
	edges: [
		{ id: 'e1', source: 't1', target: 'notify', source_port: 'out' },
		{ id: 'e2', source: 't2', target: 'notify', source_port: 'out' }
	]
};

function base(): WorkflowForm {
	return { ...emptyWorkflowForm(), name: 'Triage', owner_id: 4, customer_scope: [2] };
}

function read(text: string) {
	const result = workflowFromJson(text, base());
	if ('error' in result) throw new Error(result.error);
	return result;
}

describe('workflowJson', () => {
	it('shows the workflow without its owner, its triggers on the nodes', () => {
		const doc = JSON.parse(workflowJson(base(), graph));
		expect(doc.name).toBe('Triage');
		expect(doc.graph).toEqual(graph);
		expect('triggers' in doc).toBe(false);
		expect('owner_id' in doc).toBe(false);
	});

	it('reads back what it shows', () => {
		const form: WorkflowForm = { ...base(), write_tool_allowlist: ['x'] };
		const back = read(workflowJson(form, graph));
		expect(back.graph).toEqual(graph);
		expect(back.form.write_tool_allowlist).toEqual(['x']);
		expect(back.form.owner_id).toBe(4);
	});
});

describe('bodyFromForm', () => {
	it('sends the trigger node configs as the backend takes them', () => {
		const body = bodyFromForm(base(), typed, { includeOwner: false });
		expect(body.graph.nodes[0].config).toEqual({
			trigger_type: 'event',
			hooks: ['on_x'],
			condition: null,
			dedup_minutes: 10
		});
		expect(body.graph.nodes[1].config).toEqual({
			trigger_type: 'cron',
			cron: '0 * * * *',
			target: 'none',
			max_targets: 5
		});
		expect('triggers' in body).toBe(false);
	});
});

describe('graphTriggers / triggerOfNode', () => {
	it('lists the trigger nodes in order', () => {
		expect(graphTriggers(typed)).toEqual([
			{
				type: 'event',
				config: { hooks: ['on_x'], condition: '', dedup_minutes: 10 },
				node_id: 't1'
			},
			{
				type: 'cron',
				config: { cron: '0 * * * *', target: 'none', max_targets: '5' },
				node_id: 't2'
			}
		]);
	});

	it('has no trigger for an untyped node', () => {
		expect(triggerOfNode({})).toBeNull();
		expect(triggerOfNode({ trigger_type: 'daily' })).toBeNull();
		expect(graphTriggers(graph)).toEqual([]);
	});
});

describe('workflowFromJson', () => {
	it('reads an exported document, its single trigger on the trigger node', () => {
		const doc = {
			format: 'iris-ai-workflow',
			format_version: 1,
			workflow: { name: 'Hunt', description: null, trigger_type: 'event', graph },
			requirements: { keystore: [], tools: [] }
		};
		const { form, graph: read_ } = read(JSON.stringify(doc));
		expect(form.name).toBe('Hunt');
		expect(form.description).toBe('');
		expect(read_.nodes[0].config).toEqual({
			trigger_type: 'event',
			hooks: [],
			condition: '',
			dedup_minutes: 10
		});
	});

	it('keeps what the JSON leaves out', () => {
		const { form } = read(JSON.stringify({ graph }));
		expect(form.name).toBe('Triage');
		expect(form.customer_scope).toEqual([2]);
		expect(form.max_runs_per_hour).toBe(60);
	});

	it('fills a partial trigger config with the defaults', () => {
		const { graph: read_ } = read(
			JSON.stringify({ trigger_type: 'event', trigger_config: { hooks: ['on_x'] }, graph })
		);
		expect(read_.nodes[0].config).toEqual({
			trigger_type: 'event',
			hooks: ['on_x'],
			condition: '',
			dedup_minutes: 10
		});
	});

	it('makes a trigger node of each older trigger', () => {
		const { graph: read_ } = read(
			JSON.stringify({
				triggers: [
					{ type: 'webhook', config: { require_signature: true } },
					{ type: 'workflow', config: {} }
				],
				graph
			})
		);
		expect(graphTriggers(read_).map((t) => [t.type, t.node_id])).toEqual([
			['webhook', 'trigger'],
			['workflow', 'n1']
		]);
		expect(read_.nodes[0].config.require_signature).toBe(true);
		expect(read_.edges).toContainEqual({
			id: 'e2',
			source: 'n1',
			target: 'notify',
			source_port: 'out'
		});
	});

	it('keeps the trigger nodes of a typed graph', () => {
		const { graph: read_ } = read(JSON.stringify({ trigger_type: 'manual', graph: typed }));
		expect(read_).toEqual(typed);
	});

	it('does not change the base form', () => {
		const start = base();
		workflowFromJson(JSON.stringify({ name: 'Other', customer_scope: [9], graph }), start);
		expect(start.name).toBe('Triage');
		expect(start.customer_scope).toEqual([2]);
	});

	it.each([
		['not json', 'Invalid JSON'],
		['[]', 'must be a JSON object'],
		[
			JSON.stringify({ format: 'iris-ai-workflow-block', block: {} }),
			'Expected a workflow document'
		],
		[JSON.stringify({ format: 'iris-ai-workflow' }), '"workflow" must be an object'],
		[JSON.stringify({ name: 3, graph }), '"name" must be a string'],
		[JSON.stringify({ trigger_type: 'daily', graph }), '"trigger_type" must be one of'],
		[
			JSON.stringify({ trigger_type: 'cron', trigger_config: [], graph }),
			'"trigger_config" must be an object'
		],
		[JSON.stringify({ triggers: [], graph }), '"triggers" must be a non-empty list'],
		[JSON.stringify({ triggers: [{ type: 'daily' }], graph }), 'A trigger "type" must be one of'],
		[JSON.stringify({ triggers: [{ type: 'cron', config: [] }], graph }), 'must be an object'],
		[JSON.stringify({ customer_scope: ['a'], graph }), '"customer_scope"'],
		[JSON.stringify({ write_tool_allowlist: [1], graph }), '"write_tool_allowlist"'],
		[JSON.stringify({ max_runs_per_hour: '5', graph }), '"max_runs_per_hour" must be a number'],
		[JSON.stringify({ suggestion_audience: 'all', graph }), '"suggestion_audience"'],
		[JSON.stringify({ is_active: 'yes', graph }), '"is_active"'],
		[JSON.stringify({ name: 'x' }), 'needs a "graph"'],
		[JSON.stringify({ graph: { nodes: [] } }), '"nodes" and "edges"'],
		[JSON.stringify({ graph: { nodes: [{ id: 1, type: 'x' }], edges: [] } }), 'string "id"'],
		[JSON.stringify({ graph: { nodes: [], edges: ['x'] } }), 'Every edge']
	])('rejects %s', (text, message) => {
		const result = workflowFromJson(text, base());
		expect('error' in result && result.error).toContain(message);
	});
});

describe('graphFromWorkflow', () => {
	const workflow = {
		name: 'W',
		description: null,
		is_active: true,
		triggers: [
			{ type: 'manual', config: { entity_types: ['case'] } },
			{ type: 'workflow', config: {} }
		],
		trigger_type: 'manual',
		trigger_config: { entity_types: ['case'] },
		customer_scope: [],
		write_tool_allowlist: [],
		max_runs_per_hour: 5,
		token_budget_per_run: 10,
		suggestion_audience: 'entity',
		owner_id: 1,
		graph
	} as unknown as AiWorkflow;

	it('puts the triggers of an older workflow on trigger nodes', () => {
		expect(graphTriggers(graphFromWorkflow(workflow))).toEqual([
			{ type: 'manual', config: { entity_types: ['case'] }, node_id: 'trigger' },
			{ type: 'workflow', config: {}, node_id: 'n1' }
		]);
		expect(formFromWorkflow(workflow).max_runs_per_hour).toBe(5);
	});

	it('keeps a typed graph', () => {
		expect(graphFromWorkflow({ ...workflow, graph: typed })).toBe(typed);
	});
});
