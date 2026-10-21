<!--
  Create or edit a tracker tab: name, icon, source (fixed once created),
  the steps it offers (all of the war room by default), its extra
  columns and, for asset rows, the asset flags column.
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
		TRACKER_SOURCES,
		WarRoomTrackersService,
		type Tracker,
		type TrackerColumn,
		type TrackerSource
	} from '$lib/services/war-room-trackers.service';
	import { errorMessage } from '../helpers';
	import type { TrackersState } from './trackers-state.svelte';

	type Props = {
		open: boolean;
		store: TrackersState;
		/** null = create. */
		editing?: Tracker | null;
		onSaved?: (tracker: Tracker) => void;
		/** Open the war-room steps manager. */
		onManageSteps?: () => void;
	};

	let { open = $bindable(), store, editing = null, onSaved, onManageSteps }: Props = $props();

	const NAME_MAX = 128;

	let name = $state('');
	let description = $state('');
	let icon = $state('list-checks');
	let source = $state<TrackerSource>('manual');
	let allSteps = $state(true);
	let stepIds = $state<number[]>([]);
	let columns = $state<TrackerColumn[]>([]);
	let showFlags = $state(false);
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
			error = null;
			busy = false;
		});
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
		const body = {
			name: trimmed,
			icon,
			description: description.trim() || null,
			step_ids: allSteps ? null : stepIds.filter((id) => store.steps.some((s) => s.id === id)),
			columns: columns.map((c) => ({ ...c, label: c.label.trim() })),
			show_asset_flags: flagsApplicable && showFlags
		};
		busy = true;
		error = null;
		try {
			const res = editing
				? await WarRoomTrackersService.update(store.warRoomId, editing.id, body)
				: await WarRoomTrackersService.create(store.warRoomId, { ...body, source });
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				error = errorMessage(res, 'Unable to save the tracker');
				return;
			}
			store.upsertTracker(res.data);
			toast({
				title: editing ? 'Tracker saved' : `Tracker "${res.data.name}" created`,
				variant: 'success'
			});
			open = false;
			onSaved?.(res.data);
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
					: 'A tab of the scope where each row carries steps, a note and your own columns.'}
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
					{#each TRACKER_SOURCES as s (s.value)}
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
						Mirrored: rows follow the war room as items are added or removed.
					</p>
				{/if}
			</fieldset>

			<fieldset class="flex flex-col gap-1.5">
				<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">Steps</legend>
				{#if store.steps.length === 0}
					<p class="text-2xs text-muted-foreground">
						The war room has no step yet.
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
						Offer every step of the war room (including steps created later)
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
