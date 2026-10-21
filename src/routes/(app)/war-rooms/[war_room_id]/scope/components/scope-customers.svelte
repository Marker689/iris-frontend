<!--
  Customers of the attached cases the caller can read, with their cases
  and the asset / IOC totals over them. "Assets" opens the Assets tab
  filtered on the customer. Cases without a customer are listed last.
-->
<script lang="ts">
	import { Building2, Flame, Server } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ScopeCustomerSummary } from '$lib/services/war-room-scope.service';
	import { caseNumberedName } from '$lib/utils/case-name';

	type Props = {
		customers: ScopeCustomerSummary[];
		/** False without vulnerability read: the Vulns column is hidden. */
		showVulnerabilities?: boolean;
		onShowAssets: (customerId: number) => void;
	};

	let { customers, showVulnerabilities = true, onShowAssets }: Props = $props();

	const TH = 'h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground';
	const TD = 'px-2 py-1.5 align-middle';
	// Beyond this, the remaining cases are summed up in a "+N" chip.
	const MAX_CASES = 8;
</script>

<div class="max-h-[70vh] overflow-auto rounded-md border">
	<table class="w-full caption-bottom text-sm" data-testid="scope-customers-table">
		<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
			<tr class="border-b">
				<th class={TH}>Customer</th>
				<th class={TH}>Cases</th>
				<th class={`${TH} text-right`}>Assets</th>
				<th class={`${TH} text-right`}>Compromised</th>
				<th class={`${TH} text-right`} title="Assets carrying a flag of kind done">Done</th>
				<th class={`${TH} text-right`} title="Distinct IOCs per case, summed">IOCs</th>
				{#if showVulnerabilities}
					<th class={`${TH} text-right`} title="Open vulnerability findings">Open vulns</th>
				{/if}
				<th class={`${TH} w-10`}><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody class="[&_tr:last-child]:border-0">
			{#each customers as c (c.customer_id ?? 'none')}
				<tr
					class="border-b transition-colors hover:bg-muted/50"
					data-testid="scope-customer-row"
					data-customer-id={c.customer_id ?? ''}
				>
					<td class={`${TD} whitespace-nowrap`}>
						<span class="inline-flex items-center gap-1.5 font-medium">
							<Building2 class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
							{#if c.customer_id === null}
								<span class="text-muted-foreground">No customer</span>
							{:else}
								{c.customer_name ?? `Customer #${c.customer_id}`}
							{/if}
						</span>
					</td>
					<td class={TD}>
						<div class="flex max-w-[32rem] flex-wrap items-center gap-1">
							{#each c.cases.slice(0, MAX_CASES) as k (k.case_id)}
								<a
									href={`/case/${k.case_id}`}
									class="rounded-md border px-1.5 py-px font-mono text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									title={caseNumberedName(k.case_id, k.case_name)}
								>
									#{k.case_id}
								</a>
							{/each}
							{#if c.cases.length > MAX_CASES}
								<span
									class="text-2xs text-muted-foreground"
									title={c.cases
										.slice(MAX_CASES)
										.map((k) => caseNumberedName(k.case_id, k.case_name))
										.join('\n')}
								>
									+{c.cases.length - MAX_CASES}
								</span>
							{/if}
						</div>
					</td>
					<td class={`${TD} text-right text-xs tabular-nums`}>{c.assets}</td>
					<td
						class={[
							`${TD} text-right text-xs tabular-nums`,
							c.compromised > 0 && 'font-medium text-destructive'
						]}
					>
						{c.compromised}
					</td>
					<td class={`${TD} text-right text-xs tabular-nums`}>{c.done}</td>
					<td class={`${TD} text-right text-xs tabular-nums`}>{c.iocs}</td>
					{#if showVulnerabilities}
						<td class={`${TD} text-right text-xs tabular-nums`}>
							<span
								class={[
									'inline-flex items-center gap-1',
									(c.vuln_exploited_open ?? 0) > 0 && 'font-medium text-red-700 dark:text-red-300'
								]}
								title={`${c.vuln_exploited_open ?? 0} exploited and open`}
							>
								{#if (c.vuln_exploited_open ?? 0) > 0}
									<Flame class="h-3 w-3" aria-hidden="true" />
								{/if}
								{c.vuln_open ?? 0}
							</span>
						</td>
					{/if}
					<td class={TD}>
						{#if c.customer_id !== null}
							{@const customerId = c.customer_id}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 gap-1.5 text-xs"
								onclick={() => onShowAssets(customerId)}
								title="Show the assets of this customer"
								data-testid="scope-customer-assets"
							>
								<Server class="h-3.5 w-3.5" /> Assets
							</Button>
						{/if}
					</td>
				</tr>
			{/each}
			{#if customers.length === 0}
				<tr>
					<td
						colspan={showVulnerabilities ? 8 : 7}
						class="p-6 text-center text-sm text-muted-foreground"
					>
						No attached case you can access. Attach cases from the Cases tab first.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
