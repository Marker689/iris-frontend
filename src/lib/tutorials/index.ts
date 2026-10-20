import type { Tutorial } from './types';
import { alertTriageKeyboardTutorial } from './catalogue/alert-triage-keyboard';
import { automateWithApiTutorial } from './catalogue/automate-with-api';
import { createAWorkflowTutorial } from './catalogue/create-a-workflow';
import { firstInvestigationTutorial } from './catalogue/first-investigation';
import { powerUserShortcutsTutorial } from './catalogue/power-user-shortcuts';
import { reportAndCloseTutorial } from './catalogue/report-and-close';
import { trackVulnerabilityTutorial } from './catalogue/track-vulnerability';
import { writeATutorialTutorial } from './catalogue/write-a-tutorial';

/** In the order the catalogue shows them: first steps first. */
export const TUTORIALS: Tutorial[] = [
	firstInvestigationTutorial,
	alertTriageKeyboardTutorial,
	reportAndCloseTutorial,
	powerUserShortcutsTutorial,
	automateWithApiTutorial,
	createAWorkflowTutorial,
	trackVulnerabilityTutorial,
	writeATutorialTutorial
];

export const tutorialById = (id: string): Tutorial | undefined =>
	TUTORIALS.find((tutorial) => tutorial.id === id);
