<!--
  Board "Edit board" panel, for the room's writers: the widgets everyone
  sees — add one (a tracker count, progress, rows or breakdown, tasks, a
  note, or a built-in removed earlier), set it up, move it within its
  zone or to the other column, remove it. The changes are a draft until
  "Save"; "Reset to the default board" drops the room's widgets for the
  default ones. Each user can still hide or reorder them for themselves
  ("Customize").
-->
<script lang="ts">
	import {
		ArrowDown,
		ArrowLeftRight,
		ArrowUp,
		ChevronDown,
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
		BOARD_ADDABLE_TYPES,
		BOARD_MAX_WIDGETS,
		BOARD_WIDGET_TYPES,
		boardWidgetProblem,
		boardWidgetTitle,
		boardWidgetsBody,
		missingBuiltins,
		moveBoardWidget,
		newBoardWidget,
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

	const trackerName = (w: WarRoomBoardWidget) =>
		trackers.find((t) => t.id === w.config.tracker_id)?.name ?? null;

	const setDraft = (next: WarRoomBoardWidget[]) => {
		draft = next;
		dirty = true;
	};

	const rowsOf = (zone: BoardWidgetZone, column?: BoardPanelColumn) =>
		draft.filter(
			(w) =>
				BOARD_WIDGET_PLACES[w.type].zone === zone &&
				(column === undefined || (w.column ?? 'main') === column)
		);

	const groups = $derived([
		{ key: 'banner', title: 'Banner', rows: rowsOf('banner') },
		{ key: 'tile', title: 'Indicators', rows: rowsOf('tile') },
		{ key: 'main', title: 'Main column', rows: rowsOf('panel', 'main'), column: 'main' as const },
		{ key: 'side', title: 'Side column', rows: rowsOf('panel', 'side'), column: 'side' as const }
	]);

	const full = $derived(draft.length >= BOARD_MAX_WIDGETS);
	const builtinsBack = $derived(missingBuiltins(draft).filter(available));
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

	const add = (type: BoardWidgetType) => {
		if (full) return;
		const w = newBoardWidget(
			type,
			trackers,
			draft.map((x) => x.id)
		);
		if (isBoardBuiltinType(type)) setDraft([...draft, w]);
		else openSettings(w, true);
	};

	const apply = (w: WarRoomBoardWidget) => {
		if (adding) setDraft([...draft, w]);
		else setDraft(draft.map((x) => (x.id === w.id ? w : x)));
		adding = false;
	};

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
</script>

<section
	class="shadow-elevation-1 rounded-xl border border-amber-500/50 bg-card"
	aria-labelledby="board-editor-title"
	data-testid="board-editor"
>
	<header class="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
		<h2 id="board-editor-title" class="text-sm font-semibold">Edit the board</h2>
		<span class="text-2xs text-muted-foreground">
			For everyone in this war room. Each one can still hide or reorder widgets for themselves.
		</span>
		<div class="ml-auto flex flex-wrap items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger disabled={full || saving}>
					{#snippet child({ props })}
						<Button
							{...props}
							size="sm"
							variant="outline"
							title={full ? `At most ${BOARD_MAX_WIDGETS} widgets` : undefined}
							data-testid="board-editor-add"
						>
							<Plus class="mr-1 h-3.5 w-3.5" /> Add a widget <ChevronDown class="ml-1 h-3 w-3" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-80">
					{#each BOARD_ADDABLE_TYPES as type (type)}
						<DropdownMenu.Item onclick={() => add(type)} data-testid={`board-editor-add-${type}`}>
							<div class="flex min-w-0 flex-col">
								<span class="text-xs font-medium">{BOARD_WIDGET_TYPES[type].label}</span>
								<span class="text-2xs text-muted-foreground">
									{BOARD_WIDGET_TYPES[type].description}
								</span>
							</div>
						</DropdownMenu.Item>
					{/each}
					{#if builtinsBack.length}
						<DropdownMenu.Separator />
						<DropdownMenu.Label>Put back</DropdownMenu.Label>
						{#each builtinsBack as type (type)}
							<DropdownMenu.Item onclick={() => add(type)}>
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
	<div class="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
		{#each groups as g (g.key)}
			<div class="min-w-0">
				<h3 class="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
					{g.title}
				</h3>
				{#if g.rows.length === 0}
					<p
						class="rounded-md border border-dashed px-2 py-3 text-center text-2xs text-muted-foreground"
					>
						Empty
					</p>
				{:else}
					<ul class="divide-y rounded-md border">
						{#each g.rows as w, i (w.id)}
							{@const label = boardWidgetTitle(w, trackerName(w))}
							{@const problem = boardWidgetProblem(w, trackers)}
							<li class="flex items-center gap-1.5 px-2 py-1.5" data-testid="board-editor-widget">
								<div class="min-w-0 flex-1">
									<span class="block truncate text-xs font-medium" title={label}>{label}</span>
									<span
										class={[
											'block truncate text-2xs',
											problem ? 'text-destructive' : 'text-muted-foreground'
										]}
									>
										{problem ?? BOARD_WIDGET_TYPES[w.type].label}
									</span>
								</div>
								{#if configurable(w)}
									<button
										type="button"
										class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
										onclick={() => openSettings(w)}
										aria-label={`Set up ${label}`}
										title="Settings"
										data-testid="board-editor-settings"
									>
										<Settings2 class="h-3.5 w-3.5" />
									</button>
								{/if}
								{#if g.column}
									<button
										type="button"
										class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
										onclick={() =>
											setDraft(
												setBoardWidgetColumn(draft, w.id, g.column === 'main' ? 'side' : 'main')
											)}
										aria-label={`Move ${label} to the ${g.column === 'main' ? 'side' : 'main'} column`}
										title={`Move to the ${g.column === 'main' ? 'side' : 'main'} column`}
									>
										<ArrowLeftRight class="h-3.5 w-3.5" />
									</button>
								{/if}
								<button
									type="button"
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
									onclick={() => setDraft(moveBoardWidget(draft, w.id, -1))}
									disabled={i === 0}
									aria-label={`Move ${label} up`}
								>
									<ArrowUp class="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
									onclick={() => setDraft(moveBoardWidget(draft, w.id, 1))}
									disabled={i === g.rows.length - 1}
									aria-label={`Move ${label} down`}
								>
									<ArrowDown class="h-3.5 w-3.5" />
								</button>
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
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
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
