<!--
  One action a suggestion would run, readable: a title (`Update case
  #3537`), the objects it acts on, and its arguments as `field → value`
  rows. Long text is folded to one line and unfolds as Markdown; the raw
  tool call stays one click away. With `selectable`, a checkbox picks it
  for "Accept selected".
-->
<script lang="ts">
	import { ChevronRightIcon, CodeIcon } from 'lucide-svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import { cn } from '$lib/utils';
	import { aiSuggestionPretty } from './ai-suggestion-format';
	import {
		aiSuggestionActionFields,
		aiSuggestionActionTargets,
		type AiSuggestionAction
	} from './ai-suggestion-actions';

	interface Props {
		action: AiSuggestionAction;
		selectable?: boolean;
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		disabled?: boolean;
		/** Show the arguments (default: while it can still run). */
		open?: boolean;
	}

	let {
		action,
		selectable = false,
		checked = false,
		onCheckedChange,
		disabled = false,
		open = undefined
	}: Props = $props();

	const fields = $derived(aiSuggestionActionFields(action.arguments));
	const targets = $derived(aiSuggestionActionTargets(action.arguments));
	const pending = $derived(action.status === 'pending');

	let showFields = $state<boolean | null>(null);
	let showRaw = $state(false);
	let unfolded = $state<Record<string, boolean>>({});

	const fieldsShown = $derived(showFields ?? open ?? pending);
	const checkboxId = $props.id();

	const STATUS: Record<string, { label: string; cls: string }> = {
		done: {
			label: 'Done',
			cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
		},
		skipped: { label: 'Skipped', cls: 'bg-muted/40 text-muted-foreground' }
	};
	const status = $derived(STATUS[action.status]);
</script>

<div
	class={cn('min-w-0 rounded-md border text-xs', pending ? 'bg-card' : 'bg-muted/20')}
	data-testid="ai-suggestion-action"
	data-action-id={action.id}
>
	<div class="flex min-w-0 items-center gap-2 px-2 py-1.5">
		{#if selectable}
			<Checkbox
				id={checkboxId}
				{checked}
				onCheckedChange={(v) => onCheckedChange?.(v === true)}
				disabled={disabled || !pending}
				aria-label={`Select: ${action.label}`}
			/>
		{/if}
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
			onclick={() => (showFields = !fieldsShown)}
			aria-expanded={fieldsShown}
		>
			<ChevronRightIcon
				size={12}
				class={cn(
					'shrink-0 text-muted-foreground transition-transform',
					fieldsShown && 'rotate-90'
				)}
			/>
			<span
				class={cn('truncate font-medium', action.status === 'skipped' && 'line-through opacity-70')}
				title={action.label}>{action.label}</span
			>
			{#each targets as target (target)}
				<span
					class="shrink-0 rounded-sm border bg-muted/40 px-1 py-px text-2xs text-muted-foreground"
					>{target}</span
				>
			{/each}
		</button>
		{#if status}
			<span class={cn('shrink-0 rounded-sm border px-1 py-px text-2xs leading-tight', status.cls)}
				>{status.label}</span
			>
		{/if}
	</div>

	{#if action.error && pending}
		<p
			class="border-t px-2 py-1 text-2xs text-destructive"
			data-testid="ai-suggestion-action-error"
		>
			Last attempt failed: {action.error}
		</p>
	{/if}

	{#if fieldsShown}
		<div class="border-t px-2 py-1.5">
			{#if fields.length > 0}
				<dl class="grid grid-cols-[minmax(6rem,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1">
					{#each fields as f (f.key)}
						<dt class="truncate text-muted-foreground" title={f.key}>{f.label}</dt>
						<dd class="min-w-0">
							{#if f.kind === 'text'}
								<span class="break-words">{f.text}</span>
							{:else if f.kind === 'empty'}
								<span class="italic text-muted-foreground">{f.text}</span>
							{:else if f.kind === 'long'}
								<button
									type="button"
									class="flex w-full min-w-0 items-center gap-1 text-left hover:text-foreground"
									onclick={() => (unfolded[f.key] = !unfolded[f.key])}
									aria-expanded={!!unfolded[f.key]}
								>
									<ChevronRightIcon
										size={11}
										class={cn(
											'shrink-0 text-muted-foreground transition-transform',
											unfolded[f.key] && 'rotate-90'
										)}
									/>
									{#if !unfolded[f.key]}
										<span class="truncate">{f.preview}</span>
									{:else}
										<span class="text-muted-foreground">{f.text.length} characters</span>
									{/if}
								</button>
								{#if unfolded[f.key]}
									<div
										class="mt-1 max-h-72 overflow-y-auto rounded-sm border bg-muted/10 px-2 py-1"
									>
										<MarkDownPreview
											markdown={f.text}
											untrusted
											class="text-xs leading-normal [&>:first-child]:mt-0 [&_code]:text-2xs [&_li]:text-xs [&_p]:text-xs [&_pre]:text-2xs [&_td]:text-xs [&_th]:text-xs"
										/>
									</div>
								{/if}
							{:else}
								<pre
									class="max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border bg-muted/20 px-1.5 py-1 font-mono text-2xs [overflow-wrap:anywhere]">{f.text}</pre>
							{/if}
						</dd>
					{/each}
				</dl>
			{:else}
				<p class="italic text-muted-foreground">No arguments.</p>
			{/if}
			<button
				type="button"
				class="mt-1.5 inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
				onclick={() => (showRaw = !showRaw)}
				aria-expanded={showRaw}
			>
				<CodeIcon size={11} />
				{showRaw ? 'Hide' : 'Show'} the raw tool call
			</button>
			{#if showRaw}
				<pre
					class="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-sm border bg-muted/20 px-2 py-1.5 font-mono text-2xs [overflow-wrap:anywhere]">{aiSuggestionPretty(
						{ tool: action.tool, arguments: action.arguments }
					)}</pre>
			{/if}
		</div>
	{/if}
</div>
