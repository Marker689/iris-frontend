<!--
  Sliding side panel that shows the case DataStore tree from anywhere in
  the workspace. Mirrors CaseActivityPanel's chrome.

  Interactions:
  - Click row → opens dropdown menu of actions (download, copy link, …)
  - Right-click row → opens the same action menu at the cursor
  - Drag a file/folder onto another folder → moves it
  - Drag external files from the OS → uploads them to the target folder
    (or the root if dropped on empty area / panel chrome)
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		DatabaseIcon,
		FolderPlusIcon,
		PlusIcon,
		RefreshCwIcon,
		SearchIcon,
		XIcon,
		UploadIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		DATASTORE_PANEL_CTX,
		type DatastorePanelContext
	} from '$lib/contexts/datastore-panel.context.svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { toast } from '$lib/stores/toast.store';
	import CaseDatastoreTree from '$lib/components/common/Datastore/CaseDatastoreTree.svelte';
	import { datastoreUploadFiles } from '$lib/components/common/Datastore/datastore-actions';

	const panel = getContext<DatastorePanelContext>(DATASTORE_PANEL_CTX);
	const datastore = getContext<CaseDatastoreContext>(CASE_DATASTORE_CTX);

	let isRefreshing = $state(false);
	let searchTerm = $state('');

	const caseId = $derived(Number(page.params.case_id));

	const refresh = async () => {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			await datastore.loadTree({ fetch });
		} finally {
			isRefreshing = false;
		}
	};

	let wasOpen = false;
	$effect(() => {
		const isOpen = panel.state.open;
		if (isOpen && !wasOpen) {
			wasOpen = true;
			void refresh();
		} else if (!isOpen) {
			wasOpen = false;
		}
	});

	$effect(() => {
		if (!panel.state.open) return;
		const handler = (e: KeyboardEvent) => {
			// An open context menu catches Escape first (see CaseDatastoreTree).
			if (e.key === 'Escape') panel.close();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});

	onMount(() => {
		if (panel.state.open) void refresh();
	});

	const openAddFile = (folderId?: number) => {
		if (folderId !== undefined) datastore.ui.selectedFolderId = folderId;
		datastore.ui.showAddFileModal = true;
	};

	const openAddFolder = (folderId?: number) => {
		if (folderId !== undefined) datastore.ui.selectedFolderId = folderId;
		datastore.ui.showAddFolderModal = true;
	};

	// Tracks whether an external-file drag is currently over the panel body
	// (so we can show the big "drop to upload" overlay).
	let bodyDropActive = $state(false);

	// Body-level drag handlers: catch OS-file drops that don't land on a
	// specific folder row. We upload to the root folder in that case.
	const handleBodyDragOver = (event: DragEvent) => {
		if (!event.dataTransfer) return;
		if (!event.dataTransfer.types.includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		bodyDropActive = true;
	};

	const handleBodyDragLeave = (event: DragEvent) => {
		// Only clear when we leave the actual panel body — dragging onto a
		// child element triggers dragleave on the parent first.
		if (event.currentTarget === event.target) {
			bodyDropActive = false;
		}
	};

	const handleBodyDrop = async (event: DragEvent) => {
		if (!event.dataTransfer) return;
		const files = event.dataTransfer.files;
		if (!files || files.length === 0) {
			bodyDropActive = false;
			return;
		}
		event.preventDefault();
		const target = datastore.tree.rootId;
		if (target == null) {
			toast({ title: 'No target folder available', variant: 'destructive' });
			bodyDropActive = false;
			return;
		}
		await datastoreUploadFiles(datastore, target, files);
		bodyDropActive = false;
	};
</script>

{#if panel.state.open}
	<div class="flex h-full w-full flex-col">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3 dark:border-slate-700">
			<DatabaseIcon class="size-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0 flex-1">
				<div class="text-2xs uppercase tracking-wide text-muted-foreground">DataStore</div>
				<div class="truncate text-sm font-semibold">Case files</div>
			</div>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="ghost"
							size="icon"
							class="size-7"
							onclick={() => openAddFolder(datastore.tree.rootId ?? undefined)}
							aria-label="Add folder"
						>
							<FolderPlusIcon class="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Add folder</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="ghost"
							size="icon"
							class="size-7"
							onclick={() => openAddFile(datastore.tree.rootId ?? undefined)}
							aria-label="Add file"
						>
							<PlusIcon class="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Add file</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={refresh}
				disabled={isRefreshing}
				aria-label="Refresh datastore"
			>
				<RefreshCwIcon class={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
			</Button>

			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={() => panel.close()}
				aria-label="Close datastore panel"
			>
				<XIcon class="size-4" />
			</Button>
		</header>

		<div class="border-b border-border/60 px-3 py-2 dark:border-slate-700/60">
			<div class="relative">
				<SearchIcon
					size={12}
					class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input bind:value={searchTerm} placeholder="Search files…" class="h-7 pl-7 text-xs" />
			</div>
		</div>

		<!--
			Body acts as a passive drop zone for OS-file uploads when nothing
			more specific (a folder row) catches the drop. The big overlay
			only renders while a file is actively over the panel.
		-->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative min-h-0 flex-1 overflow-auto px-2 py-2"
			ondragover={handleBodyDragOver}
			ondragleave={handleBodyDragLeave}
			ondrop={handleBodyDrop}
			ondropcapture={() => (bodyDropActive = false)}
		>
			{#key caseId}
				<CaseDatastoreTree
					{datastore}
					{caseId}
					filter={searchTerm}
					emptyMessage="No files yet — drop one here or use the + button above."
				/>
			{/key}

			{#if bodyDropActive}
				<div
					class="pointer-events-none absolute inset-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5"
					aria-hidden="true"
				>
					<UploadIcon class="size-8 text-primary" />
					<p class="mt-2 text-sm font-medium text-primary">Drop to upload to root</p>
					<p class="text-2xs text-muted-foreground">Hover a folder to upload there instead</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
