<!--
  Save the steps and (some of) the trackers of the case as a new
  global tracker template. Server administrators only.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { getTrackerIcon } from '$lib/components/common/trackers/tracker-icon';
	import { CaseTrackersService } from '$lib/services/case-trackers.service';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import type { CaseTrackersState } from './trackers-state.svelte';

	type Props = {
		open: boolean;
		store: CaseTrackersState;
		/** Tracker ticked when the dialog opens; every tracker when null. */
		initialTrackerId?: number | null;
	};

	let { open = $bindable(), store, initialTrackerId = null }: Props = $props();

	let name = $state('');
	let description = $state('');
	let trackerIds = $state<number[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			const initial = initialTrackerId !== null ? store.tracker(initialTrackerId) : null;
			name = initial?.name ?? '';
			description = '';
			trackerIds = initial ? [initial.id] : store.trackers.map((t) => t.id);
			error = null;
		});
	});

	const toggle = (id: number) => {
		trackerIds = trackerIds.includes(id) ? trackerIds.filter((t) => t !== id) : [...trackerIds, id];
	};

	const save = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Name is required';
			return;
		}
		busy = true;
		error = null;
		try {
			const res = await CaseTrackersService.saveAsTemplate(store.caseId, {
				name: trimmed,
				description: description.trim() || null,
				tracker_ids: trackerIds
			});
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				error = apiErrorMessage(res, 'Unable to save the template');
				return;
			}
			toast({ title: `Template "${res.data.name}" saved`, variant: 'success' });
			open = false;
		} finally {
			busy = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Save as template</Dialog.Title>
			<Dialog.Description>
				Every step of the case, with the trackers picked below. Rows are not saved.
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex flex-col gap-3"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<div class="flex flex-col gap-1">
				<label
					for="tracker-template-name"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Name *
				</label>
				<Input id="tracker-template-name" bind:value={name} maxlength={128} disabled={busy} />
			</div>
			<div class="flex flex-col gap-1">
				<label
					for="tracker-template-description"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Description
				</label>
				<Textarea
					id="tracker-template-description"
					rows={2}
					bind:value={description}
					disabled={busy}
				/>
			</div>
			<fieldset class="flex flex-col gap-1.5">
				<legend class="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
					Trackers
				</legend>
				{#each store.trackers as t (t.id)}
					{@const Icon = getTrackerIcon(t.icon)}
					<label class="flex items-center gap-2 text-xs" for={`tracker-template-t-${t.id}`}>
						<Checkbox
							id={`tracker-template-t-${t.id}`}
							checked={trackerIds.includes(t.id)}
							onCheckedChange={() => toggle(t.id)}
							disabled={busy}
						/>
						<Icon class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
						{t.name}
					</label>
				{/each}
			</fieldset>
			{#if error}
				<p class="text-2xs text-destructive" role="alert">{error}</p>
			{/if}
			<Dialog.Footer class="pt-1">
				<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
				<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
