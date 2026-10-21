<!--
  AI workflows: searchable list with trigger, active toggle, owner, version and
  last-24h run counts; new / import / edit / export / publish / delete / run
  / share / move to category actions, the category column (drop a row on a
  category to move it), the workflow library and the JSON authoring guide. The editor
  lives at `./[id]` (`./new` to create), runs at `./runs`. A workflow shared
  with one of the user's groups can be viewed and run (`can_edit` false), or
  edited too (`can_manage` false: its owner alone activates, shares, files,
  exports, publishes or deletes it).
-->
<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		BookOpenIcon,
		BookUpIcon,
		DownloadIcon,
		FolderIcon,
		LibraryIcon,
		ListIcon,
		PencilIcon,
		PlayIcon,
		PlusIcon,
		RefreshCwIcon,
		SearchIcon,
		Trash2Icon,
		UploadIcon,
		UsersIcon,
		WorkflowIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import CategoryMoveMenu from '$lib/components/common/categories/CategoryMoveMenu.svelte';
	import CategorySidebar, {
		CATEGORY_DRAG_TYPE
	} from '$lib/components/common/categories/CategorySidebar.svelte';
	import { CategoryState } from '$lib/components/common/categories/category-state.svelte';
	import { categoryMatches, countByCategory } from '$lib/services/categories.service';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import {
		AiWorkflowsService,
		aiListData,
		aiWorkflowTriggers,
		type AiImportResult,
		type AiRunSummary,
		type AiWorkflow,
		type AiWorkflowSummary
	} from '$lib/services/ai-workflows.service';
	import FeatureGate from './components/FeatureGate.svelte';
	import RunDialog from './components/RunDialog.svelte';
	import AuthoringGuideDialog from './components/AuthoringGuideDialog.svelte';
	import LibraryDialog from './components/LibraryDialog.svelte';
	import PublishDialog from './components/PublishDialog.svelte';
	import ShareDialog from './components/ShareDialog.svelte';
	import {
		describeApiError,
		describeWarnings,
		downloadJson,
		exportFilename,
		pickJsonFile,
		RUN_STATUS_TONES,
		TRIGGER_LABELS,
		triggerDetail,
		userLabel,
		workflowMatchesSearch
	} from './helpers/ui';

	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('ai_workflows_write') ?? false);

	let workflows = $state<AiWorkflowSummary[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let toggling = $state<Record<number, boolean>>({});

	let pendingDelete = $state<AiWorkflowSummary | null>(null);
	let confirmDeleteOpen = $state(false);

	let runTarget = $state<AiWorkflowSummary | null>(null);
	let runOpen = $state(false);
	let guideOpen = $state(false);
	let libraryOpen = $state(false);
	let publishTarget = $state<AiWorkflowSummary | null>(null);
	let publishOpen = $state(false);
	let shareTarget = $state<AiWorkflowSummary | null>(null);
	let shareOpen = $state(false);
	let importing = $state(false);

	/** Write permission on a workflow the user owns, administers or may edit. */
	const canEdit = (workflow: AiWorkflowSummary) => canWrite && workflow.can_edit !== false;
	/** Write permission on a workflow the user owns (or administers). */
	const canManage = (workflow: AiWorkflowSummary) =>
		canEdit(workflow) && workflow.can_manage !== false;

	function onShared(updated: AiWorkflow) {
		workflows = workflows.map((w) =>
			w.id === updated.id
				? {
						...w,
						shared_group_ids: updated.shared_group_ids,
						shared_edit_group_ids: updated.shared_edit_group_ids,
						shared_groups: updated.shared_groups
					}
				: w
		);
	}

	let search = $state('');

	const categories = new CategoryState('ai-workflows');
	const searched = $derived(workflows.filter((w) => workflowMatchesSearch(w, search)));
	// Category counts follow the search, not the category, like war rooms.
	const categoryCounts = $derived(countByCategory(searched, categories.categories));
	const shown = $derived(
		searched.filter((w) => categoryMatches(categories.filter, w.category_id, categories.categories))
	);

	async function moveWorkflow(workflowId: number, categoryId: number | null) {
		const workflow = workflows.find((w) => w.id === workflowId);
		if (!workflow || (workflow.category_id ?? null) === categoryId) return;
		const res = await AiWorkflowsService.setCategory(workflowId, categoryId);
		if (!res.ok) {
			toast({
				title: 'Could not move the workflow',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		workflows = workflows.map((w) => (w.id === workflowId ? { ...w, category_id: categoryId } : w));
		const target = categories.name(categoryId);
		toast({
			title: target ? `Moved “${workflow.name}” to ${target}` : `“${workflow.name}” uncategorised`,
			variant: 'success'
		});
	}

	function dragWorkflow(workflow: AiWorkflowSummary, e: DragEvent) {
		if (!canManage(workflow) || !e.dataTransfer) return;
		e.dataTransfer.setData(CATEGORY_DRAG_TYPE, String(workflow.id));
		e.dataTransfer.effectAllowed = 'move';
	}

	async function importWorkflow() {
		let picked;
		try {
			picked = await pickJsonFile();
		} catch (e) {
			toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
			return;
		}
		if (!picked) return;
		importing = true;
		const res = await AiWorkflowsService.importWorkflow(picked.data);
		importing = false;
		if (!res.ok) {
			toast({
				title: 'Import failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const result = res.data as AiImportResult<AiWorkflow>;
		const created = result.workflow;
		const warnings = describeWarnings(result.warnings);
		toast({
			title: `Workflow “${created?.name ?? picked.name}” imported (inactive)`,
			description: warnings || 'Review it, then activate it.',
			variant: warnings ? 'warning' : 'success'
		});
		if (created) goto(`/settings/ai-workflows/${created.id}`);
		else load();
	}

	function onLibraryAdded(created: AiWorkflow | undefined, name: string, warnings: string) {
		toast({
			title: `Workflow “${name}” added (inactive)`,
			description: warnings || 'Review it, then activate it.',
			variant: warnings ? 'warning' : 'success'
		});
		if (created) goto(`/settings/ai-workflows/${created.id}`);
		else load();
	}

	async function exportWorkflow(workflow: AiWorkflowSummary) {
		const res = await AiWorkflowsService.exportWorkflow(workflow.id);
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		downloadJson(exportFilename(workflow.name, 'workflow'), res.data);
	}

	async function load() {
		loading = true;
		loadError = null;
		const res = await AiWorkflowsService.list();
		loading = false;
		if (!res.ok) {
			loadError = res.error?.message ?? describeApiError(res.data, 'Failed to load the workflows');
			return;
		}
		workflows = aiListData<AiWorkflowSummary>(res.data).sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	}

	// Not onMount: on a hard load the runtime config may still be in
	// flight, and the page would never load once it turns the feature on.
	let started = false;
	$effect(() => {
		if (started || !runtimeConfig.aiWorkflowsEnabled) return;
		started = true;
		untrack(() => {
			load();
			categories.load();
		});
	});

	async function toggleActive(workflow: AiWorkflowSummary, value: boolean) {
		toggling[workflow.id] = true;
		const res = await AiWorkflowsService.update(workflow.id, { is_active: value });
		toggling[workflow.id] = false;
		if (!res.ok) {
			toast({
				title: value ? 'Could not activate the workflow' : 'Could not deactivate the workflow',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		workflows = workflows.map((w) => (w.id === workflow.id ? { ...w, is_active: value } : w));
	}

	async function remove() {
		const target = pendingDelete;
		if (!target) return;
		const res = await AiWorkflowsService.remove(target.id);
		pendingDelete = null;
		if (!res.ok) {
			toast({
				title: 'Delete failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		workflows = workflows.filter((w) => w.id !== target.id);
		toast({ title: 'Workflow deleted', description: target.name, variant: 'success' });
	}

	function openRun(workflow: AiWorkflowSummary) {
		runTarget = workflow;
		runOpen = true;
	}

	const COUNT_ORDER = [
		'succeeded',
		'failed',
		'running',
		'waiting',
		'cancelled',
		'skipped'
	] as const;

	function onRunStarted(run: AiRunSummary) {
		goto(`/settings/ai-workflows/runs/${run.uuid}`);
	}
</script>

<svelte:head>
	<title>Workflows</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<WorkflowIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Workflows</h1>
				<p class="text-xs text-muted-foreground">
					Graphs of AI agents, HTTP calls, conditions and analyst questions, fired by events, a
					schedule, a webhook or by hand.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" href="/settings/ai-workflows/runs">
				<ListIcon size={12} class="mr-1" /> Runs
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="h-7"
				onclick={() => (guideOpen = true)}
				title="How to write workflows as JSON (for people and LLMs)"
				data-testid="wf-guide"
			>
				<BookOpenIcon size={12} class="mr-1" /> JSON guide
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={() => (libraryOpen = true)}
				title="Workflows shipped with IRIS, ready to add and adapt"
				data-testid="wf-library"
			>
				<LibraryIcon size={12} class="mr-1" /> Library
			</Button>
			<Button variant="outline" size="sm" class="h-7" onclick={load} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			{#if canWrite}
				<Button
					variant="outline"
					size="sm"
					class="h-7"
					onclick={importWorkflow}
					disabled={importing}
					title="Create a workflow from a JSON document"
					data-testid="wf-import"
				>
					<UploadIcon size={12} class="mr-1" />
					{importing ? 'Importing…' : 'Import'}
				</Button>
				<Button size="sm" class="h-7" href="/settings/ai-workflows/new" data-testid="wf-new">
					<PlusIcon size={12} class="mr-1" /> New workflow
				</Button>
			{/if}
		</div>
	</header>

	<div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
		<FeatureGate>
			{#if loadError}
				<ApiError error={loadError} onRetry={load} />
			{/if}

			{#if loading && workflows.length === 0}
				<p class="py-10 text-center text-xs text-muted-foreground">Loading…</p>
			{:else if workflows.length === 0 && !loadError}
				<div
					class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
					data-testid="wf-empty"
				>
					<WorkflowIcon size={32} class="opacity-40" />
					<p class="text-sm">No workflows yet.</p>
					<p class="max-w-md text-xs">
						Triage new alerts, enrich cases from external tools, or ask an analyst before acting.
					</p>
					{#if canWrite}
						<div class="mt-2 flex gap-1.5">
							<Button variant="outline" size="sm" class="h-7" onclick={() => (libraryOpen = true)}>
								<LibraryIcon size={12} class="mr-1" /> Start from the library
							</Button>
							<Button size="sm" class="h-7" href="/settings/ai-workflows/new">
								<PlusIcon size={12} class="mr-1" /> Create a workflow
							</Button>
						</div>
					{/if}
				</div>
			{:else if workflows.length > 0}
				<div class="flex gap-5">
					<aside class="w-48 shrink-0" data-testid="wf-categories">
						<CategorySidebar
							store={categories}
							total={searched.length}
							counts={categoryCounts}
							canManage={canWrite}
							itemLabel="workflows"
							onDropItem={canWrite ? moveWorkflow : undefined}
						/>
					</aside>
					<div class="min-w-0 flex-1 space-y-3">
						<div class="relative max-w-sm">
							<SearchIcon
								size={12}
								class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								type="search"
								placeholder="Search by name, description, owner, trigger…"
								class="h-7 pl-7 pr-7 text-xs"
								bind:value={search}
								aria-label="Search workflows"
								data-testid="wf-search"
							/>
							{#if search}
								<button
									type="button"
									aria-label="Clear search"
									class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									onclick={() => (search = '')}
								>
									<XIcon size={11} />
								</button>
							{/if}
						</div>
						{#if shown.length === 0 && search.trim()}
							<p
								class="py-10 text-center text-xs text-muted-foreground"
								data-testid="wf-search-empty"
							>
								No workflow matches <span class="font-mono">{search.trim()}</span>.
							</p>
						{:else if shown.length === 0}
							<p
								class="py-10 text-center text-xs text-muted-foreground"
								data-testid="wf-category-empty"
							>
								No workflow in this category.
							</p>
						{:else}
							<div class="overflow-hidden rounded-md border">
								<table class="w-full text-xs" data-testid="wf-table">
									<thead
										class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
									>
										<tr>
											<th class="w-16 px-3 py-2">Active</th>
											<th class="px-3 py-2">Name</th>
											<th class="w-48 px-3 py-2">Trigger</th>
											<th class="w-40 px-3 py-2">Owner</th>
											<th class="w-16 px-3 py-2">Version</th>
											<th class="w-48 px-3 py-2" title="Runs started in the last 24 hours"
												>24h runs</th
											>
											<th class="w-36 px-3 py-2"></th>
										</tr>
									</thead>
									<tbody>
										{#each shown as workflow (workflow.id)}
											{@const counts = workflow.run_counts_24h ?? {}}
											{@const categoryName =
												categories.filter === 'all' ? categories.name(workflow.category_id) : null}
											<tr
												class="border-t hover:bg-muted/20"
												data-testid={`wf-row-${workflow.id}`}
												draggable={canManage(workflow)}
												ondragstart={(e) => dragWorkflow(workflow, e)}
											>
												<td class="px-3 py-2">
													<Switch
														checked={workflow.is_active}
														disabled={!canManage(workflow) || toggling[workflow.id]}
														onCheckedChange={(v: boolean) => toggleActive(workflow, v)}
														aria-label={`Activate ${workflow.name}`}
													/>
												</td>
												<td class="max-w-0 px-3 py-2">
													<a
														class="block max-w-full truncate font-medium underline-offset-2 hover:underline"
														href={`/settings/ai-workflows/${workflow.id}`}
													>
														{workflow.name}
													</a>
													{#if workflow.description}
														<div class="truncate text-2xs text-muted-foreground">
															{workflow.description}
														</div>
													{/if}
													{#if categoryName}
														<div
															class="flex items-center gap-1 truncate text-2xs text-muted-foreground"
															title={`Category: ${categoryName}`}
														>
															<FolderIcon size={10} class="shrink-0" />{categoryName}
														</div>
													{/if}
												</td>
												<td class="max-w-0 px-3 py-2">
													<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
														{#each aiWorkflowTriggers(workflow) as trigger, i (i)}
															{@const detail = triggerDetail(trigger.type, trigger.config)}
															<span class="flex min-w-0 items-center">
																<span class="rounded bg-muted px-1.5 py-0.5 text-2xs">
																	{TRIGGER_LABELS[trigger.type] ?? trigger.type}
																</span>
																{#if detail}
																	<span
																		class="ml-1 truncate font-mono text-2xs text-muted-foreground"
																		title={detail}
																	>
																		{detail}
																	</span>
																{/if}
															</span>
														{/each}
													</div>
													{#if workflow.last_fired_at}
														<div class="text-2xs text-muted-foreground">
															Last fired {formatDateTime(workflow.last_fired_at)}
														</div>
													{/if}
												</td>
												<td class="max-w-0 px-3 py-2">
													<div class="truncate">{userLabel(workflow.owner)}</div>
													{#if workflow.shared_groups?.length}
														{@const groupNames = workflow.shared_groups
															.map(
																(g) =>
																	`${g.name ?? `#${g.id}`}${workflow.shared_edit_group_ids?.includes(g.id) ? ' (edit)' : ''}`
															)
															.join(', ')}
														<div
															class="flex items-center gap-1 truncate text-2xs text-muted-foreground"
															title={`Shared with ${groupNames}`}
															data-testid={`wf-shared-${workflow.id}`}
														>
															<UsersIcon size={10} class="shrink-0" />{groupNames}
														</div>
													{/if}
												</td>
												<td class="px-3 py-2 font-mono">v{workflow.version}</td>
												<td class="px-3 py-2">
													<a
														class="flex flex-wrap gap-1"
														href={`/settings/ai-workflows/runs?workflow_id=${workflow.id}`}
														title="Open the runs of this workflow"
													>
														{#each COUNT_ORDER as status (status)}
															{#if counts[status]}
																<span class={`rounded px-1 text-2xs ${RUN_STATUS_TONES[status]}`}>
																	{counts[status]}
																	{status}
																</span>
															{/if}
														{/each}
														{#if !COUNT_ORDER.some((s) => counts[s])}
															<span class="text-muted-foreground">—</span>
														{/if}
													</a>
													{#if workflow.skipped_count}
														<div
															class="mt-0.5 text-2xs text-muted-foreground"
															title={workflow.last_skipped_at
																? `Last skipped ${formatDateTime(workflow.last_skipped_at)}`
																: undefined}
															data-testid={`wf-skipped-${workflow.id}`}
														>
															{workflow.skipped_count} skipped{workflow.last_skip_reason
																? ` (last: ${workflow.last_skip_reason})`
																: ''}
														</div>
													{/if}
												</td>
												<td class="px-3 py-2">
													<div class="flex justify-end gap-1">
														{#if canWrite}
															<Button
																variant="ghost"
																size="icon"
																class="h-7 w-7"
																title="Run"
																aria-label={`Run ${workflow.name}`}
																onclick={() => openRun(workflow)}
															>
																<PlayIcon size={13} />
															</Button>
														{/if}
														<Button
															variant="ghost"
															size="icon"
															class="h-7 w-7"
															title={canEdit(workflow) ? 'Edit' : 'View'}
															href={`/settings/ai-workflows/${workflow.id}`}
														>
															<PencilIcon size={13} />
														</Button>
														{#if workflow.can_manage !== false && workflow.can_edit !== false}
															<Button
																variant="ghost"
																size="icon"
																class="h-7 w-7"
																title="Export (JSON, without secrets)"
																aria-label={`Export ${workflow.name}`}
																onclick={() => exportWorkflow(workflow)}
															>
																<DownloadIcon size={13} />
															</Button>
														{/if}
														{#if canManage(workflow)}
															<Button
																variant="ghost"
																size="icon"
																class="h-7 w-7"
																title="Share with groups"
																aria-label={`Share ${workflow.name}`}
																onclick={() => {
																	shareTarget = workflow;
																	shareOpen = true;
																}}
																data-testid={`wf-share-${workflow.id}`}
															>
																<UsersIcon size={13} />
															</Button>
															<CategoryMoveMenu
																categories={categories.categories}
																value={workflow.category_id}
																itemName={workflow.name}
																onSelect={(id) => moveWorkflow(workflow.id, id)}
																triggerClass="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
															/>
															<Button
																variant="ghost"
																size="icon"
																class="h-7 w-7"
																title="Publish to the library"
																aria-label={`Publish ${workflow.name} to the library`}
																onclick={() => {
																	publishTarget = workflow;
																	publishOpen = true;
																}}
																data-testid={`wf-publish-${workflow.id}`}
															>
																<BookUpIcon size={13} />
															</Button>
															<Button
																variant="ghost"
																size="icon"
																class="h-7 w-7 text-muted-foreground hover:text-destructive"
																title="Delete"
																aria-label={`Delete ${workflow.name}`}
																onclick={() => {
																	pendingDelete = workflow;
																	confirmDeleteOpen = true;
																}}
															>
																<Trash2Icon size={13} />
															</Button>
														{/if}
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmDeleteOpen}
	title="Delete this workflow?"
	message={`“${pendingDelete?.name ?? ''}” is deleted and its active runs are cancelled. The run history is kept.`}
	confirmText="Delete"
	onConfirm={remove}
/>

{#if runTarget}
	<RunDialog
		bind:open={runOpen}
		workflowId={runTarget.id}
		workflowName={runTarget.name}
		triggers={aiWorkflowTriggers(runTarget)}
		onStarted={onRunStarted}
	/>
{/if}

<AuthoringGuideDialog bind:open={guideOpen} />
<LibraryDialog bind:open={libraryOpen} {canWrite} onAdded={onLibraryAdded} />
{#if publishTarget}
	<PublishDialog
		bind:open={publishOpen}
		workflowId={publishTarget.id}
		workflowName={publishTarget.name}
		workflowDescription={publishTarget.description}
	/>
{/if}
{#if shareTarget}
	<ShareDialog
		bind:open={shareOpen}
		workflowId={shareTarget.id}
		workflowName={shareTarget.name}
		groupIds={shareTarget.shared_group_ids ?? []}
		editGroupIds={shareTarget.shared_edit_group_ids ?? []}
		{onShared}
	/>
{/if}
