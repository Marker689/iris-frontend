import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	CustomDashboardsService,
	isNullFilterOperator,
	parseWidgetRowLink,
	widgetRowHref
} from '../custom-dashboards.service';
import { ApiService } from '../api.service';

describe('CustomDashboardsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() hits /custom-dashboards', async () => {
		(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: []
		});
		await CustomDashboardsService.list();
		expect(ApiService.get).toHaveBeenCalledWith('/custom-dashboards', undefined);
	});

	it('get(uuid) hits /custom-dashboards/<uuid>', async () => {
		(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: null
		});
		await CustomDashboardsService.get('abc');
		expect(ApiService.get).toHaveBeenCalledWith('/custom-dashboards/abc', undefined);
	});

	it('create() POSTs the dashboard definition', async () => {
		(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 201,
			data: null
		});
		const definition = { name: 'd', widgets: [] };
		await CustomDashboardsService.create(definition);
		expect(ApiService.post).toHaveBeenCalledWith('/custom-dashboards', definition, undefined);
	});

	it('update() PUTs to /custom-dashboards/<uuid>', async () => {
		(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: null
		});
		await CustomDashboardsService.update('xyz', { name: 'new' });
		expect(ApiService.put).toHaveBeenCalledWith(
			'/custom-dashboards/xyz',
			{ name: 'new' },
			undefined
		);
	});

	it('delete() DELETEs /custom-dashboards/<uuid>', async () => {
		(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 204,
			data: null
		});
		await CustomDashboardsService.delete('xyz');
		expect(ApiService.delete).toHaveBeenCalledWith('/custom-dashboards/xyz', undefined);
	});

	it('render() POSTs to /custom-dashboards/<uuid>/render with the definition and filters', async () => {
		(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: { widgets: [] }
		});
		const body = {
			definition: { name: 'd' },
			timeframe: { start: '2026-01-01', end: '2026-02-01' },
			filters: { customer_id: 3 }
		};
		await CustomDashboardsService.render('xyz', body);
		expect(ApiService.post).toHaveBeenCalledWith('/custom-dashboards/xyz/render', body, undefined);
	});

	it('getSchema() hits /custom-dashboards/schema', async () => {
		(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: null
		});
		await CustomDashboardsService.getSchema();
		expect(ApiService.get).toHaveBeenCalledWith('/custom-dashboards/schema', undefined);
	});

	it('getPresets() hits /custom-dashboards/presets', async () => {
		(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: null
		});
		await CustomDashboardsService.getPresets();
		expect(ApiService.get).toHaveBeenCalledWith('/custom-dashboards/presets', undefined);
	});
});

describe('isNullFilterOperator', () => {
	it('recognises the operators that take no value', () => {
		expect(isNullFilterOperator('is_null')).toBe(true);
		expect(isNullFilterOperator('is_not_null')).toBe(true);
		expect(isNullFilterOperator('eq')).toBe(false);
		expect(isNullFilterOperator(undefined)).toBe(false);
	});
});

describe('parseWidgetRowLink', () => {
	it('accepts a case or alert target with a key', () => {
		expect(parseWidgetRowLink({ target: 'case', key: 'cases_case_id' })).toEqual({
			target: 'case',
			key: 'cases_case_id'
		});
		expect(parseWidgetRowLink({ target: 'alert', key: 'alert_id' })).toEqual({
			target: 'alert',
			key: 'alert_id'
		});
	});

	it('rejects anything else', () => {
		expect(parseWidgetRowLink(undefined)).toBeNull();
		expect(parseWidgetRowLink('case')).toBeNull();
		expect(parseWidgetRowLink({ target: 'user', key: 'id' })).toBeNull();
		expect(parseWidgetRowLink({ target: 'case', key: '' })).toBeNull();
		expect(parseWidgetRowLink({ target: 'case' })).toBeNull();
	});
});

describe('widgetRowHref', () => {
	const caseLink = { target: 'case' as const, key: 'cases_case_id' };
	const alertLink = { target: 'alert' as const, key: 'alert_id' };

	it('builds the case and alert pages', () => {
		expect(widgetRowHref(caseLink, 3275)).toBe('/case/3275');
		expect(widgetRowHref(alertLink, 12)).toBe('/alerts/12');
		expect(widgetRowHref(alertLink, ' 12 ')).toBe('/alerts/12');
	});

	it('returns null for values that are not a positive integer identifier', () => {
		for (const value of [null, undefined, '', 'N/A', 0, -1, 1.5, '1,234', '../settings', {}]) {
			expect(widgetRowHref(caseLink, value)).toBeNull();
		}
	});
});
