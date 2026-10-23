<!--
  Board "Customize" panel: the user's own view of the room's board — show
  or hide each widget, reorder them within their zone (and panel column)
  and move panels between the main and the side column. Every change is
  applied live by the parent through `onChange`; "Reset" goes back to the
  room's board as its writers set it.
-->
<script lang="ts">
	import { ArrowDown, ArrowLeftRight, ArrowUp, RotateCcw, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		isDefaultBoardLayout,
		moveWidget,
		setPanelColumn,
		setWidgetVisible,
		zoneWidgets,
		type BoardLayout,
		type BoardPanelColumn,
		type BoardSlot,
		type BoardWidgetZone
	} from '../board-layout';

	type Props = {
		layout: BoardLayout;
		/** The room's widgets. */
		slots: BoardSlot[];
		/** Title and description of a widget. */
		describe: (id: string) => { label: string; description: string };
		/** Widgets the user can have at all (e.g. vulnerabilities need read). */
		available: (slot: BoardSlot) => boolean;
		onChange: (layout: BoardLayout) => void;
		onReset: () => void;
		onClose: () => void;
	};

	let { layout, slots, describe, available, onChange, onReset, onClose }: Props = $props();

	const skip = (id: string) => {
		const slot = slots.find((s) => s.id === id);
		return !slot || !available(slot);
	};

	// Hidden widgets stay in the list (unchecked) so they can be shown again.
	const listed = (zone: BoardWidgetZone, column?: BoardPanelColumn) =>
		zoneWidgets(layout, slots, zone, available, column).map((slot) => ({
			...slot,
			...describe(slot.id)
		}));

	const groups = $derived([
		{ key: 'banner', title: 'Banner', rows: listed('banner') },
		{ key: 'tile', title: 'Indicators', rows: listed('tile') },
		{ key: 'main', title: 'Main column', rows: listed('panel', 'main'), column: 'main' as const },
		{ key: 'side', title: 'Side column', rows: listed('panel', 'side'), column: 'side' as const }
	]);
</script>

<section
	class="shadow-elevation-1 rounded-xl border border-primary/40 bg-card"
	aria-labelledby="board-customize-title"
	data-testid="board-customize"
>
	<header class="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
		<h2 id="board-customize-title" class="text-sm font-semibold">Customize the board</h2>
		<span class="text-2xs text-muted-foreground">
			Only for you, in this war room. The widgets are the room's.
		</span>
		<div class="ml-auto flex items-center gap-2">
			<Button
				size="sm"
				variant="ghost"
				onclick={onReset}
				disabled={isDefaultBoardLayout(layout, slots)}
				data-testid="board-customize-reset"
			>
				<RotateCcw class="mr-1 h-3.5 w-3.5" /> Back to the room's layout
			</Button>
			<Button size="sm" onclick={onClose} data-testid="board-customize-done">
				<X class="mr-1 h-3.5 w-3.5" /> Done
			</Button>
		</div>
	</header>
	<div class="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
		{#each groups as g (g.key)}
			<div class="min-w-0">
				<h3 class="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
					{g.title}
				</h3>
				{#if g.rows.length === 0}
					<p
						class="rounded-md border border-dashed px-2 py-3 text-center text-2xs text-muted-foreground"
					>
						Empty
					</p>
				{:else}
					<ul class="divide-y rounded-md border">
						{#each g.rows as def, i (def.id)}
							{@const shown = !layout.hidden.includes(def.id)}
							<li
								class={['flex items-center gap-2 px-2 py-1.5', !shown && 'opacity-60']}
								data-testid="board-customize-widget"
							>
								<Checkbox
									id={`board-customize-${def.id}`}
									checked={shown}
									onCheckedChange={(v) => onChange(setWidgetVisible(layout, def.id, !!v))}
									aria-label={`Show ${def.label}`}
								/>
								<label for={`board-customize-${def.id}`} class="min-w-0 flex-1 cursor-pointer">
									<span class="block truncate text-xs font-medium">{def.label}</span>
									<span
										class="block truncate text-2xs text-muted-foreground"
										title={def.description}
									>
										{def.description}
									</span>
								</label>
								{#if g.column}
									<button
										type="button"
										class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
										onclick={() =>
											onChange(setPanelColumn(layout, def, g.column === 'main' ? 'side' : 'main'))}
										aria-label={`Move ${def.label} to the ${g.column === 'main' ? 'side' : 'main'} column`}
										title={`Move to the ${g.column === 'main' ? 'side' : 'main'} column`}
									>
										<ArrowLeftRight class="h-3.5 w-3.5" />
									</button>
								{/if}
								<button
									type="button"
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
									onclick={() => onChange(moveWidget(layout, slots, def.id, -1, skip))}
									disabled={i === 0}
									aria-label={`Move ${def.label} up`}
								>
									<ArrowUp class="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
									onclick={() => onChange(moveWidget(layout, slots, def.id, 1, skip))}
									disabled={i === g.rows.length - 1}
									aria-label={`Move ${def.label} down`}
								>
									<ArrowDown class="h-3.5 w-3.5" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</div>
</section>
