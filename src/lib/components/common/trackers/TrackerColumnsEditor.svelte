<!--
  Editor of the extra columns of a tracker (or of a template tracker):
  label, type and, for select / multiselect, the options (one per line).
  Keys are generated from the label on creation and never change, so
  stored values survive a rename.
-->
<script lang="ts">
	import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		TRACKER_COLUMN_TYPES,
		TRACKER_MAX_COLUMNS,
		newTrackerColumnKey,
		type TrackerColumn,
		type TrackerColumnType
	} from '$lib/services/war-room-trackers.service';

	type Props = {
		columns: TrackerColumn[];
		disabled?: boolean;
		idPrefix?: string;
	};

	let { columns = $bindable(), disabled = false, idPrefix = 'tracker-col' }: Props = $props();

	const hasOptions = (type: TrackerColumnType) => type === 'select' || type === 'multiselect';

	const add = () => {
		if (columns.length >= TRACKER_MAX_COLUMNS) return;
		const label = `Column ${columns.length + 1}`;
		columns = [
			...columns,
			{
				key: newTrackerColumnKey(
					label,
					columns.map((c) => c.key)
				),
				label,
				type: 'text'
			}
		];
	};

	const update = (index: number, patch: Partial<TrackerColumn>) => {
		columns = columns.map((c, i) => {
			if (i !== index) return c;
			const next = { ...c, ...patch };
			if (!hasOptions(next.type)) delete next.options;
			else if (!next.options) next.options = [];
			return next;
		});
	};

	const remove = (index: number) => {
		columns = columns.filter((_, i) => i !== index);
	};

	const move = (from: number, to: number) => {
		if (to < 0 || to >= columns.length) return;
		const next = [...columns];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		columns = next;
	};

	const optionsText = (c: TrackerColumn) => (c.options ?? []).join('\n');
	const parseOptions = (text: string) =>
		[...new Set(text.split('\n').map((o) => o.trim()))].filter(Boolean);
</script>

<div class="flex flex-col gap-2" data-testid="tracker-columns-editor">
	{#if columns.length === 0}
		<p class="text-2xs text-muted-foreground">
			No extra column. Every row already has its steps and a note.
		</p>
	{/if}
	{#each columns as column, index (column.key)}
		<div class="flex flex-col gap-1.5 rounded-md border p-2" data-testid="tracker-column-row">
			<div class="flex items-center gap-1.5">
				<Input
					id={`${idPrefix}-${index}-label`}
					class="h-8 flex-1 text-xs"
					value={column.label}
					maxlength={64}
					placeholder="Label"
					aria-label="Column label"
					{disabled}
					oninput={(e) => update(index, { label: (e.target as HTMLInputElement).value })}
				/>
				<select
					class="h-8 rounded-md border bg-background px-2 text-xs"
					value={column.type}
					aria-label="Column type"
					{disabled}
					onchange={(e) =>
						update(index, { type: (e.target as HTMLSelectElement).value as TrackerColumnType })}
				>
					{#each TRACKER_COLUMN_TYPES as t (t.value)}
						<option value={t.value}>{t.label}</option>
					{/each}
				</select>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					aria-label={`Move ${column.label} up`}
					disabled={disabled || index === 0}
					onclick={() => move(index, index - 1)}
				>
					<ChevronUp class="h-3.5 w-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					aria-label={`Move ${column.label} down`}
					disabled={disabled || index === columns.length - 1}
					onclick={() => move(index, index + 1)}
				>
					<ChevronDown class="h-3.5 w-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7 text-destructive hover:text-destructive"
					aria-label={`Remove column ${column.label}`}
					{disabled}
					onclick={() => remove(index)}
				>
					<Trash2 class="h-3.5 w-3.5" />
				</Button>
			</div>
			{#if hasOptions(column.type)}
				<textarea
					class="min-h-[3.5rem] w-full rounded-md border bg-background px-2 py-1 text-xs"
					placeholder="One option per line"
					aria-label={`Options of ${column.label}`}
					value={optionsText(column)}
					{disabled}
					onchange={(e) =>
						update(index, { options: parseOptions((e.target as HTMLTextAreaElement).value) })}
				></textarea>
			{/if}
		</div>
	{/each}
	<div>
		<Button
			variant="outline"
			size="sm"
			class="h-7 gap-1.5 text-xs"
			onclick={add}
			disabled={disabled || columns.length >= TRACKER_MAX_COLUMNS}
			data-testid="tracker-column-add"
		>
			<Plus class="h-3.5 w-3.5" /> Add column
		</Button>
		{#if columns.length >= TRACKER_MAX_COLUMNS}
			<span class="ml-2 text-2xs text-muted-foreground">
				At most {TRACKER_MAX_COLUMNS} columns.
			</span>
		{/if}
	</div>
</div>
