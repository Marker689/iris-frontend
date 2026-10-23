<!--
  Settings of one widget of the room's board, in "Edit board": its title,
  its column (panels), the kind of a tracker widget ("Show as": a count,
  progress, rows or a breakdown, keeping its tracker, steps and filter)
  and what its type needs — the tracker, the steps
  counted or listed, how progress is drawn, a filter on a column of the
  tracker, the column a breakdown groups by, the teams of a tasks widget,
  the text of a note, the steps flagged on the case cards. "Apply" hands
  the widget back to the board editor; nothing is saved until the board is.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import {
		BOARD_WIDGET_PLACES,
		boardValueLabel,
		type BoardFilterValue,
		type BoardConfigurableType,
		type BoardProgressDisplay,
		type BoardWidgetConfig,
		type BoardWidgetType,
		type WarRoomBoardWidget
	} from '$lib/services/war-room-board.service';
	import type { Tracker, TrackerStep } from '$lib/services/war-room-trackers.service';
	import type { WarRoomTeam } from '$lib/services/war-room-teams.service';
	import {
		BOARD_TRACKER_KINDS,
		BOARD_WIDGET_TYPES,
		boardWidgetProblem,
		boardWidgetTitle,
		breakdownColumns,
		changeBoardWidgetType,
		isTrackerWidget
	} from '../board-widgets';

	type Props = {
		open: boolean;
		widget: WarRoomBoardWidget | null;
		trackers: Tracker[];
		steps: TrackerStep[];
		teams: WarRoomTeam[];
		onApply: (widget: WarRoomBoardWidget) => void;
	};

	let { open = $bindable(), widget, trackers, steps, teams, onApply }: Props = $props();

	const TITLE_MAX = 128;
	const NOTE_MAX = 20000;
	const DISPLAYS: { value: BoardProgressDisplay; label: string }[] = [
		{ value: 'bars', label: 'Bars' },
		{ value: 'donut', label: 'Donut' },
		{ value: 'funnel', label: 'Funnel' }
	];
	const SELECT_CLASS = 'h-8 rounded-md border bg-background px-2 text-xs';

	let title = $state('');
	let column = $state<'main' | 'side'>('main');
	let config = $state<BoardWidgetConfig>({});
	let kind = $state<BoardWidgetType>('note');

	$effect(() => {
		if (!open || !widget) return;
		const w = widget;
		untrack(() => {
			title = w.title ?? '';
			column = w.column ?? 'main';
			config = structuredClone($state.snapshot(w.config)) as BoardWidgetConfig;
			kind = w.type;
		});
	});

	const type = $derived(widget ? kind : 'note');
	const isPanel = $derived(BOARD_WIDGET_PLACES[type].zone === 'panel');
	const isTracker = $derived(widget ? isTrackerWidget({ type }) : false);
	const tracker = $derived(trackers.find((t) => t.id === config.tracker_id) ?? null);
	// The steps a tracker widget can pick from: the ones its tracker offers.
	const trackerSteps = $derived(
		tracker?.step_ids ? steps.filter((s) => tracker.step_ids?.includes(s.id)) : steps
	);
	const filterColumns = $derived(breakdownColumns(tracker?.columns ?? []));
	const filterColumn = $derived(
		filterColumns.find((c) => c.key === config.filter?.column_key) ?? null
	);
	const filterChoices = $derived<BoardFilterValue[]>(
		filterColumn?.type === 'checkbox' ? [true, false] : (filterColumn?.options ?? [])
	);
	// Progress and breakdown show the offered steps unless told otherwise.
	const allSteps = $derived(
		(type === 'tracker_progress' || type === 'tracker_breakdown') && config.step_ids == null
	);

	const draft = $derived<WarRoomBoardWidget | null>(
		widget
			? {
					...widget,
					type,
					title: title.trim() || null,
					column: isPanel ? column : null,
					config
				}
			: null
	);
	const problem = $derived(draft ? boardWidgetProblem(draft, trackers) : null);

	const toggle = <T,>(list: T[] | null | undefined, value: T): T[] =>
		(list ?? []).includes(value)
			? (list ?? []).filter((v) => v !== value)
			: [...(list ?? []), value];

	const setTracker = (id: number) => {
		const next = trackers.find((t) => t.id === id);
		const offered = next?.step_ids ?? null;
		config = {
			...config,
			tracker_id: id,
			filter: config.filter === undefined ? undefined : null,
			step_ids:
				config.step_ids == null
					? config.step_ids
					: config.step_ids.filter((s) => !offered || offered.includes(s)),
			...(type === 'tracker_breakdown'
				? { column_key: breakdownColumns(next?.columns ?? [])[0]?.key }
				: {})
		};
	};

	const setKind = (next: BoardConfigurableType) => {
		if (!widget || next === type) return;
		const changed = changeBoardWidgetType(
			{ ...widget, type, column: isPanel ? column : null, config },
			next,
			trackers
		);
		kind = changed.type;
		column = changed.column ?? 'main';
		config = changed.config;
	};

	const setFilterColumn = (key: string) => {
		config = { ...config, filter: key ? { column_key: key, values: [] } : null };
	};

	const toggleFilterValue = (value: BoardFilterValue) => {
		if (!config.filter) return;
		config = {
			...config,
			filter: { ...config.filter, values: toggle(config.filter.values, value) }
		};
	};

	const apply = () => {
		if (!draft || problem) return;
		onApply(draft);
		open = false;
	};
</script>

{#snippet stepChips(selected: number[], pick: (id: number) => void, choices: TrackerStep[])}
	{#if choices.length === 0}
		<p class="text-2xs text-muted-foreground">The war room has no step yet.</p>
	{:else}
		<div class="flex flex-wrap gap-1.5">
			{#each choices as s (s.id)}
				<button
					type="button"
					role="checkbox"
					aria-checked={selected.includes(s.id)}
					aria-label={s.name}
					onclick={() => pick(s.id)}
				>
					<TrackerStepChip step={s} size="sm" muted={!selected.includes(s.id)} />
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>{BOARD_WIDGET_TYPES[type].label}</Dialog.Title>
			<Dialog.Description>{BOARD_WIDGET_TYPES[type].description}</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1"
			onsubmit={(e) => {
				e.preventDefault();
				apply();
			}}
			data-testid="board-widget-form"
		>
			<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
				<div class="flex flex-col gap-1">
					<label
						for="board-widget-title"
						class="text-2xs uppercase tracking-wide text-muted-foreground">Title</label
					>
					<Input
						id="board-widget-title"
						bind:value={title}
						maxlength={TITLE_MAX}
						placeholder={draft ? boardWidgetTitle({ ...draft, title: null }, tracker?.name) : ''}
					/>
				</div>
				{#if isPanel}
					<div class="flex flex-col gap-1">
						<label
							for="board-widget-column"
							class="text-2xs uppercase tracking-wide text-muted-foreground">Column</label
						>
						<select id="board-widget-column" class={`${SELECT_CLASS} h-9`} bind:value={column}>
							<option value="main">Main</option>
							<option value="side">Side</option>
						</select>
					</div>
				{/if}
			</div>

			{#if isTracker}
				<fieldset class="flex flex-col gap-1">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
						Show as
					</legend>
					<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup">
						{#each BOARD_TRACKER_KINDS as k (k)}
							<button
								type="button"
								role="radio"
								aria-checked={type === k}
								class={[
									'rounded-md border px-2 py-1.5 text-left text-xs',
									type === k
										? 'border-primary bg-primary/5 font-medium'
										: 'text-muted-foreground hover:bg-muted/40'
								]}
								title={BOARD_WIDGET_TYPES[k].description}
								onclick={() => setKind(k)}
								data-testid={`board-widget-kind-${k}`}
							>
								{BOARD_WIDGET_TYPES[k].label.replace(/^Tracker /, '')}
								<span class="block text-[10px] font-normal text-muted-foreground">
									{BOARD_WIDGET_PLACES[k].zone === 'tile' ? 'Indicator' : 'Panel'}
								</span>
							</button>
						{/each}
					</div>
				</fieldset>
				<div class="flex flex-col gap-1">
					<label
						for="board-widget-tracker"
						class="text-2xs uppercase tracking-wide text-muted-foreground">Tracker *</label
					>
					{#if trackers.length === 0}
						<p class="text-2xs text-muted-foreground">
							The war room has no tracker yet: create one in the Scope tab.
						</p>
					{:else}
						<select
							id="board-widget-tracker"
							class={SELECT_CLASS}
							value={config.tracker_id == null ? '' : String(config.tracker_id)}
							onchange={(e) => setTracker(Number((e.target as HTMLSelectElement).value))}
							data-testid="board-widget-tracker"
						>
							{#if config.tracker_id == null || !tracker}
								<option value="" disabled>Pick a tracker</option>
							{/if}
							{#each trackers as t (t.id)}
								<option value={String(t.id)}>{t.name}</option>
							{/each}
						</select>
					{/if}
				</div>
			{/if}

			{#if type === 'tracker_count' || type === 'tracker_list'}
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
						{type === 'tracker_count' ? 'Count the rows carrying' : 'List the rows carrying'}
					</legend>
					<p class="text-2xs text-muted-foreground">
						One of these steps — every row when none is picked.
					</p>
					{@render stepChips(
						config.step_ids ?? [],
						(id) => (config = { ...config, step_ids: toggle(config.step_ids, id) }),
						trackerSteps
					)}
				</fieldset>
			{/if}

			{#if type === 'tracker_count'}
				<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
					<label for="board-widget-of-total" class="min-w-0">
						<span class="block text-xs font-medium">Out of all the rows</span>
						<span class="block text-2xs text-muted-foreground">Show 10/20 rather than 10.</span>
					</label>
					<Switch
						id="board-widget-of-total"
						checked={config.of_total !== false}
						onCheckedChange={(v) => (config = { ...config, of_total: !!v })}
					/>
				</div>
			{/if}

			{#if type === 'tracker_progress' || type === 'tracker_breakdown'}
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Steps</legend>
					<label class="flex items-center gap-2 text-xs" for="board-widget-all-steps">
						<Checkbox
							id="board-widget-all-steps"
							checked={allSteps}
							onCheckedChange={(v) =>
								(config = {
									...config,
									step_ids: v ? null : trackerSteps.map((s) => s.id)
								})}
						/>
						Every step the tracker offers, in the room's order
					</label>
					{#if !allSteps}
						<div class="pl-6">
							{@render stepChips(
								config.step_ids ?? [],
								(id) =>
									(config = {
										...config,
										// Kept in the room's order, whatever the click order.
										step_ids: steps
											.map((s) => s.id)
											.filter((s) => toggle(config.step_ids, id).includes(s))
									}),
								trackerSteps
							)}
						</div>
					{/if}
				</fieldset>
			{/if}

			{#if type === 'tracker_progress'}
				<fieldset class="flex flex-col gap-1">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground"
						>Display</legend
					>
					<div class="flex gap-1.5" role="radiogroup">
						{#each DISPLAYS as d (d.value)}
							<button
								type="button"
								role="radio"
								aria-checked={(config.display ?? 'bars') === d.value}
								class={[
									'rounded-md border px-3 py-1.5 text-xs',
									(config.display ?? 'bars') === d.value
										? 'border-primary bg-primary/5 font-medium'
										: 'text-muted-foreground hover:bg-muted/40'
								]}
								onclick={() => (config = { ...config, display: d.value })}>{d.label}</button
							>
						{/each}
					</div>
					{#if (config.display ?? 'bars') === 'funnel'}
						<p class="text-2xs text-muted-foreground">
							One stage per step, in order, each counting the rows carrying it — best when rows keep
							their earlier steps, e.g. contacted, acknowledged, closed.
						</p>
					{/if}
				</fieldset>
			{/if}

			{#if type === 'tracker_breakdown' && tracker}
				<div class="flex flex-col gap-1">
					<label
						for="board-widget-column-key"
						class="text-2xs uppercase tracking-wide text-muted-foreground">Group by *</label
					>
					{#if filterColumns.length === 0}
						<p class="text-2xs text-muted-foreground">
							{tracker.name} has no select, multiselect or checkbox column.
						</p>
					{:else}
						<select
							id="board-widget-column-key"
							class={SELECT_CLASS}
							value={config.column_key ?? ''}
							onchange={(e) =>
								(config = { ...config, column_key: (e.target as HTMLSelectElement).value })}
						>
							{#each filterColumns as c (c.key)}
								<option value={c.key}>{c.label}</option>
							{/each}
						</select>
					{/if}
				</div>
			{/if}

			{#if (type === 'tracker_count' || type === 'tracker_progress' || type === 'tracker_list') && tracker}
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Filter</legend
					>
					{#if filterColumns.length === 0}
						<p class="text-2xs text-muted-foreground">
							Every row of {tracker.name}. Add a select, multiselect or checkbox column to the
							tracker to filter its rows here (e.g. by sector or customer type).
						</p>
					{:else}
						<label class="flex items-center gap-2 text-xs" for="board-widget-filter-column">
							Only the rows whose
							<select
								id="board-widget-filter-column"
								class={SELECT_CLASS}
								value={config.filter?.column_key ?? ''}
								onchange={(e) => setFilterColumn((e.target as HTMLSelectElement).value)}
								data-testid="board-widget-filter-column"
							>
								<option value="">(every row)</option>
								{#each filterColumns as c (c.key)}
									<option value={c.key}>{c.label}</option>
								{/each}
							</select>
							{#if config.filter}is{/if}
						</label>
						{#if config.filter}
							<div class="flex flex-wrap gap-1.5 pl-1">
								{#each filterChoices as v (String(v))}
									{@const on = config.filter.values.includes(v)}
									<button
										type="button"
										role="checkbox"
										aria-checked={on}
										class={[
											'rounded-full border px-2 py-0.5 text-2xs',
											on
												? 'border-primary bg-primary/10 font-medium'
												: 'text-muted-foreground hover:bg-muted/40'
										]}
										onclick={() => toggleFilterValue(v)}>{boardValueLabel(v)}</button
									>
								{/each}
							</div>
						{/if}
					{/if}
				</fieldset>
			{/if}

			{#if type === 'tasks'}
				<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
					<label for="board-widget-in-progress" class="min-w-0">
						<span class="block text-xs font-medium">In progress only</span>
						<span class="block text-2xs text-muted-foreground">
							Leave out the open tasks not started yet.
						</span>
					</label>
					<Switch
						id="board-widget-in-progress"
						checked={!!config.in_progress_only}
						onCheckedChange={(v) => (config = { ...config, in_progress_only: !!v })}
					/>
				</div>
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Teams</legend>
					<p class="text-2xs text-muted-foreground">
						The tasks of these teams — every task when none is picked.
					</p>
					{#if teams.length === 0}
						<p class="text-2xs text-muted-foreground">The war room has no team.</p>
					{:else}
						<div class="flex flex-wrap gap-1.5">
							{#each teams as t (t.team_id)}
								{@const on = (config.team_ids ?? []).includes(t.team_id)}
								<button
									type="button"
									role="checkbox"
									aria-checked={on}
									class={[
										'rounded-full border px-2 py-0.5 text-2xs',
										on
											? 'border-primary bg-primary/10 font-medium'
											: 'text-muted-foreground hover:bg-muted/40'
									]}
									onclick={() =>
										(config = { ...config, team_ids: toggle(config.team_ids, t.team_id) })}
									>{t.name}</button
								>
							{/each}
						</div>
					{/if}
				</fieldset>
			{/if}

			{#if type === 'note'}
				<div class="flex flex-col gap-1">
					<label
						for="board-widget-text"
						class="text-2xs uppercase tracking-wide text-muted-foreground">Text (markdown)</label
					>
					<Textarea
						id="board-widget-text"
						rows={8}
						maxlength={NOTE_MAX}
						value={config.text ?? ''}
						oninput={(e) => (config = { ...config, text: (e.target as HTMLTextAreaElement).value })}
					/>
				</div>
			{/if}

			{#if type === 'cases'}
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
						Flag the cases
					</legend>
					<p class="text-2xs text-muted-foreground">
						Cases with tracker rows carrying these steps come first, the steps on their card (e.g.
						"Action required", "Compromise assessment").
					</p>
					{@render stepChips(
						config.highlight_step_ids ?? [],
						(id) =>
							(config = {
								...config,
								highlight_step_ids: toggle(config.highlight_step_ids, id)
							}),
						steps
					)}
					{#if (config.highlight_step_ids ?? []).length && trackers.length > 1}
						<label class="mt-1 flex items-center gap-2 text-xs" for="board-widget-all-trackers">
							<Checkbox
								id="board-widget-all-trackers"
								checked={config.tracker_ids == null}
								onCheckedChange={(v) =>
									(config = { ...config, tracker_ids: v ? null : trackers.map((t) => t.id) })}
							/>
							Looking at the rows of every tracker
						</label>
						{#if config.tracker_ids != null}
							<div class="flex flex-wrap gap-1.5 pl-6">
								{#each trackers as t (t.id)}
									{@const on = config.tracker_ids.includes(t.id)}
									<button
										type="button"
										role="checkbox"
										aria-checked={on}
										class={[
											'rounded-full border px-2 py-0.5 text-2xs',
											on
												? 'border-primary bg-primary/10 font-medium'
												: 'text-muted-foreground hover:bg-muted/40'
										]}
										onclick={() =>
											(config = { ...config, tracker_ids: toggle(config.tracker_ids, t.id) })}
										>{t.name}</button
									>
								{/each}
							</div>
						{/if}
					{/if}
				</fieldset>
			{/if}

			{#if problem}
				<p class="text-2xs text-destructive" role="alert">{problem}</p>
			{/if}
		</form>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={apply} disabled={!!problem} data-testid="board-widget-apply">Apply</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
