<!--
  History dialog of a tracker: the log of one row, or (row = null)
  the last events of the whole tracker ("Activity").
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { History, Loader2 } from 'lucide-svelte';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		WarRoomTrackersService,
		trackerRowLabel,
		type Tracker,
		type TrackerEvent,
		type TrackerHistoryQuery,
		type TrackerRow,
		type TrackerStep
	} from '$lib/services/war-room-trackers.service';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import { describeTrackerEvent } from '$lib/components/common/trackers/tracker-helpers';

	type Props = {
		open: boolean;
		warRoomId: number;
		tracker: Tracker;
		steps: TrackerStep[];
		/** null = the whole tracker. */
		row: TrackerRow | null;
		/** Rows of the tracker, to name the rows of tracker-wide events. */
		rows?: TrackerRow[];
		/** Bumped by the parent on live updates. */
		version?: number;
	};

	let {
		open = $bindable(),
		warRoomId,
		tracker,
		steps,
		row,
		rows = [],
		version = 0
	}: Props = $props();

	let events = $state<TrackerEvent[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let seq = 0;

	const query = (r: TrackerRow | null): TrackerHistoryQuery | null => {
		if (!r) return {};
		if (r.row_id != null) return { row_id: r.row_id };
		if (r.item_type && r.item_id != null) return { item_type: r.item_type, item_id: r.item_id };
		return null;
	};

	const load = async () => {
		const q = query(row);
		const mine = ++seq;
		if (q === null) {
			events = [];
			return;
		}
		loading = true;
		failed = false;
		const res = await WarRoomTrackersService.history(warRoomId, tracker.id, q);
		if (mine !== seq) return;
		loading = false;
		if (res.ok && Array.isArray(res.data)) events = res.data;
		else {
			events = [];
			failed = true;
		}
	};

	$effect(() => {
		void version;
		void row;
		if (open) untrack(() => void load());
	});

	const rowName = (e: TrackerEvent): string | null => {
		if (row || !e.row_key) return null;
		const r = rows.find((x) => x.key === e.row_key);
		if (r) return trackerRowLabel(r);
		const d = (e.details ?? {}) as Record<string, unknown>;
		return typeof d.label === 'string' ? d.label : e.row_key;
	};
</script>

<Dialog bind:open>
	<DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle class="flex items-center gap-2">
				<History class="h-4 w-4 text-primary" aria-hidden="true" />
				{row ? trackerRowLabel(row) || 'Row' : `${tracker.name} — activity`}
			</DialogTitle>
			<DialogDescription>
				{row ? 'Every change made to this row.' : 'The last changes made in this tracker.'}
			</DialogDescription>
		</DialogHeader>

		<div class="flex-1 overflow-y-auto px-6 py-4" data-testid="tracker-history">
			{#if loading && events.length === 0}
				<div class="flex justify-center py-8">
					<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			{:else if failed}
				<p class="py-6 text-center text-xs text-destructive">Unable to load the history.</p>
			{:else if events.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">No change recorded yet.</p>
			{:else}
				<ol class="relative ml-1.5 border-l pl-4">
					{#each events as e (e.id)}
						{@const name = rowName(e)}
						<li class="mb-3 last:mb-0" data-testid="tracker-history-event">
							<span
								class="absolute -left-[0.3rem] mt-1.5 h-2 w-2 rounded-full bg-muted-foreground/60"
								aria-hidden="true"
							></span>
							<p class="text-xs">
								<span class="font-medium">{e.user?.name ?? 'Someone'}</span>
								{describeTrackerEvent(e, { steps, columns: tracker.columns })}
								{#if name}
									<span class="text-muted-foreground">on</span>
									<span class="font-medium">{name}</span>
								{/if}
							</p>
							<p class="text-2xs text-muted-foreground">
								{mediumDateTimeFormatter(e.created_at)}
							</p>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</DialogContent>
</Dialog>
