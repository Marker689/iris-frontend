<!--
  War-room datastore side panel.

  The room's own datastore comes first, then one section per attached
  case holding that case's tree. All of them are the same tree as the
  case panel (`DatastoreTree`), so files and folders have the same menu
  and behaviour: preview, download, copy link / markdown link, edit,
  delete, add / rename / delete folders, drag to move and drop from the
  OS onto a folder to upload. Dropping anywhere else uploads to the war
  room's root folder.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { useWarRoomLive } from '$lib/contexts/war-room.context.svelte';
	import { DatabaseIcon, RefreshCwIcon, UploadIcon, XIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import { createWarRoomDatastoreContext } from '$lib/contexts/war-room-datastore.context.svelte';
	import { WarRoomsService, type WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import WarRoomCaseDatastoreSection from '$lib/components/common/WarRoom/WarRoomCaseDatastoreSection.svelte';
	import DatastoreTree from '$lib/components/common/Datastore/DatastoreTree.svelte';
	import { datastoreUploadFiles } from '$lib/components/common/Datastore/datastore-actions';

	const panel = getContext<WarRoomDatastorePanelContext>(WAR_ROOM_DATASTORE_PANEL_CTX);

	const warRoomId = $derived(Number(page.params.war_room_id));

	const datastore = createWarRoomDatastoreContext(() => warRoomId || null);

	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let isRefreshing = $state(false);
	let uploading = $state(false);
	let dragOver = $state(false);
	let inputEl: HTMLInputElement | null = $state(null);
	let lastWarRoomId: number | null = null;

	// Bumped by the refresh button so each case section reloads its tree.
	let refreshKey = $state(0);

	let searchTerm = $state('');

	const load = async () => {
		if (!warRoomId) return;
		const [casesRes] = await Promise.all([
			WarRoomsService.listCases(warRoomId),
			datastore.loadTree()
		]);
		if (casesRes.ok && Array.isArray(casesRes.data)) {
			attachedCases = casesRes.data;
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

	// Files or folders changed elsewhere, or a case attached / detached
	useWarRoomLive(['datastore', 'cases'], load);

	$effect(() => {
		if (!panel.state.open) return;
		if (warRoomId !== lastWarRoomId) {
			lastWarRoomId = warRoomId;
			void load();
		}
	});

	// --- Uploads to the war room's root folder ---------------------------
	const uploadFiles = async (picked: FileList) => {
		if (picked.length === 0) return;
		uploading = true;
		try {
			if (datastore.tree.rootId === null) await datastore.loadTree();
			const rootId = datastore.tree.rootId;
			if (rootId === null) return;
			await datastoreUploadFiles(datastore, rootId, picked);
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
		<!-- War-room datastore -->
		<section class="border-b px-1 py-2">
			<DatastoreTree
				{datastore}
				filter={searchTerm}
				rootLabel="War room"
				withAddDialogs
				emptyMessage="Drop a file to stash a war-room-level artefact."
			/>
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
