<!--
  One AI workflow suggestion, as a compact row: kind, title, severity,
  a one-line preview, the entity and the Accept / Dismiss / Answer
  controls (a dry-run one can only be cleared). In the inbox
  (`showEntity`) the workflow, entity, age and controls are fixed-width
  columns, so the rows line up, and the unfolded body takes the card's
  full width. Clicking the row unfolds the rest: the full rationale, the
  related objects, what it would run, the run trace ("Why?") and how it
  was resolved.

  A suggestion proposes one action or a bundle of them, each shown as
  readable `field → value` rows (raw tool call behind a toggle). A bundle
  is a checklist: accept all of it or only the ticked actions. Accepting
  runs them as the current analyst, so the confirm dialog lists exactly
  what will run first.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronRightIcon, CheckIcon, ExternalLinkIcon, WrenchIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import { cn } from '$lib/utils';
	import { current_user } from '$lib/stores/auth.store';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { AiSuggestionsService, type AiSuggestion } from '$lib/services/ai-suggestions.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import {
		AI_SUGGESTION_STATUS_LABELS,
		aiSuggestionAge,
		aiSuggestionConfidence,
		aiSuggestionKind,
		aiSuggestionPretty,
		aiSuggestionSeverityClass,
		aiSuggestionSnippet
	} from './ai-suggestion-format';
	import {
		AI_SUGGESTION_ENTITY_LABELS,
		aiSuggestionsEntityHref,
		aiSuggestionsRunHref
	} from '$lib/stores/ai-suggestions.store.svelte';
	import { aiSuggestionActions, aiSuggestionActionsSummary } from './ai-suggestion-actions';
	import AiSuggestionActionView from './AiSuggestionActionView.svelte';
	import AiSuggestionAnswerForm from './AiSuggestionAnswerForm.svelte';

	interface Props {
		suggestion: AiSuggestion;
		/** Called with the updated suggestion (or null to force a reload). */
		onChanged: (updated: AiSuggestion | null) => void;
		/** Inbox row: name the entity and workflow, in aligned columns (outside the entity's page). */
		showEntity?: boolean;
		/** Outline and unfold it (the one a link pointed at). */
		highlight?: boolean;
	}

	let { suggestion, onChanged, showEntity = false, highlight = false }: Props = $props();

	const kind = $derived(aiSuggestionKind(suggestion.kind));
	const confidence = $derived(aiSuggestionConfidence(suggestion.confidence));
	const isOpen = $derived(suggestion.status === 'open');
	const isInfoRequest = $derived(suggestion.kind === 'info_request');
	const actions = $derived(aiSuggestionActions(suggestion));
	const pendingActions = $derived(actions.filter((a) => a.status === 'pending'));
	const isBundle = $derived(actions.some((a) => a.bundled));
	const canAccept = $derived(
		isOpen && !isInfoRequest && suggestion.can_accept !== false && pendingActions.length > 0
	);
	// The link text is always the canonical `type #id`; the title is
	// LLM-provided, so it only shows as secondary text / tooltip.
	const refs = $derived(
		(Array.isArray(suggestion.related_refs) ? suggestion.related_refs : [])
			.map((r) => ({
				key: `${r?.type}:${r?.id}`,
				href: aiSuggestionsEntityHref(r?.type, r?.id),
				label: `${String(r?.type ?? '').replace(/_/g, ' ')} #${r?.id}`,
				title: typeof r?.title === 'string' && r.title.trim() ? r.title.trim() : null
			}))
			.filter((r, i, all) => r.href && all.findIndex((o) => o.key === r.key) === i)
	);
	const runHref = $derived(aiSuggestionsRunHref(suggestion.run_uuid));
	const isDryRun = $derived(suggestion.status === 'dry_run');
	const canDismiss = $derived(isOpen || isDryRun);
	const entityHref = $derived(
		aiSuggestionsEntityHref(suggestion.entity_type, suggestion.entity_id)
	);
	const entityText = $derived(
		suggestion.entity_type
			? `${AI_SUGGESTION_ENTITY_LABELS[suggestion.entity_type] ?? suggestion.entity_type} #${suggestion.entity_id}`
			: null
	);
	const snippet = $derived(
		actions.length > 0 ? aiSuggestionActionsSummary(actions) : aiSuggestionSnippet(suggestion.body)
	);
	const actingAs = $derived(
		$current_user ? `${$current_user.user_name} (${$current_user.user_login})` : 'you'
	);

	let expanded = $state(untrack(() => highlight));
	// Bundle: the pending actions left unticked (everything is ticked by default)
	let unticked = $state<number[]>([]);
	const selectedIds = $derived(
		pendingActions.filter((a) => !unticked.includes(a.id)).map((a) => a.id)
	);
	const toRun = $derived(
		isBundle ? pendingActions.filter((a) => selectedIds.includes(a.id)) : pendingActions
	);
	let showResult = $state(false);
	let showAnswer = $state(false);
	let acceptOpen = $state(false);
	let dismissOpen = $state(false);
	let note = $state('');
	let busy = $state(false);

	$effect(() => {
		if (highlight) expanded = true;
	});

	function settle(res: RequestResponse<AiSuggestion>, okTitle: string, failTitle: string) {
		if (res.ok) {
			const data = res.data;
			const updated =
				data && typeof data === 'object' && 'id' in (data as object)
					? (data as AiSuggestion)
					: null;
			toast({ title: okTitle, variant: 'success' });
			onChanged(updated);
			return true;
		}
		const message =
			(res.data && typeof res.data === 'object' && 'message' in (res.data as object)
				? String((res.data as unknown as { message: unknown }).message)
				: null) ??
			res.error?.message ??
			undefined;
		toast({ title: failTitle, description: message, variant: 'destructive' });
		return false;
	}

	function tick(id: number, checked: boolean) {
		unticked = checked ? unticked.filter((u) => u !== id) : [...unticked, id];
	}

	function openAccept(all = false) {
		if (all) unticked = [];
		note = '';
		acceptOpen = true;
	}

	async function accept() {
		if (toRun.length === 0) return;
		busy = true;
		try {
			const res = await AiSuggestionsService.accept(
				suggestion.id,
				note.trim() || null,
				{},
				isBundle ? toRun.map((a) => a.id) : null
			);
			const okTitle =
				isBundle && toRun.length < pendingActions.length
					? `${toRun.length} of ${pendingActions.length} actions run`
					: 'Suggestion accepted';
			if (settle(res, okTitle, 'Could not accept the suggestion')) {
				acceptOpen = false;
				note = '';
				unticked = [];
			} else if (isBundle) {
				// Actions before the failing one may have run: reload to show them
				acceptOpen = false;
				onChanged(null);
			}
		} finally {
			busy = false;
		}
	}

	async function dismiss() {
		busy = true;
		try {
			const res = await AiSuggestionsService.dismiss(suggestion.id, note.trim() || null);
			const done = isDryRun ? 'Dry-run suggestion cleared' : 'Suggestion dismissed';
			if (settle(res, done, 'Could not dismiss the suggestion')) {
				dismissOpen = false;
				note = '';
			}
		} finally {
			busy = false;
		}
	}

	async function answer(values: Record<string, unknown>, answerNote: string | null) {
		busy = true;
		try {
			const res = await AiSuggestionsService.answer(suggestion.id, values, answerNote);
			if (settle(res, 'Answer sent', 'Could not send the answer')) {
				showAnswer = false;
			}
		} finally {
			busy = false;
		}
	}

	function toggleAnswer() {
		showAnswer = !showAnswer;
		if (showAnswer) expanded = true;
	}

	const fmt = (iso: string | null) => (iso ? formatDateTime(iso) : '');
	const chip = 'shrink-0 rounded-sm border px-1 py-px text-2xs leading-tight';
</script>

<article
	class={cn(
		'rounded-md border bg-card text-sm transition-colors',
		!isOpen && 'bg-muted/20',
		!expanded && 'hover:border-foreground/20',
		highlight && 'ring-2 ring-primary'
	)}
	data-testid="ai-suggestion-card"
	data-suggestion-id={suggestion.id}
>
	<div class={cn('flex items-center gap-2 pl-1.5 pr-2', showEntity ? 'gap-3 py-2' : 'py-1.5')}>
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			data-testid="ai-suggestion-toggle"
		>
			<ChevronRightIcon
				size={12}
				class={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
			/>
			<span
				class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-violet-500/10 text-violet-600 dark:text-violet-400"
				title={kind.label}
			>
				<kind.icon size={11} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="flex min-w-0 items-center gap-1.5">
					<span class="truncate font-medium leading-snug" title={suggestion.title}
						>{suggestion.title}</span
					>
					{#if suggestion.severity}
						<span
							class={cn(
								chip,
								'font-medium capitalize',
								aiSuggestionSeverityClass(suggestion.severity)
							)}
						>
							{suggestion.severity}
						</span>
					{/if}
					{#if confidence}
						<span class={cn(chip, 'tabular-nums text-muted-foreground')} title="Confidence">
							{confidence}
						</span>
					{/if}
					{#if !isOpen}
						<span
							class={cn(
								chip,
								isDryRun
									? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
									: 'bg-muted/40 text-muted-foreground'
							)}
						>
							{AI_SUGGESTION_STATUS_LABELS[suggestion.status] ?? suggestion.status}
						</span>
					{/if}
				</span>
				{#if !expanded}
					<span class="block truncate text-2xs text-muted-foreground">
						{kind.label}{snippet ? ` · ${snippet}` : ''}
					</span>
				{/if}
			</span>
		</button>

		<div class="flex shrink-0 items-center gap-3 text-2xs text-muted-foreground">
			{#if showEntity}
				<span
					class="hidden w-44 truncate xl:block"
					title={suggestion.workflow_name ?? undefined}
					data-testid="ai-suggestion-workflow">{suggestion.workflow_name ?? ''}</span
				>
				<span class="hidden w-32 truncate md:block">
					{#if entityText && entityHref}
						<a
							href={entityHref}
							class="font-medium text-primary hover:underline"
							title={suggestion.entity_title ?? undefined}>{entityText}</a
						>
					{:else if entityText}
						<span class="font-medium">{entityText}</span>
					{:else}
						<span class="italic opacity-70">No entity</span>
					{/if}
				</span>
			{/if}
			{#if suggestion.created_at}
				<time
					class="w-10 text-right tabular-nums"
					datetime={suggestion.created_at}
					title={fmt(suggestion.created_at)}>{aiSuggestionAge(suggestion.created_at)}</time
				>
			{:else if showEntity}
				<span class="w-10"></span>
			{/if}
			{#if canDismiss || showEntity}
				<div class={cn('flex shrink-0 items-center justify-end gap-1', showEntity && 'w-28')}>
					{#if isOpen && isInfoRequest}
						<Button size="xs" class="h-6 px-2" onclick={toggleAnswer} disabled={busy}>
							{showAnswer ? 'Hide form' : 'Answer'}
						</Button>
					{:else if canAccept}
						<Button
							size="xs"
							class="h-6 px-2"
							onclick={() => openAccept(true)}
							disabled={busy}
							title={isBundle
								? `Review and run the ${pendingActions.length} proposed actions`
								: undefined}
						>
							<CheckIcon />
							{isBundle && pendingActions.length > 1 ? `Accept ${pendingActions.length}` : 'Accept'}
						</Button>
					{/if}
					{#if canDismiss}
						<Button
							size="xs"
							variant="ghost"
							class="h-6 w-6 p-0"
							title={isDryRun ? 'Clear this dry-run suggestion' : 'Dismiss'}
							aria-label={isDryRun ? 'Clear' : 'Dismiss'}
							onclick={() => ((note = ''), (dismissOpen = true))}
							disabled={busy}
							data-testid="ai-suggestion-dismiss"
						>
							<XIcon />
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if expanded}
		<div
			class={cn(
				'flex flex-col gap-2 border-t px-3 py-2',
				// Inbox: indent the details under the title (past the chevron and kind icon)
				showEntity && 'gap-3 py-3 pl-[3.125rem] pr-4'
			)}
			data-testid="ai-suggestion-details"
		>
			<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
				<span class="font-medium uppercase tracking-wide">{kind.label}</span>
				{#if confidence}<span>{confidence} confidence</span>{/if}
				{#if suggestion.workflow_name}
					<span class="truncate">· From {suggestion.workflow_name}</span>
				{/if}
				{#if suggestion.created_at}<span>· {fmt(suggestion.created_at)}</span>{/if}
				{#if runHref}
					<a
						href={runHref}
						class="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
						title="Open the run that produced this suggestion"
					>
						Why?
						<ExternalLinkIcon size={10} />
					</a>
				{/if}
			</div>

			{#if showEntity}
				<div class="truncate text-2xs text-muted-foreground">
					{#if entityText}
						{#if entityHref}
							<a href={entityHref} class="font-medium text-primary hover:underline">{entityText}</a>
						{:else}
							<span class="font-medium">{entityText}</span>
						{/if}
						{#if suggestion.entity_title}
							<span title={suggestion.entity_title}>· {suggestion.entity_title}</span>
						{/if}
					{:else}
						Not about a specific alert, case or war room
					{/if}
				</div>
			{/if}

			{#if isDryRun}
				<p class="text-2xs text-amber-700 dark:text-amber-300">
					Produced by a dry run: shown for review only, nothing can be accepted.
				</p>
			{/if}

			{#if suggestion.body}
				<!-- The inbox page scrolls on its own: no nested scroll box there -->
				<div class={cn(!showEntity && 'max-h-64 overflow-y-auto')}>
					<MarkDownPreview
						markdown={suggestion.body}
						untrusted
						class="text-sm leading-normal [&>:first-child]:mt-0 [&_code]:text-xs [&_li]:text-sm [&_p]:text-sm [&_pre]:text-xs"
					/>
				</div>
			{/if}

			{#if refs.length > 0}
				<div class="flex flex-wrap items-center gap-1 text-2xs">
					<span class="text-muted-foreground">Related:</span>
					{#each refs as r (r.key)}
						<a
							href={r.href}
							class="inline-flex max-w-full items-center gap-1 rounded-sm border bg-muted/40 px-1.5 py-px hover:bg-muted"
							title={r.title ?? undefined}
						>
							<span class="shrink-0 font-medium">{r.label}</span>
							{#if r.title}
								<span class="truncate text-muted-foreground">{r.title}</span>
							{/if}
						</a>
					{/each}
				</div>
			{/if}

			{#if actions.length > 0}
				<section class="flex min-w-0 flex-col gap-1.5" data-testid="ai-suggestion-actions">
					<div class="flex items-center gap-1.5 text-2xs text-muted-foreground">
						<WrenchIcon size={12} class="shrink-0" />
						<span class="font-medium uppercase tracking-wide">
							{actions.length === 1 ? 'Proposed action' : `${actions.length} proposed actions`}
						</span>
						{#if isBundle && canAccept && pendingActions.length > 1}
							<span class="ml-auto flex items-center gap-1">
								<Button
									size="xs"
									variant="outline"
									class="h-6 px-2"
									onclick={() => openAccept(false)}
									disabled={busy || selectedIds.length === 0}
									data-testid="ai-suggestion-accept-selected"
								>
									Accept selected ({selectedIds.length})
								</Button>
								<Button
									size="xs"
									class="h-6 px-2"
									onclick={() => openAccept(true)}
									disabled={busy}
									data-testid="ai-suggestion-accept-all"
								>
									<CheckIcon />
									Accept all ({pendingActions.length})
								</Button>
							</span>
						{/if}
					</div>
					{#each actions as action (action.id)}
						<AiSuggestionActionView
							{action}
							selectable={isBundle && canAccept && pendingActions.length > 1}
							checked={selectedIds.includes(action.id)}
							onCheckedChange={(v) => tick(action.id, v)}
							disabled={busy}
							open={actions.length === 1 && action.status === 'pending'}
						/>
					{/each}
				</section>
			{/if}

			{#if isOpen && isInfoRequest && showAnswer}
				<div class="border-t pt-2">
					<AiSuggestionAnswerForm
						fields={suggestion.form_schema?.fields ?? []}
						{busy}
						onSubmit={answer}
						onCancel={() => (showAnswer = false)}
					/>
				</div>
			{/if}

			{#if !isOpen && (suggestion.resolved_by || suggestion.resolution_note || suggestion.resolution_hidden || suggestion.answer != null || suggestion.result != null)}
				<div class="border-t pt-2 text-2xs text-muted-foreground">
					{#if suggestion.resolved_by}
						<div>
							{AI_SUGGESTION_STATUS_LABELS[suggestion.status] ?? suggestion.status} by
							<span class="font-medium text-foreground">{suggestion.resolved_by.name}</span>
							{#if suggestion.resolved_at}· {fmt(suggestion.resolved_at)}{/if}
						</div>
					{/if}
					{#if suggestion.resolution_note}
						<div class="mt-0.5 whitespace-pre-wrap">Note: {suggestion.resolution_note}</div>
					{/if}
					{#if suggestion.resolution_hidden}
						<div class="mt-0.5 italic" data-testid="ai-suggestion-resolution-hidden">
							{suggestion.kind === 'info_request' ? 'The answer' : 'The result'} is visible only to whoever
							resolved it.
						</div>
					{/if}
					{#if suggestion.answer != null || suggestion.result != null}
						<button
							type="button"
							class="mt-1 inline-flex items-center gap-1 hover:text-foreground"
							onclick={() => (showResult = !showResult)}
							aria-expanded={showResult}
						>
							<ChevronRightIcon
								size={11}
								class="transition-transform {showResult ? 'rotate-90' : ''}"
							/>
							{suggestion.answer != null ? 'Answer' : 'Result'}
						</button>
						{#if showResult}
							<pre
								class="mt-1 max-h-48 overflow-auto rounded-sm border bg-muted/20 px-2 py-1 font-mono">{aiSuggestionPretty(
									suggestion.answer ?? suggestion.result
								)}</pre>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</article>

<Dialog.Root bind:open={acceptOpen}>
	<Dialog.Content class="grid-cols-[minmax(0,1fr)] sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>
				{isBundle && pendingActions.length > 1
					? 'Run these actions as you?'
					: 'Run this action as you?'}
			</Dialog.Title>
			<Dialog.Description>
				Accepting runs {isBundle && pendingActions.length > 1
					? 'the ticked actions, in order,'
					: 'the action below'}
				with your own permissions, as
				<span class="font-medium text-foreground">{actingAs}</span>. It is recorded in the activity
				log under your name.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex min-w-0 flex-col gap-2 text-sm">
			<div class="flex max-h-[50vh] min-w-0 flex-col gap-1.5 overflow-y-auto">
				{#each pendingActions as action (action.id)}
					<AiSuggestionActionView
						{action}
						selectable={isBundle && pendingActions.length > 1}
						checked={selectedIds.includes(action.id)}
						onCheckedChange={(v) => tick(action.id, v)}
						disabled={busy}
						open={pendingActions.length <= 2}
					/>
				{/each}
			</div>
			{#if isBundle && toRun.length < pendingActions.length}
				<p class="text-2xs text-muted-foreground">
					The {pendingActions.length - toRun.length} unticked
					{pendingActions.length - toRun.length === 1 ? 'action is' : 'actions are'} skipped.
				</p>
			{/if}
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">Note (optional)</span>
				<Textarea rows={2} bind:value={note} disabled={busy} />
			</label>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (acceptOpen = false)} disabled={busy}>Cancel</Button>
			<Button
				onclick={accept}
				disabled={busy || toRun.length === 0}
				data-testid="ai-suggestion-run"
			>
				{busy ? 'Running…' : toRun.length > 1 ? `Run ${toRun.length} as me` : 'Run as me'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={dismissOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isDryRun ? 'Clear dry-run suggestion' : 'Dismiss suggestion'}</Dialog.Title>
			<Dialog.Description>{suggestion.title}</Dialog.Description>
		</Dialog.Header>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-xs text-muted-foreground">Note (optional)</span>
			<Textarea rows={3} bind:value={note} disabled={busy} placeholder="Why it does not apply" />
		</label>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dismissOpen = false)} disabled={busy}>Cancel</Button
			>
			<Button variant="destructive" onclick={dismiss} disabled={busy}>
				{busy ? 'Dismissing…' : isDryRun ? 'Clear' : 'Dismiss'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
