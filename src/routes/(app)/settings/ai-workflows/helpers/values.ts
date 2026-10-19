/**
 * The values of a node config that the run renders: a template (text), a
 * `{"$path": "dotted.path"}` reference, or a JSON literal (a number, a
 * boolean, a list, an object). Shown as text in the forms without ever
 * falling back to `[object Object]`.
 */

export type ValueMode = 'template' | 'path' | 'json';

export type PathRef = { $path: string };

/** The exact form the backend reads as a reference (`ai_workflows_context_path_reference`). */
export function isPathRef(value: unknown): value is PathRef {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).length === 1 &&
		typeof (value as Record<string, unknown>).$path === 'string'
	);
}

/** How a value is edited: text is a template, anything else but a reference is JSON. */
export function valueMode(value: unknown): ValueMode {
	if (isPathRef(value)) return 'path';
	if (value === undefined || value === null || typeof value === 'string') return 'template';
	return 'json';
}

/** The text of a value in its mode. */
export function valueText(value: unknown): string {
	if (isPathRef(value)) return value.$path;
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

/**
 * A value shown in a plain text field: lists of plain values as
 * `a,b` (what a comma-separated field expects), objects as JSON.
 */
export function displayText(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value !== 'object') return String(value);
	if (Array.isArray(value) && value.every((item) => item === null || typeof item !== 'object')) {
		return String(value);
	}
	return JSON.stringify(value);
}

export type JsonParse = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * The text of a JSON-mode value. A text or an empty value is a template,
 * so JSON mode only takes numbers, booleans, lists and objects.
 */
export function parseJsonValue(text: string): JsonParse {
	if (text.trim() === '')
		return { ok: false, error: 'Enter a number, true/false, a list or an object' };
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { ok: false, error: 'Not valid JSON' };
	}
	if (value === null || typeof value === 'string') {
		return { ok: false, error: 'A text or an empty value is a template: switch to Template' };
	}
	if (isPathRef(value)) return { ok: false, error: 'A reference is a path: switch to Path' };
	return { ok: true, value };
}

/** `value` in another mode, keeping its text; JSON text that does not parse gives an error. */
export function convertValue(value: unknown, mode: ValueMode): JsonParse {
	const text = valueText(value);
	if (mode === 'path') return { ok: true, value: { $path: text.trim() } };
	if (mode === 'template') return { ok: true, value: text };
	return parseJsonValue(text);
}
