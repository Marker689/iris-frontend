<!--
  Tutorials admin page. Server administrators write guided tutorials
  for their team here (the editor is `/settings/tutorials/[id]`, `new`
  creates one); published ones are listed in Help → Tutorials next to
  the built-in ones, and run in the same panel.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		DownloadIcon,
		GraduationCapIcon,
		PencilIcon,
		PlayIcon,
		PlusIcon,
		RefreshCwIcon,
		Trash2Icon,
		UploadIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { downloadBlob } from '$lib/services/report-templates.service';
	import {
		TutorialsService,
		toEngineTutorial,
		type CustomTutorial
	} from '$lib/services/tutorials.service';
	import { tutorial as tutorialRun } from '$lib/stores/tutorial.store.svelte';
	import { parseTutorialFile, tutorialFileName, tutorialToFile } from '$lib/tutorials/io';
	import { formatDateTime } from '$lib/utils/time-formatter';

	let tutorials = $state<CustomTutorial[]>([]);
	let loading = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	let confirmOpen = $state(false);
	let pendingDelete = $state<CustomTutorial | null>(null);

	async function refresh() {
		loading = true;
		try {
			const res = await TutorialsService.list();
			if (res.ok && Array.isArray(res.data)) {
				tutorials = res.data;
			} else {
				toast({
					title: 'Failed to load tutorials',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			loading = false;
		}
	}

	onMount(() => refresh());

	function tryIt(item: CustomTutorial) {
		if (item.steps.length === 0) {
			toast({ title: 'This tutorial has no steps yet', variant: 'warning' });
			return;
		}
		tutorialRun.start(toEngineTutorial(item), { preview: !item.published });
	}

	function exportIt(item: CustomTutorial) {
		const file = tutorialToFile(item);
		downloadBlob(
			new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
			tutorialFileName(item.title)
		);
	}

	async function importFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		let body;
		try {
			body = parseTutorialFile(await file.text());
		} catch (error) {
			toast({
				title: 'Cannot import this file',
				description: error instanceof Error ? error.message : undefined,
				variant: 'destructive'
			});
			return;
		}
		// Imported tutorials start as drafts: try them before publishing.
		const res = await TutorialsService.create({ ...body, published: false });
		if (res.ok && res.data && typeof res.data === 'object') {
			toast({ title: `Imported "${body.title}" as a draft`, variant: 'success' });
			await goto(`/settings/tutorials/${res.data.id}`);
		} else {
			toast({
				title: 'Failed to import the tutorial',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	}

	function requestDelete(item: CustomTutorial) {
		pendingDelete = item;
		confirmOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const res = await TutorialsService.remove(pendingDelete.id);
		if (res.ok) {
			toast({ title: 'Tutorial deleted', variant: 'success' });
			await refresh();
		} else {
			toast({
				title: 'Failed to delete the tutorial',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
		pendingDelete = null;
	}
</script>

<svelte:head>
	<title>Tutorials</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<GraduationCapIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Tutorials</h1>
				<p class="text-2xs text-muted-foreground">
					Guided walkthroughs of your own procedures. Published ones appear in Help → Tutorials for
					every user.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" onclick={refresh} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			<Button variant="outline" size="sm" class="h-7" onclick={() => fileInput?.click()}>
				<UploadIcon size={12} class="mr-1" />
				Import
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={importFile}
			/>
			<Button size="sm" class="h-7" href="/settings/tutorials/new" data-testid="tutorial-new">
				<PlusIcon size={12} class="mr-1" />
				New tutorial
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-auto p-4">
		{#if tutorials.length === 0 && !loading}
			<div
				class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
			>
				<GraduationCapIcon size={32} class="opacity-40" />
				<p class="text-sm">No tutorials yet.</p>
				<p class="max-w-md text-xs">
					Write one step by step, or press Record in the editor and do the procedure once: the pages
					you open and what you save become the steps.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-md border">
				<table class="w-full text-xs">
					<thead
						class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
					>
						<tr>
							<th class="px-3 py-2">Title</th>
							<th class="w-20 px-3 py-2">Steps</th>
							<th class="w-24 px-3 py-2">Status</th>
							<th class="w-44 px-3 py-2">Updated</th>
							<th class="w-36 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each tutorials as item (item.id)}
							<tr class="border-t hover:bg-muted/20" data-testid="tutorial-row-{item.id}">
								<td class="px-3 py-2">
									<a class="font-medium hover:underline" href="/settings/tutorials/{item.id}">
										{item.title}
									</a>
									{#if item.summary}
										<div class="truncate text-muted-foreground">{item.summary}</div>
									{/if}
								</td>
								<td class="px-3 py-2">{item.steps.length}</td>
								<td class="px-3 py-2">
									{#if item.published}
										<span class="text-primary">Published</span>
									{:else}
										<span class="text-muted-foreground">Draft</span>
									{/if}
								</td>
								<td class="px-3 py-2 text-muted-foreground">{formatDateTime(item.updated_at)}</td>
								<td class="px-3 py-2">
									<div class="flex items-center justify-end gap-1">
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6"
											aria-label="Try the tutorial"
											title="Try it"
											onclick={() => tryIt(item)}
										>
											<PlayIcon size={12} />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6"
											aria-label="Edit the tutorial"
											href="/settings/tutorials/{item.id}"
										>
											<PencilIcon size={12} />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6"
											aria-label="Export the tutorial"
											title="Export as JSON"
											onclick={() => exportIt(item)}
										>
											<DownloadIcon size={12} />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6 text-destructive hover:text-destructive"
											aria-label="Delete the tutorial"
											onclick={() => requestDelete(item)}
										>
											<Trash2Icon size={12} />
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete tutorial?"
	message={pendingDelete
		? `The tutorial "${pendingDelete.title}" will be permanently deleted.`
		: ''}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>
