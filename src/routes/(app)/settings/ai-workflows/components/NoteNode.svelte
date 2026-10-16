<!--
  Canvas note: a sticky note documenting part of the workflow. It has
  no connectors and never runs; it sits under the other nodes, so it
  can be stretched behind the group it describes. Selected (and the
  workflow editable), its corners and sides resize it; the size is kept
  in its config (`width` / `height`). The text is Markdown, rendered
  under the untrusted profile: a workflow can be imported or drafted by
  Yuki, so a note must not be able to fake IRIS UI or beacon out.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { NodeResizer, type NodeProps } from '@xyflow/svelte';
	import { CircleAlertIcon } from 'lucide-svelte';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import {
		NOTE_MAX_SIZE,
		NOTE_MIN_SIZE,
		noteSize,
		type FlowNode
	} from '$lib/utils/ai-workflow-graph';
	import { WORKFLOW_EDITOR_CTX, noteTone } from '../helpers/ui';
	import type { WorkflowEditorCtx } from '../helpers/editor';

	let { id, selected, width, height }: NodeProps<FlowNode> = $props();

	const editor = getContext<WorkflowEditorCtx>(WORKFLOW_EDITOR_CTX);

	const config = $derived(editor?.meta[id]?.config);
	const label = $derived(editor?.meta[id]?.label ?? '');
	const text = $derived(typeof config?.text === 'string' ? config.text : '');
	const size = $derived(noteSize(config));
	const errors = $derived(editor?.errors[id] ?? []);
	const peers = $derived(editor?.editors[id] ?? []);

	function onResizeEnd(_event: unknown, params: { width: number; height: number }) {
		const meta = editor?.meta[id];
		if (!meta) return;
		const next = noteSize({ width: params.width, height: params.height });
		meta.config = { ...meta.config, width: next.width, height: next.height };
	}
</script>

<NodeResizer
	isVisible={selected && !editor?.readOnly}
	minWidth={NOTE_MIN_SIZE}
	minHeight={NOTE_MIN_SIZE}
	maxWidth={NOTE_MAX_SIZE}
	maxHeight={NOTE_MAX_SIZE}
	{onResizeEnd}
/>
<div
	class={`relative flex flex-col overflow-hidden rounded-md border shadow-sm ${noteTone(config?.color)} ${
		selected ? 'ring-2 ring-primary' : ''
	} ${errors.length ? 'border-destructive' : ''}`}
	style={`width: ${width ?? size.width}px; height: ${height ?? size.height}px${
		peers.length ? `; outline: 2px solid ${peers[0].color}; outline-offset: 2px` : ''
	}`}
	data-testid={`wf-node-${id}`}
	data-note
>
	{#if label}
		<div class="shrink-0 truncate px-2.5 pt-2 text-xs font-semibold" title={label}>{label}</div>
	{/if}
	<div
		class="nowheel min-h-0 flex-1 overflow-y-auto px-2.5 py-2 text-xs leading-snug"
		data-testid={`wf-note-text-${id}`}
	>
		{#if text}<MarkDownPreview
				markdown={text}
				untrusted
				class="text-xs text-inherit [&_*]:text-inherit"
			/>{:else}<span class="italic opacity-60">Empty note: write it in the panel.</span>{/if}
	</div>
	{#if errors.length}
		<span
			class="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-destructive px-1 text-2xs font-semibold text-destructive-foreground"
			title={errors.join('\n')}
			data-testid={`wf-node-errors-${id}`}
		>
			<CircleAlertIcon size={10} />
			{errors.length}
		</span>
	{/if}
</div>
