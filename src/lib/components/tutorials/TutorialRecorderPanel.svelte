<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Circle from 'lucide-svelte/icons/circle';
	import Crosshair from 'lucide-svelte/icons/crosshair';
	import MessageSquarePlus from 'lucide-svelte/icons/message-square-plus';
	import Undo2 from 'lucide-svelte/icons/undo-2';
	import Square from 'lucide-svelte/icons/square';
	import X from 'lucide-svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { tutorialRecorder } from '$lib/stores/tutorial-recorder.store.svelte';
	import { isTutorialUiTarget } from '$lib/tutorials/dom';

	/**
	 * Floating panel of the tutorial recorder (Settings → Tutorials →
	 * Record). Shown on every page while a recording runs; write calls and
	 * page changes are recorded on their own, elements are picked here.
	 * `data-tutorial-ui` keeps dialogs open while the panel is used.
	 */

	type Rect = { top: number; left: number; width: number; height: number };

	let hovered = $state<Rect | null>(null);
	let noteOpen = $state(false);
	let noteTitle = $state('');
	let noteBody = $state('');

	const recording = $derived(tutorialRecorder.recording);
	const steps = $derived(tutorialRecorder.steps);
	const picking = $derived(tutorialRecorder.picking);

	onMount(() => {
		tutorialRecorder.hydrate();
	});

	const recordingId = $derived(recording?.tutorialId ?? null);

	$effect(() => {
		const pathname = page.url.pathname;
		if (recordingId !== null) untrack(() => tutorialRecorder.observe(pathname));
	});

	// Pick mode: the next click on the page selects an element instead of
	// using it. Pointer and mouse downs are swallowed too, or menus and
	// dialogs would react before the click arrives.
	$effect(() => {
		if (!picking) {
			hovered = null;
			return;
		}
		const swallow = (e: Event) => {
			if (isTutorialUiTarget(e.target)) return;
			e.preventDefault();
			e.stopPropagation();
		};
		const onClick = (e: MouseEvent) => {
			if (isTutorialUiTarget(e.target) || !(e.target instanceof Element)) return;
			swallow(e);
			if (!tutorialRecorder.pick(e.target)) {
				toast({
					title: 'No stable way to find this element',
					description: 'Pick its button or link instead, or give it a data-tour attribute.',
					variant: 'warning'
				});
			}
		};
		const onMove = (e: MouseEvent) => {
			if (isTutorialUiTarget(e.target) || !(e.target instanceof Element)) {
				hovered = null;
				return;
			}
			const r = e.target.getBoundingClientRect();
			hovered = { top: r.top, left: r.left, width: r.width, height: r.height };
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				tutorialRecorder.picking = false;
			}
		};
		window.addEventListener('pointerdown', swallow, true);
		window.addEventListener('mousedown', swallow, true);
		window.addEventListener('click', onClick, true);
		window.addEventListener('mousemove', onMove, true);
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('pointerdown', swallow, true);
			window.removeEventListener('mousedown', swallow, true);
			window.removeEventListener('click', onClick, true);
			window.removeEventListener('mousemove', onMove, true);
			window.removeEventListener('keydown', onKey, true);
		};
	});

	const addNote = (e: Event) => {
		e.preventDefault();
		tutorialRecorder.addExplanation(noteTitle, noteBody);
		noteTitle = '';
		noteBody = '';
		noteOpen = false;
	};

	const stop = () => {
		const id = tutorialRecorder.stop();
		if (id !== null) void goto(`/settings/tutorials/${id}`);
	};
</script>

{#if recording}
	{#if picking && hovered}
		<div
			aria-hidden="true"
			class="pointer-events-none fixed z-[200] rounded-md bg-primary/10 ring-2 ring-primary"
			style:top="{hovered.top}px"
			style:left="{hovered.left}px"
			style:width="{hovered.width}px"
			style:height="{hovered.height}px"
		></div>
	{/if}

	<section
		data-tutorial-ui
		data-testid="tutorial-recorder"
		aria-label="Tutorial recorder"
		class="shadow-elevation-3 pointer-events-auto fixed bottom-4 left-4 z-[210] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-border/60 bg-card text-card-foreground"
	>
		<header class="flex items-center gap-2 px-4 pt-3">
			<Circle class="size-3 shrink-0 fill-red-500 text-red-500 motion-safe:animate-pulse" />
			<span class="grow text-xs font-medium">
				Recording · {steps.length}
				{steps.length === 1 ? 'step' : 'steps'}
			</span>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				aria-label="Discard the recording"
				onclick={() => tutorialRecorder.cancel()}
			>
				<X />
			</Button>
		</header>

		<div class="space-y-3 px-4 pb-4 pt-2">
			<p class="text-xs text-muted-foreground">
				{#if picking}
					Click the element the step is about. <kbd class="font-mono">Esc</kbd> cancels.
				{:else}
					Do it on the real pages: what you save and the pages you open become steps.
				{/if}
			</p>

			{#if steps.length}
				<ol class="max-h-40 space-y-1 overflow-y-auto text-xs">
					{#each steps as step, i (i)}
						<li class="truncate rounded bg-muted/50 px-2 py-1">
							<span class="text-muted-foreground">{i + 1}.</span>
							{step.title}
						</li>
					{/each}
				</ol>
			{/if}

			{#if noteOpen}
				<form class="space-y-2" onsubmit={addNote}>
					<Input class="h-8 text-xs" placeholder="Title" maxlength={200} bind:value={noteTitle} />
					<Textarea
						rows={3}
						class="text-xs"
						placeholder="What the learner should know here"
						maxlength={4000}
						bind:value={noteBody}
					/>
					<div class="flex justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onclick={() => (noteOpen = false)}>
							Cancel
						</Button>
						<Button type="submit" size="sm">Add</Button>
					</div>
				</form>
			{:else}
				<div class="flex flex-wrap items-center gap-1.5">
					<Button
						variant={picking ? 'default' : 'outline'}
						size="sm"
						data-testid="tutorial-recorder-pick"
						onclick={() => (tutorialRecorder.picking = !picking)}
					>
						<Crosshair /> Pick element
					</Button>
					<Button variant="outline" size="sm" onclick={() => (noteOpen = true)}>
						<MessageSquarePlus /> Explain
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8"
						aria-label="Remove the last step"
						disabled={!steps.length}
						onclick={() => tutorialRecorder.undo()}
					>
						<Undo2 />
					</Button>
					<span class="grow"></span>
					<Button size="sm" data-testid="tutorial-recorder-stop" onclick={stop}>
						<Square /> Stop
					</Button>
				</div>
			{/if}
		</div>
	</section>
{/if}
