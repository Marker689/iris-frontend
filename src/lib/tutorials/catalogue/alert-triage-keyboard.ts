import type { Tutorial } from '../types';

/**
 * Keyboard triage in the split view: walk the queue, select, escalate
 * into a case. Needs at least one alert in the queue; it escalates a
 * real one, so pick a test alert.
 */
export const alertTriageKeyboardTutorial: Tutorial = {
	id: 'alert-triage-keyboard',
	title: 'Triage alerts from the keyboard',
	summary:
		'Use the split triage view to walk the alert queue with j and k, select with x, and escalate an alert into a case with e.',
	duration: '~5 min',
	steps: [
		{
			title: 'Welcome',
			body: 'Triage is repetitive: the **split view** keeps the queue and the alert side by side, and single keys do the common actions. You need at least one alert in the queue, and you will escalate one of them into a case: pick a test alert.'
		},
		{
			title: 'Open the alerts',
			body: 'Open **Alerts** from the sidebar.',
			anchor: 'a[href="/alerts"]',
			goTo: '/alerts',
			waitFor: { kind: 'route', path: '/alerts' }
		},
		{
			title: 'Switch to split triage',
			body: 'Click **Split triage**. IRIS remembers the view you use.',
			anchor: '[aria-label="Split triage"]',
			waitFor: { kind: 'element', anchor: '[aria-label="Alert triage cockpit"]' }
		},
		{
			title: 'Your queues',
			body: 'These tabs split the work: **Mine**, **Unassigned** and **Escalated**, with their counts. Start the day on Unassigned, then on Mine.',
			anchor: '[aria-label="Alert queue filter"]'
		},
		{
			title: 'Walk the queue',
			body: 'Press `j` to go down and `k` to go up (the arrow keys work too). The alert on the right follows, and you never lose your place in the list. Press `x` to select the current alert: selected alerts can be closed, assigned or merged together.',
			anchor: '[aria-label="Alert triage cockpit"]'
		},
		{
			title: 'Escalate',
			body: 'Stop on a test alert and press `e`. Letters do nothing while you are typing in a field: click a row first if a shortcut seems dead.',
			anchor: '[aria-label="Alert triage cockpit"]',
			waitFor: { kind: 'element', anchor: 'alert-escalate-form' }
		},
		{
			title: 'Into a new case',
			body: 'Escalating opens a case from the alert. Give it a title and tick the **IOCs** and **assets** of the alert that should be carried into the case. Then click **Merge**.',
			anchor: 'alert-escalate-form',
			fills: [
				{
					anchor: '#merge-alert-case-title',
					label: 'Case title',
					value: 'Tutorial - escalated alert'
				}
			],
			waitFor: {
				kind: 'api',
				method: 'POST',
				path: '/alerts/escalate/{alertId}',
				capture: { caseId: 'case_id' }
			}
		},
		{
			title: 'The case is ready',
			body: 'Alert #{alertId} is now case #{caseId}, with the IOCs and assets you kept. Next time, `m` merges the alert into an **existing** case instead: handy when several alerts belong to the same incident.',
			goTo: '/case/{caseId}',
			waitFor: { kind: 'route', path: '/case/{caseId}' }
		},
		{
			title: 'That is all',
			body: 'In short: `j` / `k` move, `x` selects, `e` escalates, `m` merges. Back in the queue, the escalated alert has moved to the **Escalated** tab.'
		}
	]
};
