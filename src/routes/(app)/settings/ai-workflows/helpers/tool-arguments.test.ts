import { describe, expect, it } from 'vitest';
import { toolArguments, toolArgumentsSkeleton } from './tool-arguments';

const schema = {
	type: 'object',
	properties: {
		case_identifier: { type: 'integer' },
		alert_identifier: { type: 'integer' },
		payload: {
			type: 'object',
			description: 'Asset fields.',
			properties: {
				asset_name: { type: 'string' },
				asset_compromise_status_id: { type: 'integer', enum: [0, 1, 2, 3] },
				asset_tags: { type: 'string', description: 'Comma-separated tags.' }
			},
			required: ['asset_name']
		},
		ioc_links: { type: 'array', items: { type: 'integer' } },
		labels: { type: 'array' },
		mode: { type: ['string', 'null'] }
	},
	required: ['case_identifier', 'payload', 'labels']
};

describe('toolArguments', () => {
	it('reads the arguments and their fields', () => {
		const [caseId, , payload, links, labels, mode] = toolArguments(schema, 'read');
		expect(caseId).toMatchObject({ name: 'case_identifier', type: 'integer', required: true });
		expect(payload.description).toBe('Asset fields.');
		expect(payload.fields.map((f) => [f.name, f.required])).toEqual([
			['asset_name', true],
			['asset_compromise_status_id', false],
			['asset_tags', false]
		]);
		expect(payload.fields[1].values).toEqual([0, 1, 2, 3]);
		expect(links.type).toBe('array of integer');
		expect(labels.type).toBe('array');
		expect(mode.type).toBe('string | null');
	});

	it('tells which arguments the run sets', () => {
		const pinned = (classification: string) =>
			Object.fromEntries(toolArguments(schema, classification).map((a) => [a.name, !!a.pinned]));
		expect(pinned('read')).toMatchObject({ case_identifier: true, alert_identifier: false });
		expect(pinned('write')).toMatchObject({ case_identifier: true, alert_identifier: true });
	});

	it('reads a missing or odd schema as no arguments', () => {
		expect(toolArguments(undefined)).toEqual([]);
		expect(toolArguments({ properties: [] })).toEqual([]);
	});
});

describe('toolArgumentsSkeleton', () => {
	it('adds the required arguments', () => {
		expect(toolArgumentsSkeleton({}, schema)).toEqual({
			case_identifier: null,
			payload: { asset_name: null },
			labels: []
		});
	});

	it('keeps the values already given', () => {
		const current = { payload: { asset_tags: 'x' }, labels: ['a'], extra: '{{ trigger.id }}' };
		expect(toolArgumentsSkeleton(current, schema)).toEqual({
			case_identifier: null,
			payload: { asset_tags: 'x', asset_name: null },
			labels: ['a'],
			extra: '{{ trigger.id }}'
		});
	});

	it('does not replace a templated object', () => {
		const current = { payload: '{{ nodes.build.output }}' };
		expect(toolArgumentsSkeleton(current, schema).payload).toBe('{{ nodes.build.output }}');
	});
});
