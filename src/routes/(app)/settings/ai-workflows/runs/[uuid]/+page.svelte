<!--
  Run inspector, laid out as a story run: the steps as a timeline on the
  left, the workflow as it ran in the middle (visited nodes lit, the links
  the run followed highlighted, unreached nodes dimmed), and the selected
  step's input, output, LLM and tool calls on the right. With no step
  selected the right pane shows the run itself: error, waits,
  suggestions, trigger payload and context. Cancel, rerun and JSON export
  (admins and the workflow owner). Live while the run is running or
  waiting: each pushed change re-reads it, and it is polled as a fallback.
-->
<script lang="ts">
	import { getContext, onDestroy, setContext, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import {
		ArrowLeftIcon,
		BanIcon,
		ChevronDownIcon,
		ChevronUpIcon,
		CircleCheckIcon,
		CircleXIcon,
		DownloadIcon,
		FlagIcon,
		HourglassIcon,
		LoaderCircleIcon,
		RefreshCwIcon,
		RotateCcwIcon,
		SparklesIcon,
		WrenchIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import { notifications } from '$lib/stores/notifications.store';
	import {
		graphToFlow,
		labelFor,
		NOTE_FLOW_NODE_TYPE,
		type FlowEdge,
		type FlowNode,
		type NodeMetaMap
	} from '$lib/utils/ai-workflow-graph';
	import {
		AI_RUN_LIVE_EVENT,
		AI_RUN_UNWATCH,
		AI_RUN_WATCH,
		AiWorkflowsService,
		type AiLlmCall,
		type AiNodeStats,
		type AiRunDetail,
		type AiRunLiveEvent,
		type AiRunStep,
		type AiRunSummary,
		type AiToolCall,
		type AiWait,
		type AiWorkflowCatalogue,
		type AiWorkflowGraph
	} from '$lib/services/ai-workflows.service';
	import FeatureGate from '../../components/FeatureGate.svelte';
	import JsonBlock from '../../components/JsonBlock.svelte';
	import WorkflowCanvas from '../../components/WorkflowCanvas.svelte';
	import {
		CLASSIFICATION_TONES,
		describeApiError,
		downloadJson,
		entityHref,
		entityLabel,
		EXEC_MODE_LABELS,
		EXEC_MODE_TONES,
		formatDuration,
		nodeIcon,
		nodeTone,
		runTone,
		stepTone,
		TRIGGER_LABELS,
		userLabel,
		WAIT_STATUS_TONES,
		WORKFLOW_EDITOR_CTX
	} from '../../helpers/ui';
	import type { WorkflowEditorCtx } from '../../helpers/editor';
	import { aiLiveFromRun } from '../../helpers/live';

	const POLL_MS = 3000;

	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('ai_workflows_write') ?? false);

	const uuid = $derived(page.params.uuid ?? '');

	let run = $state<AiRunDetail | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let confirmCancelOpen = $state(false);
	let catalogue = $state<AiWorkflowCatalogue | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let loadedUuid = '';

	/** The step shown on the right; null shows the run itself. */
	let selectedStepId = $state<number | null>(null);
	/** A node picked on the canvas that has not run. */
	let unreachedNodeId = $state<string | null>(null);

	const live = $derived(run?.status === 'running' || run?.status === 'waiting');
	const steps = $derived([...(run?.steps ?? [])].sort((a, b) => a.seq - b.seq));
	const stepIds = $derived(new Set(steps.map((s) => s.id)));
	const toolsByStep = $derived(groupByStep(run?.tool_calls ?? []));
	const llmByStep = $derived(groupByStep(run?.llm_calls ?? []));
	const orphanTools = $derived(
		(run?.tool_calls ?? []).filter((c) => c.step_id === null || !stepIds.has(c.step_id))
	);
	const orphanLlm = $derived(
		(run?.llm_calls ?? []).filter((c) => c.step_id === null || !stepIds.has(c.step_id))
	);
	const entityLink = $derived(run ? entityHref(run.entity_type, run.entity_id) : null);

	const selectedIndex = $derived(steps.findIndex((s) => s.id === selectedStepId));
	const selectedStep = $derived(selectedIndex >= 0 ? steps[selectedIndex] : null);
	const failedStep = $derived(steps.findLast((s) => s.status === 'failed') ?? null);

	const graph = $derived(
		(run?.definition_snapshot?.graph as AiWorkflowGraph | undefined | null) ?? null
	);
	const graphNodes = $derived(new Map((graph?.nodes ?? []).map((n) => [n.id, n])));
	const unreachedNode = $derived(unreachedNodeId ? graphNodes.get(unreachedNodeId) : undefined);

	const stepsByNode = $derived.by(() => {
		const map = new Map<string, AiRunStep[]>();
		for (const step of steps) {
			const bucket = map.get(step.node_id) ?? [];
			bucket.push(step);
			map.set(step.node_id, bucket);
		}
		return map;
	});

	/** This run's steps per node, shown as each node's badge. */
	const stats = $derived.by(() => {
		const out: Record<string, AiNodeStats> = {};
		for (const [nodeId, list] of stepsByNode) {
			const counts: AiNodeStats['counts'] = {};
			for (const s of list) counts[s.status] = (counts[s.status] ?? 0) + 1;
			out[nodeId] = { total: list.length, counts, last_at: list.at(-1)?.ended_at ?? null };
		}
		return out;
	});

	/** Links the run followed: left on the port a step took, to a node that ran after it. */
	const traversed = $derived.by(() => {
		const ids = new Set<string>();
		for (const edge of graph?.edges ?? []) {
			const port = edge.source_port || 'out';
			const later = stepsByNode.get(edge.target) ?? [];
			const followed = (stepsByNode.get(edge.source) ?? []).some(
				(s) => (s.port ?? null) === port && later.some((t) => t.seq > s.seq)
			);
			if (followed) ids.add(edge.id);
		}
		return ids;
	});

	let flowNodes = $state<FlowNode[]>([]);
	let flowEdges = $state<FlowEdge[]>([]);
	let meta = $state<NodeMetaMap>({});
	let flowFor = $state('');

	const TRAVERSED_STYLE = 'stroke: rgb(16 185 129); stroke-width: 2;';
	const IDLE_STYLE = 'opacity: 0.3;';

	// The canvas is built once per run, then only restyled as steps come in
	$effect(() => {
		if (!run) return;
		const key = run.uuid;
		const visited = stepsByNode;
		const followed = traversed;
		const selectedNode = selectedStep?.node_id ?? unreachedNodeId;
		const started = steps.length > 0;
		untrack(() => {
			if (flowFor !== key) {
				const flow = graphToFlow(graph);
				meta = flow.meta;
				flowNodes = flow.nodes;
				flowEdges = flow.edges;
				flowFor = key;
			}
			flowNodes = flowNodes.map((n) => ({
				...n,
				selected: n.id === selectedNode,
				class: started && n.type !== NOTE_FLOW_NODE_TYPE && !visited.has(n.id) ? 'opacity-40' : ''
			}));
			flowEdges = flowEdges.map((e) => ({
				...e,
				style: followed.has(e.id) ? TRAVERSED_STYLE : started ? IDLE_STYLE : undefined
			}));
		});
	});

	const editorCtx: WorkflowEditorCtx = {
		get meta() {
			return meta;
		},
		errors: {},
		get catalogue() {
			return catalogue;
		},
		get stats() {
			return stats;
		},
		get live() {
			return run ? aiLiveFromRun(run).nodes : {};
		},
		get nodeTypes() {
			return Object.fromEntries(flowNodes.map((n) => [n.id, n.data.nodeType]));
		},
		get workflowId() {
			return run?.workflow_id ?? null;
		},
		suggestionAudience: 'owner',
		editors: {},
		readOnly: true
	};
	setContext(WORKFLOW_EDITOR_CTX, editorCtx);

	function groupByStep<T extends { step_id: number | null }>(list: T[]): Map<number, T[]> {
		const map = new Map<number, T[]>();
		for (const item of list) {
			if (item.step_id === null) continue;
			const bucket = map.get(item.step_id) ?? [];
			bucket.push(item);
			map.set(item.step_id, bucket);
		}
		return map;
	}

	function selectStep(id: number | null) {
		selectedStepId = id;
		unreachedNodeId = null;
	}

	// A node clicked on the canvas: its latest step, the one before on a
	// second click; a node that never ran shows its configuration
	function selectNode(id: string | null) {
		if (!id) return selectStep(null);
		const list = stepsByNode.get(id) ?? [];
		if (!list.length) {
			selectedStepId = null;
			unreachedNodeId = graphNodes.has(id) ? id : null;
			return;
		}
		const at = list.findIndex((s) => s.id === selectedStepId);
		selectStep(at > 0 ? list[at - 1].id : list[list.length - 1].id);
	}

	function moveSelection(delta: number) {
		const next = steps[selectedIndex + delta];
		if (next) selectStep(next.id);
	}

	// Up / down on a timeline entry selects and focuses its neighbour
	function onTimelineKey(event: KeyboardEvent, index: number) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		const next = steps[index + (event.key === 'ArrowDown' ? 1 : -1)];
		if (!next) return;
		selectStep(next.id);
		const item = (event.currentTarget as HTMLElement).closest('li');
		const sibling =
			event.key === 'ArrowDown' ? item?.nextElementSibling : item?.previousElementSibling;
		sibling?.querySelector('button')?.focus();
	}

	function stopPolling() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	async function load(quiet = false) {
		stopPolling();
		const current = uuid;
		if (!quiet) {
			loading = true;
			loadError = null;
		}
		const res = await AiWorkflowsService.getRun(current);
		if (current !== uuid) return;
		loading = false;
		if (!res.ok) {
			if (!quiet || !run) {
				loadError =
					res.status === 404
						? 'Run not found'
						: describeApiError(res.data, res.error?.message ?? 'Failed to load the run');
			}
			return;
		}
		run = res.data as AiRunDetail;
		if (run.status === 'running' || run.status === 'waiting') {
			timer = setTimeout(() => load(true), POLL_MS);
		}
	}

	async function loadCatalogue() {
		const res = await AiWorkflowsService.catalogue();
		// Without it the nodes fall back to the built-in ports and labels
		if (res.ok) catalogue = res.data as AiWorkflowCatalogue;
	}

	$effect(() => {
		const id = uuid;
		if (!runtimeConfig.aiWorkflowsEnabled || !userCtx?.ready || !id) return;
		if (id !== loadedUuid) {
			loadedUuid = id;
			run = null;
			flowFor = '';
			selectStep(null);
			load();
			if (!catalogue) loadCatalogue();
		}
	});

	// Pushes only say something changed: re-read, at most every 300 ms
	const PUSH_DEBOUNCE_MS = 300;
	let pushTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const id = uuid;
		if (!runtimeConfig.aiWorkflowsEnabled || !id) return;
		const offEvent = notifications.onSocketEvent<AiRunLiveEvent>(AI_RUN_LIVE_EVENT, (event) => {
			if (event?.run_uuid !== id || pushTimer) return;
			pushTimer = setTimeout(() => {
				pushTimer = null;
				if (id === uuid) load(true);
			}, PUSH_DEBOUNCE_MS);
		});
		const offRoom = notifications.watchRoom(AI_RUN_WATCH, AI_RUN_UNWATCH, { run_uuid: id });
		return () => {
			offEvent();
			offRoom();
			if (pushTimer) clearTimeout(pushTimer);
			pushTimer = null;
		};
	});

	onDestroy(stopPolling);

	async function cancelRun() {
		if (!run) return;
		busy = true;
		const res = await AiWorkflowsService.cancelRun(run.uuid);
		busy = false;
		if (!res.ok) {
			toast({
				title: 'Cancel failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		toast({ title: 'Run cancelled', variant: 'success' });
		load(true);
	}

	async function rerun() {
		if (!run) return;
		busy = true;
		const res = await AiWorkflowsService.rerun(run.uuid);
		busy = false;
		if (!res.ok) {
			toast({
				title: 'Rerun failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const created = res.data as AiRunSummary;
		toast({ title: 'Run restarted', variant: 'success' });
		goto(`/settings/ai-workflows/runs/${created.uuid}`);
	}

	async function exportRun() {
		if (!run) return;
		busy = true;
		const res = await AiWorkflowsService.exportRun(run.uuid);
		busy = false;
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		downloadJson(`ai-workflow-run-${run.uuid}.json`, res.data);
	}

	const BADGE = 'rounded px-1.5 py-0.5 text-2xs';
	const SECTION_TITLE =
		'mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground';
	const STATUS_DOTS: Record<string, string> = {
		running: 'bg-blue-500 animate-pulse',
		succeeded: 'bg-emerald-500',
		failed: 'bg-destructive',
		waiting: 'bg-amber-500 animate-pulse',
		resumed: 'bg-blue-500'
	};
</script>

<svelte:head>
	<title>{run ? `Run · ${run.workflow_name}` : 'Workflow run'}</title>
</svelte:head>

{#snippet toolCall(call: AiToolCall)}
	<div class="rounded-md border bg-background p-2" data-testid={`wf-tool-call-${call.id}`}>
		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			<WrenchIcon size={12} class="text-muted-foreground" />
			<span class="font-mono font-medium">{call.tool_name}</span>
			<span class={`${BADGE} ${CLASSIFICATION_TONES[call.classification] ?? ''}`}>
				{call.classification}
			</span>
			<span class={`${BADGE} ${EXEC_MODE_TONES[call.execution_mode] ?? 'bg-muted'}`}>
				{EXEC_MODE_LABELS[call.execution_mode] ?? call.execution_mode}
			</span>
			<span class="text-2xs text-muted-foreground">as {userLabel(call.acting_user)}</span>
			{#if call.duration_ms !== null}
				<span class="text-2xs text-muted-foreground">{call.duration_ms} ms</span>
			{/if}
			{#if call.suggestion_id}
				<span class="text-2xs text-muted-foreground">suggestion #{call.suggestion_id}</span>
			{/if}
		</div>
		{#if call.error}
			<p class="mt-1 text-2xs text-destructive">{call.error}</p>
		{/if}
		<div class="mt-1 flex flex-col gap-1">
			<JsonBlock label="Arguments" value={call.arguments} />
			{#if call.result_hidden === true}
				<p
					class="text-2xs italic text-muted-foreground"
					data-testid={`wf-tool-call-hidden-${call.id}`}
				>
					Result withheld: visible only to the analyst who accepted the action.
				</p>
			{:else}
				<JsonBlock label="Result" value={call.result} />
			{/if}
			{#if call.result_truncated === true}
				<span
					class={`${BADGE} w-fit bg-amber-500/15 text-amber-700 dark:text-amber-300`}
					title="The stored result was cut to 16 KB"
					data-testid={`wf-tool-call-truncated-${call.id}`}
				>
					truncated
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet llmCall(call: AiLlmCall)}
	<div class="rounded-md border bg-background p-2" data-testid={`wf-llm-call-${call.id}`}>
		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			<SparklesIcon size={12} class="text-muted-foreground" />
			<span class="font-medium">{call.provider ?? 'LLM'}</span>
			{#if call.model}<span class="font-mono text-2xs">{call.model}</span>{/if}
			<span class="text-2xs text-muted-foreground">
				{call.prompt_tokens} in · {call.completion_tokens} out · {call.bytes_sent} bytes sent
			</span>
			{#if call.redacted}
				<span class={`${BADGE} bg-amber-500/15 text-amber-700 dark:text-amber-300`}>redacted</span>
			{/if}
			{#if call.restriction_level}
				<span class="text-2xs text-muted-foreground">policy: {call.restriction_level}</span>
			{/if}
		</div>
		{#if call.error}
			<p class="mt-1 text-2xs text-destructive">{call.error}</p>
		{/if}
		{#if call.snapshots_visible}
			<div class="mt-1 flex flex-col gap-1">
				<JsonBlock label="Request" value={call.request_snapshot} />
				<JsonBlock label="Response" value={call.response_snapshot} />
			</div>
		{:else}
			<p class="mt-1 text-2xs text-muted-foreground">
				The request and response are only shown to administrators and the workflow owner.
			</p>
		{/if}
	</div>
{/snippet}

{#snippet waitItem(wait: AiWait)}
	<li class="rounded-md border p-2 text-xs">
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="font-medium">{wait.kind}</span>
			<span class="font-mono text-2xs text-muted-foreground">{wait.node_id}</span>
			<span class={`${BADGE} ${WAIT_STATUS_TONES[wait.status] ?? 'bg-muted'}`}>
				{wait.status}
			</span>
		</div>
		<div class="mt-0.5 text-2xs text-muted-foreground">
			{#if wait.status === 'pending' && wait.expires_at}
				Expires {formatDateTime(wait.expires_at)}
			{:else if wait.resolved_at}
				Resolved {formatDateTime(wait.resolved_at)}
				{#if wait.resolved_by}· by {wait.resolved_by.name ||
						wait.resolved_by.login}{:else if wait.resolved_by_id}· by user #{wait.resolved_by_id}{/if}
				{#if wait.source_ip}· from {wait.source_ip}{/if}
			{/if}
		</div>
		{#if wait.resolved_payload_hidden === true}
			<p class="mt-1 text-2xs italic text-muted-foreground">
				Answer withheld: visible only to the analyst who gave it.
			</p>
		{:else if wait.resolved_payload !== undefined && wait.resolved_payload !== null}
			<div class="mt-1">
				<JsonBlock label="Payload" value={wait.resolved_payload} />
			</div>
		{/if}
	</li>
{/snippet}

{#snippet stepDetail(step: AiRunStep)}
	{@const Icon = nodeIcon(step.node_type)}
	{@const tools = toolsByStep.get(step.id) ?? []}
	{@const llms = llmByStep.get(step.id) ?? []}
	{@const waits = (run?.waits ?? []).filter((w) => w.node_id === step.node_id)}
	<div class="flex flex-col gap-4" data-testid="wf-run-step-detail">
		<div class="flex items-start gap-2.5">
			<span
				class={`flex size-8 shrink-0 items-center justify-center rounded-md ${nodeTone(step.node_type)}`}
			>
				<Icon size={15} />
			</span>
			<div class="min-w-0 flex-1 leading-tight">
				<h2 class="truncate text-sm font-semibold" title={step.node_label || step.node_id}>
					{step.node_label || step.node_id}
				</h2>
				<p class="truncate font-mono text-2xs text-muted-foreground">
					#{step.seq} · {labelFor(step.node_type, catalogue?.node_types)} · {step.node_id}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					title="Previous step"
					disabled={selectedIndex <= 0}
					onclick={() => moveSelection(-1)}
				>
					<ChevronUpIcon size={13} />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					title="Next step"
					disabled={selectedIndex >= steps.length - 1}
					onclick={() => moveSelection(1)}
				>
					<ChevronDownIcon size={13} />
				</Button>
			</div>
		</div>

		<dl class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/20 p-2.5 text-xs">
			<div>
				<dt class="text-2xs text-muted-foreground">Status</dt>
				<dd><span class={`${BADGE} ${stepTone(step.status)}`}>{step.status}</span></dd>
			</div>
			<div>
				<dt class="text-2xs text-muted-foreground">Exit</dt>
				<dd class="font-mono">{step.port ?? '—'}</dd>
			</div>
			<div>
				<dt class="text-2xs text-muted-foreground">Started</dt>
				<dd>{step.started_at ? formatDateTime(step.started_at) : '—'}</dd>
			</div>
			<div>
				<dt class="text-2xs text-muted-foreground">Duration</dt>
				<dd>{formatDuration(step.started_at, step.ended_at)}</dd>
			</div>
			{#if step.tokens_used}
				<div>
					<dt class="text-2xs text-muted-foreground">Tokens</dt>
					<dd class="font-mono">{step.tokens_used}</dd>
				</div>
			{/if}
		</dl>

		{#if step.error}
			<p
				class="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
			>
				{step.error}
			</p>
		{/if}

		<section>
			<h3 class={SECTION_TITLE}>Input</h3>
			<JsonBlock label="Input" value={step.input} open />
		</section>
		<section>
			<h3 class={SECTION_TITLE}>Output</h3>
			<JsonBlock label="Output" value={step.output} open />
		</section>

		{#if llms.length}
			<section>
				<h3 class={SECTION_TITLE}>LLM calls · {llms.length}</h3>
				<div class="flex flex-col gap-1.5">
					{#each llms as call (call.id)}
						{@render llmCall(call)}
					{/each}
				</div>
			</section>
		{/if}
		{#if tools.length}
			<section>
				<h3 class={SECTION_TITLE}>Tool calls · {tools.length}</h3>
				<div class="flex flex-col gap-1.5">
					{#each tools as call (call.id)}
						{@render toolCall(call)}
					{/each}
				</div>
			</section>
		{/if}
		{#if waits.length}
			<section>
				<h3 class={SECTION_TITLE}>Waits</h3>
				<ul class="flex flex-col gap-1.5">
					{#each waits as wait (wait.id)}
						{@render waitItem(wait)}
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/snippet}

{#snippet runOverview(detail: AiRunDetail)}
	<div class="flex flex-col gap-4" data-testid="wf-run-overview">
		<div class="flex items-center gap-2">
			<span class={`${BADGE} ${runTone(detail.status)}`}>{detail.status}</span>
			<p class="text-xs text-muted-foreground">
				{steps.length} step{steps.length === 1 ? '' : 's'} · select one on the left or on the canvas
			</p>
		</div>

		{#if detail.error}
			<div
				class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
				data-testid="wf-run-error"
			>
				<p class="whitespace-pre-wrap">{detail.error}</p>
				{#if failedStep}
					<button
						type="button"
						class="mt-1 text-2xs font-medium underline underline-offset-2"
						onclick={() => failedStep && selectStep(failedStep.id)}
					>
						Show the failing step
					</button>
				{/if}
			</div>
		{/if}

		{#if detail.tool_calls_omitted}
			<p
				class="text-2xs text-amber-700 dark:text-amber-300"
				data-testid="wf-run-tool-calls-omitted"
			>
				{detail.tool_calls_omitted} tool call(s) not shown: only the first 200 of each step are listed.
			</p>
		{/if}

		<section>
			<h3 class={SECTION_TITLE}>Trigger payload</h3>
			<JsonBlock label="Payload" value={detail.trigger_payload} open />
		</section>

		<section>
			<h3 class={SECTION_TITLE}>Waits</h3>
			<ul class="flex flex-col gap-1.5" data-testid="wf-run-waits">
				{#each detail.waits as wait (wait.id)}
					{@render waitItem(wait)}
				{:else}
					<li class="text-xs text-muted-foreground">None.</li>
				{/each}
			</ul>
		</section>

		<section>
			<h3 class={SECTION_TITLE}>Suggestions</h3>
			<ul class="flex flex-col gap-1.5" data-testid="wf-run-suggestions">
				{#each detail.suggestions as s (s.id)}
					<li class="rounded-md border p-2 text-xs">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="font-medium">{s.title}</span>
							<span class={`${BADGE} bg-muted`}>{s.status}</span>
							{#if s.severity}
								<span class="text-2xs text-muted-foreground">{s.severity}</span>
							{/if}
						</div>
						{#if s.body}
							<p class="mt-0.5 line-clamp-3 whitespace-pre-wrap text-2xs text-muted-foreground">
								{s.body}
							</p>
						{/if}
						{#if s.proposed_actions?.length}
							<div class="mt-1 flex flex-col gap-1">
								{#each s.proposed_actions as a (a.id)}
									<JsonBlock
										label={`${a.status === 'pending' ? 'Proposed' : a.status === 'done' ? 'Done' : 'Skipped'}: ${a.label} (${a.tool})`}
										value={a.arguments}
									/>
								{/each}
							</div>
						{:else if s.proposed_action}
							<div class="mt-1">
								<JsonBlock
									label={`Proposed: ${s.proposed_action.tool}`}
									value={s.proposed_action.arguments}
								/>
							</div>
						{/if}
						{#if s.resolved_at}
							<p class="mt-0.5 text-2xs text-muted-foreground">
								{s.status}
								{formatDateTime(s.resolved_at)} by {userLabel(s.resolved_by)}
								{#if s.resolution_note}· {s.resolution_note}{/if}
							</p>
						{/if}
					</li>
				{:else}
					<li class="text-xs text-muted-foreground">None.</li>
				{/each}
			</ul>
		</section>

		{#if orphanTools.length || orphanLlm.length}
			<section>
				<h3 class={SECTION_TITLE}>Other calls</h3>
				<div class="flex flex-col gap-1.5">
					{#each orphanLlm as call (call.id)}
						{@render llmCall(call)}
					{/each}
					{#each orphanTools as call (call.id)}
						{@render toolCall(call)}
					{/each}
				</div>
			</section>
		{/if}

		<section class="flex flex-col gap-1.5">
			<h3 class={SECTION_TITLE}>Data</h3>
			<JsonBlock label="Context" value={detail.context} />
			<JsonBlock label="Definition (as run)" value={detail.definition_snapshot} />
		</section>
	</div>
{/snippet}

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex flex-col gap-1.5 border-b px-4 py-2.5">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					href={run?.workflow_id
						? `/settings/ai-workflows/runs?workflow_id=${run.workflow_id}`
						: '/settings/ai-workflows/runs'}
					title="Back to the runs"
				>
					<ArrowLeftIcon size={14} />
				</Button>
				<h1 class="flex min-w-0 items-center gap-2 text-sm font-semibold">
					<span class="truncate">{run?.workflow_name ?? 'Run'}</span>
					{#if run}
						<span class="font-mono text-2xs font-normal text-muted-foreground">
							v{run.workflow_version}
						</span>
						<span class={`${BADGE} ${runTone(run.status)}`} data-testid="wf-run-status">
							{run.status}
						</span>
						{#if run.is_dry_run}
							<span class={`${BADGE} bg-muted font-normal`}>dry run</span>
						{/if}
						{#if live}
							<RefreshCwIcon size={11} class="animate-spin text-muted-foreground" />
						{/if}
					{/if}
				</h1>
				<span class="hidden truncate font-mono text-2xs text-muted-foreground md:inline">
					{uuid}
				</span>
			</div>
			{#if run}
				<div class="flex items-center gap-1.5">
					{#if run.workflow_id}
						<Button
							variant="ghost"
							size="sm"
							class="h-7"
							href={`/settings/ai-workflows/${run.workflow_id}`}
						>
							Open workflow
						</Button>
					{/if}
					{#if live && canWrite}
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							disabled={busy}
							onclick={() => (confirmCancelOpen = true)}
							data-testid="wf-run-cancel"
						>
							<BanIcon size={12} class="mr-1" /> Cancel
						</Button>
					{/if}
					{#if !live && canWrite && run.workflow_id}
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							disabled={busy}
							onclick={rerun}
							data-testid="wf-run-rerun"
						>
							<RotateCcwIcon size={12} class="mr-1" /> Rerun
						</Button>
					{/if}
					{#if run.can_view_llm_snapshots}
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							disabled={busy}
							onclick={exportRun}
							data-testid="wf-run-export"
						>
							<DownloadIcon size={12} class="mr-1" /> Export JSON
						</Button>
					{/if}
					<Button
						variant="outline"
						size="icon"
						class="h-7 w-7"
						disabled={loading}
						onclick={() => load()}
						title="Refresh"
					>
						<RefreshCwIcon size={12} />
					</Button>
				</div>
			{/if}
		</div>
		{#if run}
			<dl
				class="flex flex-wrap items-center gap-x-4 gap-y-1 pl-9 text-2xs [&_dt]:text-muted-foreground"
				data-testid="wf-run-header"
			>
				<div class="flex gap-1">
					<dt>Trigger</dt>
					<dd>{TRIGGER_LABELS[run.trigger_type] ?? run.trigger_type}</dd>
				</div>
				{#if run.entity_type}
					<div class="flex min-w-0 gap-1">
						<dt>Entity</dt>
						<dd class="max-w-80 truncate">
							{#if entityLink}
								<a class="underline-offset-2 hover:underline" href={entityLink}>
									{entityLabel(run.entity_type)} #{run.entity_id}
								</a>
							{:else}
								{entityLabel(run.entity_type)} #{run.entity_id}
							{/if}
							{#if run.entity_title}
								<span class="text-muted-foreground">· {run.entity_title}</span>
							{/if}
						</dd>
					</div>
				{/if}
				<div class="flex gap-1">
					<dt>Acting as</dt>
					<dd>{userLabel(run.run_as)}</dd>
				</div>
				<div class="flex gap-1">
					<dt>Triggered by</dt>
					<dd>{userLabel(run.triggered_by)}</dd>
				</div>
				<div class="flex gap-1">
					<dt>Started</dt>
					<dd>{run.started_at ? formatDateTime(run.started_at) : '—'}</dd>
				</div>
				<div class="flex gap-1">
					<dt>Duration</dt>
					<dd>
						{formatDuration(run.started_at, live ? null : (run.finished_at ?? run.updated_at))}
					</dd>
				</div>
				<div class="flex gap-1">
					<dt>Tokens</dt>
					<dd class="font-mono">{run.tokens_used}</dd>
				</div>
				<div class="flex gap-1">
					<dt>Steps</dt>
					<dd class="font-mono">
						{run.step_count}{#if run.chain_depth}
							<span class="text-muted-foreground"> · chain depth {run.chain_depth}</span>
						{/if}
					</dd>
				</div>
			</dl>
		{/if}
	</header>

	<FeatureGate>
		{#if loadError}
			<div class="p-5"><ApiError error={loadError} onRetry={() => load()} /></div>
		{:else if !run}
			<p class="py-10 text-center text-xs text-muted-foreground">Loading…</p>
		{:else}
			<div class="flex min-h-0 flex-1">
				<!-- Timeline -->
				<nav
					class="flex w-72 shrink-0 flex-col overflow-y-auto border-r bg-muted/10 py-2"
					aria-label="Steps"
				>
					<button
						type="button"
						class={`mx-2 mb-1 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${
							selectedStep || unreachedNode ? '' : 'bg-muted'
						}`}
						onclick={() => selectStep(null)}
					>
						<span class="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
							<FlagIcon size={12} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block font-medium">Run</span>
							<span class="block truncate text-2xs text-muted-foreground">
								{TRIGGER_LABELS[run.trigger_type] ?? run.trigger_type}
								{#if run.started_at}· {formatDateTime(run.started_at)}{/if}
							</span>
						</span>
					</button>

					<ol class="relative flex flex-col" data-testid="wf-run-steps">
						{#if steps.length > 1}
							<span
								class="pointer-events-none absolute bottom-5 left-[1.75rem] top-5 w-px bg-border"
								aria-hidden="true"
							></span>
						{/if}
						{#each steps as step, index (step.id)}
							{@const Icon = nodeIcon(step.node_type)}
							{@const toolCount = toolsByStep.get(step.id)?.length ?? 0}
							{@const llmCount = llmByStep.get(step.id)?.length ?? 0}
							{@const selected = step.id === selectedStepId}
							<li class="relative px-2">
								<button
									type="button"
									class={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60 ${
										selected ? 'bg-muted ring-1 ring-border' : ''
									}`}
									aria-current={selected ? 'step' : undefined}
									data-testid={`wf-run-step-${step.seq}`}
									onclick={() => selectStep(step.id)}
									onkeydown={(e) => onTimelineKey(e, index)}
								>
									<span
										class={`relative flex size-6 shrink-0 items-center justify-center rounded ring-2 ring-background ${nodeTone(step.node_type)}`}
									>
										<Icon size={12} />
										<span
											class={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background ${STATUS_DOTS[step.status] ?? 'bg-muted-foreground'}`}
											title={step.status}
										></span>
									</span>
									<span class="min-w-0 flex-1">
										<span class="flex items-center gap-1.5">
											<span
												class={`truncate font-medium ${step.status === 'failed' ? 'text-destructive' : ''}`}
											>
												{step.node_label || step.node_id}
											</span>
										</span>
										<span class="flex items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="font-mono">#{step.seq}</span>
											{#if step.port}<span class="truncate">→ {step.port}</span>{/if}
											{#if llmCount}
												<span class="flex items-center gap-0.5" title="LLM calls">
													<SparklesIcon size={10} />{llmCount}
												</span>
											{/if}
											{#if toolCount}
												<span class="flex items-center gap-0.5" title="Tool calls">
													<WrenchIcon size={10} />{toolCount}
												</span>
											{/if}
										</span>
									</span>
									<span class="shrink-0 text-2xs tabular-nums text-muted-foreground">
										{step.status === 'running'
											? '…'
											: formatDuration(step.started_at, step.ended_at)}
									</span>
								</button>
							</li>
						{:else}
							<li class="px-4 py-2 text-xs text-muted-foreground">No step has run yet.</li>
						{/each}
					</ol>

					<div
						class="mx-2 mt-1 flex items-center gap-2.5 px-2 py-1.5 text-2xs text-muted-foreground"
					>
						<span class="flex size-6 shrink-0 items-center justify-center">
							{#if run.status === 'running'}
								<LoaderCircleIcon size={14} class="animate-spin text-blue-500" />
							{:else if run.status === 'waiting'}
								<HourglassIcon size={14} class="animate-pulse text-amber-500" />
							{:else if run.status === 'succeeded'}
								<CircleCheckIcon size={14} class="text-emerald-500" />
							{:else}
								<CircleXIcon size={14} class="text-destructive" />
							{/if}
						</span>
						{#if live}
							{run.status === 'waiting' ? 'Waiting…' : 'Running…'}
						{:else}
							Ended {run.status}
							{#if run.finished_at}· {formatDateTime(run.finished_at)}{/if}
						{/if}
					</div>
				</nav>

				<!-- The workflow as it ran -->
				<div class="hidden min-w-0 flex-1 lg:block">
					{#if !graph}
						<p class="py-10 text-center text-xs text-muted-foreground">
							No definition was kept for this run.
						</p>
					{:else if flowFor === run.uuid}
						{#key run.uuid}
							<SvelteFlowProvider>
								<WorkflowCanvas
									bind:nodes={flowNodes}
									bind:edges={flowEdges}
									{catalogue}
									readOnly
									onAddNode={() => {}}
									onSelect={selectNode}
								/>
							</SvelteFlowProvider>
						{/key}
					{/if}
				</div>

				<!-- The selected step, else the run -->
				<aside
					class="min-w-0 flex-1 overflow-y-auto border-l p-4 lg:w-[440px] lg:flex-none xl:w-[500px]"
				>
					{#if selectedStep}
						{@render stepDetail(selectedStep)}
					{:else if unreachedNode}
						{@const Icon = nodeIcon(unreachedNode.type)}
						<div class="flex flex-col gap-4" data-testid="wf-run-unreached">
							<div class="flex items-start gap-2.5">
								<span
									class={`flex size-8 shrink-0 items-center justify-center rounded-md opacity-60 ${nodeTone(unreachedNode.type)}`}
								>
									<Icon size={15} />
								</span>
								<div class="min-w-0 leading-tight">
									<h2 class="truncate text-sm font-semibold">
										{unreachedNode.label || unreachedNode.id}
									</h2>
									<p class="truncate font-mono text-2xs text-muted-foreground">
										{labelFor(unreachedNode.type, catalogue?.node_types)} · {unreachedNode.id}
									</p>
								</div>
							</div>
							<p class="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
								{live ? 'Not reached yet.' : 'Not reached in this run.'}
							</p>
							<section>
								<h3 class={SECTION_TITLE}>Configuration</h3>
								<JsonBlock label="Config" value={unreachedNode.config} open />
							</section>
						</div>
					{:else}
						{@render runOverview(run)}
					{/if}
				</aside>
			</div>
		{/if}
	</FeatureGate>
</div>

<ConfirmationDialog
	bind:open={confirmCancelOpen}
	title="Cancel this run?"
	message="Pending waits are closed and no further step runs. Actions already taken are not undone."
	confirmText="Cancel the run"
	onConfirm={cancelRun}
/>
