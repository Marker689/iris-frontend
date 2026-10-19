import { toEngineTutorial, type CustomTutorial } from '$lib/services/tutorials.service';
import { tutorialById } from '.';
import type { Tutorial } from './types';

/**
 * Administrators can edit the built-in tutorials (Settings → Tutorials).
 * Their version is a saved tutorial with `builtin_id` set: published, it
 * replaces the built-in, keeping its id so completion carries over;
 * unpublished, it hides it. Deleting it brings the built-in back.
 */

export type TutorialCatalogue = {
	/** In the bundle's order, as administrators left them. */
	builtIn: Tutorial[];
	/** Published tutorials administrators wrote from scratch. */
	team: Tutorial[];
};

export const applyOverride = (builtIn: Tutorial, row: CustomTutorial): Tutorial => ({
	...builtIn,
	title: row.title,
	summary: row.summary,
	duration: row.duration,
	steps: row.steps
});

export const buildCatalogue = (builtIns: Tutorial[], rows: CustomTutorial[]): TutorialCatalogue => {
	const overrides = new Map(
		rows.filter((row) => row.builtin_id).map((row) => [row.builtin_id, row])
	);
	const builtIn: Tutorial[] = [];
	for (const tutorial of builtIns) {
		const row = overrides.get(tutorial.id);
		if (!row) builtIn.push(tutorial);
		else if (row.published) builtIn.push(applyOverride(tutorial, row));
	}
	// A version of a built-in this release no longer ships is left out.
	const team = rows.filter((row) => !row.builtin_id && row.published).map(toEngineTutorial);
	return { builtIn, team };
};

export const forAudience = (tutorials: Tutorial[], administrator: boolean): Tutorial[] =>
	tutorials.filter((tutorial) => !tutorial.audience || administrator);

/** What `tutorial.start()` takes: the bare id for a bundled tutorial left as is. */
export const startSource = (tutorial: Tutorial): string | Tutorial =>
	tutorialById(tutorial.id) === tutorial ? tutorial.id : tutorial;
