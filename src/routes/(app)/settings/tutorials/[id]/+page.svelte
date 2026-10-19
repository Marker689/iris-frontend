<!--
  Tutorial editor (`/settings/tutorials/new` creates one).

  Steps are written by hand, or recorded: Record saves the tutorial,
  then the administrator does the procedure on the real pages while the
  recorder panel (mounted in the app layout) turns what they save and
  open into steps. Stopping it comes back here and appends them.

  Try it runs the tutorial as it is in the editor, saved or not, in the
  same panel learners get; a preview is never recorded as completed.

  `new?builtin=<id>` starts from a built-in tutorial: saving creates the
  administrators' version of it, which replaces the built-in for
  everyone (hides it once unpublished) until it is restored.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeftIcon,
		CircleIcon,
		DownloadIcon,
		PlayIcon,
		PlusIcon,
		RotateCcwIcon,
		SaveIcon,
		TriangleAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import { downloadBlob } from '$lib/services/report-templates.service';
	import {
		TutorialsService,
		customTutorialId,
		type CustomTutorialBody
	} from '$lib/services/tutorials.service';
	import { tutorial as tutorialRun } from '$lib/stores/tutorial.store.svelte';
	import { tutorialRecorder } from '$lib/stores/tutorial-recorder.store.svelte';
	import { tutorialById } from '$lib/tutorials';
	import { tutorialFileName, tutorialToFile } from '$lib/tutorials/io';
	import { lintTutorial } from '$lib/tutorials/lint';
	import StepEditor from '../components/StepEditor.svelte';
	import {
		emptyStep,
		fromStepForm,
		moveItem,
		toStepForm,
		type StepForm
	} from '../helpers/step-form';

	const routeId = $derived(page.params.id ?? 'new');
	const requestedBuiltIn = $derived(page.url.searchParams.get('builtin'));

	let tutorialId = $state<number | null>(null);
	/** The built-in tutorial this is the administrators' version of. */
	let builtinId = $state<string | null>(null);
	const builtIn = $derived(builtinId ? (tutorialById(builtinId) ?? null) : null);
	let title = $state('');
	let summary = $state('');
	let duration = $state('');
	let published = $state(false);
	let steps = $state<StepForm[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let savedSnapshot = $state('');

	const body = $derived<Required<Omit<CustomTutorialBody, 'builtin_id'>>>({
		title: title.trim(),
		summary: summary.trim(),
		duration: duration.trim(),
		published,
		steps: steps.map(fromStepForm)
	});
	const dirty = $derived(JSON.stringify(body) !== savedSnapshot);
	const issues = $derived(lintTutorial(body));
	const tutorialIssues = $derived(issues.filter((i) => i.step === null));
	const stepIssues = (index: number) =>
		issues.filter((i) => i.step === index).map((i) => i.message);

	const markSaved = () => {
		savedSnapshot = JSON.stringify(body);
	};

	async function load(id: number) {
		loading = true;
		try {
			const res = await TutorialsService.get(id);
			if (!res.ok || !res.data || typeof res.data !== 'object') {
				toast({
					title: 'Failed to load the tutorial',
					description: res.error?.message,
					variant: 'destructive'
				});
				await goto('/settings/tutorials');
				return;
			}
			tutorialId = res.data.id;
			builtinId = res.data.builtin_id;
			title = res.data.title;
			summary = res.data.summary;
			duration = res.data.duration;
			published = res.data.published;
			steps = res.data.steps.map(toStepForm);
			markSaved();
		} finally {
			loading = false;
		}
	}

	function appendRecorded(id: number) {
		const recorded = tutorialRecorder.takeResult(id);
		if (!recorded.length) return;
		steps = [...steps, ...recorded.map(toStepForm)];
		toast({
			title: `${recorded.length} recorded ${recorded.length === 1 ? 'step' : 'steps'} added`,
			description: 'Rewrite their titles and explanations, then save.',
			variant: 'success'
		});
	}

	// Steps recorded for this tutorial land here once the recording is
	// stopped, whether the editor was reopened or stayed open.
	$effect(() => {
		const id = tutorialId;
		const idle = !loading && !tutorialRecorder.recording;
		if (id !== null && idle) untrack(() => appendRecorded(id));
	});

	// The page is reused when only the id changes (saving a new tutorial,
	// stopping a recording of another one): (re)load on every change.
	$effect(() => {
		const route = routeId;
		const requested = requestedBuiltIn;
		untrack(() => {
			if (tutorialId !== null && route === String(tutorialId)) return;
			const id = Number(route);
			if (route !== 'new' && Number.isInteger(id)) {
				void load(id);
				return;
			}
			tutorialId = null;
			const source = requested ? tutorialById(requested) : undefined;
			builtinId = source?.id ?? null;
			title = source?.title ?? '';
			summary = source?.summary ?? '';
			duration = source?.duration ?? '';
			// Learners have it already: the edited version replaces it as soon as it is saved.
			published = !!source;
			steps = source?.steps.map(toStepForm) ?? [];
			markSaved();
		});
	});

	beforeNavigate((navigation) => {
		if (!dirty || navigation.type === 'leave' || saving) return;
		if (!confirm('Leave the editor? Unsaved changes will be lost.')) navigation.cancel();
	});

	/** Saves; returns the id, or `null` when it failed. */
	async function save(): Promise<number | null> {
		if (!body.title) {
			toast({ title: 'Give the tutorial a title first', variant: 'destructive' });
			return null;
		}
		if (body.published && body.steps.length === 0) {
			toast({ title: 'A published tutorial needs at least one step', variant: 'destructive' });
			return null;
		}
		saving = true;
		try {
			const res =
				tutorialId === null
					? await TutorialsService.create({ ...body, builtin_id: builtinId })
					: await TutorialsService.update(tutorialId, body);
			if (!res.ok || !res.data || typeof res.data !== 'object') {
				toast({
					title: 'Failed to save the tutorial',
					description: res.error?.message,
					variant: 'destructive'
				});
				return null;
			}
			markSaved();
			const created = tutorialId === null;
			tutorialId = res.data.id;
			if (created) {
				await goto(`/settings/tutorials/${tutorialId}`, { replaceState: true, noScroll: true });
			}
			toast({ title: 'Tutorial saved', variant: 'success' });
			return tutorialId;
		} finally {
			saving = false;
		}
	}

	async function record() {
		const id = dirty || tutorialId === null ? await save() : tutorialId;
		if (id === null) return;
		tutorialRecorder.start(id);
		toast({
			title: 'Recording',
			description:
				'Do the procedure on the real pages. Use the recorder panel to pick elements, add explanations, and stop.',
			variant: 'success'
		});
	}

	function tryIt() {
		if (body.steps.length === 0) {
			toast({ title: 'Add a step first', variant: 'warning' });
			return;
		}
		tutorialRun.start(
			{
				id: builtinId ?? customTutorialId(tutorialId ?? 0),
				title: body.title || 'Untitled tutorial',
				summary: body.summary,
				duration: body.duration,
				steps: body.steps
			},
			{ preview: true }
		);
	}

	async function restore() {
		if (tutorialId === null) return;
		if (!confirm('Restore the tutorial IRIS ships? Your changes will be lost.')) return;
		const res = await TutorialsService.remove(tutorialId);
		if (!res.ok) {
			toast({
				title: 'Failed to restore the tutorial',
				description: res.error?.message,
				variant: 'destructive'
			});
			return;
		}
		markSaved();
		toast({ title: 'Built-in tutorial restored', variant: 'success' });
		await goto('/settings/tutorials');
	}

	function exportIt() {
		downloadBlob(
			new Blob([JSON.stringify(tutorialToFile(body), null, 2)], { type: 'application/json' }),
			tutorialFileName(body.title)
		);
	}

	function addStep() {
		steps = [...steps, emptyStep()];
	}

	function moveStep(index: number, delta: number) {
		steps = moveItem(steps, index, delta);
	}

	function removeStep(index: number) {
		steps = steps.filter((_, i) => i !== index);
	}
</script>

<svelte:head>
	<title>{title || 'New tutorial'} · Tutorials</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex min-w-0 items-center gap-2.5">
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				aria-label="Back to tutorials"
				href="/settings/tutorials"
			>
				<ArrowLeftIcon size={14} />
			</Button>
			<h1 class="truncate text-sm font-semibold">
				{title || (tutorialId === null ? 'New tutorial' : 'Untitled tutorial')}
			</h1>
			{#if dirty}<span class="text-2xs text-muted-foreground">Unsaved</span>{/if}
		</div>

		<div class="flex items-center gap-1.5">
			<label
				class="mr-2 flex cursor-pointer items-center gap-2 text-xs"
				data-tour="tutorial-published"
				title={builtIn ? 'Off hides this tutorial from the catalogue' : undefined}
			>
				<Switch checked={published} onCheckedChange={(v: boolean) => (published = v)} />
				Published
			</label>
			{#if builtinId && tutorialId !== null}
				<Button variant="outline" size="sm" class="h-7" onclick={restore} disabled={saving}>
					<RotateCcwIcon size={12} class="mr-1" />
					Restore
				</Button>
			{/if}
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={record}
				disabled={saving || loading || !!tutorialRecorder.recording}
				data-testid="tutorial-record"
				data-tour="tutorial-record"
			>
				<CircleIcon size={12} class="mr-1 fill-red-500 text-red-500" />
				Record
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={tryIt}
				disabled={loading}
				data-tour="tutorial-try"
			>
				<PlayIcon size={12} class="mr-1" />
				Try it
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={exportIt}
				disabled={loading}
				data-tour="tutorial-export"
			>
				<DownloadIcon size={12} class="mr-1" />
				Export
			</Button>
			<Button
				size="sm"
				class="h-7"
				onclick={save}
				disabled={saving || loading}
				data-testid="tutorial-save"
				data-tour="tutorial-save"
			>
				<SaveIcon size={12} class="mr-1" />
				Save
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-auto p-4">
		<div class="mx-auto flex max-w-4xl flex-col gap-4">
			{#if builtinId}
				<p class="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
					{#if !builtIn}
						IRIS no longer ships this tutorial, so learners do not see it. Restore it to delete it.
					{:else if tutorialId === null}
						Built-in tutorial. Learners keep IRIS's version until you save yours: it then replaces
						it for everyone.
					{:else}
						Your version of a built-in tutorial: it replaces IRIS's for everyone while published,
						and hides it otherwise. Restore brings IRIS's version back.
					{/if}
				</p>
			{/if}

			<section class="grid gap-3 text-xs md:grid-cols-[1fr_10rem]" data-tour="tutorial-details">
				<div class="flex flex-col gap-1">
					<label class="font-medium" for="tutorial-title">Title</label>
					<Input
						id="tutorial-title"
						class="h-8 text-xs"
						maxlength={200}
						placeholder="Escalate a phishing alert the way we do it"
						bind:value={title}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="font-medium" for="tutorial-duration">Duration</label>
					<Input
						id="tutorial-duration"
						class="h-8 text-xs"
						maxlength={32}
						placeholder="~5 min"
						bind:value={duration}
					/>
				</div>
				<div class="flex flex-col gap-1 md:col-span-2">
					<label class="font-medium" for="tutorial-summary">Summary</label>
					<Textarea
						id="tutorial-summary"
						rows={2}
						maxlength={1000}
						class="text-xs"
						placeholder="What the learner will know how to do afterwards."
						bind:value={summary}
					/>
				</div>
			</section>

			{#if tutorialIssues.length && !loading}
				<ul class="flex flex-col gap-1 text-xs">
					{#each tutorialIssues as issue, i (i)}
						<li class="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-300">
							<TriangleAlertIcon size={12} />
							{issue.message}
						</li>
					{/each}
				</ul>
			{/if}

			{#each steps as step, i (step.key)}
				<StepEditor
					bind:step={steps[i]}
					index={i}
					total={steps.length}
					issues={stepIssues(i)}
					onmove={(delta) => moveStep(i, delta)}
					onremove={() => removeStep(i)}
				/>
			{/each}

			<div class="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={addStep}
					data-testid="tutorial-add-step"
					data-tour="tutorial-add-step"
				>
					<PlusIcon size={12} class="mr-1" />
					Add a step
				</Button>
				<span class="text-xs text-muted-foreground">
					or press Record and do the procedure once.
				</span>
			</div>
		</div>
	</div>
</div>
