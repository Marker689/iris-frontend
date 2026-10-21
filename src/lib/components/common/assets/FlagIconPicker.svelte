<!--
  Icon picker over an allow-list of lucide icons (the asset flag icons
  by default), the picked one tinted with `color`. Shared by the asset
  flags settings and the war-room trackers.
-->
<script lang="ts">
	import type { Icon as LucideIcon } from 'lucide-svelte';
	import { assetFlagChipClass } from '$lib/services/asset-flags.service';
	import { ASSET_FLAG_ICONS } from './asset-flag-icon';

	type Props = {
		value: string;
		color?: string;
		icons?: Record<string, typeof LucideIcon>;
		disabled?: boolean;
		labelledby?: string;
	};

	let {
		value = $bindable(),
		color = 'slate',
		icons = ASSET_FLAG_ICONS,
		disabled = false,
		labelledby
	}: Props = $props();

	const names = $derived(Object.keys(icons));
</script>

<div class="flex flex-wrap gap-1" role="radiogroup" aria-labelledby={labelledby}>
	{#each names as name (name)}
		{@const Icon = icons[name]}
		<button
			type="button"
			role="radio"
			aria-checked={value === name}
			aria-label={name}
			title={name}
			{disabled}
			onclick={() => (value = name)}
			class="flex h-8 w-8 items-center justify-center rounded-md border transition-colors {value ===
			name
				? assetFlagChipClass(color)
				: 'text-muted-foreground hover:bg-muted'}"
		>
			<Icon class="h-4 w-4" aria-hidden="true" />
		</button>
	{/each}
</div>
