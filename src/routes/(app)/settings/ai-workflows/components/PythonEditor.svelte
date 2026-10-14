<!--
  Script editor of the `python` node: Ace with Python highlighting, and a
  live check against the sandbox rules.

  The check is the backend's own static check (`/ai-workflows/python/check`,
  the one a save runs), so it reports exactly what the sandbox would
  refuse: syntax errors, but also imports, attribute access, unknown
  methods… It runs a moment after typing stops; its errors are marked in
  the gutter and listed under the editor (a click goes to the line).
  Ace is imported lazily, in the browser only (it touches `document`).
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { mode } from 'mode-watcher';
	import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from 'lucide-svelte';
	import { AiWorkflowsService, type AiPythonCheckError } from '$lib/services/ai-workflows.service';

	type Props = {
		value: string;
		onInput: (value: string) => void;
		readOnly?: boolean;
		minLines?: number;
		maxLines?: number;
		testId?: string;
	};

	let {
		value,
		onInput,
		readOnly = false,
		minLines = 18,
		maxLines = 40,
		testId = 'wf-cfg-code'
	}: Props = $props();

	const CHECK_DELAY_MS = 400;

	let container: HTMLDivElement | null = $state(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let editor: any = null;
	let suppressChange = false;

	let checking = $state(false);
	let checked = $state(false);
	let checkFailed = $state(false);
	let problems = $state<AiPythonCheckError[]>([]);
	let checkTimer: ReturnType<typeof setTimeout> | null = null;
	// Only the answer to the latest request counts.
	let checkSeq = 0;

	const theme = (current: string | undefined) =>
		current === 'dark' ? 'ace/theme/tomorrow_night' : 'ace/theme/github';

	const annotate = () => {
		editor?.session.setAnnotations(
			problems.map((p) => ({
				row: Math.max(0, (p.line ?? 1) - 1),
				column: 0,
				text: p.message,
				type: 'error'
			}))
		);
	};

	const runCheck = async (code: string) => {
		const seq = ++checkSeq;
		if (!code.trim()) {
			checking = false;
			checked = false;
			checkFailed = false;
			problems = [];
			annotate();
			return;
		}
		checking = true;
		const res = await AiWorkflowsService.checkPython(code);
		if (seq !== checkSeq) return;
		checking = false;
		if (res.ok && res.data && typeof res.data === 'object') {
			checked = true;
			checkFailed = false;
			problems = res.data.errors ?? [];
		} else {
			// The save still validates; just say the live check is unavailable.
			checked = false;
			checkFailed = true;
			problems = [];
		}
		annotate();
	};

	const scheduleCheck = (code: string) => {
		if (checkTimer) clearTimeout(checkTimer);
		checkTimer = setTimeout(() => void runCheck(code), CHECK_DELAY_MS);
	};

	const goToLine = (line: number | null) => {
		if (!editor || !line) return;
		editor.gotoLine(line, 0, true);
		editor.focus();
	};

	onMount(async () => {
		if (!browser || !container) return;
		const aceModule = await import('ace-builds/src-noconflict/ace');
		const ace = (aceModule.default ?? aceModule) as typeof import('ace-builds');
		await Promise.all([
			import('ace-builds/src-noconflict/mode-python'),
			import('ace-builds/src-noconflict/theme-github'),
			import('ace-builds/src-noconflict/theme-tomorrow_night')
		]);
		if (!container) return;

		editor = ace.edit(container, {
			mode: 'ace/mode/python',
			theme: theme($mode),
			value,
			minLines,
			maxLines,
			fontSize: 12,
			showPrintMargin: false,
			// Ace has no Python worker; the check above stands in for it.
			useWorker: false,
			tabSize: 4,
			useSoftTabs: true,
			wrap: false,
			readOnly
		});
		editor.clearSelection();

		editor.session.on('change', () => {
			if (suppressChange) return;
			const next = editor.getValue();
			onInput(next);
			scheduleCheck(next);
		});

		void runCheck(value);
	});

	// Follow a value replaced from outside (another node, an undo, a load).
	$effect(() => {
		const next = value;
		if (!editor || editor.getValue() === next) return;
		suppressChange = true;
		editor.setValue(next, -1);
		suppressChange = false;
		scheduleCheck(next);
	});

	$effect(() => {
		editor?.setReadOnly(readOnly);
	});

	$effect(() => {
		editor?.setTheme(theme($mode));
	});

	onDestroy(() => {
		if (checkTimer) clearTimeout(checkTimer);
		checkSeq++;
		editor?.destroy();
		editor = null;
	});
</script>

<div class="flex flex-col gap-1">
	<div
		bind:this={container}
		class="w-full overflow-hidden rounded-md border text-xs"
		data-testid={testId}
	></div>
	<div class="min-h-4 text-[11px]" aria-live="polite" data-testid={`${testId}-check`}>
		{#if checking}
			<span class="inline-flex items-center gap-1 text-muted-foreground">
				<LoaderCircleIcon class="h-3 w-3 animate-spin" /> Checking…
			</span>
		{:else if problems.length}
			<ul class="flex flex-col gap-0.5">
				{#each problems as p, i (i)}
					<li>
						<button
							type="button"
							class="inline-flex items-start gap-1 text-left text-destructive hover:underline disabled:no-underline"
							onclick={() => goToLine(p.line)}
							disabled={!p.line}
						>
							<CircleAlertIcon class="mt-px h-3 w-3 shrink-0" />
							<span>
								{#if p.line}<span class="font-mono">line {p.line}</span>:{/if}
								{p.message}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if checked}
			<span class="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
				<CircleCheckIcon class="h-3 w-3" /> No problem found
			</span>
		{:else if checkFailed}
			<span class="text-muted-foreground"
				>The live check is unavailable; saving still checks it.</span
			>
		{/if}
	</div>
</div>
