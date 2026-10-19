import type { Tutorial } from '../types';

/**
 * From the UI to scripts: a named, scoped API key, the request that uses
 * it, and the API reference. Everything the UI does goes through the
 * same REST API, so anything shown in the other tutorials can be
 * scripted.
 */
export const automateWithApiTutorial: Tutorial = {
	id: 'automate-with-api',
	title: 'Automate IRIS with the API',
	summary:
		'Create a read-only API key for a script or an AI assistant, call the API with it, and find every endpoint in the reference.',
	duration: '~4 min',
	steps: [
		{
			title: 'Welcome',
			body: 'Every page of IRIS works through its REST API, so whatever you do here, a script can do too. You will create an API key limited to reading alerts, and see how to use it.'
		},
		{
			title: 'Your API keys',
			body: '**Named API keys** live in your profile. Each one has a name, an optional scope narrower than your own permissions, and can be revoked on its own.',
			anchor: 'api-keys',
			goTo: '/profile',
			waitFor: { kind: 'route', path: '/profile' }
		},
		{
			title: 'A new key',
			body: 'Click **New key**.',
			anchor: 'api-key-new',
			waitFor: { kind: 'element', anchor: 'api-key-form' }
		},
		{
			title: 'Name and scope',
			body: 'Name the key after what will use it. The **scope** lists the permissions it gets, here `alerts_read` only: even with your account behind it, the key can do nothing else. Left empty, it gets all your permissions. Click **Create key**.',
			anchor: 'api-key-form',
			fills: [
				{ anchor: 'api-key-name', label: 'Name', value: 'Tutorial - alert export script' },
				{ anchor: 'api-key-scope', label: 'Scope', value: 'alerts_read' }
			],
			waitFor: { kind: 'api', method: 'POST', path: '/me/api-keys' }
		},
		{
			title: 'Copy it now',
			body: 'This is the only time the key is shown: copy it into your script or password manager. Lost it? Revoke it and create another one.',
			anchor: 'api-key-minted'
		},
		{
			title: 'Use it',
			body: 'Send the key as a bearer token, on the same address as the UI: `curl -H "Authorization: Bearer <key>" https://<your IRIS>/api/v2/alerts` lists the alerts. Asking for anything else is refused: the key only reads alerts.'
		},
		{
			title: 'Every endpoint',
			body: 'The **API reference** documents every endpoint, its parameters and its answers. It is generated from the code, so it matches this instance.',
			goTo: '/api-docs',
			waitFor: { kind: 'route', path: '/api-docs' }
		},
		{
			title: 'AI assistants',
			body: 'When an administrator enables it, IRIS also speaks MCP at `/api/v2/mcp`: an assistant such as Claude Desktop or Claude Code can then search and update cases for you. Give it a named key too, read-only to start with. Revoke keys from the list on your profile once they are no longer used.'
		}
	]
};
