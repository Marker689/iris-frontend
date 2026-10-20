<!--
  Workflow edge: xyflow's bezier, routed around the nodes in its way
  (see edge-routing). Registered as the canvas's `default` edge type.
  While a run is shown, the links it went through are drawn in solid
  indigo (traced in as they are taken) and the others dashed; the port
  of a branching node (`true`, `false`, `error`...) sits beside the link.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { useNodes, type EdgeProps } from '@xyflow/svelte';
	import { routeEdge, type Box, type Side } from '$lib/utils/edge-routing';
	import { WORKFLOW_EDITOR_CTX } from '../helpers/ui';
	import type { WorkflowEditorCtx } from '../helpers/editor';

	let {
		id,
		source,
		target,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		label,
		markerStart,
		markerEnd,
		interactionWidth = 20,
		selected
	}: EdgeProps = $props();

	const editor = getContext<WorkflowEditorCtx | undefined>(WORKFLOW_EDITOR_CTX);
	const nodes = useNodes();

	const boxes = $derived(
		nodes.current.flatMap((n): Box[] => {
			const width = n.measured?.width ?? n.width;
			const height = n.measured?.height ?? n.height;
			return width && height ? [{ id: n.id, x: n.position.x, y: n.position.y, width, height }] : [];
		})
	);

	const route = $derived(
		routeEdge(
			{
				source: { x: sourceX, y: sourceY },
				sourceSide: sourcePosition as Side,
				target: { x: targetX, y: targetY },
				targetSide: targetPosition as Side,
				sourceId: source,
				targetId: target
			},
			boxes
		)
	);

	// Taken: the run left the source done and reached the target
	const live = $derived(editor?.live ?? {});
	const running = $derived(Object.keys(live).length > 0);
	const taken = $derived(live[source] === 'succeeded' && !!live[target]);

	const stroke = $derived(
		selected
			? 'stroke-primary'
			: taken
				? 'stroke-indigo-500 dark:stroke-indigo-400'
				: 'stroke-slate-900/20 dark:stroke-white/20'
	);

	// The port beside the link, on the side it heads to
	const labelSide = $derived(targetX === sourceX ? 10 : targetX > sourceX ? 12 : -12);
</script>

<path
	{id}
	d={route.path}
	class={`${stroke} ${taken ? 'wf-edge-taken' : ''}`}
	fill="none"
	stroke-width={taken || selected ? 2 : 1.5}
	stroke-linecap="round"
	stroke-dasharray={taken || selected || !running ? undefined : '4 5'}
	pathLength={taken ? 1 : undefined}
	marker-start={markerStart}
	marker-end={markerEnd}
	data-taken={taken || undefined}
/>

{#if interactionWidth > 0}
	<path
		d={route.path}
		stroke-opacity={0}
		stroke-width={interactionWidth}
		fill="none"
		class="svelte-flow__edge-interaction"
	/>
{/if}

{#if label}
	<text
		x={route.labelX + labelSide}
		y={route.labelY}
		text-anchor={labelSide < 0 ? 'end' : 'start'}
		dominant-baseline="middle"
		class="pointer-events-none fill-slate-500 font-mono text-[10px] dark:fill-slate-400"
	>
		{label}
	</text>
{/if}

<style>
	/* Traced in once, when the run takes the link */
	.wf-edge-taken {
		stroke-dasharray: 1;
		animation: wf-edge-draw 0.5s ease-in-out both;
	}

	@keyframes wf-edge-draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
</style>
