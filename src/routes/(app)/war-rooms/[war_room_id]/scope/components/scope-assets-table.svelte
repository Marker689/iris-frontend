<!--
  Assets of every readable attached case. Rows sharing a group_key (same
  type + name) are flagged: the same machine is tracked in several cases.
  The Vulns column lists the findings as identifier tags (click one to
  filter the scope on it) with an inline "+" to record a new one.
  With a paginated list, case group headers and sightings come from the
  server-side totals so they cover every page, not just the loaded one.
  Grouped by vulnerability, an asset is listed under each vulnerability
  it has a finding on (loaded page only), then the assets without any.
  Registry assets attached to the room (Assets Manager, not in a case)
  are listed in the same groups, after the case assets: under their
  linked case, else in a "Not in a case" group. They have no customer,
  flag, compromise or IOC data, and are edited / detached, not selected.
  With write access, the Compromise and Analysis cells open a status menu.
  Each group header can copy its rows to the clipboard as a table.
-->
<script lang="ts">
	import { caseNameWithoutNumber, caseNumberedName } from '$lib/utils/case-name';
	import {
		Building2,
		ClipboardCopy,
		Copy,
		Flame,
		Gavel,
		Link2,
		Paperclip,
		Pencil,
		Plus,
		Send,
		ShieldAlert,
		ShieldCheck,
		ShieldQuestion,
		ShieldX,
		Trash2
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import AssetFlagChips from '$lib/components/common/assets/AssetFlagChips.svelte';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import type {
		ScopeAsset,
		ScopeAssetCaseTotals,
		ScopeCase,
		ScopeRegistryAsset,
		ScopeStatusChange
	} from '$lib/services/war-room-scope.service';
	import ScopeStatusMenu from './scope-status-menu.svelte';
	import { SEVERITY_CLASSES, SEVERITY_LABELS } from '$lib/components/vulnerabilities/labels';
	import { SELECT_CHECKBOX_CLASS, caseLabel, limitedList } from './helpers';
	import {
		assetVulnTagTitle,
		assetVulnTags,
		findingRefs,
		groupRowsByVulnerability,
		registryRowRefs,
		sumVulnCounts,
		vulnTooltip,
		type AssetGroupMode,
		type VulnGroup
	} from './vulnerability-helpers';

	type Props = {
		assets: ScopeAsset[];
		/**
		 * Loaded assets by group_key, the fallback to count sightings in other
		 * cases when the server did not send `sighting_count`.
		 */
		sightings: Map<string, ScopeAsset[]>;
		/** Per-case totals over every page (paginated lists only). */
		caseTotals?: Map<number, ScopeAssetCaseTotals>;
		flags: AssetFlag[];
		cases: ScopeCase[];
		selected: number[];
		onSelectionChange: (next: number[]) => void;
		groupBy: AssetGroupMode;
		canWrite: boolean;
		onFlag: (asset: ScopeAsset) => void;
		onPush: (asset: ScopeAsset) => void;
		/** Change the compromise / analysis status; the cells are read-only when unset. */
		onSetStatus?: (asset: ScopeAsset, change: ScopeStatusChange) => void;
		analysisStatuses?: AnalysisStatusItem[];
		/** Record a finding on this asset; the "+" is hidden when unset. */
		onRecordVulnerability?: (asset: ScopeAsset) => void;
		/** Filter the scope on a vulnerability identifier (tag click). */
		onFilterVulnerability?: (identifier: string) => void;
		/** Identifier currently filtered on, highlighted in the tags. */
		activeVulnerability?: string | null;
		/** False without vulnerability read: the Vulns column and counts are hidden. */
		showVulnerabilities?: boolean;
		/** Registry assets attached to the room, already filtered. */
		attached?: ScopeRegistryAsset[];
		onEditAttached?: (row: ScopeRegistryAsset) => void;
		onDetachAttached?: (row: ScopeRegistryAsset) => void;
		/** Attachment being detached, its button is disabled. */
		detachingId?: number | null;
		/** Copy the rows of one group; the group headers have no copy button when unset. */
		onCopyGroup?: (assets: ScopeAsset[], attached: ScopeRegistryAsset[]) => void;
	};

	let {
		assets,
		sightings,
		caseTotals,
		flags,
		cases,
		selected,
		onSelectionChange,
		groupBy,
		canWrite,
		onFlag,
		onPush,
		onSetStatus,
		analysisStatuses = [],
		onRecordVulnerability,
		onFilterVulnerability,
		activeVulnerability = null,
		showVulnerabilities = true,
		attached = [],
		onEditAttached,
		onDetachAttached,
		detachingId = null,
		onCopyGroup
	}: Props = $props();

	const TH = 'h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground';
	const TD = 'px-2 py-1.5 align-middle';
	const STATUS_TRIGGER =
		'-mx-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

	const flagById = $derived(new Map(flags.map((f) => [f.id, f])));
	const selectedSet = $derived(new Set(selected));
	const allSelected = $derived(
		assets.length > 0 && assets.every((a) => selectedSet.has(a.asset_id))
	);
	const someSelected = $derived(!allSelected && assets.some((a) => selectedSet.has(a.asset_id)));

	type Item = { kind: 'case'; a: ScopeAsset } | { kind: 'attached'; r: ScopeRegistryAsset };

	type Group = {
		key: string;
		c: ScopeCase | null;
		v: VulnGroup<Item> | null;
		rows: ScopeAsset[];
		attached: ScopeRegistryAsset[];
	};

	const groupByCase = $derived(groupBy === 'case');

	const caseGroups = (): Group[] => {
		const byCase = new Map<number, ScopeAsset[]>();
		for (const a of assets) {
			const list = byCase.get(a.case_id);
			if (list) list.push(a);
			else byCase.set(a.case_id, [a]);
		}
		const knownIds = new Set(cases.map((c) => c.case_id));
		const attachedByCase = new Map<number, ScopeRegistryAsset[]>();
		const unlinked: ScopeRegistryAsset[] = [];
		for (const r of attached) {
			if (r.case_id === null || !knownIds.has(r.case_id)) {
				unlinked.push(r);
				continue;
			}
			const list = attachedByCase.get(r.case_id);
			if (list) list.push(r);
			else attachedByCase.set(r.case_id, [r]);
		}
		const out: Group[] = cases
			.filter((c) => byCase.has(c.case_id) || attachedByCase.has(c.case_id))
			.map((c) => ({
				key: `c:${c.case_id}`,
				c,
				v: null,
				rows: byCase.get(c.case_id) ?? [],
				attached: attachedByCase.get(c.case_id) ?? []
			}));
		// Rows whose case is missing from `cases` (should not happen) stay visible.
		const orphans = assets.filter((a) => !knownIds.has(a.case_id));
		if (orphans.length) out.push({ key: 'orphans', c: null, v: null, rows: orphans, attached: [] });
		if (unlinked.length) {
			out.push({ key: 'unlinked', c: null, v: null, rows: [], attached: unlinked });
		}
		return out;
	};

	const vulnerabilityGroups = (): Group[] => {
		const items: Item[] = [
			...assets.map((a) => ({ kind: 'case' as const, a })),
			...attached.map((r) => ({ kind: 'attached' as const, r }))
		];
		return groupRowsByVulnerability(items, (it) =>
			it.kind === 'case' ? findingRefs(it.a.vulnerabilities) : registryRowRefs(it.r)
		).map((v) => ({
			key: v.key,
			c: null,
			v,
			rows: v.rows.flatMap((it) => (it.kind === 'case' ? [it.a] : [])),
			attached: v.rows.flatMap((it) => (it.kind === 'attached' ? [it.r] : []))
		}));
	};

	const groups = $derived.by((): Group[] => {
		if (groupBy === 'case') return caseGroups();
		if (groupBy === 'vulnerability' && showVulnerabilities) return vulnerabilityGroups();
		return [{ key: 'all', c: null, v: null, rows: assets, attached }];
	});

	const columnCount = $derived((groupByCase ? 12 : 13) - (showVulnerabilities ? 0 : 1));

	const toggle = (id: number, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(id);
		else next.delete(id);
		onSelectionChange([...next]);
	};

	const toggleAll = () => {
		const ids = new Set(assets.map((a) => a.asset_id));
		if (allSelected) onSelectionChange(selected.filter((id) => !ids.has(id)));
		else onSelectionChange([...new Set([...selected, ...ids])]);
	};

	const casesById = $derived(new Map(cases.map((c) => [c.case_id, c])));

	/** Other cases tracking the same asset: count and a bounded tooltip. */
	const otherCases = (a: ScopeAsset): { count: number; title: string } => {
		if (a.sighting_count != null) {
			const labels = (a.sighting_case_ids ?? []).map((id) => {
				const c = casesById.get(id);
				return c ? caseLabel(c) : `#${id}`;
			});
			const hidden = a.sighting_count - labels.length;
			const list = limitedList(labels, 10);
			return {
				count: a.sighting_count,
				title: `Also in ${list}${hidden > 0 ? ` and ${hidden} more` : ''}`
			};
		}
		const others = (sightings.get(a.group_key) ?? []).filter((o) => o.case_id !== a.case_id);
		return {
			count: others.length,
			title: `Also in ${limitedList(
				others.map((o) => caseNumberedName(o.case_id, o.case_name)),
				10
			)}`
		};
	};

	/** Group header figures: server totals when known, else the loaded rows. */
	const groupStats = (caseId: number, rows: ScopeAsset[]) => {
		const t = caseTotals?.get(caseId);
		if (t) {
			return {
				total: t.assets,
				done: t.done,
				open: t.vuln_open,
				exploitedOpen: t.vuln_exploited_open,
				title: `${t.vuln_open} open finding(s), ${t.vuln_exploited_open} exploited and open`
			};
		}
		const v = sumVulnCounts(rows);
		return {
			total: rows.length,
			done: doneCount(rows),
			open: v.vuln_open_count,
			exploitedOpen: v.vuln_exploited_open_count,
			title: vulnTooltip(v)
		};
	};

	const compromiseLabel = (id: number | null): string =>
		id != null && id in COMPROMISE_STATUS
			? COMPROMISE_STATUS[id as keyof typeof COMPROMISE_STATUS]
			: '—';

	const doneCount = (rows: ScopeAsset[]): number =>
		rows.filter((r) => (r.flags ?? []).some((f) => flagById.get(f.flag_id)?.kind === 'done'))
			.length;

	const flagsTitle = (a: ScopeAsset): string => {
		const lines = (a.flags ?? []).map((f) => {
			const name = flagById.get(f.flag_id)?.name ?? `Flag #${f.flag_id}`;
			return f.reason ? `${name}: ${f.reason}` : name;
		});
		return lines.length ? lines.join('\n') : 'No flag';
	};

	const attachedTitle = (r: ScopeRegistryAsset): string => {
		const added = [
			r.added_at ? `Attached ${formatDateTime(r.added_at)}` : 'Attached',
			r.added_by_name ? `by ${r.added_by_name}` : ''
		]
			.filter(Boolean)
			.join(' ');
		return [r.asset_description, `${added} from the Assets Manager`, r.is_active ? '' : 'Inactive']
			.filter(Boolean)
			.join('\n');
	};
</script>

{#snippet copyGroup(g: Group, label: string)}
	{#if onCopyGroup && g.rows.length + g.attached.length > 0}
		<Button
			variant="ghost"
			size="sm"
			class="ml-auto h-6 gap-1 px-1.5 text-2xs text-muted-foreground"
			onclick={() => onCopyGroup(g.rows, g.attached)}
			aria-label={`Copy the assets of ${label}`}
			title="Copy the rows of this group as a table, with the columns of the last CSV download"
			data-testid="scope-assets-group-copy"
		>
			<ClipboardCopy class="h-3 w-3" aria-hidden="true" /> Copy
		</Button>
	{/if}
{/snippet}

{#snippet compromise(a: ScopeAsset)}
	<span class="inline-flex items-center gap-1">
		{#if a.asset_compromise_status_id === 1}
			<ShieldAlert class="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
		{:else if a.asset_compromise_status_id === 2}
			<ShieldCheck class="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
		{:else}
			<ShieldQuestion class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
		{/if}
		{compromiseLabel(a.asset_compromise_status_id)}
	</span>
{/snippet}

<div class="max-h-[70vh] overflow-auto rounded-md border">
	<table class="w-full caption-bottom text-sm" data-testid="scope-assets-table">
		<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
			<tr class="border-b">
				<th class={`${TH} w-8`}>
					<Checkbox
						class={SELECT_CHECKBOX_CLASS}
						checked={allSelected}
						indeterminate={someSelected}
						onCheckedChange={toggleAll}
						aria-label="Select all visible assets"
					/>
				</th>
				<th class={TH}>Asset</th>
				<th class={TH}>Type</th>
				<th class={TH}>IP</th>
				{#if !groupByCase}
					<th class={TH}>Case</th>
				{/if}
				<th class={TH}>Customer</th>
				<th class={TH}>Compromise</th>
				<th class={TH} title="Investigation progress (case analysis status)">Analysis</th>
				<th class={TH} title="Status flags (isolated, patched…)">Flags</th>
				<th class={`${TH} text-right`}>IOCs</th>
				{#if showVulnerabilities}
					<th class={TH} title="Vulnerability findings, open first">Vulns</th>
				{/if}
				<th class={TH}>Updated</th>
				<th class={`${TH} w-10`}><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody class="[&_tr:last-child]:border-0">
			{#each groups as g (g.key)}
				{#if groupByCase && g.c}
					{@const st = groupStats(g.c.case_id, g.rows)}
					<tr class="border-b bg-muted/30">
						<td colspan={columnCount} class="px-2 py-1.5">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								<a
									href={`/case/${g.c.case_id}/assets`}
									class="font-medium hover:underline"
									title="Open the case assets"
								>
									{caseLabel(g.c)}
								</a>
								{#if g.c.customer_name}
									<span class="inline-flex items-center gap-1 text-muted-foreground">
										<Building2 class="h-3 w-3 opacity-70" aria-hidden="true" />
										{g.c.customer_name}
									</span>
								{/if}
								<span class="text-muted-foreground">
									{#if st.total > g.rows.length}
										{g.rows.length} shown of
									{/if}
									{st.total}
									{st.total === 1 ? 'asset' : 'assets'} · {st.done} done
									{#if g.attached.length}
										· {g.attached.length} attached
									{/if}
								</span>
								{#if showVulnerabilities && st.open > 0}
									<a
										href={`/case/${g.c.case_id}/assets`}
										class={[
											'inline-flex items-center gap-1 hover:underline',
											st.exploitedOpen > 0
												? 'font-medium text-red-700 dark:text-red-300'
												: 'text-muted-foreground'
										]}
										title={st.title}
									>
										{#if st.exploitedOpen > 0}
											<Flame class="h-3 w-3" aria-hidden="true" />
										{/if}
										{st.open} open
										{st.open === 1 ? 'vulnerability' : 'vulnerabilities'}
									</a>
								{/if}
								{@render copyGroup(g, caseLabel(g.c))}
							</div>
						</td>
					</tr>
				{:else if g.v}
					{@const v = g.v}
					<tr class="border-b bg-muted/30" data-testid="scope-assets-vuln-group">
						<td colspan={columnCount} class="px-2 py-1.5">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								{#if v.identifier && v.severity}
									<button
										type="button"
										class={[
											'inline-flex items-center gap-1 rounded-md border px-1.5 py-px font-mono text-2xs font-medium transition-opacity hover:opacity-80 disabled:cursor-default',
											SEVERITY_CLASSES[v.severity] ?? SEVERITY_CLASSES.unknown
										]}
										onclick={() => onFilterVulnerability?.(v.identifier ?? '')}
										disabled={!onFilterVulnerability}
										title={`${SEVERITY_LABELS[v.severity] ?? v.severity} — click to filter the scope on it`}
									>
										{v.identifier}
									</button>
									{#if v.vulnerability_id !== null}
										<a
											href={`/manage/vulnerabilities/${v.vulnerability_id}`}
											class="text-muted-foreground hover:underline"
										>
											Catalogue entry
										</a>
									{/if}
									{#if v.kev}
										<span
											class="rounded-md border border-red-500/40 px-1 py-px text-2xs font-medium text-red-700 dark:text-red-300"
										>
											KEV
										</span>
									{/if}
								{:else}
									<span class="inline-flex items-center gap-1 font-medium">
										<ShieldX class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
										No vulnerability
									</span>
								{/if}
								<span class="text-muted-foreground">
									{g.rows.length + g.attached.length}
									{g.rows.length + g.attached.length === 1 ? 'asset' : 'assets'}
									{#if v.identifier}
										· {v.open} still open
									{/if}
								</span>
								{#if v.exploitedOpen > 0}
									<span
										class="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300"
									>
										<Flame class="h-3 w-3" aria-hidden="true" />
										{v.exploitedOpen} exploited
									</span>
								{/if}
								{@render copyGroup(g, v.identifier ?? 'the assets without vulnerability')}
							</div>
						</td>
					</tr>
				{:else if groupByCase && g.key === 'unlinked'}
					<tr class="border-b bg-muted/30" data-testid="scope-assets-unlinked-group">
						<td colspan={columnCount} class="px-2 py-1.5">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
								<span class="inline-flex items-center gap-1 font-medium">
									<Paperclip class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
									Not in a case
								</span>
								<span class="text-muted-foreground">
									{g.attached.length}
									{g.attached.length === 1 ? 'asset' : 'assets'} attached from the Assets Manager
								</span>
								{@render copyGroup(g, 'the assets not in a case')}
							</div>
						</td>
					</tr>
				{/if}
				{#each g.rows as a (a.asset_id)}
					{@const others = otherCases(a)}
					{@const checked = selectedSet.has(a.asset_id)}
					{@const vulnTags = assetVulnTags(a.vulnerabilities)}
					<tr
						class={['border-b transition-colors hover:bg-muted/50', checked && 'bg-primary/5']}
						data-testid="scope-asset-row"
						data-asset-name={a.asset_name}
						data-case-id={a.case_id}
					>
						<td class={TD}>
							<Checkbox
								class={SELECT_CHECKBOX_CLASS}
								{checked}
								onCheckedChange={(v) => toggle(a.asset_id, !!v)}
								aria-label={`Select ${a.asset_name} in case #${a.case_id}`}
							/>
						</td>
						<td class={TD}>
							<div class="flex min-w-0 items-center gap-2">
								<a
									href={`/case/${a.case_id}/assets/${a.asset_id}`}
									class="truncate font-medium hover:underline"
									title={a.asset_description ?? a.asset_name}
								>
									{a.asset_name}
								</a>
								{#if others.count}
									<span
										class="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-1 py-px text-2xs text-sky-700 dark:text-sky-300"
										title={others.title}
									>
										<Copy class="h-2.5 w-2.5" aria-hidden="true" />+{others.count}
										{others.count === 1 ? 'case' : 'cases'}
									</span>
								{/if}
							</div>
						</td>
						<td class={`${TD} text-xs text-muted-foreground`}>{a.asset_type_name ?? '—'}</td>
						<td class={`${TD} font-mono text-xs`}>{a.asset_ip || '—'}</td>
						{#if !groupByCase}
							<td class={`${TD} text-xs`}>
								<span class="font-mono text-2xs text-muted-foreground">#{a.case_id}</span>
								<span class="max-w-[12rem] truncate">{caseNameWithoutNumber(a.case_name)}</span>
							</td>
						{/if}
						<td class={`${TD} text-xs text-muted-foreground`}>{a.customer_name ?? '—'}</td>
						<td class={`${TD} whitespace-nowrap text-xs`} data-testid="scope-asset-compromise">
							{#if canWrite && onSetStatus}
								<ScopeStatusMenu
									kind="compromise"
									value={a.asset_compromise_status_id}
									onSelect={(id) => onSetStatus(a, { asset_compromise_status_id: id })}
									label={`Change the compromise status of ${a.asset_name}`}
									triggerClass={STATUS_TRIGGER}
								>
									{@render compromise(a)}
								</ScopeStatusMenu>
							{:else}
								{@render compromise(a)}
							{/if}
						</td>
						<td
							class={`${TD} whitespace-nowrap text-xs text-muted-foreground`}
							data-testid="scope-asset-analysis"
						>
							{#if canWrite && onSetStatus}
								<ScopeStatusMenu
									kind="analysis"
									value={a.analysis_status_id}
									{analysisStatuses}
									onSelect={(id) => onSetStatus(a, { analysis_status_id: id })}
									label={`Change the analysis status of ${a.asset_name}`}
									triggerClass={STATUS_TRIGGER}
								>
									{a.analysis_status_name ?? '—'}
								</ScopeStatusMenu>
							{:else}
								{a.analysis_status_name ?? '—'}
							{/if}
						</td>
						<td class={TD}>
							<div class="flex items-center gap-1" data-testid="scope-asset-flags">
								{#if canWrite}
									<button
										type="button"
										class="rounded-md text-left transition-opacity hover:opacity-80"
										onclick={() => onFlag(a)}
										aria-label={`Change flags of ${a.asset_name}`}
										title={flagsTitle(a)}
									>
										<AssetFlagChips flags={a.flags} max={3} />
									</button>
								{:else}
									<span title={flagsTitle(a)}>
										<AssetFlagChips flags={a.flags} max={3} />
									</span>
								{/if}
								{#if (a.flags ?? []).some((f) => f.decision_id != null)}
									<Gavel class="h-3 w-3 text-muted-foreground" aria-label="Linked to a decision" />
								{/if}
							</div>
						</td>
						<td class={`${TD} text-right text-xs tabular-nums`}>{a.ioc_count}</td>
						{#if showVulnerabilities}
							<td class={`${TD} text-xs`} data-testid="scope-asset-vulns">
								<div class="flex max-w-[18rem] flex-wrap items-center gap-1">
									{#each vulnTags.visible as t (t.finding_id)}
										{@const active =
											!!activeVulnerability &&
											t.identifier.toLowerCase() === activeVulnerability.toLowerCase()}
										<button
											type="button"
											class={[
												'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border px-1.5 py-px font-mono text-2xs transition-opacity hover:opacity-80 disabled:cursor-default',
												t.group === 'open'
													? (SEVERITY_CLASSES[t.severity] ?? SEVERITY_CLASSES.unknown)
													: 'border-dashed text-muted-foreground line-through decoration-muted-foreground/50',
												active && 'ring-1 ring-primary ring-offset-1 ring-offset-background'
											]}
											onclick={() => onFilterVulnerability?.(t.identifier)}
											disabled={!onFilterVulnerability}
											title={assetVulnTagTitle(t)}
											data-testid="scope-asset-vuln-tag"
										>
											{#if t.exploited && t.group === 'open'}
												<Flame class="h-2.5 w-2.5" aria-hidden="true" />
											{/if}
											{t.identifier}
										</button>
									{/each}
									{#if vulnTags.hidden.length > 0}
										<a
											href={`/case/${a.case_id}/assets/${a.asset_id}?tab=vulnerabilities`}
											class="whitespace-nowrap rounded-md px-1 py-px text-2xs text-muted-foreground hover:underline"
											title={`${vulnTags.hidden.map((t) => t.identifier).join(', ')} — open the asset findings`}
										>
											+{vulnTags.hidden.length}
										</a>
									{/if}
									{#if vulnTags.visible.length === 0 && !onRecordVulnerability}
										<span class="text-muted-foreground" title={vulnTooltip(a)}>—</span>
									{/if}
									{#if onRecordVulnerability}
										<button
											type="button"
											class="inline-flex h-5 w-5 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
											onclick={() => onRecordVulnerability(a)}
											aria-label={`Record a vulnerability on ${a.asset_name}`}
											title="Record a vulnerability on this asset"
											data-testid="scope-asset-add-vuln"
										>
											<Plus class="h-3 w-3" />
										</button>
									{/if}
								</div>
							</td>
						{/if}
						<td class={`${TD} whitespace-nowrap text-xs text-muted-foreground`}>
							{a.date_update ? formatDateTime(a.date_update) : '—'}
						</td>
						<td class={TD}>
							{#if canWrite}
								<Button
									variant="ghost"
									size="icon"
									class="h-7 w-7 text-muted-foreground"
									onclick={() => onPush(a)}
									aria-label={`Push ${a.asset_name} to other cases`}
									title="Push to other cases"
								>
									<Send class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</td>
					</tr>
				{/each}
				{#each g.attached as r (r.id)}
					{@const tags = assetVulnTags(r.vulnerabilities)}
					{@const link = r.vulnerability}
					<tr
						class="border-b transition-colors hover:bg-muted/50"
						data-testid="scope-registry-row"
						data-asset-name={r.asset_name}
					>
						<td class={TD}>
							<span
								class="flex w-[1.05rem] justify-center text-muted-foreground"
								title="Attached from the Assets Manager"
							>
								<Paperclip class="h-3.5 w-3.5" aria-label="Attached from the Assets Manager" />
							</span>
						</td>
						<td class={TD}>
							<div class="flex min-w-0 items-center gap-2">
								<a
									href={`/manage/assets?asset=${r.managed_asset_id}`}
									class={[
										'truncate font-medium hover:underline',
										!r.is_active && 'text-muted-foreground'
									]}
									title={attachedTitle(r)}
								>
									{r.asset_name}
								</a>
								{#if r.criticality === 'critical' || r.criticality === 'high'}
									<span
										class="shrink-0 rounded-md border px-1 py-px text-2xs capitalize text-muted-foreground"
										title="Criticality in the Assets Manager"
									>
										{r.criticality}
									</span>
								{/if}
							</div>
							{#if r.note}
								<p class="max-w-[20rem] truncate text-2xs text-muted-foreground" title={r.note}>
									{r.note}
								</p>
							{/if}
						</td>
						<td class={`${TD} text-xs text-muted-foreground`}>{r.asset_type_name ?? '—'}</td>
						<td class={`${TD} font-mono text-xs`}>{r.asset_ip || r.asset_domain || '—'}</td>
						{#if !groupByCase}
							<td class={`${TD} text-xs`}>
								{#if r.case_id !== null}
									<a href={`/case/${r.case_id}/assets`} class="hover:underline">
										<span class="font-mono text-2xs text-muted-foreground">#{r.case_id}</span>
										<span class="max-w-[12rem] truncate">{caseNameWithoutNumber(r.case_name)}</span>
									</a>
								{/if}
							</td>
						{/if}
						<!-- Customer, compromise, analysis, flags, IOCs: case data, none here. -->
						<td class={TD}></td>
						<td class={TD}></td>
						<td class={TD}></td>
						<td class={TD}></td>
						<td class={TD}></td>
						{#if showVulnerabilities}
							<td class={`${TD} text-xs`} data-testid="scope-asset-vulns">
								<div class="flex max-w-[18rem] flex-wrap items-center gap-1">
									{#if link}
										<button
											type="button"
											class={[
												'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border px-1.5 py-px font-mono text-2xs transition-opacity hover:opacity-80 disabled:cursor-default',
												SEVERITY_CLASSES[link.severity] ?? SEVERITY_CLASSES.unknown,
												!!activeVulnerability &&
													link.identifier.toLowerCase() === activeVulnerability.toLowerCase() &&
													'ring-1 ring-primary ring-offset-1 ring-offset-background'
											]}
											onclick={() => onFilterVulnerability?.(link.identifier)}
											disabled={!onFilterVulnerability}
											title={`Linked: ${link.title || link.identifier}${link.kev ? ' · CISA KEV' : ''} — click to filter the scope on it`}
											data-testid="scope-asset-vuln-tag"
										>
											<Link2 class="h-2.5 w-2.5" aria-hidden="true" />
											{link.identifier}
										</button>
									{/if}
									{#each tags.visible as t (t.finding_id)}
										<button
											type="button"
											class={[
												'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border px-1.5 py-px font-mono text-2xs transition-opacity hover:opacity-80 disabled:cursor-default',
												t.group === 'open'
													? (SEVERITY_CLASSES[t.severity] ?? SEVERITY_CLASSES.unknown)
													: 'border-dashed text-muted-foreground line-through decoration-muted-foreground/50',
												!!activeVulnerability &&
													t.identifier.toLowerCase() === activeVulnerability.toLowerCase() &&
													'ring-1 ring-primary ring-offset-1 ring-offset-background'
											]}
											onclick={() => onFilterVulnerability?.(t.identifier)}
											disabled={!onFilterVulnerability}
											title={assetVulnTagTitle(t)}
											data-testid="scope-asset-vuln-tag"
										>
											{#if t.exploited && t.group === 'open'}
												<Flame class="h-2.5 w-2.5" aria-hidden="true" />
											{/if}
											{t.identifier}
										</button>
									{/each}
									{#if tags.hidden.length > 0}
										<a
											href={`/manage/assets?asset=${r.managed_asset_id}&tab=vulnerabilities`}
											class="whitespace-nowrap rounded-md px-1 py-px text-2xs text-muted-foreground hover:underline"
											title={`${tags.hidden.map((t) => t.identifier).join(', ')} — open the asset findings`}
										>
											+{tags.hidden.length}
										</a>
									{/if}
								</div>
							</td>
						{/if}
						<td class={`${TD} whitespace-nowrap text-xs text-muted-foreground`}>
							{r.added_at ? formatDateTime(r.added_at) : '—'}
						</td>
						<td class={`${TD} whitespace-nowrap`}>
							{#if canWrite}
								{#if onEditAttached}
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 text-muted-foreground"
										onclick={() => onEditAttached(r)}
										aria-label={`Edit the links of ${r.asset_name}`}
										title="Link to a case or a vulnerability"
									>
										<Pencil class="h-3.5 w-3.5" />
									</Button>
								{/if}
								{#if onDetachAttached}
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 text-muted-foreground hover:text-destructive"
										onclick={() => onDetachAttached(r)}
										disabled={detachingId === r.id}
										aria-label={`Detach ${r.asset_name}`}
										title="Detach from the scope (kept in the Assets Manager)"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</Button>
								{/if}
							{/if}
						</td>
					</tr>
				{/each}
			{/each}
			{#if assets.length === 0 && attached.length === 0}
				<tr>
					<td colspan={columnCount} class="p-6 text-center text-sm text-muted-foreground">
						No asset matches.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
