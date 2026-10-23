<!--
  Timeline settings of a tracker (or of a template tracker): off, or
  what to write (every change / the current state of each row), how to
  date it (the change, or a date column) and where (the case timelines
  or the war-room timeline). Templates offer no war-room timeline: a
  new war room has its own.
-->
<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import {
		TRACKER_TIMELINE_CHANGED_AT,
		TRACKER_TIMELINE_MODES,
		TRACKER_TIMELINE_TARGETS,
		trackerTimelineDateColumns,
		type TrackerColumn,
		type TrackerTimelineSync
	} from '$lib/services/war-room-trackers.service';

	type Props = {
		value: TrackerTimelineSync | null;
		/** The tracker columns as edited (the date ones can date the events). */
		columns: TrackerColumn[];
		/** The war-room timelines; null = not offered (templates). */
		warRoomTimelines?: { timeline_id: number; name: string }[] | null;
		disabled?: boolean;
		idPrefix?: string;
	};

	let {
		value = $bindable(),
		columns,
		warRoomTimelines = null,
		disabled = false,
		idPrefix = 'tracker-timeline'
	}: Props = $props();

	const dateColumns = $derived(trackerTimelineDateColumns(columns));

	const toggle = (on: boolean) => {
		value = on
			? {
					mode: 'changes',
					target: 'cases',
					date: TRACKER_TIMELINE_CHANGED_AT,
					war_room_timeline_id: null
				}
			: null;
	};

	const update = (patch: Partial<TrackerTimelineSync>) => {
		if (value) value = { ...value, ...patch };
	};
</script>

<div class="flex flex-col gap-2 rounded-md border px-3 py-2" data-testid="tracker-timeline-editor">
	<div class="flex items-center justify-between gap-3">
		<label for={`${idPrefix}-on`} class="min-w-0">
			<span class="block text-xs font-medium">Write to the timelines</span>
			<span class="block text-2xs text-muted-foreground">
				Turn row changes into timeline events. Case timelines are only written where you have full
				access to the case.
			</span>
		</label>
		<Switch
			id={`${idPrefix}-on`}
			checked={value !== null}
			onCheckedChange={(v) => toggle(!!v)}
			{disabled}
		/>
	</div>

	{#if value}
		<div
			class="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
			role="radiogroup"
			aria-label="What to write"
		>
			{#each TRACKER_TIMELINE_MODES as m (m.value)}
				<button
					type="button"
					role="radio"
					aria-checked={value.mode === m.value}
					{disabled}
					onclick={() => update({ mode: m.value })}
					class="rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-40 {value.mode ===
					m.value
						? 'border-primary bg-primary/5'
						: 'hover:bg-muted/40'}"
					data-testid={`${idPrefix}-mode-${m.value}`}
				>
					<span class="block text-xs font-medium">{m.label}</span>
					<span class="block text-2xs text-muted-foreground">{m.help}</span>
				</button>
			{/each}
		</div>

		<div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Where">
			{#each TRACKER_TIMELINE_TARGETS as t (t.value)}
				<button
					type="button"
					role="radio"
					aria-checked={value.target === t.value}
					{disabled}
					onclick={() => update({ target: t.value })}
					class="rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-40 {value.target ===
					t.value
						? 'border-primary bg-primary/5'
						: 'hover:bg-muted/40'}"
					data-testid={`${idPrefix}-target-${t.value}`}
				>
					<span class="block text-xs font-medium">{t.label}</span>
					<span class="block text-2xs text-muted-foreground">{t.help}</span>
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<label class="flex items-center gap-2 text-xs" for={`${idPrefix}-date`}>
				Event date
				<select
					id={`${idPrefix}-date`}
					class="h-8 rounded-md border bg-background px-2 text-xs"
					value={value.date}
					{disabled}
					onchange={(e) => update({ date: (e.target as HTMLSelectElement).value })}
				>
					<option value={TRACKER_TIMELINE_CHANGED_AT}>Time of the change</option>
					{#each dateColumns as c (c.key)}
						<option value={c.key}>Column: {c.label}</option>
					{/each}
				</select>
			</label>

			{#if value.target === 'war_room' && warRoomTimelines}
				<label class="flex items-center gap-2 text-xs" for={`${idPrefix}-room-timeline`}>
					Timeline
					<select
						id={`${idPrefix}-room-timeline`}
						class="h-8 rounded-md border bg-background px-2 text-xs"
						value={value.war_room_timeline_id === null ? '' : String(value.war_room_timeline_id)}
						{disabled}
						onchange={(e) => {
							const raw = (e.target as HTMLSelectElement).value;
							update({ war_room_timeline_id: raw === '' ? null : Number(raw) });
						}}
					>
						<option value="">"Trackers" (created if needed)</option>
						{#each warRoomTimelines as t (t.timeline_id)}
							<option value={String(t.timeline_id)}>{t.name}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>
		{#if value.date !== TRACKER_TIMELINE_CHANGED_AT}
			<p class="text-2xs text-muted-foreground">
				Rows without a date in this column are dated by the time of the change.
			</p>
		{/if}
	{/if}
</div>
