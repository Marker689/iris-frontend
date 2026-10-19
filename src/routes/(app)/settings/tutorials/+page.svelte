<!--
  Tutorials admin page. Server administrators write guided tutorials
  for their team here (the editor is `/settings/tutorials/[id]`, `new`
  creates one); published ones are listed in Help → Tutorials next to
  the built-in ones, and run in the same panel.

  The built-in tutorials are listed too. Editing one saves the
  administrators' version of it (`new?builtin=<id>` the first time),
  which replaces it for everyone, or hides it once unpublished;
  deleting that version restores the built-in (`overrides.ts`).
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
		RotateCcwIcon,
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
	import { TUTORIALS, tutorialById } from '$lib/tutorials';
	import { parseTutorialFile, tutorialFileName, tutorialToFile } from '$lib/tutorials/io';
	import { applyOverride } from '$lib/tutorials/overrides';
	import type { Tutorial } from '$lib/tutorials/types';
	import { formatDateTime } from '$lib/utils/time-formatter';

	/** A built-in tutorial, and the administrators' version of it if any. */
	type BuiltInRow = {
		id: string;
		/** `null` when this release no longer ships it. */
		builtIn: Tutorial | null;
		override: CustomTutorial | null;
	};

	let tutorials = $state<CustomTutorial[]>([]);
	const own = $derived(tutorials.filter((item) => !item.builtin_id));
	const builtInRows = $derived.by((): BuiltInRow[] => {
		const overrides = new Map(
			tutorials.filter((item) => item.builtin_id).map((item) => [item.builtin_id ?? '', item])
		);
		const rows: BuiltInRow[] = TUTORIALS.map((builtIn) => ({
			id: builtIn.id,
			builtIn,
			override: overrides.get(builtIn.id) ?? null
		}));
		for (const [id, override] of overrides) {
			if (!tutorialById(id)) rows.push({ id, builtIn: null, override });
		}
		return rows;
	});
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

	/** The tutorial as learners get it: the administrators' version, if any. */
	const effective = (row: BuiltInRow): Tutorial | null => {
		if (!row.override) return row.builtIn;
		return row.builtIn ? applyOverride(row.builtIn, row.override) : toEngineTutorial(row.override);
	};

	function tryBuiltIn(row: BuiltInRow) {
		const item = effective(row);
		if (!item || item.steps.length === 0) {
			toast({ title: 'This tutorial has no steps yet', variant: 'warning' });
			return;
		}
		if (!row.override) tutorialRun.start(row.id);
		else tutorialRun.start(item, { preview: !row.override.published });
	}

	function exportIt(item: Pick<Tutorial, 'title' | 'summary' | 'duration' | 'steps'>) {
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
			toast({
				title: pendingDelete.builtin_id ? 'Built-in tutorial restored' : 'Tutorial deleted',
				variant: 'success'
			});
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

		<div class="flex items-center gap-1.5" data-tour="tutorials-actions">
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
			<Button
				size="sm"
				class="h-7"
				href="/settings/tutorials/new"
				data-testid="tutorial-new"
				data-tour="tutorial-new"
			>
				<PlusIcon size={12} class="mr-1" />
				New tutorial
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-auto p-4">
		<div class="flex flex-col gap-6">
			<section class="flex flex-col gap-2" data-tour="tutorials-built-in">
				<div>
					<h2 class="text-xs font-semibold">Built into IRIS</h2>
					<p class="text-2xs text-muted-foreground">
						Edit one to adapt it to your team: your version replaces it for everyone. Unpublish it
						to hide the tutorial, restore it to get IRIS's version back.
					</p>
				</div>
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-xs">
						<thead
							class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="px-3 py-2">Title</th>
								<th class="w-20 px-3 py-2">Steps</th>
								<th class="w-32 px-3 py-2">Status</th>
								<th class="w-44 px-3 py-2">Updated</th>
								<th class="w-36 px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each builtInRows as row (row.id)}
								{@const item = effective(row)}
								{@const editHref = row.override
									? `/settings/tutorials/${row.override.id}`
									: `/settings/tutorials/new?builtin=${row.id}`}
								<tr class="border-t hover:bg-muted/20" data-testid="tutorial-built-in-row-{row.id}">
									<td class="px-3 py-2">
										<a class="font-medium hover:underline" href={editHref}>
											{row.override?.title ?? item?.title}
										</a>
										{#if row.builtIn?.audience === 'administrators'}
											<span
												class="ml-1 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
											>
												Administrators
											</span>
										{/if}
										{#if row.override?.summary ?? item?.summary}
											<div class="truncate text-muted-foreground">
												{row.override?.summary ?? item?.summary}
											</div>
										{/if}
									</td>
									<td class="px-3 py-2">{(row.override ?? item)?.steps.length ?? 0}</td>
									<td class="px-3 py-2">
										{#if !row.builtIn}
											<span class="text-muted-foreground">No longer in IRIS</span>
										{:else if !row.override}
											<span class="text-muted-foreground">As shipped</span>
										{:else if row.override.published}
											<span class="text-primary">Edited</span>
										{:else}
											<span class="text-muted-foreground">Hidden</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-muted-foreground">
										{row.override ? formatDateTime(row.override.updated_at) : ''}
									</td>
									<td class="px-3 py-2">
										<div class="flex items-center justify-end gap-1">
											<Button
												variant="ghost"
												size="icon"
												class="h-6 w-6"
												aria-label="Try the tutorial"
												title="Try it"
												onclick={() => tryBuiltIn(row)}
											>
												<PlayIcon size={12} />
											</Button>
											{#if row.builtIn}
												<Button
													variant="ghost"
													size="icon"
													class="h-6 w-6"
													aria-label="Edit the tutorial"
													href={editHref}
												>
													<PencilIcon size={12} />
												</Button>
											{/if}
											{#if item}
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
											{/if}
											{#if row.override}
												{@const override = row.override}
												<Button
													variant="ghost"
													size="icon"
													class="h-6 w-6"
													aria-label="Restore the built-in tutorial"
													title="Restore IRIS's version"
													onclick={() => requestDelete(override)}
												>
													<RotateCcwIcon size={12} />
												</Button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<section class="flex flex-col gap-2" data-tour="tutorials-own">
				<h2 class="text-xs font-semibold">Written by your team</h2>
				{#if own.length === 0 && !loading}
					<div
						class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center text-muted-foreground"
					>
						<GraduationCapIcon size={32} class="opacity-40" />
						<p class="text-sm">No tutorials yet.</p>
						<p class="max-w-md text-xs">
							Write one step by step, or press Record in the editor and do the procedure once: the
							pages you open and what you save become the steps.
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
									<th class="w-32 px-3 py-2">Status</th>
									<th class="w-44 px-3 py-2">Updated</th>
									<th class="w-36 px-3 py-2"></th>
								</tr>
							</thead>
							<tbody>
								{#each own as item (item.id)}
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
										<td class="px-3 py-2 text-muted-foreground">
											{formatDateTime(item.updated_at)}
										</td>
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
			</section>
		</div>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={pendingDelete?.builtin_id ? 'Restore the built-in tutorial?' : 'Delete tutorial?'}
	message={pendingDelete
		? `The tutorial "${pendingDelete.title}" will be permanently deleted.`
		: ''}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>
