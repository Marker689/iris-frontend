<!--
  One editable cell of a tracker row (an extra column or the note).
  Shows the value; with write access a click turns it into the editor of
  its type. Text-like editors commit on Enter / blur and cancel on
  Escape; checkbox, select and user commit on change.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import type { TrackerColumn, TrackerValue } from '$lib/services/war-room-trackers.service';
	import { trackerValueText } from '$lib/services/war-room-trackers.service';
	import {
		fromDateTimeInputValue,
		mediumDateTimeFormatter,
		toDateTimeInputValue
	} from '$lib/utils/time-formatter';
	import type { TrackerMemberOption } from './tracker-helpers';

	type Props = {
		value: TrackerValue | undefined;
		column: Pick<TrackerColumn, 'type' | 'label' | 'options'>;
		members?: TrackerMemberOption[];
		canWrite: boolean;
		onSave: (value: TrackerValue) => void;
	};

	let { value, column, members = [], canWrite, onSave }: Props = $props();

	const INPUT_CLASS =
		'w-full rounded border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring';

	let editing = $state(false);
	let draft = $state('');
	let multiOpen = $state(false);
	let multiDraft = $state<string[]>([]);
	let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

	const userName = (id: number) => members.find((m) => m.id === id)?.name;

	const display = $derived.by(() => {
		if (column.type === 'datetime' && typeof value === 'string' && value) {
			return mediumDateTimeFormatter(value) || value;
		}
		return trackerValueText(value, column, userName);
	});

	const isUrl = $derived(
		column.type === 'url' && typeof value === 'string' && /^https?:\/\//i.test(value)
	);

	const toDraft = (v: TrackerValue | undefined): string => {
		if (v === null || v === undefined) return '';
		if (column.type === 'datetime') return toDateTimeInputValue(v as string);
		return String(v);
	};

	const fromDraft = (raw: string): TrackerValue => {
		const text = column.type === 'longtext' ? raw : raw.trim();
		if (text === '') return null;
		switch (column.type) {
			case 'number': {
				const n = Number(text);
				return Number.isFinite(n) ? n : null;
			}
			case 'datetime':
				return fromDateTimeInputValue(text)?.toISOString() ?? null;
			case 'user':
				return Number(text);
			default:
				return text;
		}
	};

	const same = (a: TrackerValue | undefined, b: TrackerValue) =>
		(a ?? null) === b ||
		(Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((x, i) => x === b[i]));

	const start = async () => {
		if (!canWrite) return;
		draft = toDraft(value);
		editing = true;
		await tick();
		inputEl?.focus();
	};

	const commit = () => {
		if (!editing) return;
		editing = false;
		const next = fromDraft(draft);
		if (!same(value, next)) onSave(next);
	};

	const cancel = () => {
		editing = false;
	};

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if (e.key === 'Enter' && (column.type !== 'longtext' || e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			commit();
		}
	};

	const commitSelect = (raw: string) => {
		editing = false;
		const next = fromDraft(raw);
		if (!same(value, next)) onSave(next);
	};

	const openMulti = (o: boolean) => {
		if (o) multiDraft = Array.isArray(value) ? [...value] : [];
		else {
			const options = column.options ?? [];
			const next = options.filter((opt) => multiDraft.includes(opt));
			const kept = multiDraft.filter((v) => !options.includes(v));
			const out = [...next, ...kept];
			if (!same(value, out.length ? out : null)) onSave(out.length ? out : null);
		}
		multiOpen = o;
	};

	const placeholder = '—';
</script>

{#if column.type === 'checkbox'}
	<input
		type="checkbox"
		class="h-3.5 w-3.5 accent-primary"
		checked={value === true}
		disabled={!canWrite}
		aria-label={column.label}
		onchange={(e) => onSave((e.currentTarget as HTMLInputElement).checked)}
	/>
{:else if column.type === 'multiselect'}
	{#if canWrite}
		<Popover open={multiOpen} onOpenChange={openMulti}>
			<PopoverTrigger
				class="flex min-h-6 w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/60"
				aria-label={`Edit ${column.label}`}
			>
				{#if Array.isArray(value) && value.length}
					{#each value as v (v)}
						<span class="rounded bg-muted px-1.5 text-2xs leading-5">{v}</span>
					{/each}
				{:else}
					<span class="text-2xs text-muted-foreground">{placeholder}</span>
				{/if}
			</PopoverTrigger>
			<PopoverContent class="w-56 p-1.5" align="start">
				{#if (column.options ?? []).length === 0}
					<p class="p-2 text-2xs text-muted-foreground">No option defined for this column.</p>
				{/if}
				{#each column.options ?? [] as opt (opt)}
					<label class="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
						<input
							type="checkbox"
							class="h-3.5 w-3.5 accent-primary"
							checked={multiDraft.includes(opt)}
							onchange={(e) => {
								const on = (e.currentTarget as HTMLInputElement).checked;
								multiDraft = on ? [...multiDraft, opt] : multiDraft.filter((x) => x !== opt);
							}}
						/>
						{opt}
					</label>
				{/each}
			</PopoverContent>
		</Popover>
	{:else}
		<span class="text-xs">{display || placeholder}</span>
	{/if}
{:else if editing}
	{#if column.type === 'select' || column.type === 'user'}
		<select
			bind:this={inputEl}
			class={INPUT_CLASS}
			value={draft}
			aria-label={column.label}
			onchange={(e) => commitSelect((e.currentTarget as HTMLSelectElement).value)}
			onblur={cancel}
			onkeydown={(e) => e.key === 'Escape' && cancel()}
		>
			<option value="">—</option>
			{#if column.type === 'select'}
				{#each column.options ?? [] as opt (opt)}
					<option value={opt}>{opt}</option>
				{/each}
				{#if typeof value === 'string' && value && !(column.options ?? []).includes(value)}
					<option {value}>{value}</option>
				{/if}
			{:else}
				{#each members as m (m.id)}
					<option value={String(m.id)}>{m.name}</option>
				{/each}
				{#if typeof value === 'number' && !members.some((m) => m.id === value)}
					<option value={String(value)}>{display}</option>
				{/if}
			{/if}
		</select>
	{:else if column.type === 'longtext'}
		<textarea
			bind:this={inputEl}
			bind:value={draft}
			rows={3}
			class={INPUT_CLASS}
			aria-label={column.label}
			onblur={commit}
			onkeydown={onKey}
		></textarea>
	{:else}
		<input
			bind:this={inputEl}
			bind:value={draft}
			type={column.type === 'number'
				? 'number'
				: column.type === 'date'
					? 'date'
					: column.type === 'datetime'
						? 'datetime-local'
						: column.type === 'url'
							? 'url'
							: 'text'}
			step={column.type === 'number' ? 'any' : undefined}
			class={INPUT_CLASS}
			aria-label={column.label}
			onblur={commit}
			onkeydown={onKey}
		/>
	{/if}
{:else if canWrite}
	<div class="flex min-h-6 items-center gap-1">
		{#if isUrl}
			<a
				href={value as string}
				target="_blank"
				rel="noopener noreferrer"
				class="min-w-0 truncate text-xs text-primary hover:underline">{display}</a
			>
		{/if}
		<button
			type="button"
			class="min-h-6 min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60 {column.type ===
			'longtext'
				? 'whitespace-pre-wrap break-words'
				: 'truncate'}"
			title={column.type === 'longtext' ? undefined : display}
			aria-label={`Edit ${column.label}`}
			onclick={start}
			data-testid="tracker-value-edit"
		>
			{#if isUrl}
				<span class="text-2xs text-muted-foreground">edit</span>
			{:else if display}
				{display}
			{:else}
				<span class="text-muted-foreground">{placeholder}</span>
			{/if}
		</button>
	</div>
{:else if isUrl}
	<a
		href={value as string}
		target="_blank"
		rel="noopener noreferrer"
		class="truncate text-xs text-primary hover:underline">{display}</a
	>
{:else}
	<span class="text-xs {column.type === 'longtext' ? 'whitespace-pre-wrap break-words' : ''}">
		{display || placeholder}
	</span>
{/if}
