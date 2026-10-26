<!--
  The tab bar of the case Trackers page (one tab per tracker), the "+"
  menu, and the dialogs shared by the trackers (create / edit, steps,
  apply and save templates).
-->
<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { getTrackerIcon } from '$lib/components/common/trackers/tracker-icon';
	import type { CaseTracker } from '$lib/services/case-trackers.service';
	import TrackerApplyTemplateDialog from './tracker-apply-template-dialog.svelte';
	import TrackerFormDialog from './tracker-form-dialog.svelte';
	import TrackerSaveTemplateDialog from './tracker-save-template-dialog.svelte';
	import TrackerStepsDialog from './tracker-steps-dialog.svelte';
	import type { CaseTrackersState } from './trackers-state.svelte';

	type Props = {
		store: CaseTrackersState;
		/** The shown tracker. */
		active: number | null;
		onSelect: (trackerId: number) => void;
		canWrite: boolean;
		isAdmin: boolean;
	};

	let { store, active, onSelect, canWrite, isAdmin }: Props = $props();

	let applyOpen = $state(false);

	const open = (t: CaseTracker) => onSelect(t.id);
</script>

<div class="flex flex-wrap items-center gap-1" role="tablist" aria-label="Trackers">
	{#each store.trackers as t (t.id)}
		{@const Icon = getTrackerIcon(t.icon)}
		<button
			type="button"
			role="tab"
			aria-selected={active === t.id}
			class={[
				'inline-flex h-7 max-w-48 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
				active === t.id
					? 'bg-secondary text-secondary-foreground'
					: 'text-muted-foreground hover:text-foreground'
			]}
			title={t.description ?? t.name}
			onclick={() => open(t)}
			data-testid={`case-tracker-tab-${t.id}`}
		>
			<Icon class="h-3.5 w-3.5 shrink-0" />
			<span class="truncate">{t.name}</span>
			<span class="rounded-full bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
				{t.row_count}
			</span>
		</button>
	{/each}

	{#if canWrite}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				aria-label="Add a tracker"
				title="Add a tracker"
				data-testid="case-tracker-add"
			>
				<Plus class="h-3.5 w-3.5" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-[200px]">
				<DropdownMenu.Label>Trackers</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => store.openForm(null)} data-testid="case-tracker-new">
					New tracker…
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => (applyOpen = true)} data-testid="case-tracker-apply">
					Apply a template…
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					onclick={() => (store.stepsOpen = true)}
					data-testid="case-tracker-steps"
				>
					Manage steps…
				</DropdownMenu.Item>
				{#if isAdmin && store.trackers.length > 0}
					<DropdownMenu.Item onclick={() => store.openSaveTemplate(null)}>
						Save trackers as template…
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>

{#if canWrite}
	<TrackerFormDialog
		bind:open={store.formOpen}
		{store}
		editing={store.formEditing}
		onSaved={(t) => {
			store.rowsVersion += 1;
			open(t);
		}}
		onManageSteps={() => (store.stepsOpen = true)}
	/>
	<TrackerApplyTemplateDialog
		bind:open={applyOpen}
		{store}
		onApplied={(created) => {
			if (created[0]) open(created[0]);
		}}
	/>
	{#if isAdmin}
		<TrackerSaveTemplateDialog
			bind:open={store.saveTemplateOpen}
			{store}
			initialTrackerId={store.saveTemplateTrackerId}
		/>
	{/if}
{/if}

<TrackerStepsDialog
	bind:open={store.stepsOpen}
	{store}
	{canWrite}
	onChanged={() => (store.rowsVersion += 1)}
/>
