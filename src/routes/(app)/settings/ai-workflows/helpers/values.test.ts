import { describe, expect, it } from 'vitest';
import {
	convertValue,
	displayText,
	isPathRef,
	parseJsonValue,
	valueMode,
	valueText
} from './values';

describe('isPathRef', () => {
	it('accepts only the exact {$path: string} form', () => {
		expect(isPathRef({ $path: 'nodes.a.output' })).toBe(true);
		expect(isPathRef({ $path: 'a', other: 1 })).toBe(false);
		expect(isPathRef({ $path: 3 })).toBe(false);
		expect(isPathRef([{ $path: 'a' }])).toBe(false);
		expect(isPathRef('nodes.a')).toBe(false);
		expect(isPathRef(null)).toBe(false);
	});
});

describe('valueMode / valueText', () => {
	it('reads text as a template', () => {
		expect(valueMode('{{ vars.x }}')).toBe('template');
		expect(valueText('{{ vars.x }}')).toBe('{{ vars.x }}');
		expect(valueMode(undefined)).toBe('template');
		expect(valueText(null)).toBe('');
	});

	it('reads a reference as a path', () => {
		expect(valueMode({ $path: 'nodes.a.output.result' })).toBe('path');
		expect(valueText({ $path: 'nodes.a.output.result' })).toBe('nodes.a.output.result');
	});

	it('reads other values as JSON, never [object Object]', () => {
		expect(valueMode(150)).toBe('json');
		expect(valueText(150)).toBe('150');
		expect(valueText(false)).toBe('false');
		expect(valueText(['a', 'b'])).toBe('["a","b"]');
		expect(valueText({ a: { b: 1 } })).toBe('{"a":{"b":1}}');
		expect(valueText([])).toBe('[]');
	});
});

describe('displayText', () => {
	it('keeps the plain-text rendering of scalars and flat lists', () => {
		expect(displayText(undefined)).toBe('');
		expect(displayText(42)).toBe('42');
		expect(displayText(['a', 'b'])).toBe('a,b');
	});

	it('shows objects and nested lists as JSON', () => {
		expect(displayText({ $path: 'nodes.a' })).toBe('{"$path":"nodes.a"}');
		expect(displayText([{ a: 1 }])).toBe('[{"a":1}]');
	});
});

describe('parseJsonValue', () => {
	it('takes numbers, booleans, lists and objects', () => {
		expect(parseJsonValue(' 1.5 ')).toEqual({ ok: true, value: 1.5 });
		expect(parseJsonValue('true')).toEqual({ ok: true, value: true });
		expect(parseJsonValue('["a", 2]')).toEqual({ ok: true, value: ['a', 2] });
		expect(parseJsonValue('{"k": [1]}')).toEqual({ ok: true, value: { k: [1] } });
	});

	it('refuses what is not JSON or belongs to another mode', () => {
		expect(parseJsonValue('').ok).toBe(false);
		expect(parseJsonValue('[1,').ok).toBe(false);
		expect(parseJsonValue('"text"').ok).toBe(false);
		expect(parseJsonValue('null').ok).toBe(false);
		expect(parseJsonValue('{"$path": "a"}').ok).toBe(false);
	});
});

describe('convertValue', () => {
	it('keeps the text across modes', () => {
		expect(convertValue('{{ x }}', 'template')).toEqual({ ok: true, value: '{{ x }}' });
		expect(convertValue(' nodes.a.output ', 'path')).toEqual({
			ok: true,
			value: { $path: 'nodes.a.output' }
		});
		expect(convertValue({ $path: 'nodes.a' }, 'template')).toEqual({ ok: true, value: 'nodes.a' });
		expect(convertValue(['a'], 'template')).toEqual({ ok: true, value: '["a"]' });
		expect(convertValue('[1, 2]', 'json')).toEqual({ ok: true, value: [1, 2] });
	});

	it('reports JSON text that does not parse', () => {
		expect(convertValue('{{ x }}', 'json').ok).toBe(false);
	});
});
