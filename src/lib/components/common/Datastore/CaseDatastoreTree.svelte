<!--
  A case's DataStore tree with its full behaviour, shared by the case
  panel and by each attached case in the war-room panel:
  - Click row → dropdown of actions (preview, download, copy link, …)
  - Right-click row → the same actions in a menu at the cursor
  - Drag a file/folder onto another folder → moves it
  - Drag external files from the OS onto a folder → uploads them there

  Everything goes through the `datastore` passed in, which is also
  provided as the case datastore context below so the dialogs act on
  this case even when several trees are on screen. `withAddDialogs`
  mounts the add-file / add-folder dialogs; the case layout already
  mounts its own. `rootLabel` renames the root folder (the war room
  shows the case there instead of a header above it).
-->
<script lang="ts">
	import { setContext } from 'svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/stores/toast.store';
	import DatastoreTreeNode, {
		type DragSource
	} from '$lib/components/common/Datastore/DatastoreTreeNode.svelte';
	import DatastoreEditFileDialog from '$lib/components/common/Datastore/DatastoreEditFileDialog.svelte';
	import DatastoreAddFileDialog from '$lib/components/common/Datastore/DatastoreAddFileDialog.svelte';
	import DatastoreAddFolderDialog from '$lib/components/common/Datastore/DatastoreAddFolderDialog.svelte';
	import {
		datastoreCopyToClipboard,
		datastoreDownloadBlobUrl,
		datastoreOpenBlobUrl,
		datastoreUploadFiles
	} from '$lib/components/common/Datastore/datastore-actions';
	import type { DataStoreFile } from '$lib/types/resources/datastore';

	type Props = {
		datastore: CaseDatastoreContext;
		caseId: number;
		filter?: string;
		withAddDialogs?: boolean;
		emptyMessage?: string;
		rootLabel?: string;
	};

	let {
		datastore,
		caseId,
		filter = '',
		withAddDialogs = false,
		emptyMessage = 'No files yet.',
		rootLabel
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	setContext<CaseDatastoreContext>(CASE_DATASTORE_CTX, datastore);

	const selectedFileId = $derived<number | undefined>(datastore.ui.selectedFileId);

	const displayTree = $derived.by(() => {
		const data = datastore.tree.data;
		if (!rootLabel) return data;
		return Object.fromEntries(
			Object.entries(data).map(([key, node]) => [
				key,
				node.type === 'directory' && node.is_root ? { ...node, name: rootLabel } : node
			])
		) as typeof data;
	});

	const openAddFile = (folderId?: number) => {
		if (folderId !== undefined) datastore.ui.selectedFolderId = folderId;
		datastore.ui.showAddFileModal = true;
	};

	const openAddFolder = (folderId?: number) => {
		if (folderId !== undefined) datastore.ui.selectedFolderId = folderId;
		datastore.ui.showAddFolderModal = true;
	};

	const handleFolderAction = async (
		action: 'add-file' | 'add-folder' | 'rename' | 'delete',
		folderId: number
	) => {
		switch (action) {
			case 'add-file':
				openAddFile(folderId);
				return;
			case 'add-folder':
				openAddFolder(folderId);
				return;
			case 'rename': {
				const name = window.prompt('New folder name');
				if (!name?.trim()) return;
				const ok = await datastore.renameFolder(folderId, { folder_name: name.trim() });
				toast({
					title: ok ? 'Folder renamed' : 'Rename failed',
					variant: ok ? 'success' : 'destructive'
				});
				return;
			}
			case 'delete': {
				if (!window.confirm('Delete this folder and all its contents?')) return;
				const ok = await datastore.deleteFolder(folderId);
				toast({
					title: ok ? 'Folder deleted' : 'Delete failed',
					variant: ok ? 'success' : 'destructive'
				});
				return;
			}
		}
	};

	let editingFile = $state<DataStoreFile | null>(null);
	let editOpen = $state(false);

	const handleFileAction = async (
		action: 'preview' | 'download' | 'copy-link' | 'copy-markdown' | 'edit' | 'delete' | 'select',
		fileId: number
	) => {
		const file = datastore.fileById[fileId];

		switch (action) {
			case 'select':
				datastore.selectFile(fileId);
				return;
			case 'preview': {
				const fetched = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
				datastoreOpenBlobUrl(fetched?.url ?? null);
				return;
			}
			case 'download': {
				const fetched = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
				datastoreDownloadBlobUrl(
					fetched?.url ?? null,
					file?.file_original_name ?? fetched?.filename ?? ''
				);
				return;
			}
			case 'copy-link':
				await datastoreCopyToClipboard(CaseDatastoreService.getViewUrl(caseId, fileId), 'Link');
				return;
			case 'copy-markdown': {
				const label = file?.file_original_name ?? `File #${fileId}`;
				await datastoreCopyToClipboard(
					CaseDatastoreService.getMarkdownLink(caseId, fileId, label),
					'Markdown link'
				);
				return;
			}
			case 'edit':
				editingFile = file ?? null;
				editOpen = true;
				return;
			case 'delete': {
				if (!window.confirm('Delete this file?')) return;
				const ok = await datastore.deleteFile(fileId);
				toast({
					title: ok ? 'File deleted' : 'Delete failed',
					variant: ok ? 'success' : 'destructive'
				});
				return;
			}
		}
	};

	// --- Context menu ---
	// One floating menu controlled by `contextMenu`; the tree dispatches
	// folder/file targets via callbacks. Positioned at the click point and
	// clamped to viewport so it never overflows on the right edge.
	type ContextTarget =
		| { kind: 'folder'; id: number; isRoot: boolean }
		| { kind: 'file'; id: number };

	let contextMenu = $state<{
		open: boolean;
		x: number;
		y: number;
		target: ContextTarget | null;
	}>({ open: false, x: 0, y: 0, target: null });
	let menuEl = $state<HTMLDivElement | null>(null);

	const closeContextMenu = () => {
		contextMenu = { open: false, x: 0, y: 0, target: null };
	};

	const openContextMenu = (target: ContextTarget, x: number, y: number) => {
		// Clamp roughly — the menu is ~220px wide, ~280px tall in its largest
		// folder variant. Real width is measured by the browser; this just
		// keeps it from spawning off-screen.
		const W = 220;
		const H = 280;
		const cx = Math.min(x, window.innerWidth - W - 8);
		const cy = Math.min(y, window.innerHeight - H - 8);
		contextMenu = { open: true, x: cx, y: cy, target };
	};

	$effect(() => {
		if (!contextMenu.open) return;
		const onClick = (e: MouseEvent) => {
			if (menuEl && menuEl.contains(e.target as Node)) return;
			closeContextMenu();
		};
		// Escape closes the menu only, not the panel around it: captured on
		// the window, before the panel's own document listener sees it.
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			closeContextMenu();
		};
		// `mousedown` instead of `click` so the menu closes on the same press
		// that lands on another row, before that row's own handler runs.
		const timer = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
		window.addEventListener('keydown', onKey, true);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', onClick);
			window.removeEventListener('keydown', onKey, true);
		};
	});

	// --- Drag and drop ---
	let dropTargetFolderId = $state<number | null>(null);

	const moveSource = async (source: DragSource, targetFolderId: number) => {
		dropTargetFolderId = null;
		if (source.kind === 'file') {
			const ok = await datastore.moveFile(source.id, targetFolderId);
			toast({
				title: ok ? 'File moved' : 'Move failed',
				variant: ok ? 'success' : 'destructive'
			});
		} else {
			const ok = await datastore.moveFolder(source.id, targetFolderId);
			toast({
				title: ok ? 'Folder moved' : 'Move failed',
				variant: ok ? 'success' : 'destructive'
			});
		}
	};

	// Files dragged in from the OS have no source row to fire `dragend`, so
	// leaving the tree is what clears their highlight.
	const handleTreeDragLeave = (event: DragEvent) => {
		const tree = event.currentTarget as HTMLElement;
		if (!tree.contains(event.relatedTarget as Node | null)) dropTargetFolderId = null;
	};
</script>

{#if datastore.tree.status === 'loading' && Object.keys(datastore.tree.data).length === 0}
	<div class="flex flex-col gap-2 p-2">
		{#each Array(3) as _}
			<Skeleton class="h-5 w-full" />
		{/each}
	</div>
{:else if datastore.tree.status === 'error'}
	<p class="px-2 text-xs text-destructive">
		{datastore.tree.error ?? 'Failed to load'}
	</p>
{:else if Object.keys(datastore.tree.data).length === 0}
	<p class="px-2 text-xs text-muted-foreground">{emptyMessage}</p>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div ondragleave={handleTreeDragLeave}>
		<DatastoreTreeNode
			tree={displayTree}
			{caseId}
			showRootBadge={!rootLabel}
			{selectedFileId}
			{dropTargetFolderId}
			{filter}
			onFolderAction={handleFolderAction}
			onFileAction={handleFileAction}
			onContextMenuFolder={(id, isRoot, x, y) =>
				openContextMenu({ kind: 'folder', id, isRoot }, x, y)}
			onContextMenuFile={(id, x, y) => openContextMenu({ kind: 'file', id }, x, y)}
			onMove={(source, targetFolderId) => moveSource(source, targetFolderId)}
			onUploadFiles={(folderId, files) => datastoreUploadFiles(datastore, folderId, files)}
			onDragTargetChange={(id) => (dropTargetFolderId = id)}
		/>
	</div>
{/if}

{#if contextMenu.open && contextMenu.target}
	{@const target = contextMenu.target}
	<div
		bind:this={menuEl}
		role="menu"
		class="fixed z-[100] min-w-[200px] overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
	>
		{#if target.kind === 'folder'}
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFolderAction('add-file', target.id);
				}}
			>
				Add file here
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFolderAction('add-folder', target.id);
				}}
			>
				Add subfolder
			</button>
			{#if !target.isRoot}
				<div class="my-1 border-t border-border" role="separator"></div>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left hover:bg-muted"
					onclick={() => {
						closeContextMenu();
						handleFolderAction('rename', target.id);
					}}
				>
					Rename
				</button>
				<button
					type="button"
					class="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted"
					onclick={() => {
						closeContextMenu();
						handleFolderAction('delete', target.id);
					}}
				>
					Delete folder
				</button>
			{/if}
		{:else}
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('preview', target.id);
				}}
			>
				Preview
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('download', target.id);
				}}
			>
				Download
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('copy-link', target.id);
				}}
			>
				Copy link
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('copy-markdown', target.id);
				}}
			>
				Copy as markdown link
			</button>
			<div class="my-1 border-t border-border" role="separator"></div>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('edit', target.id);
				}}
			>
				Edit metadata
			</button>
			<button
				type="button"
				class="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted"
				onclick={() => {
					closeContextMenu();
					handleFileAction('delete', target.id);
				}}
			>
				Delete file
			</button>
		{/if}
	</div>
{/if}

<DatastoreEditFileDialog
	bind:open={editOpen}
	file={editingFile}
	onOpenChange={(o) => {
		editOpen = o;
		if (!o) editingFile = null;
	}}
/>

{#if withAddDialogs}
	<DatastoreAddFileDialog
		open={datastore.ui.showAddFileModal}
		onOpenChange={(open) => (datastore.ui.showAddFileModal = open)}
	/>
	<DatastoreAddFolderDialog
		open={datastore.ui.showAddFolderModal}
		onOpenChange={(open) => (datastore.ui.showAddFolderModal = open)}
	/>
{/if}
