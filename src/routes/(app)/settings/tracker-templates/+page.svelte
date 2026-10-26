<!--
  Tracker templates admin page.

  Global bundles of tracker steps and trackers (source, offered steps,
  extra columns). A war room applies one from its scope "+" menu, a case
  from its Trackers page;
  its steps are merged by name and its trackers created. Master/detail
  like the asset flags page: list on the left, details on the right,
  one dialog for add/edit. JSON import/export to move templates between
  instances, and server-defined presets.

  Admin only: the nav entry is gated on `server_administrator` and every
  mutation is re-checked by the backend.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ChevronDownIcon,
		DownloadIcon,
		LayersIcon,
		ListChecksIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		Trash2Icon,
		UploadIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import { getTrackerIcon } from '$lib/components/common/trackers/tracker-icon';
	import {
		TrackerTemplatesService,
		parseTrackerTemplateJson,
		trackerTemplateToExport,
		TRACKER_TEMPLATE_FORMAT,
		TRACKER_TEMPLATE_SOURCES,
		type TrackerTemplate,
		type TrackerTemplateExport,
		type TrackerTemplatePreset
	} from '$lib/services/tracker-templates.service';
	import { TRACKER_COLUMN_TYPES } from '$lib/services/war-room-trackers.service';
	import TemplateEditorDialog from './template-editor-dialog.svelte';

	let templates = $state<TrackerTemplate[]>([]);
	let presets = $state<TrackerTemplatePreset[]>([]);
	let loading = $state(false);
	let selectedId = $state<number | null>(null);
	let editorOpen = $state(false);
	let editing = $state<TrackerTemplate | null>(null);
	let confirmOpen = $state(false);
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const selected = $derived(templates.find((t) => t.id === selectedId) ?? null);

	const sourceLabel = (value: string) =>
		TRACKER_TEMPLATE_SOURCES.find((s) => s.value === value)?.label ?? value;
	const columnTypeLabel = (value: string) =>
		TRACKER_COLUMN_TYPES.find((c) => c.value === value)?.label ?? value;

	const showError = (msg: string | null | undefined, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });

	const errorOf = (res: { data?: unknown; error?: { message?: string } }): string | undefined => {
		const data = res.data as { message?: string } | null | undefined;
		return (data && typeof data === 'object' ? data.message : undefined) ?? res.error?.message;
	};

	const sortByName = (items: TrackerTemplate[]) =>
		[...items].sort((a, b) => a.name.localeCompare(b.name));

	const loadList = async () => {
		loading = true;
		try {
			const res = await TrackerTemplatesService.list();
			if (res.ok && Array.isArray(res.data)) {
				templates = sortByName(res.data);
				if (selectedId === null || !templates.some((t) => t.id === selectedId)) {
					selectedId = templates[0]?.id ?? null;
				}
			} else {
				showError(errorOf(res), 'Failed to load the tracker templates');
			}
		} finally {
			loading = false;
		}
	};

	const loadPresets = async () => {
		const res = await TrackerTemplatesService.listPresets();
		if (res.ok && Array.isArray(res.data)) presets = res.data;
	};

	onMount(() => {
		void loadList();
		void loadPresets();
	});

	const upsert = (template: TrackerTemplate) => {
		templates = sortByName([...templates.filter((t) => t.id !== template.id), template]);
		selectedId = template.id;
	};

	const openAdd = () => {
		editing = null;
		editorOpen = true;
	};

	const openEdit = () => {
		if (!selected) return;
		editing = selected;
		editorOpen = true;
	};

	const remove = async () => {
		if (!selected) return;
		const target = selected;
		busy = true;
		try {
			const res = await TrackerTemplatesService.remove(target.id);
			if (!res.ok) {
				showError(errorOf(res), 'Unable to delete the template');
				return;
			}
			templates = templates.filter((t) => t.id !== target.id);
			selectedId = templates[0]?.id ?? null;
			toast({ title: `Template "${target.name}" deleted`, variant: 'success' });
		} finally {
			busy = false;
			confirmOpen = false;
		}
	};

	const fromPreset = async (preset: TrackerTemplatePreset) => {
		busy = true;
		try {
			const res = await TrackerTemplatesService.createFromPreset(preset.key);
			if (res.ok && res.data && typeof res.data === 'object') {
				upsert(res.data);
				toast({ title: `Template "${res.data.name}" created`, variant: 'success' });
			} else {
				showError(errorOf(res), 'Unable to create the template');
			}
		} finally {
			busy = false;
		}
	};

	const slug = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'template';

	const exportSelected = async () => {
		if (!selected) return;
		const target = selected;
		const res = await TrackerTemplatesService.exportTemplate(target.id);
		const body: TrackerTemplateExport =
			res.ok && res.data && typeof res.data === 'object'
				? res.data
				: { format: TRACKER_TEMPLATE_FORMAT, version: 1, ...trackerTemplateToExport(target) };
		const blob = new Blob([`${JSON.stringify(body, null, 2)}\n`], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `tracker-template-${slug(target.name)}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	};

	const importFile = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		let body: TrackerTemplateExport;
		try {
			body = parseTrackerTemplateJson(await file.text());
		} catch (e) {
			showError((e as Error).message, 'Invalid file');
			return;
		}
		busy = true;
		try {
			const res = await TrackerTemplatesService.importTemplate(body);
			if (res.ok && res.data && typeof res.data === 'object') {
				upsert(res.data);
				toast({ title: `Template "${res.data.name}" imported`, variant: 'success' });
			} else {
				showError(errorOf(res), 'Unable to import the template');
			}
		} finally {
			busy = false;
		}
	};
</script>

<svelte:head>
	<title>Tracker templates</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<ListChecksIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Tracker templates</h1>
				<p class="text-2xs text-muted-foreground">
					Steps and trackers a war room can apply from its scope. Steps are merged by name.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" onclick={loadList} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={() => fileInput?.click()}
				disabled={busy}
				data-testid="tracker-template-import"
			>
				<UploadIcon size={12} class="mr-1" />
				Import
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={importFile}
				aria-label="Import a template file"
			/>
			{#if presets.length}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline" size="sm" class="h-7" disabled={busy}>
								<LayersIcon size={12} class="mr-1" />
								Add preset
								<ChevronDownIcon size={12} />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-72">
						<DropdownMenu.Label>Create from a preset</DropdownMenu.Label>
						<DropdownMenu.Separator />
						{#each presets as preset (preset.key)}
							<DropdownMenu.Item onclick={() => fromPreset(preset)}>
								<div class="flex min-w-0 flex-col">
									<span class="text-xs font-medium">{preset.name}</span>
									{#if preset.description}
										<span class="truncate text-2xs text-muted-foreground">
											{preset.description}
										</span>
									{/if}
								</div>
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			<Button size="sm" class="h-7" onclick={openAdd} data-testid="tracker-template-add">
				<PlusIcon size={12} class="mr-1" />
				Add template
			</Button>
		</div>
	</header>

	<div class="flex flex-1 gap-3 overflow-hidden p-4">
		<section class="flex min-h-0 flex-1 basis-2/5 flex-col overflow-hidden rounded-md border">
			<div class="flex items-baseline gap-2 border-b bg-muted/30 px-3 py-2">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Templates
				</h2>
				<span class="text-2xs tabular-nums text-muted-foreground">{templates.length}</span>
			</div>
			<div class="flex-1 overflow-y-auto">
				{#if loading && templates.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(4) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if templates.length === 0}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">
						No tracker template yet. Add one, import a file or start from a preset.
					</p>
				{:else}
					<ul aria-label="Tracker templates" data-testid="tracker-templates-list">
						{#each templates as template (template.id)}
							{@const active = template.id === selectedId}
							<li
								class="border-b border-l-[3px] transition-colors {active
									? 'border-l-primary bg-primary/10'
									: 'border-l-transparent hover:bg-muted/40'}"
								data-testid="tracker-template-row"
							>
								<button
									type="button"
									class="flex w-full min-w-0 flex-col px-3 py-2 text-left"
									onclick={() => (selectedId = template.id)}
									aria-pressed={active}
								>
									<span class="truncate text-xs font-medium">{template.name}</span>
									<span class="truncate text-2xs text-muted-foreground">
										{template.steps.length}
										{template.steps.length === 1 ? 'step' : 'steps'} ·
										{template.trackers.length}
										{template.trackers.length === 1 ? 'tracker' : 'trackers'}
										{template.description ? ` · ${template.description}` : ''}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<section class="flex min-h-0 flex-1 basis-3/5 flex-col overflow-hidden rounded-md border">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Details
					</h2>
					{#if selected}
						<span class="text-2xs text-muted-foreground">{selected.name}</span>
					{/if}
				</div>
				{#if selected}
					<div class="flex items-center gap-1.5">
						<Button variant="outline" size="sm" class="h-7" onclick={exportSelected}>
							<DownloadIcon size={12} class="mr-1" />
							Export
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							onclick={openEdit}
							data-testid="tracker-template-edit"
						>
							<PencilIcon size={12} class="mr-1" />
							Edit
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={() => (confirmOpen = true)}
							disabled={busy}
							data-testid="tracker-template-delete"
						>
							<Trash2Icon size={12} class="mr-1" />
							Delete
						</Button>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto p-4">
				{#if !selected}
					<p class="py-6 text-center text-xs text-muted-foreground">Select a template.</p>
				{:else}
					<div class="flex flex-col gap-5">
						{#if selected.description}
							<p class="text-xs text-muted-foreground">{selected.description}</p>
						{/if}

						<div class="flex flex-col gap-1.5">
							<h3 class="text-2xs uppercase tracking-wide text-muted-foreground">Steps</h3>
							{#if selected.steps.length}
								<div class="flex flex-wrap gap-1.5">
									{#each selected.steps as step (step.name)}
										<TrackerStepChip {step} title={step.description ?? undefined} />
									{/each}
								</div>
							{:else}
								<p class="text-2xs text-muted-foreground">No step.</p>
							{/if}
						</div>

						<div class="flex flex-col gap-2">
							<h3 class="text-2xs uppercase tracking-wide text-muted-foreground">Trackers</h3>
							{#if selected.trackers.length === 0}
								<p class="text-2xs text-muted-foreground">No tracker.</p>
							{/if}
							{#each selected.trackers as tracker, i (i)}
								{@const Icon = getTrackerIcon(tracker.icon)}
								<div class="rounded-md border p-3">
									<div class="flex items-center gap-2">
										<Icon class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
										<span class="text-xs font-medium">{tracker.name}</span>
										<span class="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
											{sourceLabel(tracker.source)}
										</span>
										{#if tracker.show_asset_flags}
											<span class="text-2xs text-muted-foreground">· asset flags</span>
										{/if}
									</div>
									{#if tracker.description}
										<p class="mt-1 text-2xs text-muted-foreground">{tracker.description}</p>
									{/if}
									<p class="mt-2 text-2xs text-muted-foreground">
										Steps:
										{tracker.step_names === null
											? 'every step of the war room'
											: tracker.step_names.join(', ') || 'none'}
									</p>
									{#if tracker.columns.length}
										<p class="mt-1 text-2xs text-muted-foreground">
											Columns:
											{tracker.columns
												.map((c) => `${c.label} (${columnTypeLabel(c.type)})`)
												.join(', ')}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>

<TemplateEditorDialog bind:open={editorOpen} {editing} onSaved={upsert} />

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete the template?"
	message={selected
		? `"${selected.name}" will no longer be offered to war rooms. Trackers already created from it are kept.`
		: ''}
	confirmText="Delete"
	onConfirm={remove}
/>
