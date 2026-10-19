import type { Tutorial } from '../types';

/**
 * For administrators: writing a tutorial in Settings → Tutorials, by
 * hand and with the recorder, and adapting the built-in ones. Ends on
 * Try it, since a preview replaces the tutorial running.
 */
export const writeATutorialTutorial: Tutorial = {
	id: 'write-a-tutorial',
	title: 'Write a tutorial for your team',
	summary:
		'Turn a procedure of your team into a guided tutorial: write the steps, record them as you click through, and publish it.',
	duration: '~8 min',
	audience: 'administrators',
	steps: [
		{
			title: 'Welcome',
			body: 'The tutorials of this catalogue run on the real pages, and administrators can write their own: the house way of triaging phishing, of opening a case for a customer… You will write a small one. It stays a draft, visible to administrators only, until you publish it.'
		},
		{
			title: 'Open the tutorials settings',
			body: 'Tutorials are managed in **Settings → Tutorials**.',
			goTo: '/settings/tutorials',
			waitFor: { kind: 'route', path: '/settings/tutorials' }
		},
		{
			title: 'The built-in tutorials',
			body: 'The tutorials shipped with IRIS are listed first. **Edit** one to adapt it to your team: your version replaces it for everyone, and unpublishing it hides it. **Restore** brings back the original.',
			anchor: 'tutorials-built-in'
		},
		{
			title: 'Your own tutorials',
			body: 'The ones your team writes are listed below them. Click **New tutorial**.',
			anchor: 'tutorial-new',
			waitFor: { kind: 'route', path: '/settings/tutorials/new' }
		},
		{
			title: 'What it is about',
			body: 'The title, duration and summary are what users see in **Help → Tutorials** before starting it. Fill them in.',
			anchor: 'tutorial-details',
			fills: [
				{ anchor: '#tutorial-title', label: 'Title', value: 'Tutorial - find an open case' },
				{ anchor: '#tutorial-duration', label: 'Duration', value: '~1 min' },
				{
					anchor: '#tutorial-summary',
					label: 'Summary',
					value: 'Where the cases are and how to open one.'
				}
			]
		},
		{
			title: 'Add a step',
			body: 'A tutorial is a list of steps, shown one at a time in a panel like this one. Click **Add step**.',
			anchor: 'tutorial-add-step',
			waitFor: { kind: 'element', anchor: 'tutorial-step' }
		},
		{
			title: 'Write the step',
			body: 'Each step has a short title and an instruction. Words between two asterisks are shown in bold, words between backquotes as code.',
			anchor: 'tutorial-step',
			fills: [
				{ anchor: 'tutorial-step-title', label: 'Step title', value: 'Open the cases' },
				{
					anchor: 'tutorial-step-body',
					label: 'Instruction',
					value: 'Click **Cases** in the menu.'
				}
			]
		},
		{
			title: 'Point at the page',
			body: '**Highlight** draws a ring around what the step is about: a `data-tour` name or any CSS selector. **Take me there** offers a link to the page when the user is somewhere else.',
			anchor: 'tutorial-step-highlight'
		},
		{
			title: 'Moving on by itself',
			body: '**Done when** decides when the step is over: the user clicks Next, something gets saved, a page opens, or an element shows up. A save can remember an id of the answer, so later steps go to the very case the user just created.',
			anchor: 'tutorial-step-wait'
		},
		{
			title: 'Save the draft',
			body: 'Click **Save**. Nobody else sees it until it is published.',
			anchor: 'tutorial-save',
			waitFor: {
				kind: 'api',
				method: 'POST',
				path: '/manage/tutorials',
				capture: { tutorialId: 'id' }
			}
		},
		{
			title: 'Record instead of writing',
			body: 'Writing every step by hand is slow: the recorder writes them while you do the procedure once. Click **Record**.',
			anchor: 'tutorial-record',
			waitFor: { kind: 'element', anchor: '[data-testid="tutorial-recorder"]' }
		},
		{
			title: 'Do the procedure',
			body: 'Every page you open and everything you save becomes a step. The case or alert you work on becomes a value the tutorial asks for, so it works on any case. Open the cases list.',
			anchor: '[data-testid="tutorial-recorder"]',
			goTo: '/cases',
			waitFor: { kind: 'route', path: '/cases' }
		},
		{
			title: 'Point at things',
			body: 'Clicks are not recorded on their own. Click **Pick element**, then on the button you want the user to click: it becomes a step that highlights it.',
			anchor: '[data-testid="tutorial-recorder-pick"]'
		},
		{
			title: 'Explain',
			body: '**Explain** adds a step with only text, for the why behind a click. The arrow next to it removes the last step.',
			anchor: 'recorder-explain'
		},
		{
			title: 'Stop recording',
			body: 'Click **Stop**: you are back in the editor, with the recorded steps added to the tutorial.',
			anchor: '[data-testid="tutorial-recorder-stop"]',
			waitFor: { kind: 'route', path: '/settings/tutorials/{tutorialId}' }
		},
		{
			title: 'Polish the steps',
			body: 'Recorded steps get plain titles and no instruction: rewrite them the way you would explain the procedure to a new colleague. Warnings under a step point at what would not work, like a highlight that names nothing.',
			anchor: 'tutorial-step'
		},
		{
			title: 'Publish',
			body: 'Once it is ready, tick **Published** and save: it shows up in everyone’s **Help → Tutorials**. **Export** saves it as a file another IRIS can import from the tutorials list.',
			anchor: 'tutorial-published'
		},
		{
			title: 'Try it',
			body: '**Try it** runs the tutorial as it is in the editor, without marking it as done for you. It replaces the tutorial running, so click **Finish** here first, then **Try it**. Delete the example from the list when you are done with it.',
			anchor: 'tutorial-try'
		}
	]
};
