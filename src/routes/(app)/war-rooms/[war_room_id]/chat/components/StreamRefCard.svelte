<!--
  Inline reference card rendered alongside system-kind rows in the
  Stream. When a row carries (ref_type, ref_id) — e.g. a sitrep_published
  row referencing the SitRep that was just drafted — this turns the
  pointer into a clickable chip the operator can use to jump straight
  to the referenced object instead of hunting it down in the right tab.
-->
<script lang="ts">
	import { ExternalLink } from 'lucide-svelte';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import type { WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import { resolveStreamRef } from './stream-ref';

	type Props = {
		warRoomId: number;
		refType: string | null;
		refId: number | null;
		refCaseId: number | null;
		/**
		 * Optional in-memory lookup of the war room's attached cases.
		 * When provided, a hover tooltip on case-kind chips reveals the
		 * full case name + customer, matching the mention-chip hover UX
		 * the case notes use.
		 */
		attachedCases?: WarRoomCaseAttachment[];
	};
	let { warRoomId, refType, refId, refCaseId, attachedCases = [] }: Props = $props();

	const caseLookup = $derived.by(() => {
		const id =
			refType === 'case' ? (refId ?? refCaseId) : refType === 'user_activity' ? refCaseId : null;
		if (id == null) return null;
		return attachedCases.find((a) => a.case_id === id) ?? null;
	});

	const resolved = $derived(resolveStreamRef(warRoomId, refType, refId, refCaseId));
</script>

{#if resolved}
	{#if resolved.href && caseLookup}
		<!-- Case chip with a name + customer tooltip — same hover UX
		     the case-notes mention chips give. -->
		<!--
		  `delayDuration={0}` makes the tooltip appear instantly on
		  hover. The stream chip is a glance-and-go affordance — a
		  300ms wait makes it feel laggy when the operator is scanning
		  several rows quickly.
		-->
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipTrigger>
					<a
						href={resolved.href}
						class={[
							'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium transition-colors hover:brightness-110',
							resolved.cls
						]}
					>
						<resolved.Icon class="h-3 w-3 shrink-0" />
						<span>{resolved.label}</span>
						<ExternalLink class="h-2.5 w-2.5 shrink-0 opacity-60" />
					</a>
				</TooltipTrigger>
				<TooltipContent side="top" align="end" class="max-w-xs">
					<p class="text-xs font-semibold">{caseLookup.case_name}</p>
					{#if caseLookup.customer_name}
						<p class="text-2xs text-muted-foreground">
							{caseLookup.customer_name}
						</p>
					{/if}
					{#if caseLookup.owner_name || caseLookup.owner_login}
						<p class="text-2xs text-muted-foreground">
							Owner: {caseLookup.owner_name || caseLookup.owner_login}
						</p>
					{/if}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	{:else if resolved.href}
		<a
			href={resolved.href}
			class={[
				'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium transition-colors hover:brightness-110',
				resolved.cls
			]}
		>
			<resolved.Icon class="h-3 w-3 shrink-0" />
			<span>{resolved.label}</span>
			<ExternalLink class="h-2.5 w-2.5 shrink-0 opacity-60" />
		</a>
	{:else}
		<span
			class={[
				'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium',
				resolved.cls
			]}
		>
			<resolved.Icon class="h-3 w-3 shrink-0" />
			<span>{resolved.label}</span>
		</span>
	{/if}
{/if}
