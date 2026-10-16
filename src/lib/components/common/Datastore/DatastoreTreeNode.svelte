<!--
  Recursive tree row used by the DataStore side panel. The panel owns:
  - the context menu (right-click) and its handlers
  - the move/upload action dispatch

  This component is purely about laying out rows, rendering the inline `…`
  dropdown for keyboard/touch users, and forwarding pointer and drag-drop
  events up via callbacks. Doing it this way means we have a single,
  consistent menu and a single drop-zone state machine rather than per-row
  copies of either.
-->
<script module lang="ts">
	export type DragSource = { kind: 'file'; id: number } | { kind: 'folder'; id: number };

	// The drag in progress, shared by every row of every tree on screen
	// (the war room shows one tree per case). `dragover` cannot read the
	// payload — browsers only expose its MIME types until the drop — so
	// rows look here to decide whether to accept it. `blocked` holds the
	// folders a drop would be a no-op or a loop for: the source's current
	// parent and, for a folder, the folder itself and everything under it.
	let activeDrag: { source: DragSource; caseId?: number; blocked: Set<number> } | null = null;
</script>

<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronRightIcon,
		FileIcon,
		FolderIcon,
		FolderOpenIcon,
		MoreHorizontalIcon
	} from 'lucide-svelte';
	import type { DataStoreTree, DataStoreTreeNode } from '$lib/types/resources/datastore';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import Self from './DatastoreTreeNode.svelte';

	type FolderAction = 'add-file' | 'add-folder' | 'rename' | 'delete';
	type FileAction =
		| 'preview'
		| 'download'
		| 'copy-link'
		| 'copy-markdown'
		| 'edit'
		| 'delete'
		| 'select';

	type Props = {
		tree: DataStoreTree;
		/** Case the tree belongs to; a drag never crosses into another case's tree. */
		caseId?: number;
		/** Folder holding `tree`, undefined at the top level. */
		parentFolderId?: number;
		selectedFileId?: number;
		depth?: number;
		filter?: string;
		dropTargetFolderId?: number | null;
		/** Show the ROOT tag on the root folder. */
		showRootBadge?: boolean;
		onFolderAction: (action: FolderAction, folderId: number) => void;
		onFileAction: (action: FileAction, fileId: number) => void;
		onContextMenuFolder?: (folderId: number, isRoot: boolean, x: number, y: number) => void;
		onContextMenuFile?: (fileId: number, x: number, y: number) => void;
		onMove?: (source: DragSource, targetFolderId: number) => void;
		onUploadFiles?: (folderId: number, files: FileList) => void;
		onDragTargetChange?: (folderId: number | null) => void;
	};

	let {
		tree,
		caseId,
		parentFolderId,
		selectedFileId,
		depth = 0,
		filter = '',
		dropTargetFolderId = null,
		showRootBadge = true,
		onFolderAction,
		onFileAction,
		onContextMenuFolder,
		onContextMenuFile,
		onMove,
		onUploadFiles,
		onDragTargetChange
	}: Props = $props();

	let openMap = $state<Record<string, boolean>>({});

	const toggle = (key: string) => {
		openMap[key] = !(openMap[key] ?? depth < 2);
	};

	const isOpen = (key: string) => openMap[key] ?? depth < 2;

	const nameOf = (node: DataStoreTreeNode) =>
		node.type === 'directory' ? node.name : node.file_original_name;

	const matchesFilter = (node: DataStoreTreeNode, q: string): boolean => {
		if (!q) return true;
		const lq = q.toLowerCase();
		if (nameOf(node).toLowerCase().includes(lq)) return true;
		if (node.type === 'directory') {
			return Object.values(node.children).some((child) => matchesFilter(child, q));
		}
		return false;
	};

	const entries = $derived(Object.entries(tree).filter(([, node]) => matchesFilter(node, filter)));

	// Drag payload format: a JSON object on the 'application/x-iris-datastore'
	// MIME type. We use a custom type so file-from-OS drops (which carry the
	// 'Files' type) are clearly distinguishable from internal reorgs. The
	// payload itself is only set because Firefox refuses to start a drag
	// without one; the drop reads `activeDrag`.
	const DND_TYPE = 'application/x-iris-datastore';

	const folderIdsUnder = (subtree: DataStoreTree): number[] =>
		Object.entries(subtree).flatMap(([key, node]) =>
			node.type === 'directory' ? [Number(key.split('-')[1]), ...folderIdsUnder(node.children)] : []
		);

	const startDrag = (event: DragEvent, source: DragSource, blocked: number[]) => {
		if (!event.dataTransfer) return;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(DND_TYPE, JSON.stringify(source));
		const ids = parentFolderId === undefined ? blocked : [parentFolderId, ...blocked];
		activeDrag = { source, caseId, blocked: new Set(ids) };
	};

	// Fires on the source row whether the drop landed, missed or was
	// cancelled with Escape — the one place to clear the highlight for all three.
	const endDrag = () => {
		activeDrag = null;
		clearAutoExpand();
		onDragTargetChange?.(null);
	};

	const dropEffectFor = (event: DragEvent, folderId: number): 'copy' | 'move' | null => {
		const types = event.dataTransfer?.types ?? [];
		if (types.includes('Files')) return 'copy';
		if (!types.includes(DND_TYPE) || !activeDrag) return null;
		if (activeDrag.caseId !== caseId || activeDrag.blocked.has(folderId)) return null;
		return 'move';
	};

	// Auto-expand a folder when the user hovers over it during a drag — same
	// affordance file managers use to let users dig deep without giving up
	// the drag. `dragover` fires continuously, so the timer is only armed
	// once per folder; re-arming it on every event meant it never fired.
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let hoverKey: string | null = null;
	const scheduleAutoExpand = (key: string) => {
		if (hoverKey === key) return;
		clearAutoExpand();
		hoverKey = key;
		hoverTimer = setTimeout(() => {
			if (!isOpen(key)) openMap[key] = true;
		}, 600);
	};
	const clearAutoExpand = () => {
		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = null;
		hoverKey = null;
	};

	// `dragleave` also fires when the pointer moves onto a child of the row;
	// only a real exit counts.
	const handleDragLeave = (event: DragEvent) => {
		const row = event.currentTarget as HTMLElement;
		if (!row.contains(event.relatedTarget as Node | null)) clearAutoExpand();
	};

	/** `folderKey` is set on folder rows (auto-expand); file rows target their parent. */
	const handleDragOver = (event: DragEvent, folderId: number, folderKey?: string) => {
		const effect = dropEffectFor(event, folderId);
		if (!effect || !event.dataTransfer) {
			onDragTargetChange?.(null);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = effect;
		onDragTargetChange?.(folderId);
		if (folderKey) scheduleAutoExpand(folderKey);
	};

	const handleDrop = (event: DragEvent, folderId: number, folderKey?: string) => {
		clearAutoExpand();
		onDragTargetChange?.(null);
		if (!event.dataTransfer) return;

		const files = event.dataTransfer.files;
		if (files && files.length > 0) {
			event.preventDefault();
			event.stopPropagation();
			onUploadFiles?.(folderId, files);
			return;
		}

		if (dropEffectFor(event, folderId) !== 'move' || !activeDrag) return;
		event.preventDefault();
		event.stopPropagation();
		onMove?.(activeDrag.source, folderId);
		activeDrag = null;
		// Show where the item went.
		if (folderKey) openMap[folderKey] = true;
	};

	// One file menu open at a time, opened on click rather than on the
	// trigger's default pointerdown: bits-ui opens the menu and calls
	// preventDefault on pointerdown, which kills the drag before it starts.
	let openFileMenuId = $state<number | null>(null);
</script>

<ul class="flex flex-col">
	{#each entries as [key, node] (key)}
		{@const idStr = key.split('-')[1]}
		{@const id = Number(idStr)}
		{#if node.type === 'directory'}
			<li class="flex flex-col">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group/item flex select-none items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/60 {dropTargetFolderId ===
					id
						? 'bg-primary/15 ring-1 ring-primary/40'
						: ''}"
					style="padding-left: {depth * 12 + 4}px"
					draggable={!node.is_root}
					ondragstart={(e) =>
						startDrag(e, { kind: 'folder', id }, [id, ...folderIdsUnder(node.children)])}
					ondragend={endDrag}
					ondragover={(e) => handleDragOver(e, id, key)}
					ondragleave={handleDragLeave}
					ondrop={(e) => handleDrop(e, id, key)}
					oncontextmenu={(e) => {
						e.preventDefault();
						onContextMenuFolder?.(id, !!node.is_root, e.clientX, e.clientY);
					}}
				>
					<button
						class="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
						onclick={() => toggle(key)}
						aria-label={isOpen(key) ? 'Collapse folder' : 'Expand folder'}
					>
						{#if isOpen(key)}
							<ChevronDownIcon size={14} />
						{:else}
							<ChevronRightIcon size={14} />
						{/if}
					</button>

					<!--
					  Not a <button>: Firefox never starts a drag from inside one,
					  and this label is most of the row's surface.
					-->
					<div
						role="button"
						tabindex="0"
						class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
						onclick={() => toggle(key)}
						onkeydown={(e) => {
							if (e.key !== 'Enter' && e.key !== ' ') return;
							e.preventDefault();
							toggle(key);
						}}
					>
						{#if isOpen(key)}
							<FolderOpenIcon size={14} class="shrink-0 text-amber-500" />
						{:else}
							<FolderIcon size={14} class="shrink-0 text-amber-500" />
						{/if}
						<span class="truncate" title={node.name}>{node.name}</span>
						{#if node.is_root && showRootBadge}
							<span
								class="ml-1 shrink-0 rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground"
							>
								root
							</span>
						{/if}
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger>
							<button
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/item:opacity-100"
								aria-label="Folder actions"
							>
								<MoreHorizontalIcon size={14} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" class="min-w-[160px]">
							<DropdownMenuItem onclick={() => onFolderAction('add-file', id)}>
								Add file here
							</DropdownMenuItem>
							<DropdownMenuItem onclick={() => onFolderAction('add-folder', id)}>
								Add subfolder
							</DropdownMenuItem>
							{#if !node.is_root}
								<DropdownMenuItem onclick={() => onFolderAction('rename', id)}>
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									class="text-destructive"
									onclick={() => onFolderAction('delete', id)}
								>
									Delete folder
								</DropdownMenuItem>
							{/if}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{#if isOpen(key)}
					<Self
						tree={node.children}
						{caseId}
						parentFolderId={id}
						{selectedFileId}
						depth={depth + 1}
						{filter}
						{dropTargetFolderId}
						{onFolderAction}
						{onFileAction}
						{onContextMenuFolder}
						{onContextMenuFile}
						{onMove}
						{onUploadFiles}
						{onDragTargetChange}
					/>
				{/if}
			</li>
		{:else}
			{@const file = node}
			<li>
				<DropdownMenu
					open={openFileMenuId === id}
					onOpenChange={(open) => (openFileMenuId = open ? id : null)}
				>
					<DropdownMenuTrigger>
						{#snippet child({ props })}
							<!--
							  The trigger's own pointer handlers are dropped (see
							  `openFileMenuId`); `click` never fires after a drag, so
							  it opens the menu without stealing the gesture. Keyboard
							  opening stays with bits-ui's `onkeydown`. Dropping onto a
							  file moves into the folder holding it.
							-->
							<div
								{...props}
								onpointerdown={undefined}
								onpointerup={undefined}
								onclick={() => (openFileMenuId = openFileMenuId === id ? null : id)}
								class="group/item flex w-full cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 {selectedFileId ===
								id
									? 'bg-primary/10 text-primary'
									: ''}"
								style="padding-left: {depth * 12 + 24}px"
								role="button"
								tabindex="0"
								draggable="true"
								ondragstart={(e) => startDrag(e, { kind: 'file', id }, [])}
								ondragend={endDrag}
								ondragover={(e) => {
									if (parentFolderId !== undefined) handleDragOver(e, parentFolderId);
								}}
								ondrop={(e) => {
									if (parentFolderId !== undefined) handleDrop(e, parentFolderId);
								}}
								oncontextmenu={(e) => {
									e.preventDefault();
									onContextMenuFile?.(id, e.clientX, e.clientY);
								}}
							>
								<FileIcon size={14} class="shrink-0 text-muted-foreground" />
								<span class="min-w-0 flex-1 truncate text-left" title={file.file_original_name}
									>{file.file_original_name}</span
								>
								{#if file.file_is_ioc}
									<span
										class="shrink-0 rounded bg-red-500/15 px-1 text-[10px] uppercase tracking-wide text-red-600 dark:text-red-300"
									>
										IOC
									</span>
								{/if}
								{#if file.file_is_evidence}
									<span
										class="shrink-0 rounded bg-blue-500/15 px-1 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-300"
									>
										EV
									</span>
								{/if}
								<MoreHorizontalIcon
									size={14}
									class="shrink-0 text-muted-foreground opacity-0 group-hover/item:opacity-100"
								/>
							</div>
						{/snippet}
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" class="min-w-[180px]">
						<DropdownMenuItem onclick={() => onFileAction('preview', id)}>Preview</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('download', id)}>
							Download
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('copy-link', id)}>
							Copy link
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('copy-markdown', id)}>
							Copy as markdown link
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => onFileAction('edit', id)}>
							Edit metadata
						</DropdownMenuItem>
						<DropdownMenuItem class="text-destructive" onclick={() => onFileAction('delete', id)}>
							Delete file
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</li>
		{/if}
	{/each}
</ul>
