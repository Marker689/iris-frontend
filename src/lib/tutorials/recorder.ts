/**
 * Pure helpers behind the tutorial recorder: an administrator does the
 * thing once on the real UI and gets the steps of a tutorial back.
 *
 * - every successful write call becomes an "API" step, and the ids it
 *   returns (`case_id`, `ioc_id`, …) are captured as `{caseId}`,
 *   `{iocId}` so later paths are written with variables, not with the
 *   ids of the recording;
 * - every page change becomes a "page" step with a "Take me there" link
 *   (ids of things that existed before are bound, not hard-coded);
 * - a picked element becomes a step that highlights it.
 */
import type { ApiEvent } from '$lib/services/api-events';
import { normalisePath, unwrapEnvelope } from './logic';
import type { ApiWait, TutorialStep, TutorialVars } from './types';

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Calls the UI makes on its own, never what a tutorial is about. */
const IGNORED_API_PATHS = [
	/^\/manage\/tutorials(\/|$)/,
	/\/preferences(\/|$)/,
	/^\/auth(\/|$)/,
	/^\/me(\/|$)/,
	/\/(read|seen|heartbeat|presence)(\/|$)/
];

/** Pages that are the recorder's own, or not worth a step. */
const IGNORED_ROUTES = [/^\/settings\/tutorials(\/|$)/, /^\/login(\/|$)/];

export const isRecordableApiEvent = (event: ApiEvent): boolean =>
	event.ok &&
	(WRITE_METHODS as readonly string[]).includes(event.method) &&
	!IGNORED_API_PATHS.some((re) => re.test(event.path));

export const isRecordableRoute = (pathname: string): boolean =>
	!IGNORED_ROUTES.some((re) => re.test(normalisePath(pathname)));

/** `case_id` → `caseId`, `id` stays `id`. */
export const camelVar = (field: string): string =>
	field.replace(/_+([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Top-level `*_id` fields of a response, the ids later steps may need. */
export const idFields = (body: unknown): Record<string, string | number> => {
	const entity = unwrapEnvelope(body);
	const out: Record<string, string | number> = {};
	if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return out;
	for (const [key, value] of Object.entries(entity)) {
		if (!/^[a-z][a-z0-9_]*_id$/.test(key)) continue;
		if (typeof value === 'number' || (typeof value === 'string' && /^[\w-]{1,64}$/.test(value)))
			out[key] = value;
	}
	return out;
};

/** Replaces path segments holding a known value with its `{var}`. */
export const templatisePath = (path: string, known: TutorialVars): string => {
	const byValue = new Map<string, string>();
	for (const [name, value] of Object.entries(known)) {
		if (!byValue.has(String(value))) byValue.set(String(value), name);
	}
	return path
		.split('/')
		.map((segment) => {
			const name = byValue.get(segment);
			return name ? `{${name}}` : segment;
		})
		.join('/');
};

/** Ids of things that existed before the recording: `/alerts/42`. */
const isIdSegment = (segment: string): boolean => /^\d+$/.test(segment);

const RESOURCE_LABEL: Record<string, string> = {
	iocs: 'IOCs',
	ioc: 'IOC',
	assets: 'assets',
	events: 'timeline events',
	tasks: 'tasks',
	notes: 'notes',
	evidences: 'evidence',
	cases: 'cases'
};

const VERB: Record<string, string> = {
	POST: 'Create',
	PUT: 'Update',
	PATCH: 'Update',
	DELETE: 'Delete'
};

/** "Create IOCs", "Update cases"… — a starting title the admin rewrites. */
const apiTitle = (method: string, template: string): string => {
	const segments = template.split('/').filter((s) => s && s !== '*' && !s.startsWith('{'));
	const resource = segments.at(-1) ?? 'item';
	return `${VERB[method] ?? method} ${RESOURCE_LABEL[resource] ?? resource.replace(/-/g, ' ')}`;
};

export type RecordedApi = { step: TutorialStep; captured: TutorialVars };

/**
 * The step for a write call. New ids in the response are captured under
 * camel-case names unless an id with that name is already known.
 */
export const apiStep = (event: ApiEvent, known: TutorialVars): RecordedApi => {
	const path = templatisePath(event.path, known)
		.split('/')
		.map((segment) => (isIdSegment(segment) ? '*' : segment))
		.join('/');
	const capture: Record<string, string> = {};
	const captured: TutorialVars = {};
	for (const [field, value] of Object.entries(idFields(event.data))) {
		const name = camelVar(field);
		if (known[name] !== undefined) continue;
		capture[name] = field;
		captured[name] = value;
	}
	const waitFor: ApiWait = {
		kind: 'api',
		method: event.method as ApiWait['method'],
		path,
		...(Object.keys(capture).length ? { capture } : {})
	};
	return { step: { title: apiTitle(event.method, path), body: '', waitFor }, captured };
};

/** `case` / `cases` → `caseId`, `war-rooms` → `warRoomId`, unique among `known`. */
const varNameAfter = (segment: string | undefined, known: TutorialVars): string => {
	const base = camelVar((segment ?? 'item').replace(/-/g, '_').replace(/s$/, '')) || 'item';
	let name = `${base}Id`;
	for (let n = 2; known[name] !== undefined; n++) name = `${base}Id${n}`;
	return name;
};

export type RecordedRoute = { step: TutorialStep; captured: TutorialVars };

/**
 * The step for a page change. An id the recording did not create (the
 * user opened an existing case) becomes a variable the step binds, so
 * the tutorial works on whichever case the learner opens; such a step
 * cannot offer "Take me there".
 */
export const routeStep = (pathname: string, known: TutorialVars): RecordedRoute => {
	const segments = templatisePath(normalisePath(pathname), known).split('/');
	const captured: TutorialVars = {};
	segments.forEach((segment, i) => {
		if (!isIdSegment(segment)) return;
		const name = varNameAfter(segments[i - 1], { ...known, ...captured });
		captured[name] = Number(segment);
		segments[i] = `{${name}}`;
	});
	const path = segments.join('/');
	const binds = Object.keys(captured).length > 0;
	return {
		step: {
			title: `Go to ${path}`,
			body: '',
			...(binds ? {} : { goTo: path }),
			waitFor: { kind: 'route', path }
		},
		captured
	};
};

/** Every string of a step that may reference a `{var}`. */
const stepTemplates = (step: TutorialStep): string[] => {
	const out = [step.title, step.body, step.goTo ?? ''];
	out.push(...(Array.isArray(step.anchor) ? step.anchor : [step.anchor ?? '']));
	for (const fill of step.fills ?? []) {
		out.push(fill.anchor);
		if (typeof fill.value === 'string') out.push(fill.value);
	}
	const wait = step.waitFor;
	if (wait?.kind === 'element') out.push(wait.anchor);
	if ((wait?.kind === 'api' || wait?.kind === 'route') && typeof wait.path === 'string')
		out.push(wait.path);
	return out;
};

/** Drops captures no later step uses, so the tutorial stays readable. */
export const pruneCaptures = (steps: TutorialStep[]): TutorialStep[] =>
	steps.map((step, index) => {
		const wait = step.waitFor;
		if (wait?.kind !== 'api' || !wait.capture) return step;
		const later = steps
			.slice(index + 1)
			.flatMap(stepTemplates)
			.join('\n');
		const capture = Object.fromEntries(
			Object.entries(wait.capture).filter(([name]) => later.includes(`{${name}}`))
		);
		const rest: ApiWait = { kind: 'api', method: wait.method, path: wait.path };
		return {
			...step,
			waitFor: Object.keys(capture).length ? { ...rest, capture } : rest
		};
	});

/** bits-ui / melt-ui and friends generate ids that change between renders. */
const GENERATED_ID = /(^|[-_:])(bits|melt|radix|svelte|s)[-_:]|\d{3,}|^[a-z0-9]{8,}$/i;

const cssString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const cssIdent = (value: string): string =>
	typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^\w-]/g, '\\$&');

/**
 * A stable way to find the element again on another day, another case:
 * `data-tour`, then `data-testid`, a link's `href`, a hand-written `id`,
 * an `aria-label`. Walks up from the clicked node (an icon in a button).
 */
export const deriveAnchor = (start: Element, known: TutorialVars = {}): string | null => {
	for (let el: Element | null = start; el && el !== document.body; el = el.parentElement) {
		const tour = el.getAttribute('data-tour');
		if (tour && /^[a-z0-9-]+$/.test(tour)) return tour;
		const testId = el.getAttribute('data-testid');
		if (testId) return `[data-testid="${cssString(testId)}"]`;
		const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
		if (href && href.startsWith('/')) {
			return `a[href="${cssString(templatisePath(normalisePath(href), known))}"]`;
		}
		if (el.id && !GENERATED_ID.test(el.id)) return `#${cssIdent(el.id)}`;
		const label = el.getAttribute('aria-label');
		if (label) {
			return `${el.tagName.toLowerCase()}[aria-label="${cssString(label)}"]`;
		}
	}
	return null;
};

/** What a picked element is, for the step title: its label or text. */
export const describeElement = (el: Element): string => {
	const text =
		el.getAttribute('aria-label') ??
		el.getAttribute('placeholder') ??
		el.getAttribute('title') ??
		el.textContent ??
		'';
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
};
