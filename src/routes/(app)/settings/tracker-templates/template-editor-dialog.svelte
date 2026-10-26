<!--
  Create / edit a tracker template: name, description, the steps it
  brings (name, colour, icon) and its trackers (source, offered steps by
  name, extra columns, asset flags column, timeline settings, the
  war-room board widgets it comes with). Board widgets are set up on a
  war room's board and saved with it as a template: here they can only
  be removed.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronDown, ChevronUp, Palette, Plus, Trash2, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import FlagColorPicker from '$lib/components/common/assets/FlagColorPicker.svelte';
	import FlagIconPicker from '$lib/components/common/assets/FlagIconPicker.svelte';
	import TrackerColumnsEditor from '$lib/components/common/trackers/TrackerColumnsEditor.svelte';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import TrackerTimelineEditor from '$lib/components/common/trackers/TrackerTimelineEditor.svelte';
	import { TRACKER_ICONS } from '$lib/components/common/trackers/tracker-icon';
	import {
		TRACKER_TEMPLATE_SOURCES,
		TrackerTemplatesService,
		trackerTemplateToExport,
		type TrackerTemplate,
		type TrackerTemplateInput,
		type TrackerTemplateBoardWidget,
		type TrackerTemplateStep,
		type TrackerTemplateTracker
	} from '$lib/services/tracker-templates.service';
	import { normalizeTrackerTimelineSync } from '$lib/services/war-room-trackers.service';

	type Props = {
		open: boolean;
		/** null = create. */
		editing: TrackerTemplate | null;
		onSaved: (template: TrackerTemplate) => void;
	};

	let { open = $bindable(), editing, onSaved }: Props = $props();

	let name = $state('');
	let description = $state('');
	let steps = $state<TrackerTemplateStep[]>([]);
	let trackers = $state<TrackerTemplateTracker[]>([]);
	let styling = $state<number | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			const copy = editing
				? trackerTemplateToExport(editing)
				: ({ name: '', description: null, steps: [], trackers: [] } as TrackerTemplateInput);
			name = copy.name;
			description = copy.description ?? '';
			steps = copy.steps.map((s) => ({ ...s }));
			trackers = copy.trackers.map((t) => ({
				...t,
				step_names: t.step_names ? [...t.step_names] : null,
				board_widgets: t.board_widgets ?? [],
				columns: t.columns.map((c) => ({ ...c, options: c.options ? [...c.options] : undefined }))
			}));
			styling = null;
			error = null;
			busy = false;
		});
	});

	function moveIn<T>(list: T[], from: number, to: number): T[] {
		if (to < 0 || to >= list.length) return list;
		const next = [...list];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		return next;
	}

	const addStep = () => {
		steps = [
			...steps,
			{ name: `Step ${steps.length + 1}`, color: 'slate', icon: null, description: null }
		];
		styling = steps.length - 1;
	};

	const removeStep = (index: number) => {
		const gone = steps[index].name;
		steps = steps.filter((_, i) => i !== index);
		trackers = trackers.map((t) => ({
			...t,
			step_names: t.step_names ? t.step_names.filter((n) => n !== gone) : null,
			board_widgets: renameWidgetSteps(t.board_widgets, (n) => (n === gone ? null : n))
		}));
		styling = null;
	};

	const renameStep = (index: number, value: string) => {
		const old = steps[index].name;
		steps[index].name = value;
		const rename = (n: string) => (n === old ? value : n);
		trackers = trackers.map((t) => ({
			...t,
			step_names: t.step_names ? t.step_names.map(rename) : null,
			board_widgets: renameWidgetSteps(t.board_widgets, rename)
		}));
	};

	const addTracker = () => {
		trackers = [
			...trackers,
			{
				name: `Tracker ${trackers.length + 1}`,
				icon: 'list-checks',
				description: null,
				source: 'manual',
				step_names: null,
				columns: [],
				show_asset_flags: false,
				timeline_sync: null,
				board_widgets: []
			}
		];
	};

	const toggleTrackerStep = (t: TrackerTemplateTracker, stepName: string) => {
		const current = t.step_names ?? steps.map((s) => s.name);
		t.step_names = current.includes(stepName)
			? current.filter((n) => n !== stepName)
			: [...current, stepName];
	};

	const WIDGET_LABELS: Record<TrackerTemplateBoardWidget['type'], string> = {
		tracker_count: 'Tracker count',
		tracker_progress: 'Tracker progress',
		tracker_list: 'Tracker rows',
		tracker_breakdown: 'Tracker breakdown'
	};

	/** Rename the steps of board widgets; a null name drops the step. */
	const renameWidgetSteps = (
		widgets: TrackerTemplateBoardWidget[] | undefined,
		rename: (n: string) => string | null
	): TrackerTemplateBoardWidget[] =>
		(widgets ?? []).map((w) => ({
			...w,
			config: {
				...w.config,
				step_names:
					w.config.step_names === null ? null : w.config.step_names.flatMap((n) => rename(n) ?? [])
			}
		}));

	/**
	 * The widgets that still fit the tracker's columns: a breakdown whose
	 * column is gone is dropped, a filter on a gone column is cleared.
	 */
	const fittingWidgets = (t: TrackerTemplateTracker): TrackerTemplateBoardWidget[] => {
		const keys = new Set(t.columns.map((c) => c.key));
		return (t.board_widgets ?? [])
			.filter((w) => w.type !== 'tracker_breakdown' || keys.has(w.config.column_key ?? ''))
			.map((w) =>
				w.config.filter && !keys.has(w.config.filter.column_key)
					? { ...w, config: { ...w.config, filter: null } }
					: w
			);
	};

	const removeWidget = (t: TrackerTemplateTracker, index: number) => {
		t.board_widgets = (t.board_widgets ?? []).filter((_, i) => i !== index);
	};

	const widgetSteps = (w: TrackerTemplateBoardWidget): string => {
		const names = w.config.step_names;
		if (names === null) return 'every step';
		if (!names.length) return 'every row';
		return names.join(', ');
	};

	const validate = (): string | null => {
		if (!name.trim()) return 'Name is required';
		const names = steps.map((s) => s.name.trim());
		if (names.some((n) => !n)) return 'Every step needs a name';
		if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
			return 'Two steps have the same name';
		}
		if (trackers.some((t) => !t.name.trim())) return 'Every tracker needs a name';
		if (trackers.some((t) => t.columns.some((c) => !c.label.trim()))) {
			return 'Every column needs a label';
		}
		return null;
	};

	const submit = async () => {
		const problem = validate();
		if (problem) {
			error = problem;
			return;
		}
		const body: TrackerTemplateInput = {
			name: name.trim(),
			description: description.trim() || null,
			steps: steps.map((s) => ({ ...s, name: s.name.trim() })),
			trackers: trackers.map((t) => {
				const columns = t.columns.map((c) => ({ ...c, label: c.label.trim() }));
				return {
					...t,
					name: t.name.trim(),
					step_names: t.step_names ? t.step_names.map((n) => n.trim()) : null,
					columns,
					show_asset_flags: (t.source === 'assets' || t.source === 'manual') && t.show_asset_flags,
					timeline_sync: normalizeTrackerTimelineSync(t.timeline_sync ?? null, columns),
					board_widgets: renameWidgetSteps(fittingWidgets(t), (n) => n.trim())
				};
			})
		};
		busy = true;
		error = null;
		try {
			const res = editing
				? await TrackerTemplatesService.update(editing.id, body)
				: await TrackerTemplatesService.create(body);
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				const data = res.data as { message?: string } | null;
				error =
					(data && typeof data === 'object' ? data.message : undefined) ??
					res.error?.message ??
					'Unable to save the template';
				return;
			}
			toast({
				title: editing ? 'Template saved' : `Template "${res.data.name}" created`,
				variant: 'success'
			});
			open = false;
			onSaved(res.data);
		} finally {
			busy = false;
		}
	};

	const LABEL = 'text-2xs uppercase tracking-wide text-muted-foreground';
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>{editing ? `Edit ${editing.name}` : 'New tracker template'}</Dialog.Title>
			<Dialog.Description>
				Steps and trackers created in a war room when the template is applied.
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
			data-testid="tracker-template-form"
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label for="tt-name" class={LABEL}>Name *</label>
					<Input id="tt-name" bind:value={name} maxlength={128} disabled={busy} />
				</div>
				<div class="flex flex-col gap-1">
					<label for="tt-description" class={LABEL}>Description</label>
					<Textarea id="tt-description" rows={1} bind:value={description} disabled={busy} />
				</div>
			</div>

			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<h3 class={LABEL}>Steps</h3>
					<Button
						variant="outline"
						size="sm"
						class="h-7 gap-1 text-xs"
						onclick={addStep}
						disabled={busy}
					>
						<Plus class="h-3.5 w-3.5" /> Add step
					</Button>
				</div>
				{#if steps.length === 0}
					<p class="text-2xs text-muted-foreground">No step.</p>
				{/if}
				{#each steps as s, i (i)}
					<div class="rounded-md border p-2" data-testid="tracker-template-step">
						<div class="flex items-center gap-2">
							<TrackerStepChip step={s} />
							<Input
								class="h-7 flex-1 text-xs"
								value={s.name}
								oninput={(e) => renameStep(i, (e.currentTarget as HTMLInputElement).value)}
								maxlength={64}
								aria-label="Step name"
								disabled={busy}
							/>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7"
								aria-label="Colour and icon"
								aria-expanded={styling === i}
								onclick={() => (styling = styling === i ? null : i)}
							>
								<Palette class="h-3.5 w-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7"
								aria-label="Move up"
								disabled={busy || i === 0}
								onclick={() => (steps = moveIn(steps, i, i - 1))}
							>
								<ChevronUp class="h-3.5 w-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7"
								aria-label="Move down"
								disabled={busy || i === steps.length - 1}
								onclick={() => (steps = moveIn(steps, i, i + 1))}
							>
								<ChevronDown class="h-3.5 w-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7 text-destructive hover:text-destructive"
								aria-label="Remove the step"
								disabled={busy}
								onclick={() => removeStep(i)}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</div>
						{#if styling === i}
							<div class="mt-2 flex flex-col gap-2 pl-1">
								<FlagColorPicker bind:value={s.color} disabled={busy} />
								<FlagIconPicker
									bind:value={() => s.icon ?? '', (v) => (s.icon = v || null)}
									color={s.color}
									icons={TRACKER_ICONS}
									disabled={busy}
								/>
								<Input
									class="h-7 text-xs"
									placeholder="Description"
									value={s.description ?? ''}
									oninput={(e) =>
										(s.description = (e.currentTarget as HTMLInputElement).value || null)}
									disabled={busy}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</section>

			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<h3 class={LABEL}>Trackers</h3>
					<Button
						variant="outline"
						size="sm"
						class="h-7 gap-1 text-xs"
						onclick={addTracker}
						disabled={busy}
					>
						<Plus class="h-3.5 w-3.5" /> Add tracker
					</Button>
				</div>
				{#if trackers.length === 0}
					<p class="text-2xs text-muted-foreground">No tracker: only the steps are added.</p>
				{/if}
				{#each trackers as t, i (i)}
					<div
						class="flex flex-col gap-3 rounded-md border p-3"
						data-testid="tracker-template-tracker"
					>
						<div class="flex flex-wrap items-end gap-2">
							<div class="flex min-w-48 flex-1 flex-col gap-1">
								<label for={`tt-tracker-${i}`} class={LABEL}>Name *</label>
								<Input
									id={`tt-tracker-${i}`}
									class="h-8 text-xs"
									bind:value={t.name}
									maxlength={128}
									disabled={busy}
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label for={`tt-source-${i}`} class={LABEL}>Rows</label>
								<select
									id={`tt-source-${i}`}
									class="h-8 rounded-md border border-input bg-background px-2 text-xs"
									bind:value={t.source}
									disabled={busy}
								>
									{#each TRACKER_TEMPLATE_SOURCES as src (src.value)}
										<option value={src.value}>{src.label}</option>
									{/each}
								</select>
							</div>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8"
								aria-label="Move up"
								disabled={busy || i === 0}
								onclick={() => (trackers = moveIn(trackers, i, i - 1))}
							>
								<ChevronUp class="h-3.5 w-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8"
								aria-label="Move down"
								disabled={busy || i === trackers.length - 1}
								onclick={() => (trackers = moveIn(trackers, i, i + 1))}
							>
								<ChevronDown class="h-3.5 w-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 text-destructive hover:text-destructive"
								aria-label="Remove the tracker"
								disabled={busy}
								onclick={() => (trackers = trackers.filter((_, x) => x !== i))}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</div>

						<div class="flex flex-col gap-1">
							<span class={LABEL}>Icon</span>
							<FlagIconPicker
								bind:value={() => t.icon ?? 'list-checks', (v) => (t.icon = v)}
								icons={TRACKER_ICONS}
								disabled={busy}
							/>
						</div>

						<div class="flex flex-col gap-1">
							<span class={LABEL}>Steps offered</span>
							<label class="flex items-center gap-2 text-xs">
								<input
									type="checkbox"
									class="h-3.5 w-3.5 accent-primary"
									checked={t.step_names === null}
									onchange={(e) =>
										(t.step_names = (e.currentTarget as HTMLInputElement).checked
											? null
											: steps.map((s) => s.name))}
									disabled={busy}
								/>
								Every step of the war room
							</label>
							{#if t.step_names !== null}
								<div class="flex flex-wrap gap-1.5 pl-6">
									{#each steps as s (s.name)}
										{@const on = t.step_names.includes(s.name)}
										<button
											type="button"
											role="checkbox"
											aria-checked={on}
											aria-label={s.name}
											onclick={() => toggleTrackerStep(t, s.name)}
											disabled={busy}
										>
											<TrackerStepChip step={s} muted={!on} />
										</button>
									{/each}
								</div>
							{/if}
						</div>

						{#if t.source === 'assets' || t.source === 'manual'}
							<label class="flex items-center gap-2 text-xs">
								<Switch bind:checked={t.show_asset_flags} disabled={busy} />
								Asset flags column
							</label>
						{/if}

						<div class="flex flex-col gap-1">
							<span class={LABEL}>Extra columns</span>
							<TrackerColumnsEditor
								bind:columns={t.columns}
								disabled={busy}
								idPrefix={`tt-col-${i}`}
							/>
						</div>

						{#if t.board_widgets?.length}
							<div class="flex flex-col gap-1">
								<span class={LABEL}>Board widgets</span>
								<ul class="divide-y rounded-md border" data-testid="template-board-widgets">
									{#each t.board_widgets as w, j (j)}
										<li class="flex items-center gap-2 px-2 py-1.5 text-xs">
											<span class="min-w-0 flex-1 truncate">
												<span class="font-medium">{w.title || WIDGET_LABELS[w.type]}</span>
												<span class="text-2xs text-muted-foreground">
													· {WIDGET_LABELS[w.type]} · {widgetSteps(w)}
												</span>
											</span>
											<button
												type="button"
												class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
												onclick={() => removeWidget(t, j)}
												disabled={busy}
												aria-label={`Remove the ${w.title || WIDGET_LABELS[w.type]} widget`}
											>
												<X class="h-3.5 w-3.5" />
											</button>
										</li>
									{/each}
								</ul>
								<span class="text-2xs text-muted-foreground">
									Added to the war-room board with the tracker. Set them up on a war room's board,
									then save the war room as a template.
								</span>
							</div>
						{/if}

						<div class="flex flex-col gap-1">
							<span class={LABEL}>Timelines</span>
							<TrackerTimelineEditor
								bind:value={() => t.timeline_sync ?? null, (v) => (t.timeline_sync = v)}
								columns={t.columns}
								disabled={busy}
								idPrefix={`tt-timeline-${i}`}
							/>
						</div>
					</div>
				{/each}
			</section>

			{#if error}
				<p class="text-2xs text-destructive" role="alert">{error}</p>
			{/if}
			<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
		</form>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={busy} data-testid="tracker-template-save">
				{busy ? 'Saving…' : editing ? 'Save' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
