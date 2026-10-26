<!--
  Board view of a tracker: one column per step (after "No step"), one
  card per row carrying it — a row with several steps shows in each of
  their columns. Dragging a card to another column moves it: the row
  loses the step of the column it left and gets the one it lands in,
  keeping its other steps. Each card also edits its steps in place (the
  keyboard path), shows its flags and note, and opens its history.
-->
<script lang="ts">
	import { History } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import AssetFlagChips from '$lib/components/common/assets/AssetFlagChips.svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import type { FlagApplyAction } from '../../assets/flag-helpers';
	import TrackerFlagsMenu from './tracker-flags-menu.svelte';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import {
		caseTrackerRowLabel,
		caseTrackerRowRef,
		type CaseTrackerAssetItem,
		type CaseTrackerRow
	} from '$lib/services/case-trackers.service';
	import type { TrackerStep } from '$lib/services/war-room-trackers.service';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import TrackerItemCell from './tracker-item-cell.svelte';
	import TrackerStepsCell from '$lib/components/common/trackers/TrackerStepsCell.svelte';
	import {
		trackerBoardColumns,
		trackerBoardMove,
		type TrackerBoardColumn
	} from '$lib/components/common/trackers/tracker-helpers';

	type Props = {
		caseId: number;
		/** The rows matching the search. */
		rows: CaseTrackerRow[];
		/** The columns: steps offered here and the ones rows still carry, in order. */
		columnSteps: TrackerStep[];
		/** Every step of the case. */
		steps: TrackerStep[];
		/** Steps this tracker offers (a card can only land on those). */
		offered: TrackerStep[];
		canWrite: boolean;
		busyKeys: Set<string>;
		showType: boolean;
		showFlags: boolean;
		onMove: (row: CaseTrackerRow, from: number | null, to: number | null) => void;
		onToggle: (row: CaseTrackerRow, stepId: number, on: boolean) => void;
		onHistory: (row: CaseTrackerRow) => void;
		onFlag: (row: CaseTrackerRow, flag: AssetFlag, action: FlagApplyAction) => void;
	};

	let {
		caseId,
		rows,
		columnSteps,
		steps,
		offered,
		canWrite,
		busyKeys,
		showType,
		showFlags,
		onMove,
		onToggle,
		onHistory,
		onFlag
	}: Props = $props();

	const PAGE = 50;

	const columns = $derived(trackerBoardColumns<CaseTrackerRow>(rows, columnSteps));
	const offeredIds = $derived(new Set(offered.map((s) => s.id)));

	let shown = $state<Record<string, number>>({});
	let drag = $state<{ row: CaseTrackerRow; from: number | null } | null>(null);
	let overKey = $state<string | null>(null);

	const editable = (row: CaseTrackerRow) =>
		canWrite && !row.restricted && caseTrackerRowRef(row) !== null;

	const accepts = (col: TrackerBoardColumn<CaseTrackerRow>) =>
		drag !== null &&
		(col.step === null || offeredIds.has(col.step.id)) &&
		trackerBoardMove(drag.row, drag.from, col.step?.id ?? null) !== null;

	const drop = (col: TrackerBoardColumn<CaseTrackerRow>) => {
		const d = drag;
		drag = null;
		overKey = null;
		if (!d || !accepts(col) || busyKeys.has(d.row.key)) return;
		onMove(d.row, d.from, col.step?.id ?? null);
	};
</script>

<div class="flex max-h-[70vh] min-h-[16rem] gap-3 overflow-x-auto pb-2" data-testid="tracker-board">
	{#each columns as col (col.key)}
		{@const limit = shown[col.key] ?? PAGE}
		<section
			class={[
				'flex w-72 shrink-0 flex-col rounded-lg border bg-card/40 transition-colors',
				overKey === col.key && 'border-primary bg-primary/5',
				drag && !accepts(col) && 'opacity-60'
			]}
			aria-label={col.step ? `Step ${col.step.name}` : 'No step'}
			data-testid="tracker-board-column"
			data-step={col.step?.name ?? 'No step'}
			ondragover={(e) => {
				if (!accepts(col)) return;
				e.preventDefault();
				overKey = col.key;
			}}
			ondragleave={() => {
				if (overKey === col.key) overKey = null;
			}}
			ondrop={(e) => {
				e.preventDefault();
				drop(col);
			}}
		>
			<header class="flex items-center gap-2 border-b px-3 py-2">
				{#if col.step}
					<TrackerStepChip step={col.step} />
				{:else}
					<span
						class="inline-flex h-5 items-center rounded-md border border-dashed px-1.5 text-[11px] font-medium text-muted-foreground"
					>
						No step
					</span>
				{/if}
				<span class="text-2xs tabular-nums text-muted-foreground">{col.rows.length}</span>
				{#if col.step && !offeredIds.has(col.step.id)}
					<span class="ml-auto text-2xs text-muted-foreground" title="Not offered by this tracker">
						not offered
					</span>
				{/if}
			</header>
			<ul class="flex min-h-[4rem] flex-col gap-1.5 overflow-y-auto p-2">
				{#each col.rows.slice(0, limit) as row (row.key)}
					{@const canEdit = editable(row)}
					{@const busy = busyKeys.has(row.key)}
					<li
						class={[
							'flex flex-col gap-1.5 rounded-md border bg-background px-2.5 py-2 text-xs shadow-sm',
							canEdit && 'cursor-grab',
							(busy || drag?.row.key === row.key) && 'opacity-50'
						]}
						draggable={canEdit && !busy}
						ondragstart={(e) => {
							drag = { row, from: col.step?.id ?? null };
							e.dataTransfer?.setData('text/plain', row.key);
						}}
						ondragend={() => {
							drag = null;
							overKey = null;
						}}
						data-testid="tracker-board-card"
						data-row-key={row.key}
					>
						<div class="flex items-start gap-1">
							<div class="min-w-0 flex-1">
								<TrackerItemCell {caseId} {row} {showType} />
							</div>
							{#if !row.restricted}
								<Button
									variant="ghost"
									size="icon"
									class="-mr-1 -mt-0.5 h-6 w-6 shrink-0"
									aria-label={`History of ${caseTrackerRowLabel(row)}`}
									title="History"
									onclick={() => onHistory(row)}
								>
									<History class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</div>
						<TrackerStepsCell
							{row}
							{steps}
							{offered}
							canWrite={canEdit}
							{busy}
							onToggle={(stepId, on) => onToggle(row, stepId, on)}
						/>
						{#if showFlags && row.item_type === 'asset' && row.item && !row.restricted}
							{@const asset = row.item as CaseTrackerAssetItem}
							{#if canEdit}
								<TrackerFlagsMenu
									carried={asset.flags.map((f) => f.flag_id)}
									disabled={busy}
									label={`Flags of ${asset.asset_name}`}
									triggerClass="self-start rounded px-0.5 hover:bg-muted/60"
									onPick={(flag, action) => onFlag(row, flag, action)}
								>
									<AssetFlagChips flags={asset.flags} />
								</TrackerFlagsMenu>
							{:else}
								<AssetFlagChips flags={asset.flags} />
							{/if}
						{/if}
						{#if row.note}
							<p class="line-clamp-2 whitespace-pre-line text-2xs text-muted-foreground">
								{row.note}
							</p>
						{/if}
						{#if row.updated_at}
							<p class="truncate text-[10px] text-muted-foreground">
								{mediumDateTimeFormatter(row.updated_at)}{#if row.updated_by}
									· {row.updated_by.name}{/if}
							</p>
						{/if}
					</li>
				{:else}
					<li class="py-3 text-center text-2xs text-muted-foreground">Empty</li>
				{/each}
				{#if col.rows.length > limit}
					<li>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 w-full text-2xs"
							onclick={() => (shown = { ...shown, [col.key]: limit + PAGE })}
						>
							Show more ({col.rows.length - limit} left)
						</Button>
					</li>
				{/if}
			</ul>
		</section>
	{/each}
</div>
