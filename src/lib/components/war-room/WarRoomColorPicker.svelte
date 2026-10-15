<!--
  Accent-color picker for war rooms: a row of preset swatches, a native
  picker for anything else, and an optional "no color" swatch. Shared by
  the create dialog and the in-room topbar so both offer the same palette.
-->
<script lang="ts">
	import { CheckIcon, BanIcon } from 'lucide-svelte';
	import { safeHexColor } from '$lib/utils/color';

	let {
		value,
		onchange,
		allowNone = false,
		disabled = false
	}: {
		value: string | null;
		onchange: (color: string | null) => void;
		allowNone?: boolean;
		disabled?: boolean;
	} = $props();

	const PRESETS = [
		'#dc2626',
		'#ea580c',
		'#d97706',
		'#16a34a',
		'#0d9488',
		'#0284c7',
		'#2563eb',
		'#7c3aed',
		'#db2777',
		'#475569'
	];

	const current = $derived(safeHexColor(value)?.toLowerCase() ?? null);
	const isCustom = $derived(current !== null && !PRESETS.includes(current));
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#if allowNone}
		<button
			type="button"
			class={[
				'flex h-6 w-6 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-transform hover:scale-110 disabled:opacity-50',
				current === null && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
			]}
			onclick={() => onchange(null)}
			{disabled}
			aria-label="No color"
			title="No color"
		>
			<BanIcon size={12} />
		</button>
	{/if}
	{#each PRESETS as preset (preset)}
		<button
			type="button"
			class={[
				'flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110 disabled:opacity-50',
				current === preset && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
			]}
			style:background-color={preset}
			onclick={() => onchange(preset)}
			{disabled}
			aria-label={`Color ${preset}`}
			title={preset}
		>
			{#if current === preset}
				<CheckIcon size={12} class="text-white" />
			{/if}
		</button>
	{/each}
	<label
		class={[
			'relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] transition-transform hover:scale-110',
			isCustom && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
			disabled && 'pointer-events-none opacity-50'
		]}
		title="Custom color"
	>
		{#if isCustom}
			<span class="absolute inset-1 rounded-full" style:background-color={current}></span>
		{/if}
		<input
			type="color"
			class="absolute inset-0 cursor-pointer opacity-0"
			value={current ?? '#dc2626'}
			onchange={(e) => onchange((e.target as HTMLInputElement).value)}
			{disabled}
			aria-label="Custom color"
		/>
	</label>
</div>
