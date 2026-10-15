<!--
  Category column of a categorised list: All / Uncategorised / one entry
  per category with its count, the filter on click. With `canManage`,
  categories are created, renamed and deleted here. With `onDropItem`,
  an object dragged from the list (`CATEGORY_DRAG_TYPE`, its id as data)
  is moved by dropping it on Uncategorised or a category.
-->
<script lang="ts" module>
	export const CATEGORY_DRAG_TYPE = 'application/x-iris-category-item';
</script>

<script lang="ts">
	import { Check, FolderOpen, Folder, Inbox, Layers, Pencil, Plus, Trash2, X } from 'lucide-svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import type { Category, CategoryFilter } from '$lib/services/categories.service';
	import type { CategoryState } from './category-state.svelte';

	let {
		store,
		total,
		counts,
		canManage = false,
		itemLabel,
		onDropItem
	}: {
		store: CategoryState;
		total: number;
		counts: { none: number; byId: Record<number, number> };
		canManage?: boolean;
		/** Plural noun of the objects, for the delete confirmation. */
		itemLabel: string;
		onDropItem?: (itemId: number, categoryId: number | null) => void;
	} = $props();

	let creating = $state(false);
	let newName = $state('');
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let busy = $state(false);
	let dropTarget = $state<CategoryFilter | null>(null);
	let pendingDelete = $state<Category | null>(null);
	let confirmOpen = $state(false);

	const ENTRY =
		'group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors';

	const entryClass = (filter: CategoryFilter) => {
		const selected = store.filter === filter;
		const dropping = dropTarget === filter;
		return [
			ENTRY,
			selected
				? 'bg-primary/10 font-medium text-primary'
				: 'text-muted-foreground hover:bg-muted/60',
			dropping && 'ring-2 ring-primary/60'
		];
	};

	const focus = (node: HTMLInputElement) => {
		node.focus();
		node.select();
	};

	async function submitCreate() {
		const name = newName.trim();
		if (!name || busy) return;
		busy = true;
		const created = await store.create(name);
		busy = false;
		if (created) {
			creating = false;
			newName = '';
		}
	}

	async function submitRename(category: Category) {
		const name = editName.trim();
		if (busy) return;
		if (!name || name === category.name) {
			editingId = null;
			return;
		}
		busy = true;
		const ok = await store.rename(category, name);
		busy = false;
		if (ok) editingId = null;
	}

	function keydown(e: KeyboardEvent, submit: () => void, cancel: () => void) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}

	const accepts = (e: DragEvent) =>
		!!onDropItem && !!e.dataTransfer?.types.includes(CATEGORY_DRAG_TYPE);

	function dragover(e: DragEvent, filter: CategoryFilter) {
		if (!accepts(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTarget = filter;
	}

	function drop(e: DragEvent, categoryId: number | null) {
		dropTarget = null;
		if (!accepts(e)) return;
		e.preventDefault();
		const itemId = Number(e.dataTransfer?.getData(CATEGORY_DRAG_TYPE));
		if (Number.isInteger(itemId) && itemId > 0) onDropItem?.(itemId, categoryId);
	}
</script>

<nav class="flex flex-col gap-0.5" aria-label="Categories">
	<div class="mb-1 flex items-center justify-between px-2">
		<span class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
			Categories
		</span>
		{#if canManage}
			<button
				type="button"
				class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				title="New category"
				aria-label="New category"
				onclick={() => {
					creating = true;
					newName = '';
				}}
			>
				<Plus class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>

	<button type="button" class={entryClass('all')} onclick={() => store.select('all')}>
		<Layers class="h-3.5 w-3.5 shrink-0" />
		<span class="min-w-0 flex-1 truncate">All</span>
		<span class="tabular-nums opacity-70">{total}</span>
	</button>
	<button
		type="button"
		class={entryClass('none')}
		onclick={() => store.select('none')}
		ondragover={(e) => dragover(e, 'none')}
		ondragleave={() => (dropTarget = null)}
		ondrop={(e) => drop(e, null)}
	>
		<Inbox class="h-3.5 w-3.5 shrink-0" />
		<span class="min-w-0 flex-1 truncate">Uncategorised</span>
		<span class="tabular-nums opacity-70">{counts.none}</span>
	</button>

	{#each store.categories as category (category.id)}
		{#if editingId === category.id}
			<div class="flex h-7 items-center gap-1 px-1">
				<input
					use:focus
					class="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
					value={editName}
					maxlength={128}
					aria-label="Category name"
					oninput={(e) => (editName = (e.target as HTMLInputElement).value)}
					onkeydown={(e) =>
						keydown(
							e,
							() => submitRename(category),
							() => (editingId = null)
						)}
				/>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:text-foreground"
					title="Save"
					aria-label="Save"
					disabled={busy}
					onclick={() => submitRename(category)}
				>
					<Check class="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:text-foreground"
					title="Cancel"
					aria-label="Cancel"
					onclick={() => (editingId = null)}
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		{:else}
			<div
				class={entryClass(category.id)}
				role="button"
				tabindex="0"
				onclick={() => store.select(category.id)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						store.select(category.id);
					}
				}}
				ondragover={(e) => dragover(e, category.id)}
				ondragleave={() => (dropTarget = null)}
				ondrop={(e) => drop(e, category.id)}
				data-testid={`category-${category.id}`}
			>
				{#if store.filter === category.id}
					<FolderOpen class="h-3.5 w-3.5 shrink-0" />
				{:else}
					<Folder class="h-3.5 w-3.5 shrink-0" />
				{/if}
				<span class="min-w-0 flex-1 truncate" title={category.name}>{category.name}</span>
				{#if canManage}
					<span class="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
						<button
							type="button"
							class="rounded p-0.5 hover:bg-muted hover:text-foreground"
							title="Rename"
							aria-label={`Rename ${category.name}`}
							onclick={(e) => {
								e.stopPropagation();
								editingId = category.id;
								editName = category.name;
							}}
						>
							<Pencil class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="rounded p-0.5 hover:bg-muted hover:text-destructive"
							title="Delete"
							aria-label={`Delete ${category.name}`}
							onclick={(e) => {
								e.stopPropagation();
								pendingDelete = category;
								confirmOpen = true;
							}}
						>
							<Trash2 class="h-3 w-3" />
						</button>
					</span>
				{/if}
				<span class="tabular-nums opacity-70">{counts.byId[category.id] ?? 0}</span>
			</div>
		{/if}
	{/each}

	{#if creating}
		<div class="flex h-7 items-center gap-1 px-1">
			<input
				use:focus
				class="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
				value={newName}
				maxlength={128}
				placeholder="Category name"
				aria-label="New category name"
				oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
				onkeydown={(e) => keydown(e, submitCreate, () => (creating = false))}
			/>
			<button
				type="button"
				class="rounded p-0.5 text-muted-foreground hover:text-foreground"
				title="Create"
				aria-label="Create category"
				disabled={busy || !newName.trim()}
				onclick={submitCreate}
			>
				<Check class="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				class="rounded p-0.5 text-muted-foreground hover:text-foreground"
				title="Cancel"
				aria-label="Cancel"
				onclick={() => (creating = false)}
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
	{:else if canManage && store.categories.length === 0}
		<p class="px-2 pt-1 text-2xs text-muted-foreground">
			Create categories to file {itemLabel}, then drag them here or use their Move menu.
		</p>
	{/if}
</nav>

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete this category?"
	message={`"${pendingDelete?.name ?? ''}" is deleted for everyone. Its ${itemLabel} are kept and become uncategorised.`}
	confirmText="Delete"
	onConfirm={() => {
		if (pendingDelete) store.remove(pendingDelete);
		pendingDelete = null;
	}}
/>
