<!--
  The Export button of a grid: copy the rows as a table or download them
  as CSV, both opening the column picker first. Grid-specific exports
  (e.g. an IOC blocklist) go in `children`, below a separator.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ClipboardCopy, Download, FileSpreadsheet } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';

	type Props = {
		open?: boolean;
		/** Plural noun of the rows, e.g. "assets". */
		noun: string;
		/** No row to copy or download: the two table actions are disabled. */
		empty?: boolean;
		onCopy: () => void;
		onCsv: () => void;
		children?: Snippet;
		testId?: string;
	};

	let {
		open = $bindable(false),
		noun,
		empty = false,
		onCopy,
		onCsv,
		children,
		testId = 'table-export'
	}: Props = $props();

	const run = (action: () => void) => {
		open = false;
		action();
	};
</script>

<Popover bind:open>
	<PopoverTrigger>
		<Button variant="outline" size="sm" class="gap-1.5" data-testid={testId}>
			<Download class="h-3.5 w-3.5" /> Export
		</Button>
	</PopoverTrigger>
	<PopoverContent align="end" class="w-64 p-3">
		<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Table</p>
		<p class="mt-1 text-2xs text-muted-foreground">The {noun} listed, in the columns you pick.</p>
		<div class="mt-2 flex flex-col gap-1">
			<Button
				variant="ghost"
				size="sm"
				class="justify-start gap-2"
				disabled={empty}
				onclick={() => run(onCopy)}
				data-testid={`${testId}-copy`}
			>
				<ClipboardCopy class="h-3.5 w-3.5" /> Copy as table…
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="justify-start gap-2"
				disabled={empty}
				onclick={() => run(onCsv)}
				data-testid={`${testId}-csv`}
			>
				<FileSpreadsheet class="h-3.5 w-3.5" /> Download CSV…
			</Button>
		</div>
		{#if children}
			<div class="mt-3 border-t pt-3">
				{@render children()}
			</div>
		{/if}
	</PopoverContent>
</Popover>
