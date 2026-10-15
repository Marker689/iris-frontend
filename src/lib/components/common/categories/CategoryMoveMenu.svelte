<!--
  "Move to category" menu of one object: No category, then every
  category, the current one checked. The trigger is a small folder
  button unless the caller gives its own `triggerClass`.
-->
<script lang="ts">
	import { Check, FolderInput } from 'lucide-svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { effectiveCategoryId, type Category } from '$lib/services/categories.service';

	let {
		categories,
		value,
		itemName,
		onSelect,
		triggerClass = 'rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
	}: {
		categories: Category[];
		value: number | null | undefined;
		itemName: string;
		onSelect: (categoryId: number | null) => void;
		triggerClass?: string;
	} = $props();

	const current = $derived(effectiveCategoryId(value, categories));

	const pick = (id: number | null) => {
		if (id !== current) onSelect(id);
	};
</script>

<DropdownMenu>
	<DropdownMenuTrigger
		class={triggerClass}
		title="Move to category"
		aria-label={`Move ${itemName} to a category`}
		onclick={(e: MouseEvent) => {
			// The trigger sits on a link / clickable row.
			e.preventDefault();
			e.stopPropagation();
		}}
	>
		<FolderInput class="h-3.5 w-3.5" />
	</DropdownMenuTrigger>
	<DropdownMenuContent align="end" class="max-h-80 min-w-[180px] overflow-y-auto">
		<DropdownMenuLabel class="text-xs text-muted-foreground">Move to category</DropdownMenuLabel>
		<DropdownMenuItem class="gap-2 text-xs" onclick={() => pick(null)}>
			<Check class={`h-3.5 w-3.5 ${current === null ? 'opacity-100' : 'opacity-0'}`} />
			No category
		</DropdownMenuItem>
		{#if categories.length > 0}
			<DropdownMenuSeparator />
		{/if}
		{#each categories as category (category.id)}
			<DropdownMenuItem class="gap-2 text-xs" onclick={() => pick(category.id)}>
				<Check class={`h-3.5 w-3.5 ${current === category.id ? 'opacity-100' : 'opacity-0'}`} />
				<span class="truncate">{category.name}</span>
			</DropdownMenuItem>
		{/each}
	</DropdownMenuContent>
</DropdownMenu>
