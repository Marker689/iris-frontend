<!--
  Compromise or analysis status picker of the scope assets. The table
  cells open it on one asset (current value checked), the selection bar
  on every selected asset (no current value). The trigger content is the
  caller's.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from 'lucide-svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';

	let {
		kind,
		value = null,
		analysisStatuses = [],
		onSelect,
		label,
		triggerClass,
		children
	}: {
		kind: 'compromise' | 'analysis';
		value?: number | null;
		analysisStatuses?: AnalysisStatusItem[];
		onSelect: (id: number) => void;
		label: string;
		triggerClass?: string;
		children: Snippet;
	} = $props();

	const options = $derived(
		kind === 'compromise'
			? Object.entries(COMPROMISE_STATUS).map(([id, name]) => ({ id: Number(id), name }))
			: analysisStatuses
	);
</script>

<DropdownMenu>
	<DropdownMenuTrigger class={triggerClass} aria-label={label} title={label}>
		{@render children()}
	</DropdownMenuTrigger>
	<DropdownMenuContent align="start" class="min-w-[180px]">
		<DropdownMenuLabel class="text-xs text-muted-foreground">
			{kind === 'compromise' ? 'Compromise status' : 'Analysis status'}
		</DropdownMenuLabel>
		{#each options as o (o.id)}
			<DropdownMenuItem
				class="gap-2 text-xs"
				onclick={() => {
					if (o.id !== value) onSelect(o.id);
				}}
			>
				<Check class={`h-3.5 w-3.5 ${o.id === value ? 'opacity-100' : 'opacity-0'}`} />
				{o.name}
			</DropdownMenuItem>
		{:else}
			<DropdownMenuItem disabled class="text-xs">No analysis status available</DropdownMenuItem>
		{/each}
	</DropdownMenuContent>
</DropdownMenu>
