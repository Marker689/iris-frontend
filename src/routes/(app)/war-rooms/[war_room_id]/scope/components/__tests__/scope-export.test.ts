import { describe, expect, it } from 'vitest';
import type {
	ScopeAsset,
	ScopeAssetVulnerability,
	ScopeRegistryAsset
} from '$lib/services/war-room-scope.service';
import { rowsToTsv, pickColumns } from '$lib/utils/table-export';
import { assetExportColumns, assetExportRows, compromiseText } from '../scope-export';

const finding = (
	identifier: string,
	remediation_status: ScopeAssetVulnerability['remediation_status']
): ScopeAssetVulnerability => ({
	finding_id: 1,
	vulnerability_id: 1,
	identifier,
	severity: 'high',
	kev: false,
	remediation_status,
	exploitation_status: 'unknown'
});

const asset = (over: Partial<ScopeAsset> = {}): ScopeAsset => ({
	asset_id: 7,
	asset_uuid: null,
	asset_name: 'dc01',
	asset_type_id: 1,
	asset_type_name: 'Windows - DC',
	asset_ip: '10.0.0.1',
	asset_domain: null,
	asset_description: null,
	asset_tags: null,
	asset_compromise_status_id: 1,
	analysis_status_id: null,
	analysis_status_name: 'Started',
	flags: [{ flag_id: 3, reason: 'by EDR', decision_id: null, set_at: null }],
	case_id: 12,
	case_name: '#12 - Ransomware',
	customer_id: 1,
	customer_name: 'ACME',
	ioc_count: 4,
	date_update: null,
	vuln_open_count: 1,
	vuln_total_count: 2,
	vuln_exploited_count: 0,
	vuln_exploited_open_count: 0,
	vuln_max_severity: 'high',
	vulnerabilities: [finding('CVE-1', 'affected'), finding('CVE-2', 'patched')],
	group_key: '1:dc01',
	...over
});

const registry = (over: Partial<ScopeRegistryAsset> = {}): ScopeRegistryAsset => ({
	id: 1,
	managed_asset_id: 40,
	asset_name: 'fw01',
	asset_type_id: 2,
	asset_type_name: 'Firewall',
	asset_ip: null,
	asset_domain: 'fw.acme.local',
	asset_description: null,
	asset_tags: null,
	criticality: null,
	environment: null,
	owner: null,
	is_active: true,
	customer_id: null,
	customer_name: null,
	case_id: null,
	case_name: null,
	note: 'edge',
	added_at: null,
	added_by_id: null,
	added_by_name: null,
	...over
});

describe('assetExportRows()', () => {
	const flagName = (id: number) => (id === 3 ? 'Isolated' : `Flag #${id}`);

	it('flattens case assets then registry assets', () => {
		const rows = assetExportRows([asset()], [registry()], flagName);
		expect(rows.map((r) => [r.source, r.name])).toEqual([
			['case', 'dc01'],
			['registry', 'fw01']
		]);
		expect(rows[0]).toMatchObject({
			caseName: '#12 Ransomware',
			compromise: 'Compromised',
			flags: 'Isolated: by EDR',
			vulns: 'CVE-1; CVE-2 (patched)'
		});
		expect(rows[1]).toMatchObject({ caseName: '', domain: 'fw.acme.local', note: 'edge' });
	});

	it('copies in the chosen columns', () => {
		const rows = assetExportRows([asset()], [], flagName);
		const columns = pickColumns(assetExportColumns(true), ['name', 'ip', 'compromise']);
		expect(rowsToTsv(rows, columns)).toBe('Asset\tIP\tCompromise\ndc01\t10.0.0.1\tCompromised');
	});
});

describe('assetExportColumns()', () => {
	it('drops the vulnerability columns without the permission', () => {
		const keys = assetExportColumns(false).map((c) => c.key);
		expect(keys).not.toContain('vulns');
		expect(keys).not.toContain('open_vulns');
		expect(assetExportColumns(true).map((c) => c.key)).toContain('vulns');
	});
});

describe('compromiseText()', () => {
	it('labels known statuses only', () => {
		expect(compromiseText(2)).toBe('Not Compromised');
		expect(compromiseText(null)).toBe('');
		expect(compromiseText(99)).toBe('');
	});
});
