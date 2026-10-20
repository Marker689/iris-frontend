import type { Tutorial } from '../types';

/**
 * A first AI workflow, built on the real editor: a manual trigger in the
 * case menu, an Action reading the case, a Notify node telling about it.
 * Dry run first, then activated.
 *
 * Selects (tool, trigger type) and the canvas links can't be filled in:
 * the steps say what to pick or drag, and wait for what it produces.
 */
export const createAWorkflowTutorial: Tutorial = {
	id: 'create-a-workflow',
	title: 'Build your first AI workflow',
	summary:
		'Create a workflow from scratch: a trigger in the case menu, an action reading the case and a notification, tried in a dry run before it goes live.',
	duration: '~8 min',
	audience: 'administrators',
	steps: [
		{
			title: 'Welcome',
			body: 'An **AI workflow** is a graph: a **trigger** node starts a run, and the run follows the links from node to node — tool calls, AI agents, notifications, suggestions, questions to an analyst. You will build a small one that reads a case and notifies you about it. Nothing runs on its own until the workflow is **active**, and AI workflows must be enabled on this instance.'
		},
		{
			title: 'Open the AI workflows',
			body: 'Workflows are managed in **Settings**, under **AI → Workflows**. The list shows each workflow, its triggers and its last runs.',
			anchor: 'a[href="/settings/ai-workflows"]',
			goTo: '/settings/ai-workflows',
			waitFor: { kind: 'route', path: '/settings/ai-workflows' }
		},
		{
			title: 'Start a new workflow',
			body: 'The **Library** holds ready-made workflows to import. This time, start from an empty one: click **New workflow**.',
			anchor: '[data-testid="wf-new"]',
			waitFor: { kind: 'route', path: '/settings/ai-workflows/new' }
		},
		{
			title: 'Name it',
			body: 'The name shows in the list, in the run history and, by default, in the menus the workflow is offered in.',
			anchor: '[data-testid="wf-name"]',
			fills: [
				{
					anchor: '[data-testid="wf-name"]',
					label: 'Name',
					value: 'Tutorial - case summary'
				}
			]
		},
		{
			title: 'The workflow settings',
			body: 'The settings panel holds what applies to every run: the **customers** it may act on, who sees its **suggestions**, how many runs per hour and tokens it may spend. The **write allowlist** matters most: a write tool not listed there never runs, it becomes a suggestion an analyst accepts or not. This workflow only reads, so keep the defaults.',
			anchor: '[data-testid="wf-settings"]'
		},
		{
			title: 'Configure the trigger',
			body: 'Every workflow starts at a **trigger** node, already on the canvas. Click it: its settings open on the right. Keep the **Manual** type — the others start a run on an event, a schedule, a webhook or a call from another workflow.',
			anchor: ['[data-testid="wf-trigger-form"]', '[data-testid="wf-node-n1"]'],
			waitFor: { kind: 'element', anchor: '[data-testid="wf-trigger-form"]' }
		},
		{
			title: 'Offer it in the case menu',
			body: 'In **Entity types the Run button accepts**, pick **Case**: the run is then about a case, and its tools are pinned to it. In **Show in object menus**, pick **Case** too, so analysts can start it from a case.',
			anchor: '[data-testid="wf-trigger-form"]',
			waitFor: { kind: 'element', anchor: '[data-testid="wf-trigger-menu-label"]' }
		},
		{
			title: 'Label the menu entry',
			body: 'This is what analysts click in the case menu. Without a label, the workflow name is used.',
			anchor: '[data-testid="wf-trigger-menu-label"]',
			fills: [
				{
					anchor: '[data-testid="wf-trigger-menu-label"]',
					label: 'Menu label',
					value: 'Summarise this case'
				}
			]
		},
		{
			title: 'Add an Action node',
			body: 'The **palette** on the left lists the nodes. Click **Action** — an action runs one IRIS tool — or drag it onto the canvas.',
			anchor: '[data-testid="wf-palette-action"]',
			waitFor: { kind: 'element', anchor: '[data-testid="wf-cfg-tool"]' }
		},
		{
			title: 'Pick its tool',
			body: 'In **Tool**, pick `iris_cases_get`. It reads the case the run is about: the case is pinned to the run, so the arguments stay empty. Read tools always run; write tools need the allowlist.',
			anchor: '[data-testid="wf-cfg-tool"]'
		},
		{
			title: 'Give it a readable id',
			body: "Later nodes read this node's output as `nodes.<id>.output`. Rename the id to `case` and press **Enter**: the next templates then read `nodes.case.output.result`.",
			anchor: '[data-testid="wf-cfg-id"]',
			fills: [
				{ anchor: '[data-testid="wf-cfg-label"]', label: 'Label', value: 'Read the case' },
				{ anchor: '[data-testid="wf-cfg-id"]', label: 'Id', value: 'case' }
			]
		},
		{
			title: 'Add a Notify node',
			body: "Now click **Notify** in the palette. It sends an in-app notification — by default to the people on the run's entity: here, the case owner and whoever started the run.",
			anchor: '[data-testid="wf-palette-notify"]',
			waitFor: { kind: 'element', anchor: '[data-testid="wf-cfg-body"]' }
		},
		{
			title: 'Write the notification',
			body: 'Titles and bodies are **templates**: `{{ … }}` is replaced at run time with what earlier nodes produced. Type `{{` in a field to browse what is available.',
			anchor: '[data-testid="wf-drawer"]',
			fills: [
				{
					anchor: '[data-testid="wf-cfg-title"]',
					label: 'Title',
					value: 'Case: {{ nodes.case.output.result.case_name }}'
				},
				{
					anchor: '[data-testid="wf-cfg-body"]',
					label: 'Body',
					value: 'Opened on {{ nodes.case.output.result.open_date }}.'
				}
			]
		},
		{
			title: 'Link the nodes',
			body: 'A run only follows links. Drag from the dot at the bottom of **Trigger** to **Read the case**, then from the **out** dot of **Read the case** to **Notify**. The **error** dot of an action is where a failed tool call goes.',
			anchor: '[data-testid="wf-canvas"]'
		},
		{
			title: 'Validate',
			body: "Click **Validate**. It checks the whole graph — unlinked nodes, unknown tools, templates referring to nodes that don't exist — and marks the nodes with problems in red.",
			anchor: '[data-testid="wf-validate"]',
			waitFor: { kind: 'api', method: 'POST', path: '/ai-workflows/validate' }
		},
		{
			title: 'Create it',
			body: 'When the graph is valid, click **Create**. The workflow is saved **inactive**: nobody sees it in a menu yet.',
			anchor: '[data-testid="wf-save"]',
			waitFor: {
				kind: 'api',
				method: 'POST',
				path: '/ai-workflows',
				capture: { workflowId: 'id' }
			}
		},
		{
			title: 'Try it in a dry run',
			body: 'Click **Run**, keep **Case** and type the id of a case you can see. Leave **Dry run** on: writes become suggestions, external calls are only previewed, and a Notify node only says whom it would notify. Then start the run.',
			anchor: ['[data-testid="wf-run-dialog"]', '[data-testid="wf-run"]'],
			waitFor: { kind: 'api', method: 'POST', path: '/ai-workflows/{workflowId}/run' }
		},
		{
			title: 'Follow the run',
			body: 'The canvas follows the run live: each node lights up as it runs. **Runs** lists every run of the workflow; open this one to see the input and output of each node — the rendered notification title and body, and who would have been notified.',
			anchor: '[data-testid="wf-canvas"]'
		},
		{
			title: 'Activate it',
			body: 'Happy with the result? Switch **Active** on and click **Save**. The workflow now shows as **Summarise this case** in the case menu, and runs as the analyst who clicks it, with their access.',
			anchor: ['[data-testid="wf-active"]', '[data-testid="wf-save"]'],
			waitFor: { kind: 'api', method: 'PUT', path: '/ai-workflows/{workflowId}' }
		},
		{
			title: 'Where to go next',
			body: 'Add an **AI agent** node to summarise the case in your words, a **Suggest** node to propose changes an analyst accepts, or an **Ask analyst** node to pause for a decision. The **JSON guide** documents every node, and the **Library** has complete workflows to learn from. Delete this one from the list when you no longer need it.',
			anchor: '[data-testid="wf-palette"]'
		}
	]
};
