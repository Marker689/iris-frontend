<!--
  Tutorial editor (`/settings/tutorials/new` creates one).

  Steps are written by hand, or recorded: Record saves the tutorial,
  then the administrator does the procedure on the real pages while the
  recorder panel (mounted in the app layout) turns what they save and
  open into steps. Stopping it comes back here and appends them.

  Try it runs the tutorial as it is in the editor, saved or not, in the
  same panel learners get; a preview is never recorded as completed.
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

	let tutorialId = $state<number | null>(null);
	let title = $state('');
	let summary = $state('');
	let duration = $state('');
	let published = $state(false);
	let steps = $state<StepForm[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let savedSnapshot = $state('');

	const body = $derived<Required<CustomTutorialBody>>({
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
		untrack(() => {
			if (tutorialId !== null && route === String(tutorialId)) return;
			const id = Number(route);
			if (route !== 'new' && Number.isInteger(id)) {
				void load(id);
				return;
			}
			tutorialId = null;
			title = summary = duration = '';
			published = false;
			steps = [];
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
					? await TutorialsService.create(body)
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
				id: customTutorialId(tutorialId ?? 0),
				title: body.title || 'Untitled tutorial',
				summary: body.summary,
				duration: body.duration,
				steps: body.steps
			},
			{ preview: true }
		);
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
			<label class="mr-2 flex cursor-pointer items-center gap-2 text-xs">
				<Switch checked={published} onCheckedChange={(v: boolean) => (published = v)} />
				Published
			</label>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={record}
				disabled={saving || loading || !!tutorialRecorder.recording}
				data-testid="tutorial-record"
			>
				<CircleIcon size={12} class="mr-1 fill-red-500 text-red-500" />
				Record
			</Button>
			<Button variant="outline" size="sm" class="h-7" onclick={tryIt} disabled={loading}>
				<PlayIcon size={12} class="mr-1" />
				Try it
			</Button>
			<Button variant="outline" size="sm" class="h-7" onclick={exportIt} disabled={loading}>
				<DownloadIcon size={12} class="mr-1" />
				Export
			</Button>
			<Button
				size="sm"
				class="h-7"
				onclick={save}
				disabled={saving || loading}
				data-testid="tutorial-save"
			>
				<SaveIcon size={12} class="mr-1" />
				Save
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-auto p-4">
		<div class="mx-auto flex max-w-4xl flex-col gap-4">
			<section class="grid gap-3 text-xs md:grid-cols-[1fr_10rem]">
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
				<Button variant="outline" size="sm" onclick={addStep} data-testid="tutorial-add-step">
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
