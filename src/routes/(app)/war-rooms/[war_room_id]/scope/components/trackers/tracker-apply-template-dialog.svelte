<!--
  Apply a tracker template to the war room: its steps are merged with
  the existing ones by name and its trackers are created as new tabs.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import { getTrackerIcon } from '$lib/components/common/trackers/tracker-icon';
	import {
		TrackerTemplatesService,
		type TrackerTemplate
	} from '$lib/services/tracker-templates.service';
	import { WarRoomTrackersService, type Tracker } from '$lib/services/war-room-trackers.service';
	import { errorMessage } from '../helpers';
	import type { TrackersState } from './trackers-state.svelte';

	type Props = {
		open: boolean;
		store: TrackersState;
		/** Called with the trackers the template created. */
		onApplied?: (trackers: Tracker[]) => void;
	};

	let { open = $bindable(), store, onApplied }: Props = $props();

	let templates = $state<TrackerTemplate[]>([]);
	let loading = $state(false);
	let selectedId = $state<number | null>(null);
	let busy = $state(false);

	const selected = $derived(templates.find((t) => t.id === selectedId) ?? null);

	const load = async () => {
		loading = true;
		const res = await TrackerTemplatesService.list();
		templates = res.ok && Array.isArray(res.data) ? res.data : [];
		selectedId = templates[0]?.id ?? null;
		loading = false;
	};

	$effect(() => {
		if (open) untrack(() => void load());
	});

	const apply = async () => {
		if (!selected || busy) return;
		busy = true;
		try {
			const res = await WarRoomTrackersService.applyTemplate(store.warRoomId, selected.id);
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				if (res.status !== 403) {
					toast({
						title: 'Could not apply the template',
						description: errorMessage(res, 'The server refused the request.'),
						variant: 'destructive'
					});
				}
				return;
			}
			const created = res.data.trackers ?? [];
			await store.reload();
			toast({
				title: `Template "${selected.name}" applied`,
				description: `${created.length} ${created.length === 1 ? 'tracker' : 'trackers'} created.`,
				variant: 'success'
			});
			open = false;
			onApplied?.(created);
		} finally {
			busy = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Apply a template</Dialog.Title>
			<Dialog.Description>
				Adds the template's steps (an existing step of the same name is reused) and creates its
				trackers.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
			{#if loading}
				<div class="flex justify-center py-6">
					<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			{:else if templates.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">
					No tracker template yet. Administrators manage them in Settings &gt; Tracker templates.
				</p>
			{:else}
				<div class="flex flex-col gap-1.5" role="radiogroup" aria-label="Template">
					{#each templates as t (t.id)}
						<button
							type="button"
							role="radio"
							aria-checked={selectedId === t.id}
							onclick={() => (selectedId = t.id)}
							class="rounded-md border px-3 py-2 text-left transition-colors {selectedId === t.id
								? 'border-primary bg-primary/5'
								: 'hover:bg-muted/40'}"
							data-testid="tracker-template-option"
						>
							<span class="block text-xs font-medium">{t.name}</span>
							{#if t.description}
								<span class="block text-2xs text-muted-foreground">{t.description}</span>
							{/if}
							<span class="mt-1.5 flex flex-wrap gap-1">
								{#each t.steps as s (s.name)}
									<TrackerStepChip step={s} />
								{/each}
							</span>
							<span class="mt-1.5 flex flex-wrap gap-2 text-2xs text-muted-foreground">
								{#each t.trackers as tr, i (i)}
									{@const Icon = getTrackerIcon(tr.icon)}
									<span class="inline-flex items-center gap-1">
										<Icon class="h-3 w-3" aria-hidden="true" />
										{tr.name}
									</span>
								{/each}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={apply} disabled={!selected || busy} data-testid="tracker-template-apply">
				{busy ? 'Applying…' : 'Apply'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
