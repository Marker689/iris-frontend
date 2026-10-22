<!--
  Activity rail settings: where each automatic lane goes (rail, inline in
  the chat, or nowhere), the noise controls, and the per-case mutes that
  used to fill the stream's left sidebar. Saved to the operator's
  profile by the page, the same for every war room.
-->
<script lang="ts">
	import { ChevronDown, ChevronRight, UserCog, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Switch } from '$lib/components/ui/switch';
	import type { WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import { WAR_ROOM_ACTIVITY_FAMILIES } from '$lib/utils/war-room-stream';
	import {
		ACTIVITY_GROUPS,
		STREAM_LANES,
		caseActivityLabel,
		type LaneRoute,
		type StreamLaneKey
	} from './activity-rail';
	import { LANE_ICONS } from './stream-icons';
	import type { StreamPreferences } from './stream-preferences.svelte';

	type Props = {
		prefs: StreamPreferences;
		attachedCases: WarRoomCaseAttachment[];
		/** Loaded rows per lane, whatever their route. */
		laneCounts: Record<StreamLaneKey, number>;
		onDone: () => void;
	};
	let { prefs, attachedCases, laneCounts, onDone }: Props = $props();

	const ROUTE_OPTIONS: { value: LaneRoute; label: string }[] = [
		{ value: 'rail', label: 'Rail' },
		{ value: 'chat', label: 'Chat' },
		{ value: 'off', label: 'Off' }
	];

	let familiesOpen = $state(false);
	let openCases = $state<Set<number>>(new Set());
	const toggleCaseOpen = (caseId: number) => {
		const next = new Set(openCases);
		if (next.has(caseId)) next.delete(caseId);
		else next.add(caseId);
		openCases = next;
	};

	const mutedGroupCount = (caseId: number) =>
		ACTIVITY_GROUPS.filter((g) => prefs.groupState(caseId, g) !== 'all').length;

	// Single types muted inside a group that is otherwise on, typically by
	// a row's "Mute this kind": the group checkbox can't undo just those.
	const partlyMuted = (caseId: number) =>
		ACTIVITY_GROUPS.filter((g) => prefs.groupState(caseId, g) === 'some').flatMap((g) =>
			g.slugs.filter((s) => !prefs.isCaseActivityOn(caseId, s.slug)).map((s) => s.slug)
		);
</script>

<div class="space-y-5 px-3 py-3">
	<section>
		<div class="mb-1 flex items-center justify-between">
			<p class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				Where events go
			</p>
			{#if prefs.customised}
				<button
					type="button"
					class="text-2xs text-primary hover:underline"
					onclick={() => prefs.reset()}
				>
					Reset
				</button>
			{/if}
		</div>
		<p class="mb-2 text-2xs text-muted-foreground">
			<b class="text-foreground">Rail</b> this panel ·
			<b class="text-foreground">Chat</b> inline in the conversation ·
			<b class="text-foreground">Off</b> hidden everywhere
		</p>
		<ul class="divide-y rounded-md border">
			{#each STREAM_LANES as lane (lane.key)}
				{@const meta = LANE_ICONS[lane.key]}
				{@const route = prefs.routes[lane.key]}
				<li class="px-2 py-1.5">
					<div class="flex items-center gap-2">
						<meta.Icon class={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
						{#if lane.key === 'room_activity'}
							<button
								type="button"
								class="flex min-w-0 flex-1 items-center gap-1 text-left text-xs"
								onclick={() => (familiesOpen = !familiesOpen)}
								aria-expanded={familiesOpen}
							>
								<span class="truncate">{lane.label}</span>
								{#if familiesOpen}
									<ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground" />
								{:else}
									<ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground" />
								{/if}
							</button>
						{:else}
							<span class="min-w-0 flex-1 truncate text-xs">{lane.label}</span>
						{/if}
						<span class="text-2xs tabular-nums text-muted-foreground">{laneCounts[lane.key]}</span>
						<div
							class="inline-flex shrink-0 rounded-md border bg-muted/40 p-0.5"
							role="radiogroup"
							aria-label={`Where ${lane.label} goes`}
						>
							{#each ROUTE_OPTIONS as opt (opt.value)}
								<button
									type="button"
									role="radio"
									aria-checked={route === opt.value}
									class={[
										'h-5 rounded px-2 text-2xs transition-colors',
										route === opt.value
											? 'bg-background font-medium text-foreground shadow-sm'
											: 'text-muted-foreground hover:text-foreground'
									]}
									onclick={() => prefs.setRoute(lane.key, opt.value)}
								>
									{opt.label}
								</button>
							{/each}
						</div>
					</div>
					{#if lane.key === 'room_activity' && familiesOpen}
						<div
							class={[
								'ml-6 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 pb-1',
								route === 'off' && 'pointer-events-none opacity-50'
							]}
						>
							{#each WAR_ROOM_ACTIVITY_FAMILIES as family (family.key)}
								<label class="flex cursor-pointer items-center gap-1.5 text-xs">
									<Checkbox
										checked={!prefs.excludedRoomActivities.has(family.key)}
										onCheckedChange={() => prefs.toggleRoomActivity(family.key)}
										aria-label={`War-room activity: ${family.label}`}
									/>
									<span class="truncate">{family.label}</span>
								</label>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-1.5 text-2xs text-muted-foreground">Messages and polls always stay in the chat.</p>
	</section>

	<section>
		<p class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Noise</p>
		<div class="flex items-start gap-3 py-1.5">
			<div class="min-w-0 flex-1">
				<p class="text-xs font-medium">Fold bursts</p>
				<p class="text-2xs text-muted-foreground">
					3+ similar events in a row become one expandable row.
				</p>
			</div>
			<Switch
				checked={prefs.foldBursts}
				onCheckedChange={(v) => (prefs.foldBursts = v)}
				aria-label="Fold bursts"
			/>
		</div>
		<div class="flex items-start gap-3 py-1.5">
			<div class="min-w-0 flex-1">
				<p class="text-xs font-medium">Quiet mode</p>
				<p class="text-2xs text-muted-foreground">
					Hide case “updated” events, keep creations, deletions and state changes.
				</p>
			</div>
			<Switch
				checked={prefs.quietMode}
				onCheckedChange={(v) => (prefs.quietMode = v)}
				aria-label="Quiet mode"
			/>
		</div>
	</section>

	<section>
		<p class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
			Cases ({attachedCases.length})
		</p>
		{#if attachedCases.length === 0}
			<p class="text-2xs text-muted-foreground">
				No cases attached. Anything attached later will appear here automatically.
			</p>
		{:else}
			<ul class="divide-y rounded-md border">
				{#each attachedCases as att (att.case_id)}
					{@const on = prefs.isCaseOn(att.case_id)}
					{@const open = openCases.has(att.case_id)}
					{@const muted = mutedGroupCount(att.case_id)}
					{@const partial = open ? partlyMuted(att.case_id) : []}
					<li class="px-2 py-1.5">
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="rounded p-0.5 text-muted-foreground hover:bg-muted"
								onclick={() => toggleCaseOpen(att.case_id)}
								aria-expanded={open}
								aria-label={`Activity types of case #${att.case_id}`}
							>
								{#if open}
									<ChevronDown class="h-3.5 w-3.5" />
								{:else}
									<ChevronRight class="h-3.5 w-3.5" />
								{/if}
							</button>
							<span class="font-mono text-2xs text-muted-foreground">#{att.case_id}</span>
							<span
								class={[
									'min-w-0 flex-1 truncate text-xs',
									!on && 'text-muted-foreground line-through'
								]}
								title={att.case_name}
							>
								{att.case_name}
							</span>
							{#if muted > 0 && on}
								<span class="text-2xs tabular-nums text-muted-foreground">
									{ACTIVITY_GROUPS.length - muted}/{ACTIVITY_GROUPS.length}
								</span>
							{/if}
							<Switch
								checked={on}
								onCheckedChange={() => prefs.toggleCase(att.case_id)}
								aria-label={`Show activity of case #${att.case_id}`}
							/>
						</div>
						{#if open}
							<div
								class={[
									'ml-6 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 pb-1',
									!on && 'pointer-events-none opacity-50'
								]}
							>
								{#each ACTIVITY_GROUPS as g (g.key)}
									{@const state = prefs.groupState(att.case_id, g)}
									<label class="flex cursor-pointer items-center gap-1.5 text-xs">
										<Checkbox
											checked={state === 'all'}
											indeterminate={state === 'some'}
											onCheckedChange={() => prefs.toggleGroup(att.case_id, g)}
											aria-label={`${g.label} for case #${att.case_id}`}
										/>
										<span class="truncate">{g.label}</span>
									</label>
								{/each}
							</div>
							{#if partial.length > 0}
								<div class="ml-6 mt-1 flex flex-wrap gap-1 pb-1">
									{#each partial as slug (slug)}
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
											onclick={() => prefs.setCaseActivity(att.case_id, slug, true)}
											title="Unmute"
										>
											<span class="line-through">{caseActivityLabel(slug)}</span>
											<X class="h-2.5 w-2.5" />
										</button>
									{/each}
								</div>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
			<p class="mt-1.5 text-2xs text-muted-foreground">
				A case attached later starts streaming automatically.
			</p>
		{/if}
	</section>

	<p
		class="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-2 text-2xs text-muted-foreground"
	>
		<UserCog class="h-3.5 w-3.5 shrink-0" />
		Saved to your profile, applies to every war room you open.
	</p>
	<Button size="sm" class="w-full" onclick={onDone}>Done</Button>
</div>
