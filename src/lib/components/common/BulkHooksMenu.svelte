<!--
  "Run" menu of a selection bar (or of a single object, with one
  target and a custom `trigger`): the manual hooks (modules, webhooks,
  AI workflows) registered for `hookType`, fired once against every
  selected object. A module gets the whole selection in one task and a
  webhook in one delivery; an AI workflow starts one run per object.

  Renders nothing when no hook targets this type, so hosts can drop it
  into their bar unconditionally.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDownIcon, ZapIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
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
	import { callAlertHook, callHook, hookOptionKey } from '$lib/utils/hooks';

	type Props = {
		hookType: HookObjectType;
		/** The case the targets belong to. Unused for alerts, which have their own invoker. */
		caseId?: number;
		targets: number[];
		disabled?: boolean;
		/** Entries the host already loaded; fetched here otherwise. */
		options?: HookOption[];
		/** Runs after a hook was queued without errors. */
		onDone?: () => void;
		/** Replaces the default "Run" button; spread `props` on the element. */
		trigger?: Snippet<[{ props: Record<string, unknown>; disabled: boolean }]>;
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
		align = 'start',
		side = 'bottom'
	}: Props = $props();

	let loaded = $state<HookOption[]>([]);
	let isRunning = $state(false);

	const entries = $derived(options ?? loaded);
	const isDisabled = $derived(disabled || isRunning || targets.length === 0);

	$effect(() => {
		if (options) return;
		const type = hookType;
		HooksService.list(type).then((response) => {
			loaded = Array.isArray(response.data) ? response.data : [];
		});
	});

	const run = async (hookOption: HookOption) => {
		if (targets.length === 0) return;
		if (hookType !== 'alert' && caseId === undefined) return;

		isRunning = true;
		try {
			const result =
				hookType === 'alert'
					? await callAlertHook([...targets], hookOption)
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
</script>

{#if entries.length}
	<DropdownMenu>
		<DropdownMenuTrigger disabled={isDisabled}>
			{#snippet child({ props })}
				{#if trigger}
					{@render trigger({ props, disabled: isDisabled })}
				{:else}
					<Button {...props} size="xs" variant="outline" disabled={isDisabled}>
						<ZapIcon size={12} />
						Run
						<ChevronDownIcon size={12} />
					</Button>
				{/if}
			{/snippet}
		</DropdownMenuTrigger>

		<DropdownMenuContent {align} {side}>
			{#if targets.length > 1}
				<DropdownMenuLabel class="text-2xs font-normal text-muted-foreground">
					On {targets.length} selected
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
			{/if}
			{#each entries as hookOption (hookOptionKey(hookOption))}
				<DropdownMenuItem onclick={() => run(hookOption)}>
					{hookOption.manual_hook_ui_name}
				</DropdownMenuItem>
			{/each}
		</DropdownMenuContent>
	</DropdownMenu>
{/if}
