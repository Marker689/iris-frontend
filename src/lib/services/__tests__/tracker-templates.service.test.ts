import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	TrackerTemplatesService,
	parseTrackerTemplateJson,
	trackerTemplateToExport,
	type TrackerTemplate
} from '../tracker-templates.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

const template: TrackerTemplate = {
	id: 4,
	name: 'Notify',
	description: null,
	steps: [{ name: 'Sent', color: 'sky', icon: 'mail', description: null }],
	trackers: [
		{
			name: 'Customers',
			icon: null,
			description: null,
			source: 'customers',
			step_names: null,
			columns: [{ key: 'c_contact', label: 'Contact', type: 'text' }],
			show_asset_flags: false
		}
	],
	created_by: { id: 1, name: 'admin' },
	created_at: '2026-10-01T00:00:00',
	updated_at: null
};

describe('TrackerTemplatesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mock('get').mockResolvedValue({ ok: true, status: 200, data: [] });
		mock('post').mockResolvedValue({ ok: true, status: 201, data: {} });
		mock('patch').mockResolvedValue({ ok: true, status: 200, data: {} });
		mock('delete').mockResolvedValue({ ok: true, status: 204, data: null });
	});

	it('hits the manage endpoints', async () => {
		await TrackerTemplatesService.list();
		expect(ApiService.get).toHaveBeenCalledWith('/manage/tracker-templates', {});

		await TrackerTemplatesService.get(4);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/tracker-templates/4', {});

		const body = { name: 'X', steps: [], trackers: [] };
		await TrackerTemplatesService.create(body);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/tracker-templates', body, {});

		await TrackerTemplatesService.update(4, { name: 'Y' });
		expect(ApiService.patch).toHaveBeenCalledWith('/manage/tracker-templates/4', { name: 'Y' }, {});

		await TrackerTemplatesService.remove(4);
		expect(ApiService.delete).toHaveBeenCalledWith('/manage/tracker-templates/4', {});

		await TrackerTemplatesService.exportTemplate(4);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/tracker-templates/4/export', {});

		await TrackerTemplatesService.importTemplate(body);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/tracker-templates/import', body, {});
	});

	it('lists and creates the server presets', async () => {
		await TrackerTemplatesService.listPresets();
		expect(ApiService.get).toHaveBeenCalledWith('/manage/tracker-templates/presets', {});

		await TrackerTemplatesService.createFromPreset('asset-remediation');
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/tracker-templates/presets/asset-remediation',
			{},
			{}
		);
	});
});

describe('tracker template helpers', () => {
	it('exports only the portable fields', () => {
		const out = trackerTemplateToExport(template);
		expect(out).toEqual({
			name: 'Notify',
			description: null,
			steps: template.steps,
			trackers: template.trackers
		});
		expect(out).not.toHaveProperty('id');
		expect(out).not.toHaveProperty('created_by');
	});

	it('parses an exported file back', () => {
		const text = JSON.stringify({
			format: 'iris-tracker-template',
			version: 1,
			...template,
			id: 99
		});
		expect(parseTrackerTemplateJson(text)).toEqual({
			format: 'iris-tracker-template',
			version: 1,
			...trackerTemplateToExport(template)
		});
	});

	it('refuses what is not a template', () => {
		expect(() => parseTrackerTemplateJson('{')).toThrow('not valid JSON');
		expect(() => parseTrackerTemplateJson('[]')).toThrow('does not hold');
		expect(() => parseTrackerTemplateJson('{"steps":[],"trackers":[]}')).toThrow('no name');
		expect(() => parseTrackerTemplateJson('{"name":"x"}')).toThrow('"steps"');
	});

	it('refuses a foreign export format', () => {
		const text = JSON.stringify({ format: 'other', name: 'x', steps: [], trackers: [] });
		expect(() => parseTrackerTemplateJson(text)).toThrow('not an IRIS tracker template');
	});
});
