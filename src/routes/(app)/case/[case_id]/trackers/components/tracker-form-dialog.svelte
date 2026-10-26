<!--
  Create or edit a case tracker tab: name, icon, source (fixed once
  created), the steps it offers (all of the case by default), its extra
  columns, for asset rows the asset flags column and what it writes to
  a timeline of the case.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import FlagIconPicker from '$lib/components/common/assets/FlagIconPicker.svelte';
	import TrackerColumnsEditor from '$lib/components/common/trackers/TrackerColumnsEditor.svelte';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import { TRACKER_ICONS } from '$lib/components/common/trackers/tracker-icon';
	import {
		CASE_TRACKER_SOURCES,
		CaseTrackersService,
		TRACKER_TIMELINE_CHANGED_AT,
		type CaseTracker,
		type CaseTrackerSource,
		type CaseTrackerTimelineSync
	} from '$lib/services/case-trackers.service';
	import {
		TRACKER_TIMELINE_MODES,
		normalizeTrackerTimelineSync,
		trackerTimelineDateColumns,
		type TrackerColumn
	} from '$lib/services/war-room-trackers.service';
	import { CaseTimelinesService, type CaseTimeline } from '$lib/services/case-timelines.service';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import type { CaseTrackersState } from './trackers-state.svelte';

	type Props = {
		open: boolean;
		store: CaseTrackersState;
		/** null = create. */
		editing?: CaseTracker | null;
		onSaved?: (tracker: CaseTracker) => void;
		/** Open the case steps manager. */
		onManageSteps?: () => void;
	};

	let { open = $bindable(), store, editing = null, onSaved, onManageSteps }: Props = $props();

	const NAME_MAX = 128;

	let name = $state('');
	let description = $state('');
	let icon = $state('list-checks');
	let source = $state<CaseTrackerSource>('manual');
	let allSteps = $state(true);
	let stepIds = $state<number[]>([]);
	let columns = $state<TrackerColumn[]>([]);
	let showFlags = $state(false);
	let timelineSync = $state<CaseTrackerTimelineSync | null>(null);
	/** Write what happened before the sync was turned on, once saved. */
	let timelineBackfill = $state(true);
	let caseTimelines = $state<CaseTimeline[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			const t = editing;
			name = t?.name ?? '';
			description = t?.description ?? '';
			icon = t?.icon ?? 'list-checks';
			source = t?.source ?? 'manual';
			allSteps = t ? t.step_ids == null : true;
			stepIds = t?.step_ids ? [...t.step_ids] : store.steps.map((s) => s.id);
			columns = t
				? t.columns.map((c) => ({ ...c, options: c.options ? [...c.options] : undefined }))
				: [];
			showFlags = t?.show_asset_flags ?? false;
			timelineSync = t?.timeline_sync ? { ...t.timeline_sync } : null;
			timelineBackfill = true;
			error = null;
			busy = false;
			void loadCaseTimelines();
		});
	});

	const loadCaseTimelines = async () => {
		const res = await CaseTimelinesService.list(store.caseId);
		caseTimelines = res.ok && Array.isArray(res.data) ? res.data : [];
	};

	const dateColumns = $derived(trackerTimelineDateColumns(columns));

	const toggleTimeline = (on: boolean) => {
		timelineSync = on
			? { mode: 'changes', date: TRACKER_TIMELINE_CHANGED_AT, case_timeline_id: null }
			: null;
	};

	const updateTimeline = (patch: Partial<CaseTrackerTimelineSync>) => {
		if (timelineSync) timelineSync = { ...timelineSync, ...patch };
	};

	/** The sync to send: the date column must still be there, the timeline still exist. */
	const timelineSyncBody = (cols: TrackerColumn[]): CaseTrackerTimelineSync | null => {
		const sync = normalizeTrackerTimelineSync(timelineSync, cols);
		if (
			sync?.case_timeline_id != null &&
			!caseTimelines.some((t) => t.timeline_id === sync.case_timeline_id)
		) {
			return { ...sync, case_timeline_id: null };
		}
		return sync;
	};

	// An existing tracker getting a mode it did not have (or still holding
	// past changes not written) can be written after the fact.
	const backfillMode = $derived.by(() => {
		const mode = timelineSync?.mode;
		if (!editing || !mode) return null;
		if (editing.timeline_sync?.mode !== mode) return mode;
		return mode === 'changes' && (editing.timeline_backfill ?? 0) > 0 ? mode : null;
	});

	const flagsApplicable = $derived(source === 'assets' || source === 'manual');

	const toggleStep = (id: number) => {
		stepIds = stepIds.includes(id) ? stepIds.filter((s) => s !== id) : [...stepIds, id];
	};

	const submit = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Name is required';
			return;
		}
		if (columns.some((c) => !c.label.trim())) {
			error = 'Every column needs a label';
			return;
		}
		const bodyColumns = columns.map((c) => ({ ...c, label: c.label.trim() }));
		const body = {
			name: trimmed,
			icon,
			description: description.trim() || null,
			step_ids: allSteps ? null : stepIds.filter((id) => store.steps.some((s) => s.id === id)),
			columns: bodyColumns,
			show_asset_flags: flagsApplicable && showFlags,
			timeline_sync: timelineSyncBody(bodyColumns)
		};
		// Read before the dialog closes (and its tracker goes).
		const backfill = timelineBackfill ? backfillMode : null;
		busy = true;
		error = null;
		try {
			const res = editing
				? await CaseTrackersService.update(store.caseId, editing.id, body)
				: await CaseTrackersService.create(store.caseId, { ...body, source });
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				error = apiErrorMessage(res, 'Unable to save the tracker');
				return;
			}
			const saved = res.data;
			store.upsertTracker(saved);
			toast({
				title: editing ? 'Tracker saved' : `Tracker "${saved.name}" created`,
				variant: 'success'
			});
			open = false;
			onSaved?.(saved);
			const mode = saved.timeline_sync?.mode;
			if (
				backfill &&
				mode === backfill &&
				(mode === 'state' || (saved.timeline_backfill ?? 0) > 0)
			) {
				await store.writeTimeline(saved.id);
			}
		} finally {
			busy = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{editing ? `Edit ${editing.name}` : 'New tracker'}</Dialog.Title>
			<Dialog.Description>
				{editing
					? 'Rename the tab, change the steps it offers and its columns. The source cannot change.'
					: 'A tab of the case where each row carries steps, a note and your own columns.'}
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
			data-testid="tracker-form"
		>
			<div class="flex flex-col gap-1">
				<label for="tracker-name" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Name *
				</label>
				<Input
					id="tracker-name"
					bind:value={name}
					maxlength={NAME_MAX}
					placeholder="Customer notification"
					disabled={busy}
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label
					for="tracker-description"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Description
				</label>
				<Textarea id="tracker-description" rows={2} bind:value={description} disabled={busy} />
			</div>

			<div class="flex flex-col gap-1">
				<span
					id="tracker-icon-label"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Icon
				</span>
				<FlagIconPicker
					bind:value={icon}
					icons={TRACKER_ICONS}
					disabled={busy}
					labelledby="tracker-icon-label"
				/>
			</div>

			<fieldset class="flex flex-col gap-1">
				<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Rows</legend>
				<div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup">
					{#each CASE_TRACKER_SOURCES as s (s.value)}
						<button
							type="button"
							role="radio"
							aria-checked={source === s.value}
							disabled={busy || (editing !== null && source !== s.value)}
							onclick={() => (source = s.value)}
							class="rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-40 {source ===
							s.value
								? 'border-primary bg-primary/5'
								: 'hover:bg-muted/40'}"
							data-testid={`tracker-source-${s.value}`}
						>
							<span class="block text-xs font-medium">{s.label}</span>
							<span class="block text-2xs text-muted-foreground">{s.help}</span>
						</button>
					{/each}
				</div>
				{#if source !== 'manual'}
					<p class="text-2xs text-muted-foreground">
						Mirrored: rows follow the case as items are added or removed.
					</p>
				{/if}
			</fieldset>

			<fieldset class="flex flex-col gap-1.5">
				<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Steps</legend>
				{#if store.steps.length === 0}
					<p class="text-2xs text-muted-foreground">
						The case has no step yet.
						{#if onManageSteps}
							<button type="button" class="underline" onclick={onManageSteps}>Create steps</button>
						{/if}
					</p>
				{:else}
					<label class="flex items-center gap-2 text-xs" for="tracker-all-steps">
						<Checkbox
							id="tracker-all-steps"
							checked={allSteps}
							onCheckedChange={(v) => (allSteps = !!v)}
							disabled={busy}
						/>
						Offer every step of the case (including steps created later)
					</label>
					{#if !allSteps}
						<div class="flex flex-wrap gap-1.5 pl-6">
							{#each store.steps as s (s.id)}
								<button
									type="button"
									role="checkbox"
									aria-checked={stepIds.includes(s.id)}
									aria-label={s.name}
									onclick={() => toggleStep(s.id)}
									disabled={busy}
								>
									<TrackerStepChip step={s} size="sm" muted={!stepIds.includes(s.id)} />
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</fieldset>

			{#if flagsApplicable}
				<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
					<label for="tracker-show-flags" class="min-w-0">
						<span class="block text-xs font-medium">Asset flags column</span>
						<span class="block text-2xs text-muted-foreground">
							Show the IRIS asset flags of asset rows, and set them from here.
						</span>
					</label>
					<Switch id="tracker-show-flags" bind:checked={showFlags} disabled={busy} />
				</div>
			{/if}

			<fieldset class="flex flex-col gap-1">
				<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
					Extra columns
				</legend>
				<TrackerColumnsEditor bind:columns disabled={busy} />
			</fieldset>

			<fieldset class="flex flex-col gap-1">
				<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
					Timeline
				</legend>
				<div
					class="flex flex-col gap-2 rounded-md border px-3 py-2"
					data-testid="tracker-timeline-editor"
				>
					<div class="flex items-center justify-between gap-3">
						<label for="tracker-timeline-on" class="min-w-0">
							<span class="block text-xs font-medium">Write to the case timeline</span>
							<span class="block text-2xs text-muted-foreground">
								Turn row changes into timeline events of this case.
							</span>
						</label>
						<Switch
							id="tracker-timeline-on"
							checked={timelineSync !== null}
							onCheckedChange={(v) => toggleTimeline(!!v)}
							disabled={busy}
						/>
					</div>
					{#if timelineSync}
						<div
							class="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
							role="radiogroup"
							aria-label="What to write"
						>
							{#each TRACKER_TIMELINE_MODES as m (m.value)}
								<button
									type="button"
									role="radio"
									aria-checked={timelineSync.mode === m.value}
									disabled={busy}
									onclick={() => updateTimeline({ mode: m.value })}
									class="rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-40 {timelineSync.mode ===
									m.value
										? 'border-primary bg-primary/5'
										: 'hover:bg-muted/40'}"
									data-testid={`tracker-timeline-mode-${m.value}`}
								>
									<span class="block text-xs font-medium">{m.label}</span>
									<span class="block text-2xs text-muted-foreground">{m.help}</span>
								</button>
							{/each}
						</div>
						<div class="flex flex-wrap items-center gap-3">
							<label class="flex items-center gap-2 text-xs" for="tracker-timeline-date">
								Event date
								<select
									id="tracker-timeline-date"
									class="h-8 rounded-md border bg-background px-2 text-xs"
									value={timelineSync.date}
									disabled={busy}
									onchange={(e) => updateTimeline({ date: (e.target as HTMLSelectElement).value })}
								>
									<option value={TRACKER_TIMELINE_CHANGED_AT}>Time of the change</option>
									{#each dateColumns as c (c.key)}
										<option value={c.key}>Column: {c.label}</option>
									{/each}
								</select>
							</label>
							<label class="flex items-center gap-2 text-xs" for="tracker-timeline-case">
								Timeline
								<select
									id="tracker-timeline-case"
									class="h-8 rounded-md border bg-background px-2 text-xs"
									value={timelineSync.case_timeline_id === null
										? ''
										: String(timelineSync.case_timeline_id)}
									disabled={busy}
									onchange={(e) => {
										const raw = (e.target as HTMLSelectElement).value;
										updateTimeline({ case_timeline_id: raw === '' ? null : Number(raw) });
									}}
								>
									<option value="">"Trackers" (created if needed)</option>
									{#each caseTimelines as t (t.timeline_id)}
										<option value={String(t.timeline_id)}>{t.name}</option>
									{/each}
								</select>
							</label>
						</div>
						{#if timelineSync.date !== TRACKER_TIMELINE_CHANGED_AT}
							<p class="text-2xs text-muted-foreground">
								Rows without a date in this column are dated by the time of the change.
							</p>
						{/if}
					{/if}
				</div>
				{#if backfillMode}
					<label class="mt-1 flex items-center gap-2 text-xs">
						<Checkbox
							bind:checked={timelineBackfill}
							disabled={busy}
							data-testid="tracker-timeline-backfill-on-save"
						/>
						{backfillMode === 'changes'
							? 'Also write the changes made before, dated when they were made'
							: 'Also write the current state of the rows now'}
					</label>
				{/if}
			</fieldset>

			{#if error}
				<p class="text-2xs text-destructive" role="alert">{error}</p>
			{/if}
			<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
		</form>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={busy} data-testid="tracker-form-submit">
				{busy ? 'Saving…' : editing ? 'Save' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
