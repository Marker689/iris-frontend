<!--
  Trackers of a case: user-created tabs where each row (free text, or an
  asset / IOC / task / evidence of the case) carries steps, a note and
  custom columns — "THOR received", "waiting for the logs"… The shown
  tracker is kept in the `?tracker=` query.
-->
<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import { ListChecks, Loader2 } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';
	import TrackerPanel from './components/tracker-panel.svelte';
	import TrackerTabs from './components/tracker-tabs.svelte';
	import { CaseTrackersState } from './components/trackers-state.svelte';

	const caseAccess = getContext<CaseAccessContext>(CASE_ACCESS_CTX);
	const user = getContext<UserCtx | undefined>(USER_CTX);

	const caseId = $derived(Number(page.params.case_id));
	const canWrite = $derived(caseAccess.canEdit());
	const isAdmin = $derived(user?.can('server_administrator') ?? false);

	const store = new CaseTrackersState(() => caseId);

	const requested = $derived.by(() => {
		const raw = page.url.searchParams.get('tracker');
		const id = raw ? Number(raw) : NaN;
		return Number.isInteger(id) ? id : null;
	});
	// The requested tracker, else the first one.
	const shown = $derived(store.tracker(requested) ?? store.trackers[0] ?? null);

	const select = (trackerId: number) => {
		const url = new URL(page.url);
		url.searchParams.set('tracker', String(trackerId));
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	};

	$effect(() => {
		void caseId;
		untrack(() => {
			store.reset();
			void store.loadTrackers();
			void store.loadSteps();
		});
	});
</script>

<svelte:head>
	<title>#{page.params.case_id} - Trackers</title>
</svelte:head>

<CaseWorkspace>
	<div class="flex h-full min-h-0 w-full flex-col" data-testid="case-trackers">
		<div class="border-b bg-muted/20 px-4 py-2">
			<TrackerTabs {store} active={shown?.id ?? null} onSelect={select} {canWrite} {isAdmin} />
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-4">
			{#if !store.loaded}
				<div class="flex justify-center py-16">
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			{:else if shown}
				<TrackerPanel {store} tracker={shown} {canWrite} {isAdmin} />
			{:else}
				<div
					class="flex flex-col items-center gap-3 px-6 py-16 text-center"
					data-testid="case-trackers-empty"
				>
					<ListChecks class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
					<div class="max-w-md">
						<p class="text-sm font-medium">No tracker yet</p>
						<p class="text-xs text-muted-foreground">
							Follow anything across the case: for each asset, whether the THOR scan was received,
							what you are waiting for… A tracker lists rows (free text, or the assets, IOCs, tasks
							or evidences of the case) with steps, a note and your own columns.
						</p>
					</div>
					{#if canWrite}
						<div class="flex gap-2">
							<Button size="sm" onclick={() => store.openForm(null)}>New tracker</Button>
							<Button size="sm" variant="outline" onclick={() => (store.stepsOpen = true)}>
								Manage steps
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</CaseWorkspace>
