import type { Tutorial } from '../types';

/**
 * The daily loop of an investigation: case → IOCs → timeline → task,
 * with the shortcuts that save the most typing along the way (one IOC
 * per line, the section's Add button, the date parser).
 */
export const firstInvestigationTutorial: Tutorial = {
	id: 'first-investigation',
	title: 'Run your first investigation',
	summary:
		'Open a case, add several IOCs at once, put a raw log date on the timeline, and hand a task to a colleague.',
	duration: '~8 min',
	steps: [
		{
			title: 'Welcome',
			body: 'A **case** holds everything about one investigation: indicators, timeline, tasks, notes, evidence. You will open one and fill it the quick way. Everything you create is real data: use a test customer, and delete the case when you are done.'
		},
		{
			title: 'Open a case',
			body: 'On the cases overview, click **Open a case**.',
			anchor: 'case-new',
			goTo: '/cases',
			waitFor: { kind: 'element', anchor: 'case-form' }
		},
		{
			title: 'Fill in the case',
			body: 'Give it a name and a short description, and pick the **customer** it belongs to. Then click **Create**.',
			anchor: 'case-form',
			fills: [
				{
					anchor: 'case-name',
					label: 'Case name',
					value: 'Tutorial - phishing with malicious link'
				},
				{
					anchor: 'case-description',
					label: 'Short description',
					value: 'A user clicked a link in a fake invoice email'
				}
			],
			waitFor: {
				kind: 'api',
				method: 'POST',
				path: '/cases',
				capture: { caseId: 'case_id' }
			}
		},
		{
			title: 'Go to the IOCs',
			body: 'Case #{caseId} is open. **IOCs** are the indicators of compromise: domains, IPs, hashes, accounts. Open the **IOCs** section.',
			anchor: 'a[href="/case/{caseId}/iocs"]',
			goTo: '/case/{caseId}/iocs',
			waitFor: { kind: 'route', path: '/case/{caseId}/iocs' }
		},
		{
			title: 'The section button',
			body: 'The highlighted button always adds the kind of item of the section you are in: an IOC here, a task in Tasks, an event in the Timeline. Click **Add IOC**.',
			anchor: 'case-quick-add',
			waitFor: { kind: 'element', anchor: 'ioc-form' }
		},
		{
			title: 'Several IOCs at once',
			body: 'With **One IOC per line** ticked, each line becomes its own IOC: paste a whole list from a report or a mail header. Pick the type **domain**, then click **Add IOC**.',
			anchor: 'ioc-form',
			fills: [
				{
					anchor: 'ioc-values',
					label: 'Two domains',
					value: 'invoice-portal.example.net\ncdn-update.example.org'
				}
			],
			waitFor: { kind: 'api', method: 'POST', path: '/cases/{caseId}/iocs' }
		},
		{
			title: 'Go to the timeline',
			body: 'The **timeline** tells what happened, in order. Open it.',
			anchor: 'a[href="/case/{caseId}/timeline"]',
			goTo: '/case/{caseId}/timeline',
			waitFor: { kind: 'route', path: '/case/{caseId}/timeline' }
		},
		{
			title: 'Add an event',
			body: 'Same button, same place: click **Add Event**.',
			anchor: 'case-quick-add',
			waitFor: { kind: 'element', anchor: 'event-form' }
		},
		{
			title: 'Paste the date as it is',
			body: 'No need to retype dates from logs. Click the **wand** next to the time, paste the date exactly as the log prints it, and press **Enter**: date, time and time zone are filled in.',
			anchor: ['event-date-parse-input', 'event-date-parse'],
			fills: [
				{ anchor: 'event-date-parse-input', label: 'Log date', value: 'Oct 19 08:42:17 2026' }
			],
			waitFor: { kind: 'api', method: 'POST', path: '/cases/{caseId}/events/convert-date' }
		},
		{
			title: 'Save the event',
			body: 'Give the event a title. You can also link it to the IOCs you just added, so it shows up on their page. Then click **Add event**.',
			anchor: 'event-form',
			fills: [{ anchor: 'event-title', label: 'Title', value: 'User opens the fake invoice link' }],
			waitFor: { kind: 'api', method: 'POST', path: '/cases/{caseId}/events' }
		},
		{
			title: 'Go to the tasks',
			body: 'Investigations are shared work. Open **Tasks**.',
			anchor: 'a[href="/case/{caseId}/tasks"]',
			goTo: '/case/{caseId}/tasks',
			waitFor: { kind: 'route', path: '/case/{caseId}/tasks' }
		},
		{
			title: 'Hand out a task',
			body: 'Click **Add Task**, give it a title, and pick who it is **assigned** to. Then save it.',
			anchor: ['task-form', 'case-quick-add'],
			fills: [{ anchor: 'task-title', label: 'Title', value: 'Block both domains on the proxy' }],
			waitFor: { kind: 'api', method: 'POST', path: '/cases/{caseId}/tasks' }
		},
		{
			title: 'Notes, and what comes next',
			body: 'The **Notes** section is a shared editor: several analysts write in the same note at the same time. From here, the case **Summary** gathers everything, and the report button turns it into a document. Close the case once the work is done.',
			anchor: 'a[href="/case/{caseId}/notes"]'
		}
	]
};
