<!--
  One attached case in the war-room datastore panel: a collapsible header
  over the case's own tree, with the same actions as the case panel
  (`CaseDatastoreTree`). Each section owns a case datastore context, so
  edits, moves and uploads go to that case.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronDownIcon, ChevronRightIcon } from 'lucide-svelte';
	import { createCaseDatastoreContext } from '$lib/contexts/case-datastore.context.svelte';
	import CaseDatastoreTree from '$lib/components/common/Datastore/CaseDatastoreTree.svelte';

	type Props = {
		caseId: number;
		caseName: string;
		filter?: string;
		/** Bumped by the panel's refresh button. */
		refreshKey?: number;
	};

	let { caseId, caseName, filter = '', refreshKey = 0 }: Props = $props();

	// The panel keys sections by case id, so the id never changes here.
	const datastore = createCaseDatastoreContext(() => caseId);

	let open = $state(true);

	$effect(() => {
		void refreshKey;
		untrack(() => void datastore.loadTree());
	});

	// Cases are stored as "#42 - Title"; the id is already shown beside it.
	const title = $derived(caseName.match(/^#\d+\s*-\s*(.+)$/)?.[1] ?? caseName);
</script>

<section class="flex flex-col">
	<button
		type="button"
		class="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/60"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		{#if open}
			<ChevronDownIcon size={14} class="shrink-0 text-muted-foreground" />
		{:else}
			<ChevronRightIcon size={14} class="shrink-0 text-muted-foreground" />
		{/if}
		<span class="shrink-0 font-mono text-muted-foreground">#{caseId}</span>
		<span class="min-w-0 truncate font-medium" title={caseName}>{title}</span>
	</button>
	{#if open}
		<div class="pl-2">
			<CaseDatastoreTree {datastore} {caseId} {filter} withAddDialogs />
		</div>
	{/if}
</section>
