<script lang="ts">
	import { formatDate } from '$lib/utils/time-formatter';
	import { onMount, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ChevronDown,
		ChevronRight,
		Folder,
		Plus,
		ShieldAlert,
		Search,
		Archive,
		LayoutGrid,
		List,
		Layers
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import WarRoomColorPicker from '$lib/components/war-room/WarRoomColorPicker.svelte';
	import CategoryMoveMenu from '$lib/components/common/categories/CategoryMoveMenu.svelte';
	import CategorySidebar, {
		CATEGORY_DRAG_TYPE
	} from '$lib/components/common/categories/CategorySidebar.svelte';
	import { CategoryState } from '$lib/components/common/categories/category-state.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import {
		WarRoomsService,
		type WarRoom,
		type WarRoomState
	} from '$lib/services/war-rooms.service';
	import { categoryMatches, countByCategory } from '$lib/services/categories.service';
	import { safeHexColor } from '$lib/utils/color';
	import { toPlainSnippet } from '$lib/utils/text';

	const userCtx = getContext<UserCtx>(USER_CTX);

	// The whole roster (live + archived) is fetched once and filtered on
	// the client: the endpoint is unpaginated, and having every row in
	// memory is what lets the state chips show their counts and the
	// search react instantly. The server already sorts by state priority
	// (active > open > standby > closed) then creation date desc, and
	// Array.filter is stable, so every group below keeps that order.
	let rooms = $state<WarRoom[]>([]);
	let loading = $state(true);
	let stateFilter = $state<WarRoomState | ''>('');
	let search = $state('');
	// Collapsed by default — an operator opening this page is mostly
	// there for live rooms; archived is a "look back" affordance.
	let archivedOpen = $state(false);
	// Closed rooms are history too, so their group starts folded.
	let collapsed = $state<Record<WarRoomState, boolean>>({
		active: false,
		open: false,
		standby: false,
		closed: true
	});

	type ViewMode = 'cards' | 'list';
	const VIEW_STORAGE_KEY = 'iris_war_rooms_view';
	let view = $state<ViewMode>('cards');

	let createOpen = $state(false);
	let creating = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let newColor = $state<string | null>('#dc2626');
	let newCategoryId = $state<number | null>(null);

	const canCreate = $derived(userCtx.can('war_rooms_create'));
	// Managing the shared categories needs war_rooms_write; moving a room
	// also needs write access to that room, which the server checks.
	const canFile = $derived(userCtx.can('war_rooms_write'));
	const categories = new CategoryState('war-rooms');

	const STATES: { value: WarRoomState; label: string }[] = [
		{ value: 'active', label: 'Active' },
		{ value: 'open', label: 'Open' },
		{ value: 'standby', label: 'Standby' },
		{ value: 'closed', label: 'Closed' }
	];

	const matchesSearch = (room: WarRoom, needle: string) =>
		!needle ||
		room.name.toLowerCase().includes(needle) ||
		(room.description ?? '').toLowerCase().includes(needle);

	const searched = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		return rooms.filter((r) => matchesSearch(r, needle));
	});
	// Category counts follow the search, not the category, like the chips.
	const searchedLive = $derived(searched.filter((r) => r.archived_at == null));
	const categoryCounts = $derived(countByCategory(searchedLive, categories.categories));
	const inCategory = $derived(
		searched.filter((r) => categoryMatches(categories.filter, r.category_id, categories.categories))
	);
	const liveRooms = $derived(inCategory.filter((r) => r.archived_at == null));
	const archivedRooms = $derived(
		inCategory.filter(
			(r) => r.archived_at != null && (stateFilter === '' || r.state === stateFilter)
		)
	);
	// Chip counts follow the search but not the state filter, so they
	// always say what clicking each chip would show.
	const counts = $derived.by(() => {
		const c: Record<WarRoomState, number> = { active: 0, open: 0, standby: 0, closed: 0 };
		for (const r of liveRooms) c[r.state] += 1;
		return c;
	});
	const groups = $derived(
		STATES.filter((s) => stateFilter === '' || s.value === stateFilter)
			.map((s) => ({ ...s, rooms: liveRooms.filter((r) => r.state === s.value) }))
			.filter((g) => g.rooms.length > 0)
	);

	const load = async () => {
		loading = true;
		const res = await WarRoomsService.list({ archived: 'any' });
		if (res.ok && Array.isArray(res.data)) {
			rooms = res.data as WarRoom[];
		}
		loading = false;
	};

	const setView = (next: ViewMode) => {
		view = next;
		localStorage.setItem(VIEW_STORAGE_KEY, next);
	};

	const open = (room: WarRoom) => goto(`/war-rooms/${room.war_room_id}`);

	const moveRoom = async (roomId: number, categoryId: number | null) => {
		const room = rooms.find((r) => r.war_room_id === roomId);
		if (!room || (room.category_id ?? null) === categoryId) return;
		const res = await WarRoomsService.setCategory(roomId, categoryId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const moved = res.data as WarRoom;
			rooms = rooms.map((r) => (r.war_room_id === roomId ? moved : r));
			const target = categories.name(categoryId);
			toast({
				title: target ? `Moved "${room.name}" to ${target}` : `"${room.name}" uncategorised`
			});
		} else {
			toast({
				title: 'Could not move war room',
				description:
					typeof res.data === 'string' ? res.data : (res.error?.message ?? 'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	const dragRoom = (room: WarRoom, e: DragEvent) => {
		if (!canFile || !e.dataTransfer) return;
		e.dataTransfer.setData(CATEGORY_DRAG_TYPE, String(room.war_room_id));
		e.dataTransfer.effectAllowed = 'move';
	};

	const openCreate = () => {
		// A room created while a category is selected lands in it.
		newCategoryId = typeof categories.filter === 'number' ? categories.filter : null;
		createOpen = true;
	};

	const doArchive = async (room: WarRoom, e: MouseEvent) => {
		// The card is an <a> / the row navigates on click; block that
		// and call the API instead.
		e.preventDefault();
		e.stopPropagation();
		const res = await WarRoomsService.archive(room.war_room_id);
		if (res.ok && res.data && typeof res.data !== 'string') {
			toast({ title: `Archived "${room.name}"` });
			await load();
			archivedOpen = true;
		} else {
			toast({
				title: 'Could not archive war room',
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
		}
	};

	const doUnarchive = async (room: WarRoom, e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const res = await WarRoomsService.unarchive(room.war_room_id);
		if (res.ok && res.data && typeof res.data !== 'string') {
			toast({ title: `Restored "${room.name}"` });
			await load();
		} else {
			toast({
				title: 'Could not unarchive war room',
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
		}
	};

	onMount(() => {
		const stored = localStorage.getItem(VIEW_STORAGE_KEY);
		if (stored === 'cards' || stored === 'list') view = stored;
		load();
		categories.load();
	});

	const submitCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		creating = true;
		const res = await WarRoomsService.create({
			name,
			description: newDescription.trim() || null,
			color: newColor,
			category_id: newCategoryId
		});
		creating = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			toast({ title: `War room "${(res.data as WarRoom).name}" created` });
			createOpen = false;
			newName = '';
			newDescription = '';
			goto(`/war-rooms/${(res.data as WarRoom).war_room_id}`);
		} else {
			toast({
				title: 'Could not create war room',
				description:
					typeof res.data === 'string' ? res.data : res.error ? res.error.message : 'Unknown error',
				variant: 'destructive'
			});
		}
	};

	const stateColor = (state: WarRoomState) => {
		switch (state) {
			case 'active':
				return 'bg-red-500/10 text-red-500 ring-red-500/30';
			case 'open':
				return 'bg-amber-500/10 text-amber-500 ring-amber-500/30';
			case 'standby':
				return 'bg-blue-500/10 text-blue-500 ring-blue-500/30';
			case 'closed':
				return 'bg-muted text-muted-foreground ring-border';
		}
	};

	const stateDot = (state: WarRoomState) => {
		switch (state) {
			case 'active':
				return 'bg-red-500';
			case 'open':
				return 'bg-amber-500';
			case 'standby':
				return 'bg-blue-500';
			case 'closed':
				return 'bg-muted-foreground';
		}
	};
</script>

<svelte:head>
	<title>War Rooms</title>
</svelte:head>

{#snippet stateBadge(state: WarRoomState)}
	<span
		class={[
			'shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wider ring-1',
			stateColor(state)
		]}
	>
		{state}
	</span>
{/snippet}

{#snippet moveAction(room: WarRoom)}
	{#if canFile}
		<span class="invisible group-focus-within:visible group-hover:visible">
			<CategoryMoveMenu
				categories={categories.categories}
				value={room.category_id}
				itemName={room.name}
				onSelect={(id) => moveRoom(room.war_room_id, id)}
			/>
		</span>
	{/if}
{/snippet}

{#snippet categoryLabel(room: WarRoom)}
	{@const name = categories.filter === 'all' ? categories.name(room.category_id) : null}
	{#if name}
		<span class="opacity-40">·</span>
		<span class="inline-flex min-w-0 items-center gap-1 truncate" title={`Category: ${name}`}>
			<Folder class="h-3 w-3 shrink-0" />{name}
		</span>
	{/if}
{/snippet}

{#snippet archiveAction(room: WarRoom, isArchived: boolean)}
	<!--
	  Archive / restore lives on the card / row so the operator doesn't
	  have to open a war room just to file it away. Invisible until
	  hover so the list stays clean at a glance.
	-->
	{#if isArchived}
		<button
			type="button"
			class="invisible rounded px-1.5 py-0.5 text-2xs text-primary transition-colors hover:bg-primary/10 focus-visible:visible group-hover:visible"
			onclick={(e) => doUnarchive(room, e)}
			title="Move back to the live list"
		>
			Restore
		</button>
	{:else}
		<button
			type="button"
			class="invisible inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:visible group-hover:visible"
			onclick={(e) => doArchive(room, e)}
			title="File this room away — state is preserved"
		>
			<Archive class="h-3 w-3" />
			Archive
		</button>
	{/if}
{/snippet}

{#snippet roomCard(room: WarRoom, isArchived: boolean)}
	{@const accent = safeHexColor(room.color)}
	{@const preview = room.description ? toPlainSnippet(room.description, 220) : ''}
	<a
		href={`/war-rooms/${room.war_room_id}`}
		class={[
			'group relative flex flex-col gap-1.5 overflow-hidden rounded-lg border bg-card/50 py-3 pl-4 pr-3 transition-colors hover:bg-card hover:shadow-sm',
			isArchived && 'opacity-70 hover:opacity-100'
		]}
		ondragstart={(e) => dragRoom(room, e)}
	>
		<!-- Accent bar: the room's color, if it has one. -->
		<span
			class="absolute inset-y-0 left-0 w-1"
			style:background-color={accent ?? 'transparent'}
			aria-hidden="true"
		></span>
		<div class="flex items-start justify-between gap-2">
			<h3 class="min-w-0 break-words text-sm font-semibold leading-snug" title={room.name}>
				{room.name}
			</h3>
			{#if isArchived}
				{@render stateBadge(room.state)}
			{/if}
		</div>
		{#if preview}
			<p class="line-clamp-2 break-words text-xs text-muted-foreground" title={preview}>
				{preview}
			</p>
		{/if}
		<div
			class="mt-auto flex items-center justify-between gap-3 pt-1 text-2xs text-muted-foreground"
		>
			<span class="flex min-w-0 items-center gap-2">
				<span class="font-mono">WR#{room.war_room_id}</span>
				<span class="opacity-40">·</span>
				<span class="shrink-0">
					{#if isArchived && room.archived_at}
						Archived {formatDate(room.archived_at)}
					{:else if room.created_at}
						Created {formatDate(room.created_at)}
					{/if}
				</span>
				{@render categoryLabel(room)}
			</span>
			<span class="flex shrink-0 items-center gap-1">
				{@render moveAction(room)}
				{@render archiveAction(room, isArchived)}
			</span>
		</div>
	</a>
{/snippet}

{#snippet roomTable(list: WarRoom[], isArchived: boolean)}
	<div class="overflow-hidden rounded-lg border bg-card/50">
		<table class="w-full table-fixed text-sm">
			<colgroup>
				<col class="w-8" />
				<col class="w-[38%]" />
				<col />
				<col class="w-24" />
				<col class="w-28" />
				<col class="w-32" />
			</colgroup>
			<tbody class="divide-y">
				{#each list as room (room.war_room_id)}
					{@const accent = safeHexColor(room.color)}
					<tr
						class={[
							'group cursor-pointer align-top transition-colors hover:bg-muted/40',
							isArchived && 'opacity-70 hover:opacity-100'
						]}
						onclick={() => open(room)}
						draggable={canFile}
						ondragstart={(e) => dragRoom(room, e)}
					>
						<td class="py-2.5 pl-3">
							<span
								class={[
									'mt-1 block h-2.5 w-2.5 rounded-full',
									!accent && 'border border-dashed border-muted-foreground/50'
								]}
								style:background-color={accent ?? 'transparent'}
								aria-hidden="true"
							></span>
						</td>
						<td class="py-2 pr-3">
							<a
								href={`/war-rooms/${room.war_room_id}`}
								class="break-words font-medium leading-snug hover:underline"
								title={room.name}
								onclick={(e) => e.stopPropagation()}
							>
								{room.name}
							</a>
							<div class="flex items-center gap-2 text-2xs text-muted-foreground">
								<span class="font-mono">WR#{room.war_room_id}</span>
								{@render categoryLabel(room)}
							</div>
						</td>
						<td class="py-2.5 pr-3">
							{#if room.description}
								{@const preview = toPlainSnippet(room.description, 220)}
								<p class="line-clamp-2 break-words text-xs text-muted-foreground" title={preview}>
									{preview}
								</p>
							{/if}
						</td>
						<td class="py-2.5 pr-3">{@render stateBadge(room.state)}</td>
						<td class="whitespace-nowrap py-2.5 pr-3 text-2xs text-muted-foreground">
							{#if isArchived && room.archived_at}
								{formatDate(room.archived_at)}
							{:else if room.created_at}
								{formatDate(room.created_at)}
							{/if}
						</td>
						<td class="py-2 pr-3">
							<div class="flex items-center justify-end gap-1">
								{@render moveAction(room)}
								{@render archiveAction(room, isArchived)}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

{#snippet roomList(list: WarRoom[], isArchived: boolean)}
	{#if view === 'list'}
		{@render roomTable(list, isArchived)}
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
			{#each list as room (room.war_room_id)}
				{@render roomCard(room, isArchived)}
			{/each}
		</div>
	{/if}
{/snippet}

<div class="flex h-full w-full flex-col gap-4 p-6">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex items-center gap-3">
			<ShieldAlert class="h-7 w-7 text-red-500" />
			<div>
				<h1 class="text-2xl font-semibold leading-tight">War Rooms</h1>
				<p class="text-sm text-muted-foreground">Multi-case crisis-coordination workspaces.</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={search}
					oninput={(e) => (search = (e.target as HTMLInputElement).value)}
					placeholder="Search by name or description"
					class="h-9 w-72 pl-7 text-sm"
				/>
			</div>
			{#if canCreate}
				<Button class="h-9" onclick={openCreate} data-tour="war-room-new">
					<Plus class="mr-1 h-4 w-4" /> New war room
				</Button>
			{/if}
		</div>
	</header>

	<div class="flex min-h-0 flex-1 gap-6">
		{#if !loading && rooms.length > 0}
			<aside class="w-52 shrink-0 overflow-y-auto" data-testid="war-room-categories">
				<CategorySidebar
					store={categories}
					total={searchedLive.length}
					counts={categoryCounts}
					canManage={canFile}
					itemLabel="war rooms"
					onDropItem={canFile ? moveRoom : undefined}
				/>
			</aside>
		{/if}
		<div class="flex min-w-0 flex-1 flex-col gap-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						class={[
							'flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
							stateFilter === ''
								? 'border-primary bg-primary/10 text-primary'
								: 'border-border bg-card/40 text-muted-foreground hover:bg-muted/50'
						]}
						onclick={() => (stateFilter = '')}
					>
						<Layers class="h-3 w-3" />
						All
						<span class="tabular-nums opacity-70">{liveRooms.length}</span>
					</button>
					{#each STATES as chip (chip.value)}
						{@const active = stateFilter === chip.value}
						<button
							type="button"
							class={[
								'flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
								active
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border bg-card/40 text-muted-foreground hover:bg-muted/50',
								!active && counts[chip.value] === 0 && 'opacity-50'
							]}
							onclick={() => (stateFilter = active ? '' : chip.value)}
						>
							<span class={['h-1.5 w-1.5 rounded-full', stateDot(chip.value)]}></span>
							{chip.label}
							<span class="tabular-nums opacity-70">{counts[chip.value]}</span>
						</button>
					{/each}
				</div>

				<div
					class="flex items-center rounded-md border bg-card/40 p-0.5"
					role="group"
					aria-label="View"
				>
					<button
						type="button"
						class={[
							'flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors',
							view === 'cards'
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:text-foreground'
						]}
						onclick={() => setView('cards')}
						aria-pressed={view === 'cards'}
						title="Card view"
					>
						<LayoutGrid class="h-3.5 w-3.5" /> Cards
					</button>
					<button
						type="button"
						class={[
							'flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors',
							view === 'list'
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:text-foreground'
						]}
						onclick={() => setView('list')}
						aria-pressed={view === 'list'}
						title="Compact list view"
					>
						<List class="h-3.5 w-3.5" /> List
					</button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if loading}
					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
						{#each Array(4) as _}
							<Skeleton class="h-28 w-full" />
						{/each}
					</div>
				{:else if rooms.length === 0}
					<div class="flex h-full flex-col items-center justify-center gap-2 text-center">
						<ShieldAlert class="h-10 w-10 text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">No war rooms yet.</p>
						{#if canCreate}
							<Button variant="outline" onclick={openCreate} data-tour="war-room-new">
								<Plus class="mr-1 h-4 w-4" /> Create your first war room
							</Button>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col gap-6">
						{#if groups.length === 0}
							<p class="text-sm text-muted-foreground">
								No live war rooms match the current filters.
							</p>
						{/if}

						<!--
				  One section per state, in operational-priority order.
				  When a single state is filtered the section is forced
				  open — the operator asked for exactly those rooms.
				-->
						{#each groups as group (group.value)}
							{@const isCollapsed = stateFilter === '' && collapsed[group.value]}
							<section class="flex flex-col gap-2">
								<button
									type="button"
									class="flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (collapsed[group.value] = !collapsed[group.value])}
									aria-expanded={!isCollapsed}
								>
									{#if isCollapsed}
										<ChevronRight class="h-3 w-3" />
									{:else}
										<ChevronDown class="h-3 w-3" />
									{/if}
									<span class={['h-2 w-2 rounded-full', stateDot(group.value)]}></span>
									{group.label}
									<span class="font-normal tabular-nums">({group.rooms.length})</span>
								</button>
								{#if !isCollapsed}
									{@render roomList(group.rooms, false)}
								{/if}
							</section>
						{/each}

						<!--
				  Archived section: collapsed by default. Rooms live here
				  after an operator files them away; state is preserved
				  so they can be restored to exactly where they were.
				-->
						{#if archivedRooms.length > 0}
							<section class="flex flex-col gap-2 border-t pt-4">
								<button
									type="button"
									class="flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (archivedOpen = !archivedOpen)}
									aria-expanded={archivedOpen}
								>
									{#if archivedOpen}
										<ChevronDown class="h-3 w-3" />
									{:else}
										<ChevronRight class="h-3 w-3" />
									{/if}
									<Archive class="h-3.5 w-3.5" />
									Archived
									<span class="font-normal tabular-nums">({archivedRooms.length})</span>
								</button>
								{#if archivedOpen}
									{@render roomList(archivedRooms, true)}
								{/if}
							</section>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<Dialog bind:open={createOpen}>
	<DialogContent data-tour="war-room-form">
		<DialogHeader>
			<DialogTitle>Create a war room</DialogTitle>
			<DialogDescription>
				Spin up a coordination workspace for a multi-case crisis. You can attach cases and invite
				members from inside the war room.
			</DialogDescription>
		</DialogHeader>

		<div class="flex flex-col gap-3 py-2">
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="war-room-name"> Name </label>
				<Input
					id="war-room-name"
					data-tour="war-room-name"
					value={newName}
					oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
					placeholder="e.g. Ransomware sweep 2026-06"
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="war-room-description">
					Description (optional)
				</label>
				<Input
					id="war-room-description"
					data-tour="war-room-description"
					value={newDescription}
					oninput={(e) => (newDescription = (e.target as HTMLInputElement).value)}
					placeholder="Short context for responders"
					class="mt-1"
				/>
			</div>
			<div>
				<span class="text-xs font-medium text-muted-foreground">Accent color</span>
				<p class="mb-1.5 text-2xs text-muted-foreground">
					You can change it later from the room's header.
				</p>
				<WarRoomColorPicker value={newColor} onchange={(c) => (newColor = c)} allowNone />
			</div>
			{#if categories.categories.length > 0}
				<div>
					<label class="text-xs font-medium text-muted-foreground" for="war-room-category">
						Category (optional)
					</label>
					<select
						id="war-room-category"
						class="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
						value={newCategoryId === null ? '' : String(newCategoryId)}
						onchange={(e) => {
							const v = (e.target as HTMLSelectElement).value;
							newCategoryId = v === '' ? null : Number(v);
						}}
					>
						<option value="">No category</option>
						{#each categories.categories as category (category.id)}
							<option value={String(category.id)}>{category.name}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<DialogFooter>
			<Button variant="ghost" onclick={() => (createOpen = false)} disabled={creating}>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={creating || !newName.trim()}>
				{creating ? 'Creating…' : 'Create'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
