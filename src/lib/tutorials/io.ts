/**
 * Tutorials as JSON files, to move them between instances (Settings →
 * Tutorials → Export / Import). The file is the tutorial itself, without
 * ids or dates; the server validates it again on save.
 */
import type { Tutorial, TutorialStep } from './types';

export const TUTORIAL_FILE_FORMAT = 'iris-tutorial/1';

export type TutorialFile = {
	format: typeof TUTORIAL_FILE_FORMAT;
	title: string;
	summary: string;
	duration: string;
	steps: TutorialStep[];
};

/** Built-in tutorials may use regexps; a file can only carry strings. */
const exportableStep = (step: TutorialStep): TutorialStep => {
	const wait = step.waitFor;
	if ((wait?.kind === 'api' || wait?.kind === 'route') && wait.path instanceof RegExp) {
		throw new Error(`Step "${step.title}" matches its path with a regular expression.`);
	}
	return step;
};

export const tutorialToFile = (tutorial: Omit<Tutorial, 'id'>): TutorialFile => ({
	format: TUTORIAL_FILE_FORMAT,
	title: tutorial.title,
	summary: tutorial.summary,
	duration: tutorial.duration,
	steps: tutorial.steps.map(exportableStep)
});

export const tutorialFileName = (title: string): string =>
	`${
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'tutorial'
	}.tutorial.json`;

/** Reads a tutorial file; throws with a message fit for a toast. */
export const parseTutorialFile = (text: string): Omit<TutorialFile, 'format'> => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('The file is not JSON.');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('The file does not hold a tutorial.');
	}
	const file = parsed as Partial<TutorialFile>;
	if (file.format !== undefined && file.format !== TUTORIAL_FILE_FORMAT) {
		throw new Error(`Unsupported tutorial format "${String(file.format)}".`);
	}
	if (typeof file.title !== 'string' || !file.title.trim()) {
		throw new Error('The tutorial has no title.');
	}
	if (!Array.isArray(file.steps)) throw new Error('The tutorial has no steps.');
	return {
		title: file.title,
		summary: typeof file.summary === 'string' ? file.summary : '',
		duration: typeof file.duration === 'string' ? file.duration : '',
		steps: file.steps
	};
};
