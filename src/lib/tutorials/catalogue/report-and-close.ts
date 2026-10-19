import type { Tutorial } from '../types';

/**
 * The end of an investigation: the report a template renders from the
 * case, then closing the case with a note saying why. Report generation
 * downloads a file outside `ApiService`, so that step moves on with Next.
 */
export const reportAndCloseTutorial: Tutorial = {
	id: 'report-and-close',
	title: 'Hand over: report and close a case',
	summary:
		'Generate the case report from a template, then close the case with a note recording the outcome.',
	duration: '~4 min',
	steps: [
		{
			title: 'Welcome',
			body: 'When the work is done, IRIS writes the report from what the case holds, and closing the case records why. You need a case you can close: the one from **Run your first investigation** is perfect.'
		},
		{
			title: 'Open the case',
			body: 'Open the case you want to close from the cases list.',
			goTo: '/cases',
			waitFor: { kind: 'route', path: '/case/{caseId}' }
		},
		{
			title: 'The case menu',
			body: 'Reports are in the case menu. Open it and pick **Generate report**.',
			anchor: 'case-menu',
			waitFor: { kind: 'element', anchor: '[data-testid="case-report-dialog"]' }
		},
		{
			title: 'Pick a template',
			body: 'A template decides what goes in the report and how it looks. Pick one and click **Generate**: the file downloads. If a template fails on an image, try again with **Safe mode**, which leaves the images out. No template listed? An administrator adds them in **Settings → Report templates**.',
			anchor: '[data-testid="case-report-dialog"]'
		},
		{
			title: 'Close the case',
			body: 'Once the report is out, open the case menu again and pick **Close Case…**.',
			anchor: 'case-menu',
			waitFor: { kind: 'element', anchor: 'case-close-form' }
		},
		{
			title: 'Say why',
			body: 'The **closing note** records the outcome for whoever reads the case later: what happened, the impact, what follows. It supports Markdown. Then click **Close case**.',
			anchor: 'case-close-form',
			fills: [
				{
					anchor: 'case-closing-note',
					label: 'Closing note',
					value:
						'Phishing contained: both domains blocked on the proxy, the user changed their password. No other mailbox received the email.'
				}
			],
			waitFor: { kind: 'api', method: 'PUT', path: '/cases/{caseId}' }
		},
		{
			title: 'Closed',
			body: 'Case #{caseId} is closed: it no longer shows in the case switcher, and its related alerts were closed with it. The closing note stays on the case, and **Reopen Case** in the same menu brings it back if needed.',
			anchor: 'case-menu'
		}
	]
};
