<!--
  Opens the questions an `ask_analyst` node flagged `popup` in a dialog,
  wherever the analyst is in the app, one at a time and oldest first.
  The queue lives in the ai-suggestions store: filled from the socket
  push and, on mount, from the open questions addressed to the user.
  "Later" (or closing the dialog) puts the question off for the tab's
  session; it stays on its entity and in the suggestions inbox.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ExternalLinkIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import { AiSuggestionsService, type AiSuggestion } from '$lib/services/ai-suggestions.service';
	import {
		AI_SUGGESTION_ENTITY_LABELS,
		aiSuggestions,
		aiSuggestionsEntityHref,
		aiSuggestionsInboxHref
	} from '$lib/stores/ai-suggestions.store.svelte';
	import AiSuggestionAnswerForm from './AiSuggestionAnswerForm.svelte';

	const current = $derived<AiSuggestion | null>(aiSuggestions.popups[0] ?? null);
	const waiting = $derived(Math.max(aiSuggestions.popups.length - 1, 0));
	const entityHref = $derived(
		current ? aiSuggestionsEntityHref(current.entity_type, current.entity_id) : null
	);
	const entityLabel = $derived(
		current?.entity_type
			? (AI_SUGGESTION_ENTITY_LABELS[current.entity_type] ?? current.entity_type)
			: null
	);
	let busy = $state(false);

	onMount(() => {
		aiSuggestions.start();
		void aiSuggestions.loadPopups();
	});

	function later() {
		if (current && !busy) aiSuggestions.deferPopup(current.id);
	}

	async function answer(values: Record<string, unknown>, note: string | null) {
		if (!current) return;
		const id = current.id;
		busy = true;
		try {
			const res = await AiSuggestionsService.answer(id, values, note);
			if (res.ok) {
				toast({ title: 'Answer sent', variant: 'success' });
				const updated =
					res.data && typeof res.data === 'object' && 'id' in (res.data as object)
						? (res.data as AiSuggestion)
						: null;
				if (updated) aiSuggestions.apply(updated);
				else aiSuggestions.deferPopup(id);
				return;
			}
			const message =
				res.data && typeof res.data === 'object' && 'message' in (res.data as object)
					? String((res.data as unknown as { message: unknown }).message)
					: res.error?.message;
			toast({ title: 'Could not send the answer', description: message, variant: 'destructive' });
			// Already answered by someone else, or expired: refresh the queue
			await aiSuggestions.loadPopups();
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root
	open={current !== null}
	onOpenChange={(open) => {
		if (!open) later();
	}}
>
	{#if current}
		<Dialog.Content
			class="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl"
			data-testid="ai-question-popup"
			onInteractOutside={(e) => e.preventDefault()}
		>
			<Dialog.Header>
				<Dialog.Title>{current.title}</Dialog.Title>
				<Dialog.Description class="flex flex-wrap items-center gap-x-1.5 text-xs">
					{#if current.workflow_name}<span>Asked by {current.workflow_name}</span>{/if}
					{#if entityLabel}
						<span>·</span>
						{#if entityHref}
							<a
								class="inline-flex items-center gap-0.5 hover:underline"
								href={entityHref}
								onclick={later}
							>
								{entityLabel} #{current.entity_id}{current.entity_title
									? ` — ${current.entity_title}`
									: ''}
								<ExternalLinkIcon size={11} />
							</a>
						{:else}
							<span>{entityLabel} #{current.entity_id}</span>
						{/if}
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			{#if current.body}
				<div class="max-h-64 overflow-y-auto">
					<MarkDownPreview
						markdown={current.body}
						untrusted
						class="text-sm leading-normal [&>:first-child]:mt-0 [&_code]:text-xs [&_li]:text-sm [&_p]:text-sm [&_pre]:text-xs"
					/>
				</div>
			{/if}

			{#key current.id}
				<AiSuggestionAnswerForm
					fields={current.form_schema?.fields ?? []}
					{busy}
					onSubmit={answer}
					onCancel={later}
					cancelLabel="Later"
				/>
			{/key}

			<div class="flex items-center justify-between text-2xs text-muted-foreground">
				<a class="hover:underline" href={aiSuggestionsInboxHref(current.id)} onclick={later}>
					Open in the inbox
				</a>
				{#if waiting > 0}
					<span>{waiting} more question{waiting > 1 ? 's' : ''} waiting</span>
				{/if}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
