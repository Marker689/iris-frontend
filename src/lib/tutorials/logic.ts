/**
 * Pure helpers behind the tutorial engine — no DOM, no stores — so the
 * matching rules can be unit tested in isolation.
 */
import type { ApiEvent } from '$lib/services/api-events';
import type { ApiWait, TutorialVars } from './types';

const VAR_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export const interpolate = (template: string, vars: TutorialVars): string =>
	template.replace(VAR_RE, (whole, name: string) =>
		vars[name] === undefined ? whole : String(vars[name])
	);

/** Names a template uses that `vars` does not provide yet. */
export const missingVars = (template: string, vars: TutorialVars): string[] =>
	[...template.matchAll(VAR_RE)].map((m) => m[1]).filter((name) => vars[name] === undefined);

export const normalisePath = (path: string): string => {
	const bare = path.split(/[?#]/)[0];
	return bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
};

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SEGMENT_TOKEN_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}|\*/g;

const asVar = (raw: string): string | number => {
	let decoded = raw;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		// Keep the raw segment.
	}
	return /^\d+$/.test(decoded) && decoded.length < 16 ? Number(decoded) : decoded;
};

/**
 * Matches `actual` against a path template and returns the variables the
 * match binds, or `null` when it does not match.
 *
 * - `{name}` already in `vars` must match its value exactly;
 * - `{name}` not known yet matches any one segment and is bound to it, so
 *   a step can pick the case id off the URL the user navigated to;
 * - `*` matches any one segment and binds nothing.
 */
export const bindPath = (
	pattern: string | RegExp,
	actual: string,
	vars: TutorialVars
): TutorialVars | null => {
	const path = normalisePath(actual);
	if (pattern instanceof RegExp) return pattern.test(path) ? {} : null;
	const template = normalisePath(pattern);
	const names: string[] = [];
	let source = '';
	let last = 0;
	for (const match of template.matchAll(SEGMENT_TOKEN_RE)) {
		const index = match.index ?? 0;
		source += escapeRe(template.slice(last, index));
		const name = match[1];
		if (name === undefined) source += '[^/]+';
		else if (vars[name] !== undefined) source += escapeRe(String(vars[name]));
		else if (names.includes(name)) source += `\\${names.indexOf(name) + 1}`;
		else {
			names.push(name);
			// Never bind a literal `{x}` left in a URL by a missing variable.
			source += '([^/{}]+)';
		}
		last = index + match[0].length;
	}
	source += escapeRe(template.slice(last));
	const match = new RegExp(`^${source}$`).exec(path);
	if (!match) return null;
	return Object.fromEntries(names.map((name, i) => [name, asVar(match[i + 1])]));
};

export const matchesPath = (
	pattern: string | RegExp,
	actual: string,
	vars: TutorialVars
): boolean => bindPath(pattern, actual, vars) !== null;

/** Variables bound by the call, or `null` when it is not the awaited one. */
export const bindApi = (wait: ApiWait, event: ApiEvent, vars: TutorialVars): TutorialVars | null =>
	event.ok && event.method === wait.method ? bindPath(wait.path, event.path, vars) : null;

export const matchesApi = (wait: ApiWait, event: ApiEvent, vars: TutorialVars): boolean =>
	bindApi(wait, event, vars) !== null;

/** Names a path template binds when its variables are not known yet. */
export const pathVars = (pattern: string | RegExp): string[] =>
	pattern instanceof RegExp ? [] : [...pattern.matchAll(VAR_RE)].map((m) => m[1]);

/**
 * Some v2 endpoints wrap the entity in `{ status, message, data }`,
 * others return it bare. Accept both (same rule as the e2e helpers).
 */
export const unwrapEnvelope = (body: unknown): unknown => {
	if (body && typeof body === 'object' && 'status' in body && 'data' in body) {
		const inner = (body as { data: unknown }).data;
		if (inner && typeof inner === 'object') return inner;
	}
	return body;
};

export const readPath = (source: unknown, dotted: string): unknown => {
	let current: unknown = source;
	for (const key of dotted.split('.')) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
};

export const captureVars = (wait: ApiWait, body: unknown): TutorialVars => {
	const captured: TutorialVars = {};
	if (!wait.capture) return captured;
	const entity = unwrapEnvelope(body);
	for (const [name, dotted] of Object.entries(wait.capture)) {
		const value = readPath(entity, dotted);
		if (typeof value === 'string' || typeof value === 'number') captured[name] = value;
	}
	return captured;
};

/** A bare `data-tour` name, or any CSS selector passed through. */
export const anchorSelector = (anchor: string): string =>
	/^[a-z0-9-]+$/.test(anchor) ? `[data-tour="${anchor}"]` : anchor;

export type InlineSegment = { kind: 'text' | 'strong' | 'code'; text: string };

/** Splits `**bold**` and `` `code` `` out of a step body; everything else is text. */
export const parseInline = (source: string): InlineSegment[] => {
	const segments: InlineSegment[] = [];
	const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
	let last = 0;
	for (const match of source.matchAll(re)) {
		const index = match.index ?? 0;
		if (index > last) segments.push({ kind: 'text', text: source.slice(last, index) });
		if (match[1] !== undefined) segments.push({ kind: 'strong', text: match[1] });
		else segments.push({ kind: 'code', text: match[2] });
		last = index + match[0].length;
	}
	if (last < source.length) segments.push({ kind: 'text', text: source.slice(last) });
	return segments;
};
