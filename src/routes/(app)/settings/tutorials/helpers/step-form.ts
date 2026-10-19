/**
 * The editor works on flat, always-present form fields; tutorials store
 * optional ones. These convert between the two and drop what is blank.
 */
import type { ApiWait, TutorialFill, TutorialStep } from '$lib/tutorials/types';

export type WaitKind = 'next' | 'api' | 'route' | 'element';
export type FillKind = 'text' | 'on' | 'off';

export type FillForm = { label: string; anchor: string; kind: FillKind; value: string };
export type CaptureForm = { name: string; field: string };

export type StepForm = {
	/** Stable key for `{#each}` while steps are moved around. */
	key: number;
	title: string;
	body: string;
	/** One anchor per line: CSS selectors may contain commas. */
	anchors: string;
	goTo: string;
	wait: WaitKind;
	method: ApiWait['method'];
	apiPath: string;
	captures: CaptureForm[];
	routePath: string;
	elementAnchor: string;
	fills: FillForm[];
};

let nextKey = 1;

export const emptyStep = (): StepForm => ({
	key: nextKey++,
	title: '',
	body: '',
	anchors: '',
	goTo: '',
	wait: 'next',
	method: 'POST',
	apiPath: '',
	captures: [],
	routePath: '',
	elementAnchor: '',
	fills: []
});

const pathString = (path: string | RegExp): string => (path instanceof RegExp ? path.source : path);

export const toStepForm = (step: TutorialStep): StepForm => {
	const form = emptyStep();
	form.title = step.title;
	form.body = step.body;
	form.anchors = (Array.isArray(step.anchor) ? step.anchor : step.anchor ? [step.anchor] : []).join(
		'\n'
	);
	form.goTo = step.goTo ?? '';
	form.fills = (step.fills ?? []).map((fill) => ({
		label: fill.label,
		anchor: fill.anchor,
		kind: typeof fill.value === 'boolean' ? (fill.value ? 'on' : 'off') : 'text',
		value: typeof fill.value === 'string' ? fill.value : ''
	}));
	const wait = step.waitFor;
	if (wait?.kind === 'api') {
		form.wait = 'api';
		form.method = wait.method;
		form.apiPath = pathString(wait.path);
		form.captures = Object.entries(wait.capture ?? {}).map(([name, field]) => ({ name, field }));
	} else if (wait?.kind === 'route') {
		form.wait = 'route';
		form.routePath = pathString(wait.path);
	} else if (wait?.kind === 'element') {
		form.wait = 'element';
		form.elementAnchor = wait.anchor;
	}
	return form;
};

const fillFromForm = (fill: FillForm): TutorialFill => ({
	label: fill.label.trim(),
	anchor: fill.anchor.trim(),
	value: fill.kind === 'text' ? fill.value : fill.kind === 'on'
});

export const fromStepForm = (form: StepForm): TutorialStep => {
	const step: TutorialStep = { title: form.title.trim(), body: form.body.trim() };
	const anchors = form.anchors
		.split('\n')
		.map((a) => a.trim())
		.filter(Boolean);
	if (anchors.length === 1) step.anchor = anchors[0];
	else if (anchors.length > 1) step.anchor = anchors;
	if (form.goTo.trim()) step.goTo = form.goTo.trim();
	const fills = form.fills.filter((f) => f.anchor.trim() || f.label.trim()).map(fillFromForm);
	if (fills.length) step.fills = fills;

	if (form.wait === 'api') {
		const capture = Object.fromEntries(
			form.captures
				.filter((c) => c.name.trim() && c.field.trim())
				.map((c) => [c.name.trim(), c.field.trim()])
		);
		step.waitFor = {
			kind: 'api',
			method: form.method,
			path: form.apiPath.trim(),
			...(Object.keys(capture).length ? { capture } : {})
		};
	} else if (form.wait === 'route') {
		step.waitFor = { kind: 'route', path: form.routePath.trim() };
	} else if (form.wait === 'element') {
		step.waitFor = { kind: 'element', anchor: form.elementAnchor.trim() };
	}
	return step;
};

/** Moves the item at `from` by `delta` places; out-of-range moves are no-ops. */
export const moveItem = <T>(items: T[], from: number, delta: number): T[] => {
	const to = from + delta;
	if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
	const out = [...items];
	const [item] = out.splice(from, 1);
	out.splice(to, 0, item);
	return out;
};
