import type { Tutorial } from './types';
import { alertTriageKeyboardTutorial } from './catalogue/alert-triage-keyboard';
import { firstInvestigationTutorial } from './catalogue/first-investigation';
import { powerUserShortcutsTutorial } from './catalogue/power-user-shortcuts';
import { trackVulnerabilityTutorial } from './catalogue/track-vulnerability';

/** In the order the catalogue shows them: first steps first. */
export const TUTORIALS: Tutorial[] = [
	firstInvestigationTutorial,
	alertTriageKeyboardTutorial,
	powerUserShortcutsTutorial,
	trackVulnerabilityTutorial
];

export const tutorialById = (id: string): Tutorial | undefined =>
	TUTORIALS.find((tutorial) => tutorial.id === id);
