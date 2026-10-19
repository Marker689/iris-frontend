<!--
	Guided tutorials catalogue. Starting one opens the tutorial panel
	(TutorialOverlay, mounted in the app layout); the steps then run on
	the real pages. Completion comes from the `tutorials` user preference.

	Built-in tutorials come with IRIS, as administrators may have edited
	or hidden them; "From your team" are the ones administrators wrote in
	Settings → Tutorials. Some are listed to administrators only.
-->

<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import GraduationCap from 'lucide-svelte/icons/graduation-cap';
	import CircleCheck from 'lucide-svelte/icons/circle-check';
	import { Button } from '$lib/components/ui/button';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { TutorialsService } from '$lib/services/tutorials.service';
	import { tutorial } from '$lib/stores/tutorial.store.svelte';
	import { TUTORIALS } from '$lib/tutorials';
	import { buildCatalogue, forAudience, startSource } from '$lib/tutorials/overrides';
	import type { Tutorial } from '$lib/tutorials/types';

	const userCtx = getContext<UserCtx>(USER_CTX);
	const isAdmin = $derived(userCtx?.can('server_administrator') ?? false);

	let catalogue = $state(buildCatalogue(TUTORIALS, []));
	const builtIn = $derived(forAudience(catalogue.builtIn, isAdmin));
	const team = $derived(forAudience(catalogue.team, isAdmin));

	onMount(() => {
		void tutorial.loadCompleted();
		void TutorialsService.listPublished().then((res) => {
			if (res.ok && Array.isArray(res.data)) catalogue = buildCatalogue(TUTORIALS, res.data);
		});
	});
</script>

{#snippet card(item: Tutorial)}
	{@const completedAt = tutorial.completed[item.id]}
	{@const running = tutorial.run?.tutorialId === item.id}
	<li
		class="flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4"
		data-testid="tutorial-card-{item.id}"
	>
		<div class="min-w-0 grow">
			<div class="flex items-center gap-2">
				<h2 class="text-sm font-semibold">{item.title}</h2>
				{#if item.audience === 'administrators'}
					<span class="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
						Administrators
					</span>
				{/if}
				{#if completedAt}
					<span
						class="flex items-center gap-1 text-xs text-muted-foreground"
						title={new Date(completedAt).toLocaleString()}
					>
						<CircleCheck class="size-3.5 text-primary" /> Completed
					</span>
				{/if}
			</div>
			{#if item.summary}
				<p class="mt-1 text-sm text-muted-foreground">{item.summary}</p>
			{/if}
			<p class="mt-2 text-xs text-muted-foreground">
				{item.steps.length} steps{item.duration ? ` · ${item.duration}` : ''}
			</p>
		</div>
		<Button
			size="sm"
			variant={completedAt ? 'outline' : 'default'}
			disabled={running}
			data-testid="tutorial-start-{item.id}"
			onclick={() => tutorial.start(startSource(item))}
		>
			{running ? 'In progress' : completedAt ? 'Start again' : 'Start'}
		</Button>
	</li>
{/snippet}

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<div>
		<h1 class="flex items-center gap-2 text-lg font-semibold">
			<GraduationCap class="size-5 text-primary" /> Tutorials
		</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Step-by-step walkthroughs that run on this instance. You do every step yourself on the real
			pages; a panel explains what to do and moves on once it's done. They create real data, so use
			a test customer.
		</p>
	</div>

	<ul class="flex flex-col gap-3">
		{#each builtIn as item (item.id)}
			{@render card(item)}
		{/each}
	</ul>

	{#if team.length || isAdmin}
		<section class="flex flex-col gap-3" data-testid="tutorials-team">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold">From your team</h2>
				{#if isAdmin}
					<Button variant="link" size="sm" class="px-0" href="/settings/tutorials">
						Manage tutorials
					</Button>
				{/if}
			</div>
			{#if team.length}
				<ul class="flex flex-col gap-3">
					{#each team as item (item.id)}
						{@render card(item)}
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">
					Turn your procedures into tutorials: write them step by step, or record yourself doing
					them once.
				</p>
			{/if}
		</section>
	{/if}
</div>
