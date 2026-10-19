<!--
  A value the run renders, with its mode: a template (text), a path
  (`{"$path": …}`, the value passed with its structure) or JSON (a
  number, a boolean, a list, an object). JSON text that does not parse
  stays in the field with an error and is not saved until it does.
-->
<script lang="ts">
	import { cn } from '$lib/utils';
	import { Input } from '$lib/components/ui/input';
	import TemplateField from './TemplateField.svelte';
	import { SELECT_CLASS } from '../helpers/ui';
	import {
		convertValue,
		parseJsonValue,
		valueMode,
		valueText,
		type ValueMode
	} from '../helpers/values';

	type Props = {
		value: unknown;
		onChange: (value: unknown) => void;
		size?: 'sm' | 'md';
		templatePlaceholder?: string;
		pathPlaceholder?: string;
		disabled?: boolean;
		testId?: string;
	};

	let {
		value,
		onChange,
		size = 'md',
		templatePlaceholder = '{{ trigger.entity_id }}',
		pathPlaceholder = 'nodes.load.output.result',
		disabled = false,
		testId
	}: Props = $props();

	// JSON being typed: kept as typed (not reformatted), saved whenever it parses
	let draft = $state<string | null>(null);
	// The value the draft belongs to: another one (the row removed, an undo) drops it
	let anchor: string | undefined;

	$effect(() => {
		const current = JSON.stringify(value);
		if (draft !== null && current !== anchor) draft = null;
	});

	const mode = $derived<ValueMode>(draft !== null ? 'json' : valueMode(value));
	const text = $derived(draft ?? valueText(value));
	const error = $derived.by(() => {
		if (draft === null) return null;
		const parsed = parseJsonValue(draft);
		return parsed.ok ? null : parsed.error;
	});

	function setMode(next: ValueMode) {
		const converted = convertValue(value, next);
		if (converted.ok) {
			draft = null;
			onChange(converted.value);
		} else {
			anchor = JSON.stringify(value);
			draft = valueText(value);
		}
	}

	function setJson(next: string) {
		draft = next;
		const parsed = parseJsonValue(next);
		if (!parsed.ok) return;
		anchor = JSON.stringify(parsed.value);
		onChange(parsed.value);
	}
</script>

<div class="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
	<div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-1">
		<select
			class={cn(SELECT_CLASS, size === 'sm' && 'h-7')}
			{disabled}
			value={mode}
			onchange={(e) => setMode((e.currentTarget as HTMLSelectElement).value as ValueMode)}
			title="A template renders text; a path passes the value (object, list, number) as is; JSON is a fixed number, boolean, list or object"
		>
			<option value="template">Template</option>
			<option value="path">Path</option>
			<option value="json">JSON</option>
		</select>
		{#if mode === 'json'}
			<Input
				class={cn(
					'font-mono text-xs',
					size === 'sm' ? 'h-7' : 'h-8',
					error && 'border-destructive'
				)}
				placeholder={'["a", "b"] or {"key": 1}'}
				{disabled}
				value={text}
				aria-invalid={error ? true : undefined}
				oninput={(e) => setJson((e.currentTarget as HTMLInputElement).value)}
				onblur={() => {
					if (!error) draft = null;
				}}
			/>
		{:else}
			<TemplateField
				{size}
				mode={mode === 'path' ? 'path' : 'template'}
				placeholder={mode === 'path' ? pathPlaceholder : templatePlaceholder}
				{disabled}
				value={text}
				onInput={(v) => onChange(mode === 'path' ? { $path: v } : v)}
			/>
		{/if}
	</div>
	{#if error}
		<p class="text-2xs text-destructive">{error}</p>
	{/if}
</div>
