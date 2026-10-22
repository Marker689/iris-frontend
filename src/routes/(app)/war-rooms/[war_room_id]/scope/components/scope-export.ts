/**
 * Columns of the Scope grids for the CSV download and the clipboard copy.
 * The assets grid mixes case assets and registry assets attached to the
 * room, so both are first flattened into one export row; the other grids
 * export their rows as listed. Multi-valued cells are joined with "; ".
 */
import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
import { SEVERITY_LABELS } from '$lib/components/vulnerabilities/labels';
import type {
	ScopeAsset,
	ScopeAssetVulnerability,
	ScopeCase,
	ScopeCustomerSummary,
	ScopeRegistryAsset
} from '$lib/services/war-room-scope.service';
import {
	findingStatusGroup,
	type VulnerabilityMatrixRow
} from '$lib/services/vulnerabilities.service';
import {
	TRACKER_ITEM_TYPE_LABEL,
	trackerRowLabel,
	trackerValueText,
	type Tracker,
	type TrackerAssetItem,
	type TrackerRow,
	type TrackerStep
} from '$lib/services/war-room-trackers.service';
import { caseNumberedName } from '$lib/utils/case-name';
import type { ExportColumn } from '$lib/utils/table-export';
import { caseLabel, distinctCustomers, iocTypeNames, type IocRow } from './helpers';

/** Export grids, also the keys under which their column choice is remembered. */
export type ScopeGrid = 'assets' | 'iocs' | 'customers' | 'vulnerabilities';

const LIST = '; ';

const text = (value: string | number | null | undefined): string =>
	value === null || value === undefined ? '' : String(value);

const isOpen = (f: ScopeAssetVulnerability): boolean =>
	findingStatusGroup(f.remediation_status) === 'open';

/** "CVE-1; CVE-2 (fixed)": the open findings by identifier, the others with their status. */
const vulnList = (findings: ScopeAssetVulnerability[] | undefined): string =>
	(findings ?? [])
		.map((f) => (isOpen(f) ? f.identifier : `${f.identifier} (${f.remediation_status})`))
		.join(LIST);

// --- Assets ----------------------------------------------------------------

export interface AssetExportRow {
	source: 'case' | 'registry';
	id: number;
	name: string;
	type: string;
	ip: string;
	domain: string;
	description: string;
	tags: string;
	caseId: number | null;
	caseName: string;
	customer: string;
	compromise: string;
	analysis: string;
	flags: string;
	iocs: string;
	openVulns: string;
	vulns: string;
	updated: string;
	note: string;
}

export const compromiseText = (id: number | null): string =>
	id != null && id in COMPROMISE_STATUS
		? COMPROMISE_STATUS[id as keyof typeof COMPROMISE_STATUS]
		: '';

/** Case assets then registry assets, one flat row each. */
export const assetExportRows = (
	assets: ScopeAsset[],
	attached: ScopeRegistryAsset[],
	flagName: (flagId: number) => string
): AssetExportRow[] => [
	...assets.map(
		(a): AssetExportRow => ({
			source: 'case',
			id: a.asset_id,
			name: a.asset_name,
			type: text(a.asset_type_name),
			ip: text(a.asset_ip),
			domain: text(a.asset_domain),
			description: text(a.asset_description),
			tags: text(a.asset_tags),
			caseId: a.case_id,
			caseName: caseNumberedName(a.case_id, a.case_name),
			customer: text(a.customer_name),
			compromise: compromiseText(a.asset_compromise_status_id),
			analysis: text(a.analysis_status_name),
			flags: (a.flags ?? [])
				.map((f) => (f.reason ? `${flagName(f.flag_id)}: ${f.reason}` : flagName(f.flag_id)))
				.join(LIST),
			iocs: text(a.ioc_count),
			openVulns: text(a.vuln_open_count),
			vulns: vulnList(a.vulnerabilities),
			updated: text(a.date_update),
			note: ''
		})
	),
	...attached.map(
		(r): AssetExportRow => ({
			source: 'registry',
			id: r.managed_asset_id,
			name: r.asset_name,
			type: text(r.asset_type_name),
			ip: text(r.asset_ip),
			domain: text(r.asset_domain),
			description: text(r.asset_description),
			tags: text(r.asset_tags),
			caseId: r.case_id,
			caseName: r.case_id !== null ? caseNumberedName(r.case_id, r.case_name ?? '') : '',
			customer: text(r.customer_name),
			compromise: '',
			analysis: '',
			flags: '',
			iocs: '',
			openVulns: text((r.vulnerabilities ?? []).filter(isOpen).length),
			vulns: [r.vulnerability?.identifier, vulnList(r.vulnerabilities)].filter(Boolean).join(LIST),
			updated: text(r.added_at),
			note: text(r.note)
		})
	)
];

const ASSET_COLUMNS: ExportColumn<AssetExportRow>[] = [
	{ key: 'name', header: 'Asset', getter: (r) => r.name, defaultSelected: true },
	{ key: 'type', header: 'Type', getter: (r) => r.type, defaultSelected: true },
	{ key: 'ip', header: 'IP', getter: (r) => r.ip, defaultSelected: true },
	{ key: 'domain', header: 'Domain', getter: (r) => r.domain },
	{ key: 'case_id', header: 'Case ID', getter: (r) => text(r.caseId) },
	{ key: 'case', header: 'Case', getter: (r) => r.caseName, defaultSelected: true },
	{ key: 'customer', header: 'Customer', getter: (r) => r.customer, defaultSelected: true },
	{ key: 'compromise', header: 'Compromise', getter: (r) => r.compromise, defaultSelected: true },
	{ key: 'analysis', header: 'Analysis', getter: (r) => r.analysis, defaultSelected: true },
	{ key: 'flags', header: 'Flags', getter: (r) => r.flags, defaultSelected: true },
	{ key: 'iocs', header: 'IOCs', getter: (r) => r.iocs },
	{ key: 'open_vulns', header: 'Open vulnerabilities', getter: (r) => r.openVulns },
	{ key: 'vulns', header: 'Vulnerabilities', getter: (r) => r.vulns, defaultSelected: true },
	{ key: 'description', header: 'Description', getter: (r) => r.description },
	{ key: 'tags', header: 'Tags', getter: (r) => r.tags },
	{ key: 'note', header: 'Attachment note', getter: (r) => r.note },
	{
		key: 'source',
		header: 'Source',
		getter: (r) => (r.source === 'case' ? 'Case' : 'Assets Manager')
	},
	{ key: 'id', header: 'Asset ID', getter: (r) => text(r.id) },
	{ key: 'updated', header: 'Updated', getter: (r) => r.updated }
];

const VULN_ASSET_COLUMNS = new Set(['open_vulns', 'vulns']);

/** Without vulnerability read, the vulnerability columns are not offered. */
export const assetExportColumns = (showVulnerabilities: boolean): ExportColumn<AssetExportRow>[] =>
	showVulnerabilities ? ASSET_COLUMNS : ASSET_COLUMNS.filter((c) => !VULN_ASSET_COLUMNS.has(c.key));

// --- IOCs ------------------------------------------------------------------

/** `cases` are the listed ones: presence is reported against them only. */
export const iocExportColumns = (cases: ScopeCase[]): ExportColumn<IocRow>[] => {
	const holding = (r: IocRow) => cases.filter((c) => r.caseIds.has(c.case_id));
	return [
		{ key: 'value', header: 'Value', getter: (r) => r.first.ioc_value, defaultSelected: true },
		{ key: 'type', header: 'Type', getter: (r) => iocTypeNames(r.items), defaultSelected: true },
		{ key: 'tlp', header: 'TLP', getter: (r) => text(r.first.tlp_name), defaultSelected: true },
		{
			key: 'description',
			header: 'Description',
			getter: (r) => text(r.first.ioc_description),
			defaultSelected: true
		},
		{ key: 'tags', header: 'Tags', getter: (r) => text(r.first.ioc_tags) },
		{
			key: 'cases',
			header: 'Cases',
			getter: (r) => holding(r).map(caseLabel).join(LIST),
			defaultSelected: true
		},
		{ key: 'case_count', header: 'Case count', getter: (r) => text(holding(r).length) },
		{
			key: 'missing',
			header: 'Missing from',
			getter: (r) =>
				cases
					.filter((c) => !r.caseIds.has(c.case_id))
					.map(caseLabel)
					.join(LIST)
		},
		{
			key: 'customers',
			header: 'Customers',
			getter: (r) => distinctCustomers(r.items).join(LIST),
			defaultSelected: true
		}
	];
};

// --- Customers -------------------------------------------------------------

export const customerExportColumns = (
	showVulnerabilities: boolean
): ExportColumn<ScopeCustomerSummary>[] => [
	{
		key: 'customer',
		header: 'Customer',
		getter: (c) => (c.customer_id === null ? 'No customer' : text(c.customer_name)),
		defaultSelected: true
	},
	{
		key: 'cases',
		header: 'Cases',
		getter: (c) => c.cases.map((k) => caseNumberedName(k.case_id, k.case_name)).join(LIST),
		defaultSelected: true
	},
	{ key: 'case_count', header: 'Case count', getter: (c) => text(c.cases.length) },
	{ key: 'assets', header: 'Assets', getter: (c) => text(c.assets), defaultSelected: true },
	{
		key: 'compromised',
		header: 'Compromised',
		getter: (c) => text(c.compromised),
		defaultSelected: true
	},
	{ key: 'done', header: 'Done', getter: (c) => text(c.done), defaultSelected: true },
	{ key: 'iocs', header: 'IOCs', getter: (c) => text(c.iocs), defaultSelected: true },
	...(showVulnerabilities
		? [
				{
					key: 'vuln_open',
					header: 'Open vulnerabilities',
					getter: (c: ScopeCustomerSummary) => text(c.vuln_open ?? 0),
					defaultSelected: true
				},
				{
					key: 'vuln_exploited_open',
					header: 'Exploited and open',
					getter: (c: ScopeCustomerSummary) => text(c.vuln_exploited_open ?? 0)
				}
			]
		: [])
];

// --- Vulnerabilities -------------------------------------------------------

export const vulnerabilityExportColumns = (
	cases: ScopeCase[]
): ExportColumn<VulnerabilityMatrixRow>[] => [
	{
		key: 'identifier',
		header: 'Identifier',
		getter: (r) => r.vulnerability.identifier,
		defaultSelected: true
	},
	{ key: 'title', header: 'Title', getter: (r) => r.vulnerability.title, defaultSelected: true },
	{
		key: 'severity',
		header: 'Severity',
		getter: (r) => SEVERITY_LABELS[r.vulnerability.severity] ?? r.vulnerability.severity,
		defaultSelected: true
	},
	{ key: 'cvss', header: 'CVSS', getter: (r) => text(r.vulnerability.cvss_score) },
	{
		key: 'kev',
		header: 'CISA KEV',
		getter: (r) => (r.vulnerability.kev ? 'Yes' : 'No'),
		defaultSelected: true
	},
	{ key: 'open', header: 'Open', getter: (r) => text(r.totals.open), defaultSelected: true },
	{
		key: 'findings',
		header: 'Findings',
		getter: (r) => text(r.totals.findings),
		defaultSelected: true
	},
	{ key: 'fixed', header: 'Fixed', getter: (r) => text(r.totals.fixed) },
	{ key: 'dismissed', header: 'Dismissed', getter: (r) => text(r.totals.dismissed) },
	{ key: 'exploited', header: 'Exploited', getter: (r) => text(r.totals.exploited) },
	{
		key: 'cases',
		header: 'Cases (open/findings)',
		getter: (r) =>
			cases
				.filter((c) => r.cases?.[String(c.case_id)])
				.map((c) => {
					const n = r.cases[String(c.case_id)];
					return `${caseLabel(c)} (${n.open}/${n.findings})`;
				})
				.join(LIST),
		defaultSelected: true
	},
	{ key: 'tracked', header: 'Tracked', getter: (r) => (r.tracked ? 'Yes' : 'No') },
	{ key: 'note', header: 'Tracking note', getter: (r) => text(r.tracked?.note) }
];

// --- Trackers --------------------------------------------------------------

/** Item, steps, flags (when shown), the tracker's own columns, note, last update. */
export const trackerExportColumns = (
	tracker: Pick<Tracker, 'columns' | 'show_asset_flags'>,
	steps: TrackerStep[],
	flagName: (flagId: number) => string,
	userName: (id: number) => string | null | undefined
): ExportColumn<TrackerRow>[] => {
	const stepName = new Map(steps.map((s) => [s.id, s.name]));
	return [
		{ key: 'item', header: 'Item', getter: trackerRowLabel, defaultSelected: true },
		{
			key: 'item_type',
			header: 'Item type',
			getter: (r) => (r.item_type ? TRACKER_ITEM_TYPE_LABEL[r.item_type] : 'Text')
		},
		{
			key: 'steps',
			header: 'Steps',
			getter: (r) => r.steps.map((s) => stepName.get(s.step_id) ?? `Step #${s.step_id}`).join(LIST),
			defaultSelected: true
		},
		...(tracker.show_asset_flags
			? [
					{
						key: 'flags',
						header: 'Flags',
						getter: (r: TrackerRow) =>
							r.item_type === 'asset' && r.item && !r.restricted
								? (r.item as TrackerAssetItem).flags.map((f) => flagName(f.flag_id)).join(LIST)
								: '',
						defaultSelected: true
					}
				]
			: []),
		...tracker.columns.map((c) => ({
			key: `col:${c.key}`,
			header: c.label,
			getter: (r: TrackerRow) => trackerValueText(r.values?.[c.key], c, userName),
			defaultSelected: true
		})),
		{ key: 'note', header: 'Note', getter: (r) => text(r.note), defaultSelected: true },
		{ key: 'updated_at', header: 'Last update', getter: (r) => text(r.updated_at) },
		{ key: 'updated_by', header: 'Updated by', getter: (r) => text(r.updated_by?.name) }
	];
};
