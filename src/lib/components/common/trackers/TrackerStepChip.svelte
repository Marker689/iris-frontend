<!--
  Compact pill for one war-room tracker step, in the asset-flag palette.
-->
<script lang="ts">
	import { assetFlagChipClass } from '$lib/services/asset-flags.service';
	import type { TrackerStep } from '$lib/services/war-room-trackers.service';
	import { getTrackerIcon } from './tracker-icon';

	type Props = {
		step: Pick<TrackerStep, 'name' | 'color' | 'icon'>;
		size?: 'xs' | 'sm';
		title?: string;
		/** Dimmed (e.g. a step not set yet, in a picker). */
		muted?: boolean;
	};

	let { step, size = 'xs', title, muted = false }: Props = $props();

	const Icon = $derived(getTrackerIcon(step.icon));
</script>

<span
	class={[
		'inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-medium',
		size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
		muted ? 'border-dashed border-border text-muted-foreground' : assetFlagChipClass(step.color)
	]}
	{title}
	data-testid="tracker-step-chip"
>
	<Icon class={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
	<span class="truncate">{step.name}</span>
</span>
