<!--
  Set or remove one or several status flags on one or many assets
  (possibly across several cases); the reason and the decision apply to
  every picked flag. Each change adds or updates an event on the case
  "Asset status" timeline. Flags with `requires_reason` /
  `requires_decision` cannot be set without a reason / a linked
  decision; the server enforces the same rule. Removing never needs
  either.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Flag, Gavel, Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import AssetFlagChip from '$lib/components/common/assets/AssetFlagChip.svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import {
		WarRoomScopeService,
		type ScopeAsset,
		type ScopeDecisionRef,
		type ScopeFlagAction
	} from '$lib/services/war-room-scope.service';
	import ScopeOutcomes from './scope-outcomes.svelte';
	import { errorMessage, outcomesFailed, summariseOutcomes, type ScopeOutcome } from './helpers';

	type Props = {
		open: boolean;
		warRoomId: number;
		flags: AssetFlag[];
		assets: ScopeAsset[];
		/** Pre-picked flag (board drop); none by default. More can be picked. */
		initialFlagId?: number | null;
		initialAction?: ScopeFlagAction;
		onDone?: () => void;
	};

	let {
		open = $bindable(),
		warRoomId,
		flags,
		assets,
		initialFlagId,
		initialAction = 'set',
		onDone
	}: Props = $props();

	const MAX_REASON = 4000;

	let flagIds = $state<number[]>([]);
	let action = $state<ScopeFlagAction>('set');
	let reason = $state('');
	let decisionId = $state<number | null>(null);
	let decisions = $state<ScopeDecisionRef[]>([]);
	let submitting = $state(false);
	let outcomes = $state<ScopeOutcome[] | null>(null);

	const loadDecisions = async () => {
		const res = await WarRoomScopeService.listDecisionRefs(warRoomId);
		decisions =
			res.ok && Array.isArray(res.data)
				? res.data.filter(
						(d) =>
							d.decision_id === decisionId || (d.status !== 'rejected' && d.status !== 'superseded')
					)
				: [];
	};

	// With a single asset already carrying the (single) picked flag, start
	// from its current reason / decision so "set" reads as an update.
	const prefill = () => {
		const single = assets.length === 1 && flagIds.length === 1 ? assets[0] : null;
		const current = single?.flags?.find((f) => f.flag_id === flagIds[0]) ?? null;
		reason = action === 'set' && current ? (current.reason ?? '') : '';
		decisionId = action === 'set' && current ? current.decision_id : null;
	};

	$effect(() => {
		if (open) {
			untrack(() => {
				flagIds = initialFlagId != null ? [initialFlagId] : [];
				action = initialAction;
				prefill();
				outcomes = null;
				submitting = false;
				void loadDecisions();
			});
		}
	});

	const toggleFlag = (id: number) => {
		flagIds = flagIds.includes(id) ? flagIds.filter((f) => f !== id) : [...flagIds, id];
		prefill();
	};

	const pickAction = (next: ScopeFlagAction) => {
		action = next;
		prefill();
	};

	// In the taxonomy order, whatever the click order.
	const picked = $derived(flags.filter((f) => flagIds.includes(f.id)));
	const single = $derived(picked.length === 1 ? picked[0] : null);
	const removing = $derived(action === 'clear');
	const caseCount = $derived(new Set(assets.map((a) => a.case_id)).size);
	const needsReason = $derived(picked.some((f) => f.requires_reason));
	const needsDecision = $derived(picked.some((f) => f.requires_decision));
	const reasonMissing = $derived(!removing && needsReason && !reason.trim());
	const decisionMissing = $derived(!removing && needsDecision && decisionId == null);
	const pickedLabel = $derived(
		picked.length <= 3 ? picked.map((f) => f.name).join(', ') : `${picked.length} flags`
	);
	const canSubmit = $derived(
		assets.length > 0 &&
			picked.length > 0 &&
			!reasonMissing &&
			!decisionMissing &&
			reason.length <= MAX_REASON
	);
	const caseNames = $derived(Object.fromEntries(assets.map((a) => [a.case_id, a.case_name])));

	const submit = async () => {
		if (!canSubmit || submitting) return;
		submitting = true;
		const trimmed = reason.trim();
		const res = await WarRoomScopeService.bulkFlag(warRoomId, {
			asset_ids: assets.map((a) => a.asset_id),
			...(single ? { flag_id: single.id } : { flag_ids: picked.map((f) => f.id) }),
			action,
			reason: trimmed || undefined,
			decision_id: removing ? undefined : decisionId
		});
		submitting = false;

		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: removing ? 'Could not remove the flags' : 'Could not set the flags',
				description: errorMessage(res, 'The server refused the change.'),
				variant: 'destructive'
			});
			return;
		}

		const byId = new Map(assets.map((a) => [a.asset_id, a.asset_name]));
		const caseOf = new Map(assets.map((a) => [a.asset_id, a.case_id]));
		// The backend reports `case_id: null` for an asset it cannot find.
		const rows: ScopeOutcome[] = res.data.results.map((r) => ({
			case_id: r.case_id ?? caseOf.get(r.asset_id) ?? 0,
			status: r.status,
			label: byId.get(r.asset_id) ?? `Asset #${r.asset_id}`,
			message: r.message
		}));

		if (!outcomesFailed(rows)) {
			toast({
				title: removing ? `${pickedLabel} removed` : `${pickedLabel} set`,
				description: summariseOutcomes(rows),
				variant: 'success'
			});
			open = false;
			onDone?.();
			return;
		}
		outcomes = rows;
	};

	const close = () => {
		const hadResults = outcomes !== null;
		open = false;
		if (hadResults) onDone?.();
	};
</script>

<Dialog
	bind:open
	onOpenChange={(v) => {
		if (!v && outcomes !== null) onDone?.();
	}}
>
	<DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle class="flex items-center gap-2">
				<Flag class="h-4 w-4 text-primary" aria-hidden="true" />
				{removing ? 'Remove flags' : 'Set flags'}
			</DialogTitle>
			<DialogDescription>
				{#if assets.length === 1}
					{assets[0].asset_name} in #{assets[0].case_id} {assets[0].case_name}
				{:else}
					{assets.length} assets across {caseCount}
					{caseCount === 1 ? 'case' : 'cases'}
				{/if}
				· recorded on the case "Asset status" timeline
			</DialogDescription>
		</DialogHeader>

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if outcomes}
				<ScopeOutcomes rows={outcomes} {caseNames} />
			{:else}
				<div class="flex gap-1 rounded-md border p-0.5" role="radiogroup" aria-label="Action">
					{#each [['set', 'Set'], ['clear', 'Remove']] as const as [value, label] (value)}
						<button
							type="button"
							role="radio"
							aria-checked={action === value}
							class={[
								'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
								action === value
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-muted'
							]}
							onclick={() => pickAction(value)}
						>
							{label}
						</button>
					{/each}
				</div>

				<fieldset>
					<legend class="text-xs font-medium text-muted-foreground">
						Flags <span class="font-normal">(pick one or more)</span>
					</legend>
					{#if flags.length === 0}
						<p class="mt-1.5 text-2xs text-muted-foreground">
							No asset flag is configured. An administrator can add them in Settings → Asset flags.
						</p>
					{/if}
					<div class="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Flags">
						{#each flags as f (f.id)}
							{@const active = flagIds.includes(f.id)}
							<button
								type="button"
								role="checkbox"
								aria-checked={active}
								class={[
									'inline-flex items-center gap-1 rounded-lg border p-1 transition-colors',
									active
										? 'border-primary bg-primary/10 ring-1 ring-primary/40'
										: 'border-transparent hover:bg-muted'
								]}
								onclick={() => toggleFlag(f.id)}
							>
								<AssetFlagChip flag={f} size="sm" />
								{#if f.requires_decision}
									<Gavel class="h-3 w-3 text-muted-foreground" aria-label="Requires a decision" />
								{/if}
							</button>
						{/each}
					</div>
					{#if single?.description}
						<p class="mt-1.5 text-2xs text-muted-foreground">{single.description}</p>
					{/if}
				</fieldset>

				<div>
					<label class="text-xs font-medium text-muted-foreground" for="scope-flag-reason">
						Reason {!removing && needsReason ? '(required)' : '(optional)'}
					</label>
					<Textarea
						id="scope-flag-reason"
						value={reason}
						oninput={(e) => (reason = (e.target as HTMLTextAreaElement).value)}
						rows={3}
						maxlength={MAX_REASON}
						placeholder={removing
							? single
								? 'Why is the flag removed?'
								: 'Why are the flags removed?'
							: picked.some((f) => f.kind === 'exception')
								? 'Why is this asset an exception?'
								: 'Context for the timeline event'}
						class="mt-1"
						aria-invalid={reasonMissing}
						aria-required={!removing && needsReason}
					/>
					{#if reasonMissing}
						<p class="mt-1 text-2xs text-destructive">
							{single ? 'This flag requires' : 'A picked flag requires'} a reason.
						</p>
					{/if}
				</div>

				{#if !removing}
					<div>
						<label class="text-xs font-medium text-muted-foreground" for="scope-flag-decision">
							Decision {needsDecision ? '(required)' : '(optional)'}
						</label>
						<select
							id="scope-flag-decision"
							class="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
							value={decisionId == null ? '' : String(decisionId)}
							onchange={(e) => {
								const v = (e.target as HTMLSelectElement).value;
								decisionId = v ? Number(v) : null;
							}}
							aria-invalid={decisionMissing}
						>
							<option value="">No decision</option>
							{#each decisions as d (d.decision_id)}
								<option value={String(d.decision_id)}>{d.ref} · {d.title} ({d.status})</option>
							{/each}
						</select>
						{#if decisionMissing}
							<p class="mt-1 text-2xs text-destructive">
								{single ? 'This flag requires' : 'A picked flag requires'} a decision from the register.
							</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<DialogFooter class="border-t px-6 py-3">
			{#if outcomes}
				<Button onclick={close}>Done</Button>
			{:else}
				<Button variant="ghost" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
				<Button
					onclick={submit}
					disabled={!canSubmit || submitting}
					variant={removing ? 'destructive' : 'default'}
					class="gap-1.5"
				>
					{#if submitting}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{/if}
					{removing ? 'Remove from' : 'Apply to'}
					{assets.length}
					{assets.length === 1 ? 'asset' : 'assets'}
				</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
