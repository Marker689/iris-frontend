<!--
  The asset flags menu of tracker rows: "Set flag ▸" offers every flag,
  "Remove flag ▸" the ones the targeted assets carry. The trigger is the
  flag chips of a row, or a "Flags" button for the selection.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { assetFlagDotClass, type AssetFlag } from '$lib/services/asset-flags.service';
	import { assetFlags } from '$lib/stores/asset-flags.store.svelte';
	import type { FlagApplyAction } from '../../assets/flag-helpers';

	type Props = {
		/** Ids of the flags the targeted assets carry. */
		carried: number[];
		disabled?: boolean;
		label: string;
		triggerClass?: string;
		testId?: string;
		onPick: (flag: AssetFlag, action: FlagApplyAction) => void;
		children: Snippet;
	};

	let {
		carried,
		disabled = false,
		label,
		triggerClass = '',
		testId,
		onPick,
		children
	}: Props = $props();

	const removable = $derived(assetFlags.items.filter((f) => carried.includes(f.id)));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={triggerClass}
		{disabled}
		aria-label={label}
		title={label}
		data-testid={testId}
	>
		{@render children()}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start">
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger disabled={assetFlags.items.length === 0}>
				Set flag
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent>
				{#each assetFlags.items as f (f.id)}
					<DropdownMenu.Item onclick={() => onPick(f, 'set')}>
						<span class="h-2 w-2 shrink-0 rounded-full {assetFlagDotClass(f.color)}"></span>
						{f.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger disabled={removable.length === 0}
				>Remove flag</DropdownMenu.SubTrigger
			>
			<DropdownMenu.SubContent>
				{#each removable as f (f.id)}
					<DropdownMenu.Item onclick={() => onPick(f, 'clear')}>
						<span class="h-2 w-2 shrink-0 rounded-full {assetFlagDotClass(f.color)}"></span>
						{f.name}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
	</DropdownMenu.Content>
</DropdownMenu.Root>
