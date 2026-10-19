/**
 * Static checks on a tutorial, for the built-in catalogue (unit tests)
 * and the editor in Settings → Tutorials (shown as warnings while an
 * administrator writes one). Nothing here touches the DOM: whether an
 * anchor really exists can only be told by trying the tutorial.
 */
import { anchorSelector, missingVars, pathVars } from './logic';
import type { Tutorial, TutorialStep } from './types';

export type TutorialIssue = {
	/** Zero-based, `null` for the tutorial as a whole. */
	step: number | null;
	message: string;
};

/** Strings shown or used while the step is on screen, before it is done. */
const displayedTemplates = (step: TutorialStep): string[] => {
	const out = [step.title, step.body, step.goTo ?? ''];
	out.push(...(Array.isArray(step.anchor) ? step.anchor : [step.anchor ?? '']));
	for (const fill of step.fills ?? []) {
		out.push(fill.anchor);
		if (typeof fill.value === 'string') out.push(fill.value);
	}
	if (step.waitFor?.kind === 'element') out.push(step.waitFor.anchor);
	return out.filter(Boolean);
};

const isValidSelector = (anchor: string): boolean => {
	if (anchor.includes('{')) return true; // Checked once interpolated, at run time.
	try {
		document.createDocumentFragment().querySelector(anchorSelector(anchor));
		return true;
	} catch {
		return false;
	}
};

const anchorsOf = (step: TutorialStep): string[] => {
	const out = Array.isArray(step.anchor) ? [...step.anchor] : step.anchor ? [step.anchor] : [];
	for (const fill of step.fills ?? []) out.push(fill.anchor);
	if (step.waitFor?.kind === 'element') out.push(step.waitFor.anchor);
	return out;
};

export const lintTutorial = (tutorial: Pick<Tutorial, 'title' | 'steps'>): TutorialIssue[] => {
	const issues: TutorialIssue[] = [];
	if (!tutorial.title.trim()) issues.push({ step: null, message: 'The tutorial has no title.' });
	if (tutorial.steps.length === 0) issues.push({ step: null, message: 'Add at least one step.' });

	const known = new Set<string>();
	tutorial.steps.forEach((step, index) => {
		const add = (message: string) => issues.push({ step: index, message });
		const vars = Object.fromEntries([...known].map((name) => [name, name]));

		if (!step.title.trim()) add('The step has no title.');

		const unknown = new Set(displayedTemplates(step).flatMap((t) => missingVars(t, vars)));
		for (const name of unknown) {
			add(`{${name}} is not known yet: capture it in an earlier step.`);
		}

		if (step.goTo !== undefined && (!step.goTo.startsWith('/') || step.goTo.startsWith('//'))) {
			add('"Take me there" must be a path inside IRIS, starting with /.');
		}

		for (const anchor of anchorsOf(step)) {
			if (!anchor.trim()) add('An element to highlight or fill is empty.');
			else if (!isValidSelector(anchor)) add(`"${anchor}" is not a valid CSS selector.`);
		}

		const wait = step.waitFor;
		if (wait?.kind === 'api' && typeof wait.path === 'string') {
			if (wait.path.startsWith('/api/')) add('API paths start after /api/v2, e.g. /cases.');
			if (!wait.path.startsWith('/')) add('The API path must start with /.');
		}
		if (wait?.kind === 'route' && typeof wait.path === 'string' && !wait.path.startsWith('/')) {
			add('The page path must start with /.');
		}

		// What this step binds is known from the next step on.
		if (wait?.kind === 'api' || wait?.kind === 'route') {
			for (const name of pathVars(wait.path)) known.add(name);
		}
		if (wait?.kind === 'api') {
			for (const name of Object.keys(wait.capture ?? {})) known.add(name);
		}
	});
	return issues;
};
