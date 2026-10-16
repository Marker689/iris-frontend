import type {
	AiNodeStats,
	AiSuggestionAudience,
	AiTriggerType,
	AiWorkflow,
	AiWorkflowBody,
	AiWorkflowCatalogue,
	AiWorkflowGraph,
	AiWorkflowTrigger
} from '$lib/services/ai-workflows.service';
import { aiWorkflowTriggers } from '$lib/services/ai-workflows.service';
import { upgradeTriggerNodes, type NodeMetaMap } from '$lib/utils/ai-workflow-graph';
import type { AiLiveNodeState } from './live';
import type { AiEditorPeer } from './presence';

/**
 * Editor top-bar state. The triggers are not here: each trigger node of
 * the graph carries its own (`config.trigger_type` and that type's keys).
 */
export interface WorkflowForm {
	name: string;
	description: string;
	is_active: boolean;
	customer_scope: number[];
	write_tool_allowlist: string[];
	max_runs_per_hour: number;
	token_budget_per_run: number;
	suggestion_audience: AiSuggestionAudience;
	owner_id: number | null;
}

export function defaultTriggerConfig(type: AiTriggerType): Record<string, unknown> {
	switch (type) {
		case 'event':
			return { hooks: [], condition: '', dedup_minutes: 10 };
		case 'cron':
			return { cron: '0 * * * *', target: 'none', max_targets: 50 };
		case 'manual':
			return { entity_types: [], menus: [], menu_label: '' };
		case 'webhook':
			return { require_signature: false, entity_type: null, entity_id_path: '' };
		case 'workflow':
			return {};
	}
}

export const TRIGGERS: AiTriggerType[] = ['event', 'cron', 'manual', 'webhook', 'workflow'];

/** Trigger types a workflow holds once at most. */
export const SINGLE_TRIGGERS: AiTriggerType[] = ['webhook', 'workflow'];

/** The trigger of a trigger node's config, or null when it has no valid type. */
export function triggerOfNode(
	config: Record<string, unknown> | null | undefined
): { type: AiTriggerType; config: Record<string, unknown> } | null {
	const type = config?.trigger_type as AiTriggerType | undefined;
	if (!config || !type || !TRIGGERS.includes(type)) return null;
	const rest = { ...config };
	delete rest.trigger_type;
	return { type, config: rest };
}

/** The trigger nodes of `graph`, in order, as the backend lists them. */
export function graphTriggers(graph: AiWorkflowGraph): AiWorkflowTrigger[] {
	const triggers: AiWorkflowTrigger[] = [];
	for (const node of graph.nodes) {
		if (node.type !== 'trigger') continue;
		const trigger = triggerOfNode(node.config);
		if (trigger) triggers.push({ ...trigger, node_id: node.id });
	}
	return triggers;
}

export function emptyWorkflowForm(): WorkflowForm {
	return {
		name: '',
		description: '',
		is_active: false,
		customer_scope: [],
		write_tool_allowlist: [],
		max_runs_per_hour: 60,
		token_budget_per_run: 50000,
		suggestion_audience: 'entity',
		owner_id: null
	};
}

export function formFromWorkflow(w: AiWorkflow): WorkflowForm {
	return {
		name: w.name,
		description: w.description ?? '',
		is_active: w.is_active,
		customer_scope: [...(w.customer_scope ?? [])],
		write_tool_allowlist: [...(w.write_tool_allowlist ?? [])],
		max_runs_per_hour: w.max_runs_per_hour,
		token_budget_per_run: w.token_budget_per_run,
		suggestion_audience: w.suggestion_audience,
		owner_id: w.owner_id ?? null
	};
}

/** The graph of a saved workflow, its triggers on the trigger nodes even when it predates them. */
export function graphFromWorkflow(w: AiWorkflow): AiWorkflowGraph {
	return upgradeTriggerNodes(w.graph, aiWorkflowTriggers(w));
}

/** Strips empty optional strings so the backend sees `null`, not `''`. */
export function cleanTriggerConfig(
	type: AiTriggerType,
	config: Record<string, unknown>
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...config };
	for (const key of ['condition', 'entity_id_path', 'entity_type']) {
		if (key in out && (out[key] === '' || out[key] === undefined)) out[key] = null;
	}
	if (type === 'event') out.dedup_minutes = Number(out.dedup_minutes ?? 0);
	if (type === 'cron') out.max_targets = Number(out.max_targets ?? 0);
	return out;
}

/** `graph` with the configs of its trigger nodes as the backend takes them. */
export function cleanGraphTriggers(graph: AiWorkflowGraph): AiWorkflowGraph {
	return {
		...graph,
		nodes: graph.nodes.map((node) => {
			const trigger = node.type === 'trigger' ? triggerOfNode(node.config) : null;
			return trigger
				? {
						...node,
						config: {
							trigger_type: trigger.type,
							...cleanTriggerConfig(trigger.type, trigger.config)
						}
					}
				: node;
		})
	};
}

export function bodyFromForm(
	form: WorkflowForm,
	graph: AiWorkflowGraph,
	opts: { includeOwner: boolean; versionNote?: string }
): AiWorkflowBody {
	const body: AiWorkflowBody = {
		name: form.name.trim(),
		description: form.description.trim() || null,
		is_active: form.is_active,
		customer_scope: [...form.customer_scope],
		graph: cleanGraphTriggers(graph),
		write_tool_allowlist: [...form.write_tool_allowlist],
		max_runs_per_hour: Number(form.max_runs_per_hour),
		token_budget_per_run: Number(form.token_budget_per_run),
		suggestion_audience: form.suggestion_audience
	};
	if (opts.includeOwner && form.owner_id) body.owner_id = form.owner_id;
	if (opts.versionNote?.trim()) body.version_note = opts.versionNote.trim();
	return body;
}

/** The workflow as edited in the JSON view: everything but the owner. */
export function workflowJson(form: WorkflowForm, graph: AiWorkflowGraph): string {
	return JSON.stringify(bodyFromForm(form, graph, { includeOwner: false }), null, 2);
}

const AUDIENCES: AiSuggestionAudience[] = ['entity', 'owner'];

const isObject = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Reads the JSON view back: a bare definition or an exported document
 * (`{format, workflow}`). A field left out keeps its value in `base`;
 * the backend validates the graph itself on save.
 */
export function workflowFromJson(
	text: string,
	base: WorkflowForm
): { form: WorkflowForm; graph: AiWorkflowGraph } | { error: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		return { error: `Invalid JSON: ${(e as Error).message}` };
	}
	if (!isObject(parsed)) return { error: 'The workflow must be a JSON object' };
	let doc = parsed;
	if ('format' in doc) {
		if (doc.format !== 'iris-ai-workflow')
			return { error: `Expected a workflow document, got the format "${String(doc.format)}"` };
		if (!isObject(doc.workflow)) return { error: '"workflow" must be an object' };
		doc = doc.workflow;
	}

	const form: WorkflowForm = JSON.parse(JSON.stringify(base));
	const has = (key: string) => key in doc && doc[key] !== undefined;
	if (has('name')) {
		if (typeof doc.name !== 'string') return { error: '"name" must be a string' };
		form.name = doc.name;
	}
	if (has('description')) {
		if (doc.description !== null && typeof doc.description !== 'string')
			return { error: '"description" must be a string or null' };
		form.description = doc.description ?? '';
	}
	if (has('is_active')) {
		if (typeof doc.is_active !== 'boolean') return { error: '"is_active" must be true or false' };
		form.is_active = doc.is_active;
	}
	// Older documents carry their triggers beside the graph: they go on its trigger nodes
	const legacy: AiWorkflowTrigger[] = [];
	if (has('triggers')) {
		const triggers = doc.triggers;
		if (!Array.isArray(triggers) || triggers.length === 0)
			return { error: '"triggers" must be a non-empty list of {type, config} objects' };
		for (const t of triggers) {
			if (!isObject(t)) return { error: 'Every trigger must be a {type, config} object' };
			if (!TRIGGERS.includes(t.type as AiTriggerType))
				return { error: `A trigger "type" must be one of ${TRIGGERS.join(', ')}` };
			const type = t.type as AiTriggerType;
			if (t.config !== undefined && t.config !== null && !isObject(t.config))
				return { error: `The "${type}" trigger config must be an object` };
			legacy.push({
				type,
				config: { ...defaultTriggerConfig(type), ...((t.config as Record<string, unknown>) ?? {}) }
			});
		}
	} else if (has('trigger_type')) {
		const type = doc.trigger_type as AiTriggerType;
		if (!TRIGGERS.includes(type))
			return { error: `"trigger_type" must be one of ${TRIGGERS.join(', ')}` };
		if (has('trigger_config') && !isObject(doc.trigger_config))
			return { error: '"trigger_config" must be an object' };
		legacy.push({
			type,
			config: {
				...defaultTriggerConfig(type),
				...((doc.trigger_config as Record<string, unknown> | undefined) ?? {})
			}
		});
	}
	if (has('customer_scope')) {
		const scope = doc.customer_scope;
		if (!Array.isArray(scope) || !scope.every((id) => Number.isInteger(id)))
			return { error: '"customer_scope" must be a list of customer ids' };
		form.customer_scope = [...scope];
	}
	if (has('write_tool_allowlist')) {
		const tools = doc.write_tool_allowlist;
		if (!Array.isArray(tools) || !tools.every((t) => typeof t === 'string'))
			return { error: '"write_tool_allowlist" must be a list of tool names' };
		form.write_tool_allowlist = [...tools];
	}
	for (const key of ['max_runs_per_hour', 'token_budget_per_run'] as const) {
		if (!has(key)) continue;
		if (typeof doc[key] !== 'number' || !Number.isFinite(doc[key]))
			return { error: `"${key}" must be a number` };
		form[key] = doc[key];
	}
	if (has('suggestion_audience')) {
		if (!AUDIENCES.includes(doc.suggestion_audience as AiSuggestionAudience))
			return { error: `"suggestion_audience" must be one of ${AUDIENCES.join(', ')}` };
		form.suggestion_audience = doc.suggestion_audience as AiSuggestionAudience;
	}

	if (!has('graph')) return { error: 'The workflow needs a "graph"' };
	const graph = doc.graph;
	if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
		return { error: '"graph" must be an object with "nodes" and "edges" lists' };
	if (
		!graph.nodes.every((n) => isObject(n) && typeof n.id === 'string' && typeof n.type === 'string')
	)
		return { error: 'Every node needs a string "id" and "type"' };
	if (!graph.edges.every((e) => isObject(e))) return { error: 'Every edge must be an object' };
	return { form, graph: upgradeTriggerNodes(graph as unknown as AiWorkflowGraph, legacy) };
}

/** Shared with the canvas node components through Svelte context. */
export interface WorkflowEditorCtx {
	readonly meta: NodeMetaMap;
	readonly errors: Record<string, string[]>;
	readonly catalogue: AiWorkflowCatalogue | null;
	/** Events each node processed, per node id (saved workflows only). */
	readonly stats: Record<string, AiNodeStats>;
	/** Where the latest run is, per node id, while it goes and shortly after. */
	readonly live: Record<string, AiLiveNodeState>;
	/** Node type per node id, for the template completion. */
	readonly nodeTypes: Record<string, string>;
	/** Null until the workflow is saved (no runs to learn paths from). */
	readonly workflowId: number | null;
	/** The workflow's default suggestion audience, which nodes may override. */
	readonly suggestionAudience: AiSuggestionAudience;
	/** The other editors configuring each node, per node id. */
	readonly editors: Record<string, AiEditorPeer[]>;
	/** The workflow cannot be changed here (notes are not resizable). */
	readonly readOnly?: boolean;
}

/** Set by the node config form for the template fields it renders. */
export interface TemplateFieldCtx {
	/** The node being edited: its own output is not offered. */
	readonly nodeId: string;
	/** An async HTTP request: `callback.*` exists. */
	readonly callback: boolean;
}
