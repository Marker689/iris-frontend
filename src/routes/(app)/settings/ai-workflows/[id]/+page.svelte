<!--
  AI workflow editor (`/settings/ai-workflows/new` creates one).

  Header: name, active, JSON view, validate / save / versions / runs /
  run / export / publish to the library. Left panel: the workflow
  settings (scope, audience, budgets, write allowlist, owner); the
  triggers are trigger nodes of the canvas, each configured on its own.
  Centre: the xyflow canvas with its palette and saved blocks; each node
  shows how many events it processed.
  Right drawer: the selected node's config, and its events (browse them
  one by one, replay one).

  Several people may have the editor open: their avatars show in the
  header and on the nodes they configure, a node someone else configures
  is read-only here, a save made elsewhere reloads a clean editor (or
  says so on an edited one), and a save over someone else's asks first.

  Canvas nodes / edges are raw arrays bound to xyflow; each node's
  label and config live in the deep-reactive `meta` map, shared with the
  node components through context. `flowToGraph` folds them back into
  the stored graph for validate / save.
-->
<script lang="ts">
	import { getContext, onDestroy, onMount, setContext, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import {
		ArrowLeftIcon,
		BookOpenIcon,
		BookUpIcon,
		BracesIcon,
		CheckCircle2Icon,
		CircleAlertIcon,
		DownloadIcon,
		HistoryIcon,
		ListIcon,
		LockIcon,
		PanelLeftIcon,
		PlayIcon,
		SaveIcon,
		ShieldCheckIcon,
		TriangleAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import { notifications } from '$lib/stores/notifications.store';
	import { CustomersService } from '$lib/services/customers.service';
	import { UsersService } from '$lib/services/users.service';
	import {
		AI_RUN_LIVE_EVENT,
		AI_RUN_UNWATCH,
		AI_RUN_WATCH,
		AiWorkflowsService,
		aiListData,
		type AiBlock,
		type AiBlockDefinition,
		type AiImportResult,
		type AiNodeStats,
		type AiRunDetail,
		type AiRunLiveEvent,
		type AiRunSummary,
		type AiValidateResult,
		type AiValidationError,
		type AiWorkflow,
		type AiWorkflowBody,
		type AiWorkflowCatalogue,
		type AiWorkflowSavedEvent
	} from '$lib/services/ai-workflows.service';
	import {
		applyDirection,
		reattachEdges,
		renameFlowNode,
		createFlowNode,
		DIRECTION_HANDLES,
		emptyGraph,
		flowDirection,
		flowToGraph,
		graphToFlow,
		groupErrors,
		insertBlock,
		labelFor,
		selectionToBlock,
		readHandles,
		type FlowDirection,
		type FlowEdge,
		type FlowNode,
		type NodeMetaMap
	} from '$lib/utils/ai-workflow-graph';
	import FeatureGate from '../components/FeatureGate.svelte';
	import WorkflowCanvas from '../components/WorkflowCanvas.svelte';
	import NodeConfigForm from '../components/NodeConfigForm.svelte';
	import TriggerConfigForm from '../components/TriggerConfigForm.svelte';
	import MultiSelect, { type MultiSelectItem } from '../components/MultiSelect.svelte';
	import RunDialog from '../components/RunDialog.svelte';
	import PublishDialog from '../components/PublishDialog.svelte';
	import VersionsDialog from '../components/VersionsDialog.svelte';
	import NodeEventsPanel from '../components/NodeEventsPanel.svelte';
	import NodeTestPanel from '../components/NodeTestPanel.svelte';
	import AuthoringGuideDialog from '../components/AuthoringGuideDialog.svelte';
	import WorkflowJsonDialog from '../components/WorkflowJsonDialog.svelte';
	import PanelResizer from '../components/PanelResizer.svelte';
	import {
		bodyFromForm,
		emptyWorkflowForm,
		formFromWorkflow,
		graphFromWorkflow,
		graphTriggers,
		triggerOfNode,
		workflowFromJson,
		workflowJson,
		type WorkflowEditorCtx,
		type WorkflowForm
	} from '../helpers/editor';
	import { aiLiveFromRun, aiLiveIsActive, aiLiveReduce, type AiLiveRun } from '../helpers/live';
	import {
		CLASSIFICATION_TONES,
		describeApiError,
		describeWarnings,
		downloadJson,
		exportFilename,
		LABEL_CLASS,
		blockReview,
		definitionReview,
		keyReferences,
		pickJsonFile,
		SELECT_CLASS,
		TEXTAREA_CLASS,
		workflowErrorsFrom,
		SUGGESTION_AUDIENCE_LABELS,
		WORKFLOW_EDITOR_CTX
	} from '../helpers/ui';
	import {
		clipboardDecode,
		clipboardEncode,
		clipboardIsOwn,
		clipboardRemember,
		PASTE_OFFSET
	} from '../helpers/clipboard';
	import { EditorPresence } from '../helpers/presence.svelte';
	import { presenceInitials } from '../helpers/presence';

	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('ai_workflows_write') ?? false);
	const isAdmin = $derived(userCtx?.can('server_administrator') ?? false);
	const readOnly = $derived(!canWrite);

	const routeId = $derived(page.params.id ?? 'new');
	const isNew = $derived(routeId === 'new');

	let workflow = $state<AiWorkflow | null>(null);
	let catalogue = $state<AiWorkflowCatalogue | null>(null);
	let form = $state<WorkflowForm>(emptyWorkflowForm());
	let nodes = $state.raw<FlowNode[]>([]);
	let edges = $state.raw<FlowEdge[]>([]);
	let meta = $state<NodeMetaMap>({});
	let errorsByNode = $state<Record<string, string[]>>({});
	let globalErrors = $state<string[]>([]);
	let validated = $state<boolean | null>(null);
	let selectedId = $state<string | null>(null);

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let loadedId: string | null = null;
	let savedSnapshot = $state('');
	let saving = $state(false);
	let validating = $state(false);
	let settingsOpen = $state(true);
	let versionsOpen = $state(false);
	let runOpen = $state(false);
	let publishOpen = $state(false);
	let guideOpen = $state(false);
	let jsonOpen = $state(false);
	let drawerTab = $state<'config' | 'events' | 'test'>('config');
	const SETTINGS_WIDTH = 320;
	const DRAWER_WIDTH = 384;
	let settingsWidth = $state(SETTINGS_WIDTH);
	let drawerWidth = $state(DRAWER_WIDTH);

	/** Why a node cannot be tested on its own (it parks or starts the run). */
	function testBlocked(type: string, config: Record<string, unknown>): string | null {
		if (type === 'trigger') return 'A trigger is tested by running the workflow.';
		if (type === 'ask_analyst' || (type === 'http_request' && config.mode === 'async'))
			return 'A node that waits for an answer is tested by running the workflow.';
		if (type === 'delay' && Number(config.minutes ?? 5) > 0)
			return 'A delay that waits is tested by running the workflow.';
		return null;
	}
	let stats = $state<Record<string, AiNodeStats>>({});
	let live = $state<AiLiveRun | null>(null);

	let blocks = $state<AiBlock[]>([]);
	let blockDialogOpen = $state(false);
	let blockDraft = $state<{
		definition: AiBlockDefinition;
		name: string;
		description: string;
		category: string;
		is_shared: boolean;
	} | null>(null);
	let savingBlock = $state(false);

	// ---- Other editors
	/** This tab, in its saves: their broadcast is not news to it. */
	const EDITOR_CLIENT_ID =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	let presence = $state<EditorPresence | null>(null);
	/** Saved elsewhere while this editor had changes. */
	let remoteSave = $state<AiWorkflowSavedEvent | null>(null);
	let remoteDeleted = $state<AiWorkflowSavedEvent | null>(null);
	/** A save refused because the workflow changed since it was loaded. */
	let conflict = $state<{ revision: string | null; version: number | null } | null>(null);
	let conflictOpen = $state(false);

	let customerItems = $state<MultiSelectItem[]>([]);
	let ownerOptions = $state<{ id: number; label: string }[]>([]);

	const ctx: WorkflowEditorCtx = {
		get meta() {
			return meta;
		},
		get errors() {
			return errorsByNode;
		},
		get catalogue() {
			return catalogue;
		},
		get stats() {
			return stats;
		},
		get live() {
			return live?.nodes ?? {};
		},
		get nodeTypes() {
			return nodeTypes;
		},
		get workflowId() {
			return workflow?.id ?? null;
		},
		get suggestionAudience() {
			return form.suggestion_audience;
		},
		get editors() {
			return presence?.byNode ?? {};
		}
	};
	setContext(WORKFLOW_EDITOR_CTX, ctx);

	const nodeTypes = $derived(Object.fromEntries(nodes.map((n) => [n.id, n.data.nodeType])));

	const snapshot = $derived(
		JSON.stringify(bodyFromForm(form, flowToGraph(nodes, edges, meta), { includeOwner: true }))
	);
	const dirty = $derived(!loading && !loadError && snapshot !== savedSnapshot);

	const writeTools = $derived(
		(catalogue?.tools ?? [])
			.filter((t) => t.classification === 'write')
			.map((t) => ({
				value: t.name,
				label: t.name,
				description: t.description,
				badge: 'write',
				badgeClass: CLASSIFICATION_TONES.write
			}))
	);

	const selectedType = $derived(
		selectedId ? (nodes.find((n) => n.id === selectedId)?.data.nodeType ?? null) : null
	);
	const triggerIds = $derived(nodes.filter((n) => n.data.nodeType === 'trigger').map((n) => n.id));
	/** Trigger types of the trigger nodes other than the selected one. */
	const otherTriggerTypes = $derived(
		triggerIds
			.filter((id) => id !== selectedId)
			.map((id) => triggerOfNode(meta[id]?.config)?.type)
			.filter((t) => t !== undefined)
	);

	const otherNodes = $derived(
		nodes
			.filter((n) => n.id !== selectedId && n.data.nodeType !== 'trigger')
			.map((n) => ({
				id: n.id,
				label: meta[n.id]?.label || labelFor(n.data.nodeType, catalogue?.node_types)
			}))
	);
	const direction = $derived(flowDirection(meta));
	const errorCount = $derived(
		Object.values(errorsByNode).reduce((sum, list) => sum + list.length, 0) + globalErrors.length
	);

	function loadGraph(graph: AiWorkflow['graph'] | null | undefined) {
		const flow = graphToFlow(graph && graph.nodes?.length ? graph : emptyGraph());
		meta = flow.meta;
		nodes = flow.nodes;
		edges = flow.edges;
	}

	function applyErrors(list: AiValidationError[]) {
		const grouped = groupErrors(list);
		errorsByNode = grouped.byNode;
		globalErrors = grouped.global;
	}

	async function load(id: string) {
		loadedId = id;
		loading = true;
		loadError = null;
		selectedId = null;
		applyErrors([]);
		validated = null;
		remoteSave = null;
		remoteDeleted = null;
		conflict = null;
		const [cat, wf] = await Promise.all([
			AiWorkflowsService.catalogue(),
			id === 'new' ? Promise.resolve(null) : AiWorkflowsService.get(Number(id))
		]);
		if (cat.ok) catalogue = cat.data as AiWorkflowCatalogue;
		if (wf && !wf.ok) {
			loading = false;
			loadError =
				wf.status === 404
					? 'Workflow not found'
					: describeApiError(wf.data, wf.error?.message ?? 'Failed to load the workflow');
			return;
		}
		if (wf) {
			workflow = wf.data as AiWorkflow;
			form = formFromWorkflow(workflow);
			loadGraph(graphFromWorkflow(workflow));
		} else {
			workflow = null;
			form = emptyWorkflowForm();
			loadGraph(emptyGraph());
		}
		stats = {};
		loading = false;
		savedSnapshot = snapshot;
		loadStats();
	}

	async function loadStats() {
		if (!workflow) return;
		const res = await AiWorkflowsService.nodeStats(workflow.id);
		if (res.ok && res.data && typeof res.data === 'object') stats = res.data.nodes ?? {};
	}

	async function loadBlocks() {
		const res = await AiWorkflowsService.blocks();
		if (res.ok && Array.isArray(res.data)) blocks = res.data;
	}

	async function loadLookups() {
		const customers = await CustomersService.list();
		if (customers.ok && Array.isArray(customers.data)) {
			customerItems = customers.data.map((c) => ({
				value: String(c.customer_id),
				label: c.customer_name
			}));
		}
		if (isAdmin) {
			const users = await UsersService.list();
			if (users.ok && users.data && typeof users.data === 'object') {
				ownerOptions = (users.data.data ?? [])
					.filter((u) => u.user_active)
					.map((u) => ({ id: u.user_id, label: `${u.user_name} (${u.user_login})` }));
			}
		}
	}

	$effect(() => {
		const id = routeId;
		if (!runtimeConfig.aiWorkflowsEnabled || !userCtx?.ready) return;
		if (id !== loadedId) load(id);
	});

	onMount(() => {
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	$effect(() => {
		if (userCtx?.ready && runtimeConfig.aiWorkflowsEnabled) {
			loadLookups();
			if (canWrite) loadBlocks();
		}
	});

	beforeNavigate(({ cancel, to }) => {
		if (!dirty) return;
		// Same workflow (e.g. the id swap after the first save) is not a leave.
		if (to?.url.pathname === page.url.pathname) return;
		if (!confirm('Discard the unsaved changes to this workflow?')) cancel();
	});

	function addNode(type: string, position: { x: number; y: number }) {
		if (readOnly) return;
		const created = createFlowNode(type, position, nodes, catalogue?.node_types);
		// A new node follows the way the graph already reads
		const handles = readHandles(DIRECTION_HANDLES[direction]);
		if (handles) created.meta.handles = handles;
		meta[created.node.id] = created.meta;
		nodes = [...nodes, created.node];
		selectedId = created.node.id;
	}

	/** Connectors of the selected nodes, or of every node, left → right or top → bottom. */
	function setDirection(next: FlowDirection) {
		if (readOnly) return;
		const selected = nodes.filter((n) => n.selected).map((n) => n.id);
		const ids = selected.length ? selected : undefined;
		const graph = flowToGraph(nodes, edges, meta);
		applyDirection(meta, next, ids);
		// Links of the re-oriented nodes follow their new sides, even pinned ones.
		edges = reattachEdges(graph, meta, ids);
	}

	/** New id for node `from`: links and `nodes.<id>` references follow. */
	function renameNode(from: string, to: string) {
		if (readOnly || from === to) return;
		const renamed = renameFlowNode(nodes, edges, meta, from, to);
		meta = renamed.meta;
		nodes = renamed.nodes;
		edges = renamed.edges;
		if (Object.hasOwn(errorsByNode, from)) {
			errorsByNode[to] = errorsByNode[from];
			delete errorsByNode[from];
		}
		if (selectedId === from) selectedId = to;
	}

	function removeNodes(ids: string[]) {
		if (!ids.length) return;
		const gone = new Set(ids);
		nodes = nodes.filter((n) => !gone.has(n.id));
		edges = edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
		for (const id of ids) {
			delete meta[id];
			delete errorsByNode[id];
		}
		if (selectedId && gone.has(selectedId)) selectedId = null;
	}

	function deleteSelected() {
		const id = selectedId;
		// A workflow keeps at least one trigger
		if (!id || (selectedType === 'trigger' && triggerIds.length < 2)) return;
		removeNodes([id]);
	}

	/**
	 * Adds nodes (a saved block, pasted or duplicated nodes) with their top-left
	 * corner at `position`: what someone else wrote is reviewed first (`review`,
	 * asked as `question`), clashing ids are renamed, and the added nodes come
	 * selected, to move them together.
	 */
	function addDefinition(
		definition: AiBlockDefinition,
		position: { x: number; y: number },
		opts: { title: string; review?: string[]; question?: string; keys?: string[]; hint?: string }
	): boolean {
		if (readOnly) return false;
		const review = opts.review ?? [];
		if (review.length && !confirm(`${opts.question}\n\n${review.join('\n')}`)) return false;
		const inserted = insertBlock(definition, position, nodes, edges);
		if (!inserted.nodes.length) {
			toast({ title: 'Nothing to add: triggers are never copied', variant: 'warning' });
			return false;
		}
		for (const [id, m] of Object.entries(inserted.meta)) meta[id] = m;
		nodes = [
			...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
			...inserted.nodes.map((n) => ({ ...n, selected: true }))
		];
		edges = [...edges, ...inserted.edges];
		selectedId = null;
		const renamed = Object.entries(inserted.renames).filter(([from, to]) => from !== to);
		const keys = opts.keys ?? [];
		toast({
			title: opts.title,
			description: [
				renamed.length
					? `Renamed to avoid clashes: ${renamed.map(([from, to]) => `${from} → ${to}`).join(', ')}`
					: '',
				keys.length ? `Needs keystore entries: ${keys.join(', ')}` : '',
				opts.hint ?? ''
			]
				.filter(Boolean)
				.join(' · '),
			variant: 'success'
		});
		return true;
	}

	function insertSavedBlock(block: AiBlock, position: { x: number; y: number }) {
		addDefinition(block.definition, position, {
			title: `Block “${block.name}” added`,
			// Someone else's shared block: say what it does before it joins the workflow
			review: block.can_edit ? [] : blockReview(block),
			question: `Insert “${block.name}” by ${block.owner?.name ?? 'another user'}?`,
			keys: block.requirements?.keystore ?? [],
			hint: 'Connect it to the rest of the workflow.'
		});
	}

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	/** The selected nodes, triggers aside (a workflow has its own). */
	function selectedNodeIds(): string[] {
		return nodes.filter((n) => n.selected && n.data.nodeType !== 'trigger').map((n) => n.id);
	}

	/** Clipboard text of the selected nodes, remembered as this browser's. */
	function copySelection(): string | null {
		const ids = selectedNodeIds();
		if (!ids.length) return null;
		const text = clipboardEncode(selectionToBlock(nodes, edges, meta, ids));
		clipboardRemember(text);
		return text;
	}

	function cutSelection() {
		if (readOnly) return;
		const ids = selectedNodeIds();
		// A node someone else configures stays
		const locked = ids.filter((id) => presence?.lockHolder(id));
		removeNodes(ids.filter((id) => !locked.includes(id)));
		if (locked.length) {
			toast({
				title: `${plural(locked.length, 'node')} kept`,
				description: `Someone else is configuring ${locked.join(', ')}.`,
				variant: 'warning'
			});
		}
	}

	function pasteNodes(text: string, position: { x: number; y: number }) {
		const definition = clipboardDecode(text);
		if (!definition) return;
		const count = definition.nodes.filter((n) => n.type !== 'trigger').length;
		// Copied elsewhere (another browser, a chat, a file): reviewed like someone else's block
		const own = clipboardIsOwn(text);
		addDefinition(definition, position, {
			title: `${plural(count, 'node')} pasted`,
			review: own ? [] : definitionReview(definition),
			question: `Paste ${plural(count, 'node')} copied outside this browser?`,
			keys: own ? [] : keyReferences(definition.nodes)
		});
	}

	function duplicateSelection() {
		const ids = selectedNodeIds();
		if (readOnly || !ids.length) return;
		const picked = nodes.filter((n) => ids.includes(n.id));
		addDefinition(
			selectionToBlock(nodes, edges, meta, ids),
			{
				x: Math.min(...picked.map((n) => n.position.x)) + PASTE_OFFSET,
				y: Math.min(...picked.map((n) => n.position.y)) + PASTE_OFFSET
			},
			{ title: `${plural(ids.length, 'node')} duplicated` }
		);
	}

	function startSaveSelection() {
		const ids = selectedNodeIds();
		if (!ids.length) {
			toast({ title: 'Select the nodes to save first', variant: 'warning' });
			return;
		}
		blockDraft = {
			definition: selectionToBlock(nodes, edges, meta, ids),
			name: ids.length === 1 ? (meta[ids[0]]?.label ?? '') : '',
			description: '',
			category: '',
			is_shared: false
		};
		blockDialogOpen = true;
	}

	async function saveBlock() {
		if (!blockDraft) return;
		if (!blockDraft.name.trim()) {
			toast({ title: 'The block needs a name', variant: 'destructive' });
			return;
		}
		savingBlock = true;
		const res = await AiWorkflowsService.createBlock({
			name: blockDraft.name.trim(),
			description: blockDraft.description.trim() || null,
			category: blockDraft.category.trim() || null,
			is_shared: blockDraft.is_shared,
			definition: blockDraft.definition
		});
		savingBlock = false;
		if (!res.ok) {
			toast({
				title: 'The block was not saved',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		blockDialogOpen = false;
		blockDraft = null;
		toast({ title: `Block “${(res.data as AiBlock).name}” saved`, variant: 'success' });
		loadBlocks();
	}

	async function importBlock() {
		let picked;
		try {
			picked = await pickJsonFile();
		} catch (e) {
			toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
			return;
		}
		if (!picked) return;
		const res = await AiWorkflowsService.importBlock(picked.data);
		if (!res.ok) {
			toast({
				title: 'Import failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const result = res.data as AiImportResult<AiBlock>;
		const warnings = describeWarnings(result.warnings);
		toast({
			title: `Block “${result.block?.name ?? picked.name}” imported`,
			description: warnings || undefined,
			variant: warnings ? 'warning' : 'success'
		});
		loadBlocks();
	}

	async function exportBlock(block: AiBlock) {
		const res = await AiWorkflowsService.exportBlock(block.id);
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		downloadJson(exportFilename(block.name, 'block'), res.data);
	}

	async function deleteBlock(block: AiBlock) {
		if (!confirm(`Delete the block “${block.name}”? Workflows that use it keep their copy.`))
			return;
		const res = await AiWorkflowsService.removeBlock(block.id);
		if (!res.ok) {
			toast({
				title: 'Delete failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		blocks = blocks.filter((b) => b.id !== block.id);
	}

	async function exportWorkflow() {
		if (!workflow) return;
		const res = await AiWorkflowsService.exportWorkflow(workflow.id);
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		downloadJson(exportFilename(workflow.name, 'workflow'), res.data);
		if (dirty) {
			toast({
				title: 'Exported the saved version',
				description: 'Unsaved changes are not in the file.',
				variant: 'warning'
			});
		}
	}

	function currentGraph() {
		return flowToGraph(nodes, edges, meta);
	}

	/** The JSON view replaces the settings and the canvas; saving stores them. */
	function applyJson(text: string): string | null {
		const read = workflowFromJson(text, form);
		if ('error' in read) return read.error;
		form = read.form;
		loadGraph(read.graph);
		selectedId = null;
		applyErrors([]);
		validated = null;
		toast({
			title: 'JSON applied',
			description: isNew ? 'Create the workflow to keep it.' : 'Save the workflow to keep it.',
			variant: 'success'
		});
		return null;
	}

	async function validate(): Promise<boolean> {
		validating = true;
		const res = await AiWorkflowsService.validate({
			graph: bodyFromForm(form, currentGraph(), { includeOwner: false }).graph,
			write_tool_allowlist: [...form.write_tool_allowlist]
		});
		validating = false;
		if (!res.ok) {
			toast({
				title: 'Validation failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return false;
		}
		const result = res.data as AiValidateResult;
		applyErrors(result.errors ?? []);
		validated = result.valid;
		toast(
			result.valid
				? { title: 'The workflow is valid', variant: 'success' }
				: {
						title: `${result.errors.length} problem${result.errors.length === 1 ? '' : 's'} found`,
						description: 'Nodes with problems are flagged on the canvas.',
						variant: 'warning'
					}
		);
		return result.valid;
	}

	/**
	 * Creates or saves the workflow. A save names the revision it started
	 * from and is refused when someone else saved since; `overwrite` is the
	 * revision to replace anyway.
	 */
	async function save(overwrite?: string | null) {
		if (!form.name.trim()) {
			toast({ title: 'The workflow needs a name', variant: 'destructive' });
			return;
		}
		saving = true;
		const body: AiWorkflowBody = bodyFromForm(form, currentGraph(), { includeOwner: isAdmin });
		if (!isNew && workflow) {
			body.editor_client_id = EDITOR_CLIENT_ID;
			const expected = overwrite === undefined ? workflow.revision : overwrite;
			if (expected) body.expected_revision = expected;
		}
		const res =
			isNew || !workflow
				? await AiWorkflowsService.create(body)
				: await AiWorkflowsService.update(workflow.id, body);
		saving = false;
		if (!res.ok && res.status === 409) {
			const current = (res.data as { data?: { revision?: string; version?: number } } | null)?.data;
			conflict = { revision: current?.revision ?? null, version: current?.version ?? null };
			conflictOpen = true;
			return;
		}
		if (!res.ok) {
			const structured = workflowErrorsFrom(res.data);
			if (structured.length) {
				applyErrors(structured);
				validated = false;
				toast({
					title: 'The workflow is invalid',
					description: `${structured.length} problem${structured.length === 1 ? '' : 's'}: see the flagged nodes.`,
					variant: 'destructive'
				});
			} else {
				toast({
					title: 'Save failed',
					description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
					variant: 'destructive'
				});
			}
			return;
		}
		const wasNew = isNew;
		workflow = res.data as AiWorkflow;
		form.owner_id = workflow.owner_id ?? form.owner_id;
		applyErrors([]);
		validated = true;
		savedSnapshot = snapshot;
		remoteSave = null;
		conflict = null;
		conflictOpen = false;
		toast({
			title: wasNew ? 'Workflow created' : 'Workflow saved',
			description: `${workflow.name} · v${workflow.version}`,
			variant: 'success'
		});
		if (wasNew) {
			loadedId = String(workflow.id);
			goto(`/settings/ai-workflows/${workflow.id}`, { replaceState: true });
		}
	}

	// ---- Live progress: the latest run of this workflow, node by node.
	// Pushed over the socket (owner / admin); polled as a fallback.
	const LIVE_POLL_MS = 3000;
	const IDLE_POLL_MS = 15000;
	const LIVE_FADE_MS = 10000;
	let liveTimer: ReturnType<typeof setTimeout> | null = null;
	let fadeTimer: ReturnType<typeof setTimeout> | null = null;
	let liveOff: (() => void) | null = null;

	function applyLive(next: AiLiveRun | null) {
		const before = live;
		if (next === before) return;
		live = next;
		if (fadeTimer) clearTimeout(fadeTimer);
		fadeTimer = null;
		if (!next || aiLiveIsActive(next.status)) return;
		// Just over: the event counts moved, and the highlight fades
		if (!before || before.runUuid !== next.runUuid || aiLiveIsActive(before.status)) loadStats();
		const uuid = next.runUuid;
		fadeTimer = setTimeout(() => {
			if (live?.runUuid === uuid && !aiLiveIsActive(live.status)) live = null;
		}, LIVE_FADE_MS);
	}

	function schedulePoll(workflowId: number, ms: number) {
		if (liveTimer) clearTimeout(liveTimer);
		liveTimer = setTimeout(() => pollLive(workflowId), ms);
	}

	async function pollLive(workflowId: number) {
		liveTimer = null;
		const current = () => liveWorkflowId === workflowId && liveOff !== null;
		if (!document.hidden) {
			if (live && aiLiveIsActive(live.status)) {
				const uuid = live.runUuid;
				const res = await AiWorkflowsService.getRun(uuid);
				// A push may have moved on meanwhile: only the same, still active run is replaced
				if (res.ok && current() && live?.runUuid === uuid && aiLiveIsActive(live.status)) {
					applyLive(aiLiveFromRun(res.data as AiRunDetail));
				}
			} else {
				const res = await AiWorkflowsService.runs({
					workflow_id: workflowId,
					status: 'running',
					per_page: 1
				});
				const found = res.ok ? aiListData<AiRunSummary>(res.data)[0] : undefined;
				if (found && current() && found.uuid !== live?.runUuid) {
					const detail = await AiWorkflowsService.getRun(found.uuid);
					if (detail.ok && current()) applyLive(aiLiveFromRun(detail.data as AiRunDetail));
				}
			}
		}
		if (!current() || liveTimer) return;
		schedulePoll(workflowId, live && aiLiveIsActive(live.status) ? LIVE_POLL_MS : IDLE_POLL_MS);
	}

	function stopLive() {
		liveOff?.();
		liveOff = null;
		if (liveTimer) clearTimeout(liveTimer);
		if (fadeTimer) clearTimeout(fadeTimer);
		liveTimer = null;
		fadeTimer = null;
		live = null;
	}

	function startLive(workflowId: number) {
		stopLive();
		const offEvent = notifications.onSocketEvent<AiRunLiveEvent>(AI_RUN_LIVE_EVENT, (event) => {
			if (event?.workflow_id !== workflowId || liveWorkflowId !== workflowId) return;
			const wasActive = aiLiveIsActive(live?.status);
			applyLive(aiLiveReduce(live, event));
			if (!wasActive && aiLiveIsActive(live?.status)) schedulePoll(workflowId, LIVE_POLL_MS);
		});
		const offRoom = notifications.watchRoom(AI_RUN_WATCH, AI_RUN_UNWATCH, {
			workflow_id: workflowId
		});
		liveOff = () => {
			offEvent();
			offRoom();
		};
		pollLive(workflowId);
	}

	const liveWorkflowId = $derived(workflow?.id ?? null);
	$effect(() => {
		const id = liveWorkflowId;
		untrack(() => (id ? startLive(id) : stopLive()));
	});
	onDestroy(stopLive);

	// ---- The other editors of this workflow (saved workflows only)
	$effect(() => {
		const id = liveWorkflowId;
		untrack(() => {
			presence?.stop();
			presence = id ? new EditorPresence(id, onSavedElsewhere) : null;
			presence?.start();
		});
	});
	onDestroy(() => presence?.stop());

	// The node configured here; a read-only viewer never holds one
	$effect(() => {
		const nodeId = readOnly ? null : selectedId;
		const current = presence;
		untrack(() => current?.focus(nodeId));
	});

	/** Who else configures the selected node, first: it is read-only here. */
	const nodeLock = $derived(presence && selectedId ? presence.lockHolder(selectedId) : null);
	const editorUsers = $derived(presence?.users ?? []);
	const MAX_AVATARS = 5;

	const peerName = (event: { user_name?: string | null; user_id?: number } | null) =>
		event?.user_name || (event?.user_id ? `User #${event.user_id}` : 'Someone');

	function onSavedElsewhere(event: AiWorkflowSavedEvent) {
		// This tab's own save
		if (event.editor_client_id && event.editor_client_id === EDITOR_CLIENT_ID) return;
		if (event.deleted) {
			remoteDeleted = event;
			remoteSave = null;
			return;
		}
		if (!workflow || (event.revision && event.revision === workflow.revision)) return;
		if (dirty || saving) remoteSave = event;
		else reloadWorkflow(event);
	}

	/**
	 * The saved workflow, in place of what the editor shows (its changes are
	 * dropped). After `event`, a save elsewhere: an editor changed meanwhile
	 * is left alone, with the banner.
	 */
	async function reloadWorkflow(event: AiWorkflowSavedEvent | null) {
		if (!workflow) return;
		const id = workflow.id;
		const res = await AiWorkflowsService.get(id);
		if (workflow?.id !== id) return;
		if (!res.ok) {
			toast({
				title: 'Reload failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		if (event && dirty) {
			remoteSave = event;
			return;
		}
		workflow = res.data as AiWorkflow;
		form = formFromWorkflow(workflow);
		loadGraph(graphFromWorkflow(workflow));
		if (selectedId && !meta[selectedId]) selectedId = null;
		applyErrors([]);
		validated = null;
		remoteSave = null;
		conflict = null;
		conflictOpen = false;
		savedSnapshot = snapshot;
		loadStats();
		if (event) {
			toast({
				title: `${peerName(event)} saved v${workflow.version}`,
				description: 'The editor shows their version.'
			});
		}
	}

	function onRunStarted(run: AiRunSummary) {
		// Stay on the canvas and follow it there
		applyLive(
			aiLiveReduce(live, {
				run_uuid: run.uuid,
				workflow_id: run.workflow_id,
				status: run.status,
				waiting_node_id: run.waiting_node_id,
				step: null
			})
		);
		if (workflow) schedulePoll(workflow.id, LIVE_POLL_MS);
		toast({
			title: 'Run started',
			description: 'Its progress shows on the canvas.',
			variant: 'success',
			link: { href: `/settings/ai-workflows/runs/${run.uuid}`, label: 'Open the run' }
		});
	}

	/** The saved workflow's triggers: a run starts at one of them. */
	const savedTriggers = $derived(workflow ? graphTriggers(graphFromWorkflow(workflow)) : []);
</script>

<svelte:head>
	<title>{isNew ? 'New workflow' : (workflow?.name ?? 'Workflow')}</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden" data-testid="wf-editor">
	<header class="flex flex-wrap items-center gap-2 border-b px-3 py-2">
		<Button
			variant="ghost"
			size="icon"
			class="h-7 w-7"
			href="/settings/ai-workflows"
			title="Back to the workflows"
		>
			<ArrowLeftIcon size={14} />
		</Button>
		<Input
			class="h-8 w-72 text-sm font-semibold"
			placeholder="Workflow name"
			disabled={readOnly || loading}
			bind:value={form.name}
			data-testid="wf-name"
		/>
		{#if workflow}
			<span class="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs">v{workflow.version}</span>
		{/if}
		{#if dirty}
			<span class="text-2xs text-amber-600" data-testid="wf-dirty">Unsaved changes</span>
		{/if}
		{#if editorUsers.length}
			<div class="flex items-center -space-x-1.5" data-testid="wf-editors">
				{#each editorUsers.slice(0, MAX_AVATARS) as peer (peer.userId)}
					<span
						class="flex size-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold text-white"
						style={`background-color: ${peer.color}`}
						title={`${peer.name}: ${peer.nodeId ? `configuring ${meta[peer.nodeId]?.label || peer.nodeId}` : 'viewing'}`}
					>
						{presenceInitials(peer.name)}
					</span>
				{/each}
				{#if editorUsers.length > MAX_AVATARS}
					<span
						class="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold"
						title={editorUsers
							.slice(MAX_AVATARS)
							.map((p) => p.name)
							.join(', ')}
					>
						+{editorUsers.length - MAX_AVATARS}
					</span>
				{/if}
			</div>
		{/if}
		<label class="ml-2 flex items-center gap-1.5 text-xs">
			<Switch
				checked={form.is_active}
				disabled={readOnly || loading}
				onCheckedChange={(v: boolean) => (form.is_active = v)}
				data-testid="wf-active"
			/>
			Active
		</label>

		<div class="ml-auto flex flex-wrap items-center gap-1.5">
			<Button
				variant="ghost"
				size="sm"
				class="h-7"
				onclick={() => (settingsOpen = !settingsOpen)}
				title="Workflow settings"
			>
				<PanelLeftIcon size={12} class="mr-1" /> Settings
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="h-7"
				onclick={() => (guideOpen = true)}
				title="How to write workflows as JSON (for people and LLMs)"
			>
				<BookOpenIcon size={12} class="mr-1" /> JSON guide
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="h-7"
				onclick={() => (jsonOpen = true)}
				disabled={loading || !!loadError}
				title={readOnly ? 'Show the workflow as JSON' : 'Edit the workflow as JSON'}
				data-testid="wf-json"
			>
				<BracesIcon size={12} class="mr-1" /> JSON
			</Button>
			{#if workflow}
				<Button
					variant="outline"
					size="sm"
					class="h-7"
					onclick={exportWorkflow}
					title="Download as JSON: keystore references are kept, secrets are never exported"
					data-testid="wf-export"
				>
					<DownloadIcon size={12} class="mr-1" /> Export
				</Button>
				{#if canWrite}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						onclick={() => (publishOpen = true)}
						title="Publish the saved version to the library, for every user to add a copy"
						data-testid="wf-publish"
					>
						<BookUpIcon size={12} class="mr-1" /> Publish
					</Button>
				{/if}
				<Button variant="outline" size="sm" class="h-7" onclick={() => (versionsOpen = true)}>
					<HistoryIcon size={12} class="mr-1" /> Versions
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-7"
					href={`/settings/ai-workflows/runs?workflow_id=${workflow.id}`}
				>
					<ListIcon size={12} class="mr-1" /> Runs
				</Button>
				{#if canWrite}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						onclick={() => (runOpen = true)}
						data-testid="wf-run"
					>
						<PlayIcon size={12} class="mr-1" /> Run
					</Button>
				{/if}
			{/if}
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={validate}
				disabled={validating || loading}
				data-testid="wf-validate"
			>
				{#if validated === true && errorCount === 0}
					<CheckCircle2Icon size={12} class="mr-1 text-green-600" />
				{:else if errorCount > 0}
					<CircleAlertIcon size={12} class="mr-1 text-destructive" />
				{:else}
					<ShieldCheckIcon size={12} class="mr-1" />
				{/if}
				{validating ? 'Validating…' : 'Validate'}
			</Button>
			{#if canWrite}
				<Button
					size="sm"
					class="h-7"
					onclick={() => save()}
					disabled={saving || loading || !!remoteDeleted || (!dirty && !isNew)}
					data-testid="wf-save"
				>
					<SaveIcon size={12} class="mr-1" />
					{saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
				</Button>
			{/if}
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col">
		<FeatureGate>
			{#if loadError}
				<div class="p-5"><ApiError error={loadError} onRetry={() => load(routeId)} /></div>
			{:else if loading}
				<p class="p-6 text-xs text-muted-foreground">Loading…</p>
			{:else}
				{#if globalErrors.length}
					<ul
						class="flex flex-col gap-0.5 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-2xs text-destructive"
						data-testid="wf-global-errors"
					>
						{#each globalErrors as err, i (i)}
							<li class="flex gap-1"><CircleAlertIcon size={11} class="mt-0.5 shrink-0" />{err}</li>
						{/each}
					</ul>
				{/if}
				{#if readOnly}
					<p class="border-b bg-muted/30 px-4 py-1.5 text-2xs text-muted-foreground">
						Read-only: editing needs the “Workflows write” permission.
					</p>
				{/if}
				{#if remoteDeleted}
					<p
						class="flex items-center gap-1.5 border-b border-destructive/40 bg-destructive/10 px-4 py-1.5 text-2xs text-destructive"
						data-testid="wf-remote-deleted"
					>
						<TriangleAlertIcon size={12} class="shrink-0" />
						{peerName(remoteDeleted)} deleted this workflow: it can no longer be saved. Copy what you
						need from the JSON view before leaving.
					</p>
				{:else if remoteSave}
					<div
						class="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-2xs"
						data-testid="wf-remote-saved"
					>
						<TriangleAlertIcon size={12} class="shrink-0 text-amber-600" />
						<span>
							{peerName(remoteSave)} saved
							{remoteSave.version ? `version ${remoteSave.version}` : 'this workflow'} while you were
							editing. Saving yours asks before replacing it.
						</span>
						<Button
							variant="outline"
							size="sm"
							class="h-6 text-2xs"
							onclick={() => reloadWorkflow(null)}
							data-testid="wf-remote-reload"
						>
							Load theirs, drop my changes
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-6 text-2xs"
							onclick={() => (remoteSave = null)}
						>
							Keep editing
						</Button>
					</div>
				{/if}
				<div class="flex min-h-0 flex-1">
					{#if settingsOpen}
						<aside
							class="flex shrink-0 flex-col gap-4 overflow-y-auto border-r p-3"
							style={`width: ${settingsWidth}px`}
							data-testid="wf-settings"
						>
							<label class="flex flex-col gap-1">
								<span class={LABEL_CLASS}>Description</span>
								<textarea
									class={TEXTAREA_CLASS.replace('font-mono ', '')}
									rows="2"
									disabled={readOnly}
									bind:value={form.description}
								></textarea>
							</label>

							<div class="flex flex-col gap-1">
								<span class={LABEL_CLASS}
									>Customer scope (empty = every customer the owner sees)</span
								>
								<MultiSelect
									items={[
										...customerItems,
										...form.customer_scope
											.filter((id) => !customerItems.some((c) => c.value === String(id)))
											.map((id) => ({ value: String(id), label: `Customer #${id}` }))
									]}
									values={form.customer_scope.map(String)}
									placeholder="All customers"
									disabled={readOnly}
									onChange={(v) => (form.customer_scope = v.map(Number))}
									testId="wf-customer-scope"
								/>
							</div>

							<label class="flex flex-col gap-1">
								<span class={LABEL_CLASS}>Suggestions are shown to</span>
								<select
									class={SELECT_CLASS}
									disabled={readOnly}
									bind:value={form.suggestion_audience}
								>
									{#each Object.entries(SUGGESTION_AUDIENCE_LABELS) as [value, text] (value)}
										<option {value}>{text}</option>
									{/each}
								</select>
								<span class="text-2xs text-muted-foreground">
									The default: a Suggest or Ask an analyst node can address other users.
									Administrators see every suggestion.
								</span>
							</label>

							<div class="grid grid-cols-2 gap-2">
								<label class="flex flex-col gap-1">
									<span class={LABEL_CLASS}>Max runs / hour</span>
									<Input
										type="number"
										min="1"
										class="h-8 text-xs"
										disabled={readOnly}
										bind:value={form.max_runs_per_hour}
									/>
								</label>
								<label class="flex flex-col gap-1">
									<span class={LABEL_CLASS}>Token budget / run</span>
									<Input
										type="number"
										min="0"
										class="h-8 text-xs"
										disabled={readOnly}
										bind:value={form.token_budget_per_run}
									/>
								</label>
							</div>

							<div class="flex flex-col gap-1">
								<span class={LABEL_CLASS}>Write tools allowed to run without approval</span>
								<MultiSelect
									items={writeTools}
									values={form.write_tool_allowlist}
									placeholder="None: every write is a suggestion"
									disabled={readOnly}
									onChange={(v) => (form.write_tool_allowlist = v)}
									testId="wf-write-allowlist"
								/>
								{#if form.write_tool_allowlist.length}
									<p
										class="flex items-start gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs"
										data-testid="wf-allowlist-warning"
									>
										<TriangleAlertIcon size={12} class="mt-0.5 shrink-0 text-amber-600" />
										These tools change data without an analyst approving it, acting as the user the run
										executes as. Keep the list as short as possible.
									</p>
								{:else}
									<p class="text-2xs text-muted-foreground">
										Agent and Action writes become suggestions an analyst accepts.
									</p>
								{/if}
							</div>

							{#if isAdmin}
								<label class="flex flex-col gap-1">
									<span class={LABEL_CLASS}>Owner (event / cron / webhook runs act as them)</span>
									<select
										class={SELECT_CLASS}
										disabled={readOnly}
										value={form.owner_id === null ? '' : String(form.owner_id)}
										onchange={(e) => {
											const v = (e.currentTarget as HTMLSelectElement).value;
											form.owner_id = v ? Number(v) : null;
										}}
										data-testid="wf-owner"
									>
										<option value="">{isNew ? 'Me' : '—'}</option>
										{#each ownerOptions as o (o.id)}
											<option value={String(o.id)}>{o.label}</option>
										{/each}
										{#if form.owner_id !== null && !ownerOptions.some((o) => o.id === form.owner_id)}
											<option value={String(form.owner_id)}>
												{workflow?.owner?.name ?? `User #${form.owner_id}`}
											</option>
										{/if}
									</select>
								</label>
							{:else if workflow?.owner}
								<p class="text-2xs text-muted-foreground">
									Owner: {workflow.owner.name ?? workflow.owner.login}
								</p>
							{/if}
						</aside>
						<PanelResizer
							bind:width={settingsWidth}
							side="left"
							storageKey="ai-wf-settings-width"
							initial={SETTINGS_WIDTH}
							min={240}
							label="Resize the settings panel"
						/>
					{/if}

					<div class="min-w-0 flex-1">
						<SvelteFlowProvider>
							<WorkflowCanvas
								bind:nodes
								bind:edges
								{catalogue}
								{readOnly}
								onAddNode={addNode}
								onSelect={(id) => (selectedId = id)}
								blocks={canWrite ? blocks : []}
								onInsertBlock={canWrite ? insertSavedBlock : undefined}
								onSaveSelection={startSaveSelection}
								onImportBlock={importBlock}
								onExportBlock={exportBlock}
								onDeleteBlock={deleteBlock}
								{direction}
								onSetDirection={setDirection}
								onCopy={copySelection}
								onCut={readOnly ? undefined : cutSelection}
								onPaste={readOnly ? undefined : pasteNodes}
								onDuplicate={readOnly ? undefined : duplicateSelection}
								isLocked={(id) => !!presence?.lockHolder(id)}
							/>
						</SvelteFlowProvider>
					</div>

					{#if selectedId && selectedType && meta[selectedId]}
						{@const sid = selectedId}
						{@const sidStats = stats[sid]}
						<PanelResizer
							bind:width={drawerWidth}
							side="right"
							storageKey="ai-wf-drawer-width"
							initial={DRAWER_WIDTH}
							min={280}
							label="Resize the node panel"
						/>
						<aside
							class="flex shrink-0 flex-col border-l"
							style={`width: ${drawerWidth}px`}
							data-testid="wf-drawer"
						>
							{#if workflow}
								<div class="flex shrink-0 border-b text-xs" role="tablist">
									<button
										type="button"
										role="tab"
										aria-selected={drawerTab === 'config'}
										class={`flex-1 px-3 py-1.5 ${drawerTab === 'config' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
										onclick={() => (drawerTab = 'config')}
										data-testid="wf-drawer-tab-config"
									>
										Configuration
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={drawerTab === 'events'}
										class={`flex-1 px-3 py-1.5 ${drawerTab === 'events' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
										onclick={() => (drawerTab = 'events')}
										data-testid="wf-drawer-tab-events"
									>
										Events ({sidStats?.total ?? 0})
									</button>
									{#if canWrite}
										<button
											type="button"
											role="tab"
											aria-selected={drawerTab === 'test'}
											class={`flex-1 px-3 py-1.5 ${drawerTab === 'test' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
											onclick={() => (drawerTab = 'test')}
											data-testid="wf-drawer-tab-test"
										>
											Test
										</button>
									{/if}
								</div>
							{/if}
							{#key sid}
								{#if workflow && drawerTab === 'events'}
									<NodeEventsPanel
										workflowId={workflow.id}
										nodeId={sid}
										canReplay={canWrite}
										{dirty}
										onReplayed={() => setTimeout(loadStats, 1500)}
									/>
								{:else if workflow && canWrite && drawerTab === 'test'}
									<NodeTestPanel
										workflowId={workflow.id}
										blocked={testBlocked(selectedType, meta[sid].config)}
										node={() => ({
											id: sid,
											type: selectedType,
											label: meta[sid].label,
											config: $state.snapshot(meta[sid].config)
										})}
									/>
								{:else}
									{#if nodeLock && !readOnly}
										<p
											class="flex shrink-0 items-start gap-1.5 border-b border-l-4 bg-muted/40 px-3 py-1.5 text-2xs"
											style={`border-left-color: ${nodeLock.color}`}
											data-testid="wf-node-locked"
										>
											<LockIcon size={11} class="mt-0.5 shrink-0" />
											{nodeLock.name} is configuring this node: read-only here until they leave it. Their
											changes show once they save.
										</p>
									{/if}
									<div class="min-h-0 flex-1 overflow-y-auto">
										<NodeConfigForm
											nodeId={sid}
											nodeType={selectedType}
											bind:node={meta[sid]}
											{catalogue}
											writeAllowlist={form.write_tool_allowlist}
											errors={errorsByNode[sid] ?? []}
											{otherNodes}
											readOnly={readOnly || !!nodeLock}
											onClose={() => (selectedId = null)}
											onDelete={deleteSelected}
											onRename={(id) => renameNode(sid, id)}
											deletable={selectedType !== 'trigger' || triggerIds.length > 1}
										>
											<TriggerConfigForm
												bind:config={meta[sid].config}
												otherTypes={otherTriggerTypes}
												{catalogue}
												readOnly={readOnly || !!nodeLock}
												workflowId={workflow?.id ?? null}
												savedTriggerTypes={savedTriggers.map((t) => t.type)}
												hasInboundToken={workflow?.has_inbound_token ?? false}
												hasSigningSecret={workflow?.has_signing_secret ?? false}
												inboundUrl={workflow?.inbound_url ?? null}
												onTokenRotated={(withSecret) => {
													if (!workflow) return;
													workflow.has_inbound_token = true;
													if (withSecret) workflow.has_signing_secret = true;
												}}
												onSigningSecretRotated={() => {
													if (workflow) workflow.has_signing_secret = true;
												}}
											/>
										</NodeConfigForm>
									</div>
								{/if}
							{/key}
						</aside>
					{/if}
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>

<Dialog.Root bind:open={blockDialogOpen}>
	<Dialog.Content class="sm:max-w-[460px]">
		<Dialog.Header>
			<Dialog.Title class="text-sm">Save as a block</Dialog.Title>
			<Dialog.Description class="text-xs">
				The selected nodes and the edges between them, reusable from the palette of any workflow.
				Secrets stay in the keystore: a block only holds <code>key("NAME")</code> references.
			</Dialog.Description>
		</Dialog.Header>
		{#if blockDraft}
			<form
				class="flex flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					saveBlock();
				}}
			>
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Name</span>
					<Input
						class="h-8 text-xs"
						placeholder="Look a hash up on VirusTotal"
						bind:value={blockDraft.name}
						data-testid="wf-block-name"
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Category (groups the blocks in the palette)</span>
					<Input
						class="h-8 text-xs"
						placeholder="Enrichment"
						bind:value={blockDraft.category}
						data-testid="wf-block-category"
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Description</span>
					<textarea
						class={TEXTAREA_CLASS.replace('font-mono ', '')}
						rows="3"
						bind:value={blockDraft.description}
					></textarea>
				</label>
				<label class="flex items-center justify-between gap-2 text-xs">
					<span>Share with every workflow editor</span>
					<Switch
						checked={blockDraft.is_shared}
						onCheckedChange={(v: boolean) => {
							if (blockDraft) blockDraft.is_shared = v;
						}}
						data-testid="wf-block-shared"
					/>
				</label>
				<Dialog.Footer>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() => (blockDialogOpen = false)}
					>
						Cancel
					</Button>
					<Button type="submit" size="sm" disabled={savingBlock} data-testid="wf-block-save">
						{savingBlock ? 'Saving…' : 'Save the block'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={conflictOpen}>
	<Dialog.Content class="sm:max-w-[460px]" data-testid="wf-conflict">
		<Dialog.Header>
			<Dialog.Title class="text-sm">Saved by someone else meanwhile</Dialog.Title>
			<Dialog.Description class="text-xs">
				{remoteSave ? peerName(remoteSave) : 'Someone'} saved
				{conflict?.version ? `version ${conflict.version}` : 'this workflow'} after you opened it. Saving
				yours replaces their changes; loading theirs drops yours.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (conflictOpen = false)}>Cancel</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => reloadWorkflow(null)}
				data-testid="wf-conflict-reload"
			>
				Load theirs
			</Button>
			<Button
				variant="destructive"
				size="sm"
				disabled={saving}
				onclick={() => save(conflict?.revision ?? null)}
				data-testid="wf-conflict-overwrite"
			>
				Replace with mine
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<AuthoringGuideDialog bind:open={guideOpen} />
<WorkflowJsonDialog
	bind:open={jsonOpen}
	source={() => workflowJson(form, currentGraph())}
	{readOnly}
	onApply={applyJson}
/>

{#if workflow}
	<VersionsDialog
		bind:open={versionsOpen}
		workflowId={workflow.id}
		currentVersion={workflow.version}
	/>
	<RunDialog
		bind:open={runOpen}
		workflowId={workflow.id}
		workflowName={workflow.name}
		triggers={savedTriggers}
		{dirty}
		onStarted={onRunStarted}
	/>
	<PublishDialog
		bind:open={publishOpen}
		workflowId={workflow.id}
		workflowName={workflow.name}
		workflowDescription={workflow.description}
		{dirty}
	/>
{/if}
