<!--
  The "Steps" cell of a tracker row: the chips of the steps it carries,
  and (with write access) a popover listing the steps of the tracker to
  toggle them one by one.
-->
<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import type { TrackerRow, TrackerStep } from '$lib/services/war-room-trackers.service';
	import { formatDateTime } from '$lib/utils/time-formatter';

	type Props = {
		row: Pick<TrackerRow, 'steps' | 'restricted'>;
		/** Every step (chips of steps no longer offered still show). */
		steps: TrackerStep[];
		/** Steps this tracker offers, in order. */
		offered: TrackerStep[];
		canWrite: boolean;
		busy?: boolean;
		onToggle: (stepId: number, on: boolean) => void;
	};

	let { row, steps, offered, canWrite, busy = false, onToggle }: Props = $props();

	let open = $state(false);

	const byId = $derived(new Map(steps.map((s) => [s.id, s])));
	const carried = $derived(new Set(row.steps.map((s) => s.step_id)));
	const chips = $derived(
		row.steps
			.map((rs) => ({ rs, step: byId.get(rs.step_id) }))
			.filter((c): c is { rs: (typeof row.steps)[number]; step: TrackerStep } => !!c.step)
			.sort((a, b) => a.step.sort_order - b.step.sort_order || a.step.id - b.step.id)
	);

	const chipTitle = (c: (typeof chips)[number]) =>
		[
			c.step.name,
			c.rs.set_by?.name ? `set by ${c.rs.set_by.name}` : null,
			c.rs.set_at ? formatDateTime(c.rs.set_at) : null
		]
			.filter(Boolean)
			.join(' · ');
</script>

{#snippet chipList()}
	{#if chips.length === 0}
		<span class="text-2xs text-muted-foreground">—</span>
	{:else}
		{#each chips as c (c.step.id)}
			<TrackerStepChip step={c.step} title={chipTitle(c)} />
		{/each}
	{/if}
{/snippet}

{#if !canWrite || row.restricted}
	<div class="flex flex-wrap items-center gap-1">{@render chipList()}</div>
{:else}
	<Popover bind:open>
		<PopoverTrigger
			class="flex min-h-6 w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/60"
			aria-label="Change the steps"
			data-testid="tracker-steps-trigger"
		>
			{@render chipList()}
			<Plus class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
		</PopoverTrigger>
		<PopoverContent class="w-64 p-1.5" align="start">
			{#if offered.length === 0}
				<p class="p-2 text-2xs text-muted-foreground">This tracker offers no step.</p>
			{:else}
				<div class="flex flex-col" role="group" aria-label="Steps">
					{#each offered as s (s.id)}
						{@const on = carried.has(s.id)}
						<button
							type="button"
							role="checkbox"
							aria-checked={on}
							disabled={busy}
							onclick={() => onToggle(s.id, !on)}
							class="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
							data-testid="tracker-step-toggle"
						>
							<span
								class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border {on
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-muted-foreground/50'}"
								aria-hidden="true"
							>
								{#if on}<svg viewBox="0 0 12 12" class="h-2.5 w-2.5"
										><path
											d="M2.5 6.5l2.5 2.5 4.5-6"
											fill="none"
											stroke="currentColor"
											stroke-width="1.8"
										/></svg
									>{/if}
							</span>
							<TrackerStepChip step={s} muted={!on} />
							{#if s.description}
								<span class="sr-only">{s.description}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</PopoverContent>
	</Popover>
{/if}
