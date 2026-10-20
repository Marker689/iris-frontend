<!--
  Canvas node for every workflow node type: type icon, label, an error
  badge from the last validation, the number of events it processed,
  and its connectors. The input (none for the trigger) and one handle
  per output port sit on the node's default sides (`handles`: input on
  the left and outputs on the right unless changed); the same connectors
  also exist on the other sides, shown on hover as small faint dots
  without labels (outputs, their port in a tooltip) or while a link is
  being drawn (inputs), so a link can leave or enter on any side.
  Handle ids: the port / `in` on the default side, `<port>@<side>` /
  `in@<side>` elsewhere (see ai-workflow-graph).
  While a run goes through it, a ring and a status mark show its live
  state: a pulsing dot while it runs or waits, a check or a cross once
  done.
  The other editors configuring it outline it in their colour, with
  their names.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		Handle,
		Position,
		useConnection,
		useNodeConnections,
		useUpdateNodeInternals,
		type NodeProps
	} from '@xyflow/svelte';
	import { CheckIcon, CircleAlertIcon, XIcon } from 'lucide-svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		DEFAULT_HANDLES,
		HANDLE_SIDES,
		INPUT_HANDLE,
		handleId,
		labelFor,
		portsFor,
		type FlowNode,
		type HandleSide
	} from '$lib/utils/ai-workflow-graph';
	import {
		TRIGGER_LABELS,
		WORKFLOW_EDITOR_CTX,
		nodeIcon,
		nodeTone,
		triggerDetail
	} from '../helpers/ui';
	import { triggerOfNode, type WorkflowEditorCtx } from '../helpers/editor';
	import type { AiLiveNodeState } from '../helpers/live';

	let { id, data, selected }: NodeProps<FlowNode> = $props();

	const editor = getContext<WorkflowEditorCtx>(WORKFLOW_EDITOR_CTX);

	const type = $derived(data.nodeType);
	const ports = $derived(portsFor(type, editor?.catalogue?.node_types));
	const typeLabel = $derived(labelFor(type, editor?.catalogue?.node_types));
	const label = $derived(editor?.meta[id]?.label || typeLabel);
	// What starts the run at a trigger node
	const triggers = $derived.by(() => {
		if (type !== 'trigger') return '';
		const trigger = triggerOfNode(editor?.meta[id]?.config);
		if (!trigger) return 'No trigger type';
		const detail = triggerDetail(trigger.type, trigger.config);
		return [TRIGGER_LABELS[trigger.type] ?? trigger.type, detail].filter(Boolean).join(' · ');
	});
	const errors = $derived(editor?.errors[id] ?? []);
	const stats = $derived(editor?.stats[id]);
	const failed = $derived(stats?.counts.failed ?? 0);
	const statsTitle = $derived(
		stats
			? [
					`${stats.total} event${stats.total === 1 ? '' : 's'} processed`,
					...Object.entries(stats.counts).map(([status, n]) => `${status}: ${n}`),
					stats.last_at ? `last: ${formatDateTime(stats.last_at)}` : ''
				]
					.filter(Boolean)
					.join('\n')
			: ''
	);
	const Icon = $derived(nodeIcon(type));
	const peers = $derived(editor?.editors[id] ?? []);
	const peerNames = $derived([...new Set(peers.map((p) => p.name))]);

	const liveState = $derived(editor?.live[id]);
	// The card's ring while a run goes through it: lit and glowing while it
	// runs or waits, plain again once done (the status mark tells the outcome)
	const LIVE_RINGS: Partial<Record<AiLiveNodeState, string>> = {
		running:
			'ring-2 ring-indigo-500 shadow-[0_0_24px_rgba(99,102,241,0.3)] dark:ring-indigo-400 dark:shadow-[0_0_24px_rgba(129,140,248,0.35)]',
		waiting:
			'ring-2 ring-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.3)] dark:ring-amber-400 dark:shadow-[0_0_24px_rgba(251,191,36,0.3)]',
		failed: 'ring-2 ring-red-500/70 dark:ring-red-400/70'
	};
	const LIVE_DOTS: Partial<Record<AiLiveNodeState, string>> = {
		running: 'bg-indigo-500 dark:bg-indigo-400',
		waiting: 'bg-amber-500 dark:bg-amber-400'
	};
	const LIVE_TITLES: Record<AiLiveNodeState, string> = {
		running: 'Running',
		waiting: 'Waiting',
		succeeded: 'Done',
		failed: 'Failed'
	};

	const POSITIONS: Record<HandleSide, Position> = {
		left: Position.Left,
		top: Position.Top,
		right: Position.Right,
		bottom: Position.Bottom
	};
	const handles = $derived(editor?.meta[id]?.handles ?? DEFAULT_HANDLES);
	const outputSide = $derived(handles.output);
	const hasInput = $derived(type !== 'trigger');
	// Room for every port label along a side (outputs may show on the left / right).
	const minHeight = $derived(Math.max(50, ports.length * 20 + 16));

	// Handles carrying an edge stay visible on every side.
	const connections = useNodeConnections();
	const used = $derived(
		new Set(
			connections.current.map((c) => (c.source === id ? c.sourceHandle : c.targetHandle) ?? '')
		)
	);
	// While a link is drawn: the inputs of every other node show, extra outputs hide.
	const connection = useConnection();
	const linking = $derived(connection.current.inProgress);
	const linkingFromHere = $derived(linking && connection.current.fromNode?.id === id);
	const PADDING: Record<HandleSide, string> = {
		left: 'pl-14',
		top: 'pt-5',
		right: 'pr-14',
		bottom: 'pb-5'
	};
	const LABEL_SIDE: Record<HandleSide, string> = {
		left: 'left-2.5 -translate-y-1/2',
		top: 'top-1 -translate-x-1/2',
		right: 'right-2.5 -translate-y-1/2',
		bottom: 'bottom-1 -translate-x-1/2'
	};
	const vertical = (side: HandleSide) => side === 'top' || side === 'bottom';
	const at = (side: HandleSide, percent: number) =>
		`${vertical(side) ? 'left' : 'top'}: ${percent}%`;
	// Ports spread along a side. An odd count would put the middle one on the
	// input (always centred on its default side): there they shift half a step.
	const step = $derived(100 / (ports.length + 1));
	const portAt = (side: HandleSide, index: number) =>
		(index + 1) * step + (hasInput && side === handles.input && ports.length % 2 ? step / 2 : 0);
	// An extra input on the output side moves off a centred port the same way.
	const inputAt = (side: HandleSide) =>
		50 + (side === outputSide && ports.length % 2 ? step / 2 : 0);

	const hidden = 'pointer-events-none opacity-0';
	function inputClass(side: HandleSide): string {
		if (side === handles.input || used.has(handleId(INPUT_HANDLE, side, handles.input))) return '';
		return linking && !linkingFromHere ? 'opacity-60' : hidden;
	}
	const extraSide = (side: HandleSide, port: string) =>
		side !== outputSide && !used.has(handleId(port, side, outputSide));
	function portClass(side: HandleSide, port: string): string {
		if (!extraSide(side, port)) return '!h-2.5 !w-2.5';
		// Discreet until pointed at: the node stays readable on hover
		return linking
			? `!h-2 !w-2 ${hidden}`
			: '!h-2 !w-2 opacity-0 group-hover:opacity-40 hover:!opacity-100';
	}
	const portTone = (port: string) =>
		port === 'error' || port === 'timeout' || port === 'false' ? '!bg-destructive' : '!bg-primary';

	// xyflow measures the handles once: tell it when they move
	const updateNodeInternals = useUpdateNodeInternals();
	$effect(() => {
		void handles.input;
		void handles.output;
		void ports.length;
		void hasInput;
		updateNodeInternals(id);
	});
</script>

<div
	class={`group relative w-[228px] rounded-xl bg-card text-card-foreground transition-shadow ${
		selected
			? 'shadow-sm ring-2 ring-primary'
			: liveState && LIVE_RINGS[liveState]
				? LIVE_RINGS[liveState]
				: errors.length
					? 'shadow-sm ring-1 ring-destructive'
					: 'shadow-sm ring-1 ring-slate-200 dark:ring-white/10'
	}`}
	style={`min-height: ${minHeight}px${peers.length ? `; outline: 2px solid ${peers[0].color}; outline-offset: 2px` : ''}`}
	data-testid={`wf-node-${id}`}
	data-live={liveState}
>
	{#if hasInput}
		{#each HANDLE_SIDES as side (side)}
			<Handle
				type="target"
				position={POSITIONS[side]}
				id={handleId(INPUT_HANDLE, side, handles.input)}
				style={at(side, side === handles.input ? 50 : inputAt(side))}
				class={`!h-2.5 !w-2.5 !bg-muted-foreground transition-opacity ${inputClass(side)}`}
			/>
		{/each}
	{/if}

	<div class={`flex min-h-[50px] items-center gap-2.5 px-2.5 py-2 ${PADDING[outputSide]}`}>
		<span
			class={`grid size-7 shrink-0 place-items-center rounded-lg ${nodeTone(type)}`}
			title={typeLabel}
		>
			<Icon class="size-3.5" />
		</span>
		<div class="min-w-0 flex-1 leading-tight">
			<div
				class="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
			>
				{typeLabel}
			</div>
			<div class="truncate text-[12px] font-medium" title={`${label} · ${id}`}>{label}</div>
			{#if triggers}
				<div
					class="truncate text-2xs text-amber-700 dark:text-amber-300"
					title={triggers}
					data-testid="wf-node-triggers"
				>
					{triggers}
				</div>
			{/if}
		</div>
		{#if liveState}
			<span
				class="flex shrink-0 items-center justify-center"
				title={LIVE_TITLES[liveState]}
				data-testid={`wf-node-live-${id}`}
			>
				{#if LIVE_DOTS[liveState]}
					<span class="relative flex size-1.5">
						<span
							class={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${LIVE_DOTS[liveState]}`}
						></span>
						<span class={`relative inline-flex size-1.5 rounded-full ${LIVE_DOTS[liveState]}`}
						></span>
					</span>
				{:else if liveState === 'succeeded'}
					<span class="grid size-3.5 place-items-center rounded-full bg-emerald-500 text-white">
						<CheckIcon class="size-2.5" strokeWidth={3} />
					</span>
				{:else}
					<span class="grid size-3.5 place-items-center rounded-full bg-red-500 text-white">
						<XIcon class="size-2.5" strokeWidth={3} />
					</span>
				{/if}
			</span>
		{/if}
	</div>

	{#if errors.length}
		<span
			class="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-destructive px-1 text-2xs font-semibold text-destructive-foreground"
			title={errors.join('\n')}
			data-testid={`wf-node-errors-${id}`}
		>
			<CircleAlertIcon size={10} />
			{errors.length}
		</span>
	{/if}

	{#if stats?.total}
		<span
			class={`absolute -top-2 left-2 flex h-4 items-center gap-0.5 rounded-full border bg-card px-1.5 font-mono text-[9px] ${
				failed ? 'border-destructive/60 text-destructive' : 'text-muted-foreground'
			}`}
			title={statsTitle}
			data-testid={`wf-node-events-${id}`}
		>
			{stats.total}{failed ? ` · ${failed} failed` : ''}
		</span>
	{/if}

	{#if peerNames.length}
		<span
			class="pointer-events-none absolute -bottom-2.5 right-2 flex h-4 max-w-[85%] items-center truncate rounded-full px-1.5 text-[9px] font-medium text-white"
			style={`background-color: ${peers[0].color}`}
			title={`Being configured by ${peerNames.join(', ')}`}
			data-testid={`wf-node-editors-${id}`}
		>
			{peerNames.join(', ')}
		</span>
	{/if}

	{#each HANDLE_SIDES as side (side)}
		{#each ports as port, index (port)}
			{#if side === outputSide && ports.length > 1}
				<span
					class={`pointer-events-none absolute text-[9px] uppercase tracking-wide text-muted-foreground ${LABEL_SIDE[side]}`}
					style={at(side, portAt(side, index))}
				>
					{port}
				</span>
			{/if}
			<Handle
				type="source"
				position={POSITIONS[side]}
				id={handleId(port, side, outputSide)}
				style={at(side, portAt(side, index))}
				class={`transition-opacity ${portTone(port)} ${portClass(side, port)}`}
				title={side === outputSide ? undefined : port}
			/>
		{/each}
	{/each}
</div>
