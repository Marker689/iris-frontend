<!--
  Board "Edit board" panel, for the room's writers: the widgets everyone
  sees, laid out like the board — the banner, the indicator tiles, then
  the main and the side column. Drag a widget to another place of its
  zone (a panel also to the other column), click it to set it up, add one
  from the "Add" of each zone (a new widget, or a built-in removed
  earlier). The changes are a draft until "Save"; "Reset to the default
  board" drops the room's widgets for the default ones. Each user can
  still hide or reorder them for themselves ("Customize").
-->
<script lang="ts">
	import {
		ArrowDown,
		ArrowLeft,
		ArrowLeftRight,
		ArrowRight,
		ArrowUp,
		GripVertical,
		Plus,
		RotateCcw,
		Settings2,
		Trash2
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/components/ui/toast';
	import {
		BOARD_WIDGET_PLACES,
		WarRoomBoardService,
		isBoardBuiltinType,
		type BoardPanelColumn,
		type BoardWidgetType,
		type BoardWidgetZone,
		type WarRoomBoardWidget
	} from '$lib/services/war-room-board.service';
	import type { Tracker, TrackerStep } from '$lib/services/war-room-trackers.service';
	import type { WarRoomTeam } from '$lib/services/war-room-teams.service';
	import {
		BOARD_MAX_WIDGETS,
		BOARD_WIDGET_TYPES,
		boardWidgetProblem,
		boardWidgetSummary,
		boardWidgetTitle,
		boardWidgetsBody,
		boardZoneAddable,
		moveBoardWidget,
		newBoardWidget,
		placeBoardWidget,
		removeBoardWidget,
		setBoardWidgetColumn
	} from '../board-widgets';
	import BoardWidgetDialog from './board-widget-dialog.svelte';

	type Props = {
		warRoomId: number;
		/** The room's widgets as last read. */
		widgets: WarRoomBoardWidget[];
		/** false = the room has the default board. */
		customized: boolean;
		trackers: Tracker[];
		steps: TrackerStep[];
		teams: WarRoomTeam[];
		/** Types the editor may offer (e.g. vulnerabilities need read). */
		available: (type: BoardWidgetType) => boolean;
		/** The room's board changed: reload it. */
		onSaved: () => void | Promise<void>;
		onClose: () => void;
	};

	let {
		warRoomId,
		widgets,
		customized,
		trackers,
		steps,
		teams,
		available,
		onSaved,
		onClose
	}: Props = $props();

	const strip = (list: WarRoomBoardWidget[]): WarRoomBoardWidget[] =>
		list.map(({ data: _data, ...w }) => structuredClone($state.snapshot(w)) as WarRoomBoardWidget);

	// The draft starts from the board as opened; a refresh of the board
	// while editing does not overwrite it.
	// svelte-ignore state_referenced_locally
	let draft = $state<WarRoomBoardWidget[]>(strip(widgets));
	let dirty = $state(false);
	let saving = $state(false);
	let dialogOpen = $state(false);
	let editing = $state<WarRoomBoardWidget | null>(null);
	let adding = $state(false);

	// Drag and drop: the widget dragged and where it would land (before a
	// widget, or at the end of a zone / column).
	let dragId = $state<string | null>(null);
	let dropTarget = $state<{ zone: string; beforeId: string | null } | null>(null);

	const trackerName = (w: WarRoomBoardWidget) =>
		trackers.find((t) => t.id === w.config.tracker_id)?.name ?? null;

	const setDraft = (next: WarRoomBoardWidget[]) => {
		if (next === draft) return;
		draft = next;
		dirty = true;
	};

	type Zone = {
		key: string;
		title: string;
		hint: string;
		zone: BoardWidgetZone;
		column?: BoardPanelColumn;
		rows: WarRoomBoardWidget[];
	};

	const rowsOf = (zone: BoardWidgetZone, column?: BoardPanelColumn) =>
		draft.filter(
			(w) =>
				BOARD_WIDGET_PLACES[w.type].zone === zone &&
				(column === undefined || (w.column ?? 'main') === column)
		);

	const zones = $derived<Record<'banner' | 'tile' | 'main' | 'side', Zone>>({
		banner: {
			key: 'banner',
			title: 'Banner',
			hint: 'Across the top',
			zone: 'banner',
			rows: rowsOf('banner')
		},
		tile: {
			key: 'tile',
			title: 'Indicators',
			hint: 'Figures in a row of tiles',
			zone: 'tile',
			rows: rowsOf('tile')
		},
		main: {
			key: 'main',
			title: 'Main column',
			hint: 'Wide panels',
			zone: 'panel',
			column: 'main',
			rows: rowsOf('panel', 'main')
		},
		side: {
			key: 'side',
			title: 'Side column',
			hint: 'Narrow panels',
			zone: 'panel',
			column: 'side',
			rows: rowsOf('panel', 'side')
		}
	});

	const full = $derived(draft.length >= BOARD_MAX_WIDGETS);
	const problems = $derived(
		draft
			.map((w) => ({ w, problem: boardWidgetProblem(w, trackers) }))
			.filter((p): p is { w: WarRoomBoardWidget; problem: string } => p.problem !== null)
	);

	const configurable = (w: WarRoomBoardWidget) => !isBoardBuiltinType(w.type) || w.type === 'cases';

	const openSettings = (w: WarRoomBoardWidget, isNew = false) => {
		editing = w;
		adding = isNew;
		dialogOpen = true;
	};

	const add = (type: BoardWidgetType, column?: BoardPanelColumn) => {
		if (full) return;
		const fresh = newBoardWidget(
			type,
			trackers,
			draft.map((x) => x.id)
		);
		const w = column && BOARD_WIDGET_PLACES[type].zone === 'panel' ? { ...fresh, column } : fresh;
		if (isBoardBuiltinType(type)) setDraft([...draft, w]);
		else openSettings(w, true);
	};

	const apply = (w: WarRoomBoardWidget) => {
		if (adding) setDraft([...draft, w]);
		else setDraft(draft.map((x) => (x.id === w.id ? w : x)));
		adding = false;
	};

	// --- Drag and drop -----------------------------------------------------

	const dragged = $derived(draft.find((w) => w.id === dragId) ?? null);

	/** A widget can only land in its own zone; panels in either column. */
	const accepts = (z: Zone) =>
		dragged !== null && BOARD_WIDGET_PLACES[dragged.type].zone === z.zone;

	const over = (e: DragEvent, z: Zone, beforeId: string | null) => {
		if (!accepts(z)) return;
		e.preventDefault();
		e.stopPropagation();
		if (dropTarget?.zone !== z.key || dropTarget.beforeId !== beforeId) {
			dropTarget = { zone: z.key, beforeId };
		}
	};

	const drop = (e: DragEvent, z: Zone) => {
		e.preventDefault();
		e.stopPropagation();
		const id = dragId;
		const target = dropTarget;
		endDrag();
		if (!id || !target || target.zone !== z.key) return;
		setDraft(placeBoardWidget(draft, id, target.beforeId, z.column));
	};

	const endDrag = () => {
		dragId = null;
		dropTarget = null;
	};

	/** Where the pointer is over a widget: before it, or before the next one. */
	const beforeOf = (e: DragEvent, z: Zone, index: number) => {
		const el = e.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect();
		const after =
			z.zone === 'tile' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
		const target = after ? z.rows[index + 1] : z.rows[index];
		return target ? target.id : null;
	};

	// --- Save ----------------------------------------------------------------

	const fail = (title: string, res: { data?: unknown; error?: { message?: string } | null }) => {
		const data = res.data as { message?: unknown } | null | undefined;
		toast({
			title,
			description:
				data && typeof data === 'object' && typeof data.message === 'string'
					? data.message
					: (res.error?.message ?? undefined),
			variant: 'destructive'
		});
	};

	const save = async () => {
		if (saving || problems.length) return;
		saving = true;
		const res = await WarRoomBoardService.setWidgets(warRoomId, boardWidgetsBody(draft));
		saving = false;
		if (!res.ok) return fail('Could not save the board', res);
		toast({ title: 'Board saved' });
		dirty = false;
		await onSaved();
		onClose();
	};

	const reset = async () => {
		if (saving) return;
		if (!confirm("Replace this room's widgets with the default board, for everyone?")) return;
		saving = true;
		const res = await WarRoomBoardService.setWidgets(warRoomId, null);
		saving = false;
		if (!res.ok) return fail('Could not reset the board', res);
		toast({ title: 'Default board restored' });
		dirty = false;
		await onSaved();
		onClose();
	};

	const cancel = () => {
		if (dirty && !confirm('Drop your changes to the board?')) return;
		onClose();
	};

	const ICON_BUTTON =
		'rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30';
</script>

{#snippet addMenu(z: Zone, compact: boolean)}
	{@const offer = boardZoneAddable(z.zone, draft, available)}
	{#if offer.configurable.length || offer.builtins.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger disabled={full || saving}>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class={[
							'flex items-center justify-center gap-1 rounded-md border border-dashed text-2xs text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-foreground disabled:opacity-50',
							compact ? 'min-h-[4.5rem] px-2' : 'w-full py-2'
						]}
						title={full ? `At most ${BOARD_MAX_WIDGETS} widgets` : undefined}
						data-testid={`board-editor-add-in-${z.key}`}
					>
						<Plus class="h-3.5 w-3.5" /> Add {z.zone === 'tile' ? 'an indicator' : 'a widget'}
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-80">
				{#each offer.configurable as type (type)}
					<DropdownMenu.Item
						onclick={() => add(type, z.column)}
						data-testid={`board-editor-add-${type}`}
					>
						<div class="flex min-w-0 flex-col">
							<span class="text-xs font-medium">{BOARD_WIDGET_TYPES[type].label}</span>
							<span class="text-2xs text-muted-foreground">
								{BOARD_WIDGET_TYPES[type].description}
							</span>
						</div>
					</DropdownMenu.Item>
				{/each}
				{#if offer.builtins.length}
					{#if offer.configurable.length}<DropdownMenu.Separator />{/if}
					<DropdownMenu.Label>Put back</DropdownMenu.Label>
					{#each offer.builtins as type (type)}
						<DropdownMenu.Item onclick={() => add(type, z.column)}>
							<div class="flex min-w-0 flex-col">
								<span class="text-xs font-medium">{BOARD_WIDGET_TYPES[type].label}</span>
								<span class="truncate text-2xs text-muted-foreground">
									{BOARD_WIDGET_TYPES[type].description}
								</span>
							</div>
						</DropdownMenu.Item>
					{/each}
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}

{#snippet card(w: WarRoomBoardWidget, z: Zone, i: number)}
	{@const label = boardWidgetTitle(w, trackerName(w))}
	{@const typeLabel = BOARD_WIDGET_TYPES[w.type].label}
	{@const problem = boardWidgetProblem(w, trackers)}
	{@const tile = z.zone === 'tile'}
	{@const marked = dropTarget?.zone === z.key && dropTarget.beforeId === w.id && dragId !== w.id}
	<div
		class={[
			'group relative flex min-w-0 gap-1.5 rounded-md border bg-background p-2 shadow-sm transition-colors',
			problem ? 'border-destructive/60' : 'hover:border-primary/40',
			dragId === w.id && 'opacity-40',
			marked && (tile ? 'ring-2 ring-primary ring-offset-1' : 'border-t-2 border-t-primary')
		]}
		draggable={!saving}
		ondragstart={(e) => {
			dragId = w.id;
			e.dataTransfer?.setData('text/plain', w.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		}}
		ondragend={endDrag}
		ondragover={(e) => over(e, z, beforeOf(e, z, i))}
		ondrop={(e) => drop(e, z)}
		role="listitem"
		data-testid="board-editor-widget"
		data-widget-id={w.id}
	>
		<GripVertical
			class="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/60 group-hover:text-muted-foreground"
			aria-hidden="true"
		/>
		<button
			type="button"
			class={['min-w-0 flex-1 text-left', configurable(w) ? 'cursor-pointer' : 'cursor-grab']}
			onclick={() => configurable(w) && openSettings(w)}
			title={configurable(w) ? 'Set it up' : undefined}
			tabindex={configurable(w) ? 0 : -1}
		>
			<span class="flex items-baseline gap-1.5">
				<span class="truncate text-xs font-medium" title={label}>{label}</span>
				{#if label !== typeLabel}
					<span class="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
						{typeLabel}
					</span>
				{/if}
			</span>
			<span
				class={[
					'mt-0.5 block text-2xs',
					tile ? 'line-clamp-2' : 'truncate',
					problem ? 'text-destructive' : 'text-muted-foreground'
				]}
			>
				{problem ?? boardWidgetSummary(w, { trackers, steps, teams })}
			</span>
		</button>
		<div
			class={[
				'flex shrink-0 items-start gap-0.5',
				tile &&
					'absolute right-1 top-1 rounded bg-background/95 opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100'
			]}
		>
			{#if configurable(w)}
				<button
					type="button"
					class={ICON_BUTTON}
					onclick={() => openSettings(w)}
					aria-label={`Set up ${label}`}
					title="Settings"
					data-testid="board-editor-settings"
				>
					<Settings2 class="h-3.5 w-3.5" />
				</button>
			{/if}
			<!-- The keyboard path of the drag and drop. -->
			<button
				type="button"
				class={[ICON_BUTTON, 'sr-only focus:not-sr-only group-hover:not-sr-only']}
				onclick={() => setDraft(moveBoardWidget(draft, w.id, -1))}
				disabled={i === 0}
				aria-label={`Move ${label} ${tile ? 'left' : 'up'}`}
			>
				{#if tile}<ArrowLeft class="h-3.5 w-3.5" />{:else}<ArrowUp class="h-3.5 w-3.5" />{/if}
			</button>
			<button
				type="button"
				class={[ICON_BUTTON, 'sr-only focus:not-sr-only group-hover:not-sr-only']}
				onclick={() => setDraft(moveBoardWidget(draft, w.id, 1))}
				disabled={i === z.rows.length - 1}
				aria-label={`Move ${label} ${tile ? 'right' : 'down'}`}
			>
				{#if tile}<ArrowRight class="h-3.5 w-3.5" />{:else}<ArrowDown class="h-3.5 w-3.5" />{/if}
			</button>
			{#if z.column}
				{@const other = z.column === 'main' ? 'side' : 'main'}
				<button
					type="button"
					class={[ICON_BUTTON, 'sr-only focus:not-sr-only group-hover:not-sr-only']}
					onclick={() => setDraft(setBoardWidgetColumn(draft, w.id, other))}
					aria-label={`Move ${label} to the ${other} column`}
					title={`Move to the ${other} column`}
				>
					<ArrowLeftRight class="h-3.5 w-3.5" />
				</button>
			{/if}
			<button
				type="button"
				class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
				onclick={() => setDraft(removeBoardWidget(draft, w.id))}
				aria-label={`Remove ${label}`}
				title="Remove"
				data-testid="board-editor-remove"
			>
				<Trash2 class="h-3.5 w-3.5" />
			</button>
		</div>
	</div>
{/snippet}

{#snippet zone(z: Zone, layout: string)}
	{@const endMarked = dropTarget?.zone === z.key && dropTarget.beforeId === null}
	<section
		class={[
			'flex min-w-0 flex-col gap-1.5 rounded-lg border border-transparent p-1.5 transition-colors',
			dragged && accepts(z) && 'border-dashed border-primary/40 bg-primary/[0.03]'
		]}
		aria-label={z.title}
		ondragover={(e) => over(e, z, null)}
		ondrop={(e) => drop(e, z)}
		data-testid={`board-editor-zone-${z.key}`}
	>
		<h3 class="flex items-baseline gap-2 px-0.5">
			<span class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
				{z.title}
			</span>
			<span class="text-[10px] text-muted-foreground/80">{z.hint}</span>
		</h3>
		<div class={layout} role="list">
			{#each z.rows as w, i (w.id)}
				{@render card(w, z, i)}
			{/each}
			{#if endMarked && dragged}
				<div
					class={[
						'rounded-md border-2 border-dashed border-primary/60',
						z.zone === 'tile' ? 'min-h-[4.5rem]' : 'h-10'
					]}
					aria-hidden="true"
				></div>
			{/if}
			{@render addMenu(z, z.zone === 'tile')}
		</div>
		{#if z.rows.length === 0 && !endMarked}
			<p class="px-0.5 text-2xs text-muted-foreground">Nothing here.</p>
		{/if}
	</section>
{/snippet}

<section
	class="shadow-elevation-1 rounded-xl border border-amber-500/50 bg-card"
	aria-labelledby="board-editor-title"
	data-testid="board-editor"
>
	<header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5">
		<div class="min-w-0">
			<h2 id="board-editor-title" class="text-sm font-semibold">
				Edit the board
				{#if dirty}
					<span class="ml-1 text-2xs font-normal text-amber-700 dark:text-amber-300">
						· unsaved changes
					</span>
				{/if}
			</h2>
			<p class="text-2xs text-muted-foreground">
				For everyone in this war room. Drag a widget to move it, click it to set it up. Each one can
				still hide or reorder widgets for themselves.
			</p>
		</div>
		<div class="ml-auto flex flex-wrap items-center gap-2">
			<Button
				size="sm"
				variant="ghost"
				onclick={reset}
				disabled={saving || (!customized && !dirty)}
				data-testid="board-editor-reset"
			>
				<RotateCcw class="mr-1 h-3.5 w-3.5" /> Reset to the default board
			</Button>
			<Button size="sm" variant="outline" onclick={cancel} disabled={saving}>Cancel</Button>
			<Button
				size="sm"
				onclick={save}
				disabled={saving || !dirty || problems.length > 0}
				data-testid="board-editor-save"
			>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</div>
	</header>
	{#if problems.length}
		<ul class="border-b bg-destructive/5 px-4 py-2 text-2xs text-destructive" role="alert">
			{#each problems as p (p.w.id)}
				<li>{boardWidgetTitle(p.w, trackerName(p.w))}: {p.problem}</li>
			{/each}
		</ul>
	{/if}
	<div class="flex flex-col gap-3 p-3">
		{#if zones.banner.rows.length || boardZoneAddable('banner', draft, available).builtins.length}
			{@render zone(zones.banner, 'grid gap-1.5 sm:grid-cols-[1fr_auto]')}
		{/if}
		{@render zone(zones.tile, 'grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6')}
		<div class="grid gap-3 xl:grid-cols-3">
			<div class="min-w-0 xl:col-span-2">
				{@render zone(zones.main, 'flex flex-col gap-1.5')}
			</div>
			{@render zone(zones.side, 'flex flex-col gap-1.5')}
		</div>
	</div>
</section>

<BoardWidgetDialog
	bind:open={dialogOpen}
	widget={editing}
	{trackers}
	{steps}
	{teams}
	onApply={apply}
/>
