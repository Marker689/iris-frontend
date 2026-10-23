<!--
  "Run" menu of a selection bar (or of a single object, with one
  target and a custom `trigger`): the manual hooks (modules, webhooks,
  AI workflows) registered for `hookType`, fired once against every
  selected object. A module gets the whole selection in one task and a
  webhook in one delivery; an AI workflow starts one run per object.

  Renders nothing when no hook targets this type, so hosts can drop it
  into their bar unconditionally.

  A filter input heads the entries (focused on open; ArrowDown moves to
  the first match, Enter runs the only one left) and the list scrolls
  once it outgrows the menu.

  Alerts and war rooms are outside any case and go to their own
  invokers; for a war room the one target is its id.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDownIcon, SearchIcon, ZapIcon } from 'lucide-svelte';
	import { Button, type ButtonSize } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/stores/toast.store';
	import { HooksService, type HookObjectType, type HookOption } from '$lib/services/hooks.service';
	import {
		callAlertHook,
		callHook,
		callWarRoomHook,
		filterHookOptions,
		hookOptionKey
	} from '$lib/utils/hooks';

	type Props = {
		hookType: HookObjectType;
		/** The case the targets belong to. Unused for alerts and war rooms, which have their own invokers. */
		caseId?: number;
		targets: number[];
		disabled?: boolean;
		/** Entries the host already loaded; fetched here otherwise. */
		options?: HookOption[];
		/** Runs after a hook was queued without errors. */
		onDone?: () => void;
		/** Replaces the default "Run" button; spread `props` on the element. */
		trigger?: Snippet<[{ props: Record<string, unknown>; disabled: boolean }]>;
		/** Size and extra classes of the default "Run" button. */
		size?: ButtonSize;
		class?: string;
		/** Header of the menu, e.g. "Run on this case". */
		label?: string;
		align?: 'start' | 'center' | 'end';
		side?: 'top' | 'right' | 'bottom' | 'left';
	};

	let {
		hookType,
		caseId,
		targets,
		disabled = false,
		options,
		onDone,
		trigger,
		size = 'xs',
		class: className = '',
		label,
		align = 'start',
		side = 'bottom'
	}: Props = $props();

	let loaded = $state<HookOption[]>([]);
	let isRunning = $state(false);
	let open = $state(false);
	let query = $state('');
	let filterEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	const entries = $derived(options ?? loaded);
	const visible = $derived(filterHookOptions(entries, query));
	const isDisabled = $derived(disabled || isRunning || targets.length === 0);

	// A fresh filter each time the menu opens
	$effect(() => {
		if (!open) query = '';
	});

	$effect(() => {
		if (options) return;
		const type = hookType;
		HooksService.list(type).then((response) => {
			loaded = Array.isArray(response.data) ? response.data : [];
		});
	});

	const run = async (hookOption: HookOption) => {
		if (targets.length === 0) return;
		if (hookType !== 'alert' && hookType !== 'war_room' && caseId === undefined) return;

		isRunning = true;
		try {
			const result =
				hookType === 'alert'
					? await callAlertHook([...targets], hookOption)
					: hookType === 'war_room'
						? await callWarRoomHook(targets[0], hookOption)
						: await callHook(caseId as number, hookType, [...targets], hookOption);

			toast({
				variant: result.status === 'error' ? 'destructive' : 'success',
				title: result.message
			});

			if (result.status !== 'error') onDone?.();
		} finally {
			isRunning = false;
		}
	};

	/**
	 * Keys typed in the filter stay in it: the menu would otherwise take
	 * letters for its typeahead and Home / End / arrows for its own
	 * navigation. Escape and Tab still reach the menu.
	 */
	const onFilterKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' || event.key === 'Tab') return;
		event.stopPropagation();
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			listEl?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (visible.length !== 1) return;
			open = false;
			run(visible[0]);
		}
	};
</script>

{#if entries.length}
	<DropdownMenu bind:open>
		<DropdownMenuTrigger disabled={isDisabled}>
			{#snippet child({ props })}
				{#if trigger}
					{@render trigger({ props, disabled: isDisabled })}
				{:else}
					<Button {...props} {size} variant="outline" class={className} disabled={isDisabled}>
						<ZapIcon size={12} />
						Run
						<ChevronDownIcon size={12} />
					</Button>
				{/if}
			{/snippet}
		</DropdownMenuTrigger>

		<DropdownMenuContent
			{align}
			{side}
			class="flex max-h-[min(24rem,var(--bits-menu-content-available-height))] min-w-[14rem] max-w-sm flex-col"
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				filterEl?.focus();
			}}
		>
			{#if targets.length > 1 || label}
				<DropdownMenuLabel class="text-2xs font-normal text-muted-foreground">
					{targets.length > 1 ? `On ${targets.length} selected` : label}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
			{/if}
			<div class="relative shrink-0 px-1 pb-1.5">
				<SearchIcon
					size={12}
					class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					bind:this={filterEl}
					bind:value={query}
					type="text"
					placeholder="Filter…"
					aria-label="Filter actions"
					autocomplete="off"
					spellcheck="false"
					class="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none"
					onkeydown={onFilterKeydown}
					data-testid="hooks-menu-filter"
				/>
			</div>
			<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto">
				{#each visible as hookOption (hookOptionKey(hookOption))}
					<DropdownMenuItem onclick={() => run(hookOption)}>
						<span class="truncate" title={hookOption.manual_hook_ui_name}>
							{hookOption.manual_hook_ui_name}
						</span>
					</DropdownMenuItem>
				{:else}
					<div class="px-2 py-1.5 text-xs text-muted-foreground">No matching action</div>
				{/each}
			</div>
		</DropdownMenuContent>
	</DropdownMenu>
{/if}
