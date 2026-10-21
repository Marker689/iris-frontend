<!--
  One attached case in the war-room datastore panel: the case's own tree,
  with the same actions as the case panel (`DatastoreTree`), its root
  folder labelled with the case. Each section owns a case datastore
  context, so edits, moves and uploads go to that case.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { createCaseDatastoreContext } from '$lib/contexts/case-datastore.context.svelte';
	import DatastoreTree from '$lib/components/common/Datastore/DatastoreTree.svelte';

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

	$effect(() => {
		void refreshKey;
		untrack(() => void datastore.loadTree());
	});

	// Cases are stored as "#42 - Title"; strip it so the id isn't shown twice.
	const label = $derived(`#${caseId} ${caseName.match(/^#\d+\s*-\s*(.+)$/)?.[1] ?? caseName}`);
	const hasTree = $derived(Object.keys(datastore.tree.data).length > 0);
</script>

<section class="flex flex-col">
	{#if !hasTree}
		<p class="truncate px-1.5 py-1 text-sm" title={caseName}>{label}</p>
	{/if}
	<DatastoreTree {datastore} {caseId} {filter} rootLabel={label} withAddDialogs />
</section>
