<!--
  War-room datastore side panel.

  Files uploaded to the room itself are listed first, then one section
  per attached case holding that case's tree. The case trees are the
  same component as the case panel (`CaseDatastoreTree`), so files and
  folders there have the same menu and behaviour: preview, download,
  copy link / markdown link, edit, delete, folder actions, drag to move
  and drop from the OS onto a folder to upload. Dropping anywhere else
  uploads to the war room.
-->
<script lang="ts">
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { getContext } from 'svelte';
	import { useWarRoomLive } from '$lib/contexts/war-room.context.svelte';
	import {
		DatabaseIcon,
		File as FileIcon,
		MoreHorizontalIcon,
		RefreshCwIcon,
		UploadIcon,
		XIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import {
		WarRoomDatastoreService,
		type WarRoomDatastoreFile
	} from '$lib/services/war-room-datastore.service';
	import { WarRoomsService, type WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/components/ui/toast';
	import WarRoomCaseDatastoreSection from '$lib/components/common/WarRoom/WarRoomCaseDatastoreSection.svelte';
	import {
		datastoreCopyToClipboard,
		datastoreDownloadBlobUrl,
		datastoreOpenBlobUrl
	} from '$lib/components/common/Datastore/datastore-actions';

	const panel = getContext<WarRoomDatastorePanelContext>(WAR_ROOM_DATASTORE_PANEL_CTX);

	const warRoomId = $derived(Number(page.params.war_room_id));

	// --- War-room files --------------------------------------------------
	let warRoomFiles = $state<WarRoomDatastoreFile[]>([]);
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let loadingMeta = $state(false);
	let isRefreshing = $state(false);
	let uploading = $state(false);
	let dragOver = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);
	let lastWarRoomId: number | null = null;

	// Bumped by the refresh button so each case section reloads its tree.
	let refreshKey = $state(0);
	// War-room file whose action menu is open (click or right-click).
	let menuFileId = $state<number | null>(null);

	let searchTerm = $state('');

	const load = async () => {
		if (!warRoomId) return;
		loadingMeta = true;
		try {
			const [filesRes, casesRes] = await Promise.all([
				WarRoomDatastoreService.list(warRoomId),
				WarRoomsService.listCases(warRoomId)
			]);
			if (filesRes.ok && filesRes.data && typeof filesRes.data !== 'string') {
				const payload = filesRes.data as { files: WarRoomDatastoreFile[] };
				warRoomFiles = payload.files ?? [];
			}
			if (casesRes.ok && Array.isArray(casesRes.data)) {
				attachedCases = casesRes.data;
			}
		} finally {
			loadingMeta = false;
		}
	};

	const refresh = async () => {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			refreshKey++;
			await load();
		} finally {
			isRefreshing = false;
		}
	};

	// Files added or removed elsewhere, or a case attached / detached
	useWarRoomLive(['datastore', 'cases'], load);

	$effect(() => {
		if (!panel.state.open) return;
		if (warRoomId !== lastWarRoomId) {
			lastWarRoomId = warRoomId;
			void load();
		}
	});

	// --- War-room uploads ------------------------------------------------
	const uploadFiles = async (picked: FileList | File[]) => {
		const list = Array.from(picked);
		if (list.length === 0) return;
		uploading = true;
		try {
			for (const f of list) {
				const res = await WarRoomDatastoreService.upload(warRoomId, f);
				if (!res.ok) {
					toast({
						title: `Could not upload ${f.name}`,
						description: typeof res.data === 'string' ? res.data : undefined,
						variant: 'destructive'
					});
				}
			}
			await load();
		} finally {
			uploading = false;
		}
	};

	const onPick = (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (!target.files) return;
		void uploadFiles(target.files);
		target.value = '';
	};

	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		dragOver = false;
		if (!e.dataTransfer?.files?.length) return;
		void uploadFiles(e.dataTransfer.files);
	};

	const remove = async (f: WarRoomDatastoreFile) => {
		if (!confirm(`Delete file "${f.filename}"?`)) return;
		const res = await WarRoomDatastoreService.remove(warRoomId, f.file_id);
		if (res.ok) {
			warRoomFiles = warRoomFiles.filter((x) => x.file_id !== f.file_id);
		} else {
			toast({ title: 'Could not delete file', variant: 'destructive' });
		}
	};

	const humanSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	// --- War-room file actions -------------------------------------------
	// Same menu as a case file, minus "Edit metadata" (war-room files have
	// no editable metadata).
	const handleWarRoomFileAction = async (
		action: 'preview' | 'download' | 'copy-link' | 'copy-markdown' | 'delete',
		f: WarRoomDatastoreFile
	) => {
		switch (action) {
			case 'preview':
				datastoreOpenBlobUrl(await WarRoomDatastoreService.fetchFileBlobUrl(warRoomId, f.file_id));
				return;
			case 'download':
				datastoreDownloadBlobUrl(
					await WarRoomDatastoreService.fetchFileBlobUrl(warRoomId, f.file_id),
					f.filename
				);
				return;
			case 'copy-link':
				await datastoreCopyToClipboard(
					WarRoomDatastoreService.getViewUrl(warRoomId, f.file_id),
					'Link'
				);
				return;
			case 'copy-markdown':
				await datastoreCopyToClipboard(
					WarRoomDatastoreService.getMarkdownLink(warRoomId, f.file_id, f.filename),
					'Markdown link'
				);
				return;
			case 'delete':
				await remove(f);
				return;
		}
	};

	const warRoomFileMatches = (f: WarRoomDatastoreFile) =>
		!searchTerm || f.filename.toLowerCase().includes(searchTerm.toLowerCase());
</script>

<div
	class="flex h-full flex-col"
	role="region"
	aria-label="War room datastore"
	ondragenter={(e) => {
		e.preventDefault();
		dragOver = true;
	}}
	ondragover={(e) => {
		e.preventDefault();
		dragOver = true;
	}}
	ondragleave={() => (dragOver = false)}
	ondropcapture={() => (dragOver = false)}
	ondrop={onDrop}
>
	<header class="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
		<div class="flex items-center gap-2">
			<DatabaseIcon class="h-3.5 w-3.5 text-muted-foreground" />
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Datastore
			</h3>
		</div>
		<div class="flex items-center gap-1">
			<input
				bind:this={inputEl}
				type="file"
				multiple
				class="hidden"
				onchange={onPick}
				aria-label="Upload"
			/>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => inputEl?.click()}
				disabled={uploading}
				aria-label="Upload to war room"
				title="Upload to war room"
			>
				<UploadIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={refresh}
				disabled={isRefreshing}
				aria-label="Refresh"
			>
				<RefreshCwIcon class={isRefreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => panel.close()}
				aria-label="Close datastore panel"
			>
				<XIcon class="h-3.5 w-3.5" />
			</Button>
		</div>
	</header>

	<div class="shrink-0 border-b px-3 py-2">
		<Input
			value={searchTerm}
			oninput={(e) => (searchTerm = (e.target as HTMLInputElement).value)}
			placeholder="Search files…"
			class="h-7 text-xs"
		/>
	</div>

	<div
		class={['min-h-0 flex-1 overflow-y-auto transition-colors', dragOver ? 'bg-primary/10' : '']}
	>
		<!-- War-room files -->
		<section class="border-b">
			<div class="flex items-center gap-2 bg-card/30 px-3 py-1.5">
				<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					War room
				</span>
				<span class="text-2xs tabular-nums text-muted-foreground">
					({warRoomFiles.length})
				</span>
			</div>
			{#if loadingMeta && warRoomFiles.length === 0}
				<div class="flex flex-col gap-1 p-2">
					{#each Array(2) as _}
						<Skeleton class="h-9 w-full" />
					{/each}
				</div>
			{:else if warRoomFiles.length === 0}
				<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
					Drop a file to stash a war-room-level artefact.
				</p>
			{:else}
				<ul class="flex flex-col px-1 py-1">
					{#each warRoomFiles.filter(warRoomFileMatches) as f (f.file_id)}
						<li>
							<DropdownMenu
								open={menuFileId === f.file_id}
								onOpenChange={(o) => (menuFileId = o ? f.file_id : null)}
							>
								<DropdownMenuTrigger class="w-full">
									<div
										class="group/item flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/60"
										role="button"
										tabindex="0"
										oncontextmenu={(e) => {
											e.preventDefault();
											menuFileId = f.file_id;
										}}
									>
										<FileIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-medium" title={f.filename}>{f.filename}</p>
											<p class="text-2xs text-muted-foreground">
												{humanSize(f.size_bytes)}
												{#if f.uploaded_at}
													· {formatDateTime(f.uploaded_at)}
												{/if}
											</p>
										</div>
										<MoreHorizontalIcon
											size={14}
											class="shrink-0 text-muted-foreground opacity-0 group-hover/item:opacity-100"
										/>
									</div>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" class="min-w-[180px]">
									<DropdownMenuItem onclick={() => handleWarRoomFileAction('preview', f)}>
										Preview
									</DropdownMenuItem>
									<DropdownMenuItem onclick={() => handleWarRoomFileAction('download', f)}>
										Download
									</DropdownMenuItem>
									<DropdownMenuItem onclick={() => handleWarRoomFileAction('copy-link', f)}>
										Copy link
									</DropdownMenuItem>
									<DropdownMenuItem onclick={() => handleWarRoomFileAction('copy-markdown', f)}>
										Copy as markdown link
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										class="text-destructive"
										onclick={() => handleWarRoomFileAction('delete', f)}
									>
										Delete file
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Aggregated case datastores rendered as one big tree -->
		<section class="px-1 py-2">
			<div class="flex items-center gap-2 px-2 pb-1">
				<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					Cases
				</span>
				<span class="text-2xs tabular-nums text-muted-foreground">
					({attachedCases.length})
				</span>
			</div>

			{#if attachedCases.length === 0}
				<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
					No cases attached. Anything attached later appears here automatically.
				</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each attachedCases as c (c.case_id)}
						<WarRoomCaseDatastoreSection
							caseId={c.case_id}
							caseName={c.case_name}
							filter={searchTerm}
							{refreshKey}
						/>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>
