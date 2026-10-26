<!--
  The steps of the case, shared by all its trackers: create, edit,
  reorder (the order of the chips and menus) and delete. Deleting a step
  removes it from every row.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import FlagColorPicker from '$lib/components/common/assets/FlagColorPicker.svelte';
	import FlagIconPicker from '$lib/components/common/assets/FlagIconPicker.svelte';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import { TRACKER_ICONS } from '$lib/components/common/trackers/tracker-icon';
	import { CaseTrackersService } from '$lib/services/case-trackers.service';
	import type { TrackerStep } from '$lib/services/war-room-trackers.service';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import type { CaseTrackersState } from './trackers-state.svelte';

	type Props = {
		open: boolean;
		store: CaseTrackersState;
		canWrite: boolean;
		/** A step was deleted: rows must be re-read. */
		onChanged?: () => void;
	};

	let { open = $bindable(), store, canWrite, onChanged }: Props = $props();

	const NAME_MAX = 64;

	// null = list; 'new' = creating; a step id = editing it.
	let editing = $state<number | 'new' | null>(null);
	let name = $state('');
	let description = $state('');
	let color = $state('slate');
	let icon = $state('circle-dot');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let confirmDelete = $state<TrackerStep | null>(null);

	$effect(() => {
		if (open) untrack(() => (editing = null));
	});

	const startNew = () => {
		editing = 'new';
		name = '';
		description = '';
		color = 'slate';
		icon = 'circle-dot';
		error = null;
	};

	const startEdit = (s: TrackerStep) => {
		editing = s.id;
		name = s.name;
		description = s.description ?? '';
		color = s.color;
		icon = s.icon ?? 'circle-dot';
		error = null;
	};

	const save = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Name is required';
			return;
		}
		const body = { name: trimmed, description: description.trim() || null, color, icon };
		busy = true;
		error = null;
		try {
			const res =
				editing === 'new'
					? await CaseTrackersService.createStep(store.caseId, body)
					: await CaseTrackersService.updateStep(store.caseId, editing as number, body);
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				error = apiErrorMessage(res, 'Unable to save the step');
				return;
			}
			const saved = res.data;
			store.setSteps(
				editing === 'new'
					? [...store.steps, saved]
					: store.steps.map((s) => (s.id === saved.id ? saved : s))
			);
			editing = null;
		} finally {
			busy = false;
		}
	};

	const move = async (from: number, to: number) => {
		if (busy || to < 0 || to >= store.steps.length) return;
		const previous = store.steps;
		const next = [...previous];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		store.steps = next;
		busy = true;
		try {
			const res = await CaseTrackersService.reorderSteps(
				store.caseId,
				next.map((s) => s.id)
			);
			if (res.ok && Array.isArray(res.data)) store.setSteps(res.data);
			else {
				store.steps = previous;
				toast({
					title: 'Could not reorder the steps',
					description: apiErrorMessage(res, 'The server refused the request.'),
					variant: 'destructive'
				});
			}
		} finally {
			busy = false;
		}
	};

	const remove = async (s: TrackerStep) => {
		busy = true;
		try {
			const res = await CaseTrackersService.removeStep(store.caseId, s.id);
			if (res.ok) {
				store.setSteps(store.steps.filter((x) => x.id !== s.id));
				store.setTrackers(
					store.trackers.map((t) =>
						t.step_ids ? { ...t, step_ids: t.step_ids.filter((id) => id !== s.id) } : t
					)
				);
				toast({ title: `Step "${s.name}" deleted`, variant: 'success' });
				onChanged?.();
			} else if (res.status !== 403) {
				toast({
					title: 'Could not delete the step',
					description: apiErrorMessage(res, 'The server refused the request.'),
					variant: 'destructive'
				});
			}
		} finally {
			busy = false;
			confirmDelete = null;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Steps</Dialog.Title>
			<Dialog.Description>
				Shared by every tracker of this case. A row can carry several steps at once.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
			{#if editing !== null}
				<form
					class="flex flex-col gap-3 rounded-md border p-3"
					onsubmit={(e) => {
						e.preventDefault();
						void save();
					}}
					data-testid="tracker-step-form"
				>
					<div class="flex flex-col gap-1">
						<label
							for="tracker-step-name"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							Name *
						</label>
						<Input
							id="tracker-step-name"
							bind:value={name}
							maxlength={NAME_MAX}
							placeholder="Email sent"
							disabled={busy}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label
							for="tracker-step-description"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							Description
						</label>
						<Textarea
							id="tracker-step-description"
							rows={2}
							bind:value={description}
							disabled={busy}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<span
							id="tracker-step-color-label"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							Colour
						</span>
						<FlagColorPicker
							bind:value={color}
							disabled={busy}
							labelledby="tracker-step-color-label"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<span
							id="tracker-step-icon-label"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							Icon
						</span>
						<FlagIconPicker
							bind:value={icon}
							{color}
							icons={TRACKER_ICONS}
							disabled={busy}
							labelledby="tracker-step-icon-label"
						/>
					</div>
					<div class="flex items-center gap-2 text-2xs text-muted-foreground">
						Preview
						<TrackerStepChip step={{ name: name.trim() || 'Step', color, icon }} size="sm" />
					</div>
					{#if error}
						<p class="text-2xs text-destructive" role="alert">{error}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={() => (editing = null)} disabled={busy}>
							Cancel
						</Button>
						<Button size="sm" type="submit" disabled={busy} data-testid="tracker-step-save">
							{busy ? 'Saving…' : editing === 'new' ? 'Create step' : 'Save step'}
						</Button>
					</div>
				</form>
			{:else}
				{#if store.steps.length === 0}
					<p class="py-4 text-center text-xs text-muted-foreground">No step yet.</p>
				{:else}
					<ul class="flex flex-col divide-y rounded-md border" data-testid="tracker-steps-list">
						{#each store.steps as s, index (s.id)}
							<li class="flex items-center gap-2 px-2.5 py-2">
								<div class="min-w-0 flex-1">
									<TrackerStepChip step={s} size="sm" />
									{#if s.description}
										<p class="mt-0.5 truncate text-2xs text-muted-foreground">{s.description}</p>
									{/if}
								</div>
								{#if canWrite}
									{#if confirmDelete?.id === s.id}
										<span class="text-2xs text-muted-foreground">Remove from every row?</span>
										<Button
											variant="destructive"
											size="sm"
											class="h-7 text-xs"
											disabled={busy}
											onclick={() => remove(s)}
										>
											Delete
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="h-7 text-xs"
											onclick={() => (confirmDelete = null)}
										>
											Keep
										</Button>
									{:else}
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7"
											aria-label={`Move ${s.name} up`}
											disabled={busy || index === 0}
											onclick={() => move(index, index - 1)}
										>
											<ChevronUp class="h-3.5 w-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7"
											aria-label={`Move ${s.name} down`}
											disabled={busy || index === store.steps.length - 1}
											onclick={() => move(index, index + 1)}
										>
											<ChevronDown class="h-3.5 w-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7"
											aria-label={`Edit ${s.name}`}
											disabled={busy}
											onclick={() => startEdit(s)}
										>
											<Pencil class="h-3.5 w-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-7 w-7 text-destructive hover:text-destructive"
											aria-label={`Delete ${s.name}`}
											disabled={busy}
											onclick={() => (confirmDelete = s)}
										>
											<Trash2 class="h-3.5 w-3.5" />
										</Button>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if canWrite}
					<div>
						<Button
							variant="outline"
							size="sm"
							class="h-7 gap-1.5 text-xs"
							onclick={startNew}
							data-testid="tracker-step-new"
						>
							<Plus class="h-3.5 w-3.5" /> New step
						</Button>
					</div>
				{/if}
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
