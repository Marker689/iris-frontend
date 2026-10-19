import type { Tutorial } from '../types';

/**
 * The shortcuts experienced analysts lean on: jump to a case, search
 * everything, and the small buttons that save typing in a case. Creates
 * nothing; it needs at least one case to jump to.
 */
export const powerUserShortcutsTutorial: Tutorial = {
	id: 'power-user-shortcuts',
	title: 'Shortcuts for power users',
	summary:
		'Jump to any case with Ctrl+K, search everything with Ctrl+/, and the buttons that save typing inside a case.',
	duration: '~3 min',
	steps: [
		{
			title: 'Welcome',
			body: 'A few keys get you anywhere in IRIS without the mouse. On a Mac, read `Cmd` wherever this tutorial says `Ctrl`. Nothing is created: you only need one case to jump to.'
		},
		{
			title: 'Jump to a case',
			body: 'Press `Ctrl` + `K`, from any page.',
			waitFor: { kind: 'element', anchor: 'switch-context' }
		},
		{
			title: 'Pick it',
			body: 'Type a few letters of a case name, or its number, and pick it: IRIS opens the case.',
			anchor: 'switch-context',
			waitFor: { kind: 'route', path: '/case/{caseId}' }
		},
		{
			title: 'Search everything',
			body: 'Press `Ctrl` + `/`: the search box takes the focus, whatever page you are on.',
			anchor: 'input[aria-label="Search across cases"]',
			waitFor: { kind: 'element', anchor: 'input[aria-label="Search across cases"]:focus' }
		},
		{
			title: 'Search results',
			body: 'Type two characters or more: assets, IOCs, notes, tasks, evidence and timeline events match, each result opening at the right place. Inside a case the search stays in that case; switch the scope to search everywhere you have access. Press `Enter` for the full results page.',
			anchor: 'input[aria-label="Search across cases"]',
			waitFor: { kind: 'route', path: '/search' }
		},
		{
			title: 'One button per section',
			body: 'Back in case #{caseId}: in every section, the highlighted button adds the item of that section. Add IOC in IOCs, Add Task in Tasks, Add Event in the Timeline: no menu to open.',
			anchor: 'case-quick-add',
			goTo: '/case/{caseId}/iocs'
		},
		{
			title: 'Dates from logs',
			body: 'In the timeline, the event form has two small buttons next to the time: the **clock** sets it to now, the **wand** reads a date pasted as the log prints it (ISO 8601, syslog with a year, epoch) and fills the date, time and time zone.',
			anchor: 'case-quick-add',
			goTo: '/case/{caseId}/timeline'
		},
		{
			title: 'Save without the mouse',
			body: 'In the Markdown editors, `Ctrl` + `S` or `Ctrl` + `Enter` saves. You are all set.'
		}
	]
};
