import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptCompletion, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { forceParsing } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { MentionItem } from '../MentionList.svelte';
import { markdownMentions } from '../markdown-mentions';
import { buildMentionSpan } from '../mention-markup';

const USERS: MentionItem[] = [
	{ id: 7, label: 'Zed', sublabel: 'zed@x.test', kind: 'user' },
	{ id: 3, label: 'Bob', kind: 'user' }
];
const CASE_OBJECTS: MentionItem[] = [{ id: 12, label: 'host-1', kind: 'asset' }];

const views: EditorView[] = [];

const setup = (doc: string, anchor = doc.length) => {
	const users = vi.fn(async (_query: string) => USERS);
	const caseObjects = vi.fn(async (_query: string) => CASE_OBJECTS);
	const view = new EditorView({
		state: EditorState.create({
			doc,
			selection: EditorSelection.cursor(anchor),
			extensions: [markdown({ base: markdownLanguage }), markdownMentions({ users, caseObjects })]
		}),
		parent: document.body
	});
	forceParsing(view, view.state.doc.length, 1000);
	views.push(view);
	return { view, users, caseObjects };
};

const labels = (view: EditorView) => currentCompletions(view.state).map((c) => c.label);

/** Start completion and wait for the list to open. */
const complete = async (view: EditorView) => {
	startCompletion(view);
	await vi.waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
};

/** Start completion and give it time to (not) open. */
const completeNothing = async (view: EditorView) => {
	startCompletion(view);
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(currentCompletions(view.state)).toEqual([]);
};

afterEach(() => {
	while (views.length) views.pop()?.destroy();
	document.body.replaceChildren();
});

describe('markdownMentions', () => {
	it('queries users for `@` after whitespace', async () => {
		const { view, users, caseObjects } = setup('hi @bo');
		await complete(view);
		expect(users).toHaveBeenCalledWith('bo');
		expect(caseObjects).not.toHaveBeenCalled();
		expect(labels(view)).toEqual(['Zed', 'Bob']);
	});

	it('keeps the order the server ranked and shows the sublabel', async () => {
		const { view } = setup('@');
		await complete(view);
		const options = currentCompletions(view.state);
		expect(options.map((c) => c.label)).toEqual(['Zed', 'Bob']);
		expect(options[0].detail).toBe('zed@x.test');
		expect(options[0].type).toBe('user');
	});

	it('queries users for `@` at the start of the document or after a parenthesis', async () => {
		const start = setup('@bo');
		await complete(start.view);
		expect(start.users).toHaveBeenCalledWith('bo');

		const paren = setup('see (@al');
		await complete(paren.view);
		expect(paren.users).toHaveBeenCalledWith('al');
	});

	it('ignores an email-like `a@b`', async () => {
		const { view, users } = setup('a@b');
		await completeNothing(view);
		expect(users).not.toHaveBeenCalled();
	});

	it('ignores `#` glued to a word', async () => {
		const { view, caseObjects } = setup('issue#4');
		await completeNothing(view);
		expect(caseObjects).not.toHaveBeenCalled();
	});

	it('ignores a lone `#` at the start of a line, which may open a heading', async () => {
		const { view, caseObjects } = setup('text\n#');
		await completeNothing(view);
		expect(caseObjects).not.toHaveBeenCalled();
	});

	it('queries case objects for `#word` at the start of a line', async () => {
		const { view, caseObjects, users } = setup('text\n#ho');
		await complete(view);
		expect(caseObjects).toHaveBeenCalledWith('ho');
		expect(users).not.toHaveBeenCalled();
		expect(labels(view)).toEqual(['host-1']);
	});

	it('queries case objects for a lone `#` inside a line', async () => {
		const { view, caseObjects } = setup('see #');
		await complete(view);
		expect(caseObjects).toHaveBeenCalledWith('');
	});

	it('completes nothing inside a fenced block', async () => {
		const doc = '```\nhi @bo\n```';
		const { view, users } = setup(doc, doc.indexOf('@bo') + 3);
		await completeNothing(view);
		expect(users).not.toHaveBeenCalled();
	});

	it('completes nothing inside an unclosed fenced block', async () => {
		const { view, users } = setup('```\nhi @bo');
		await completeNothing(view);
		expect(users).not.toHaveBeenCalled();
	});

	it('completes nothing inside inline code', async () => {
		const doc = 'a ` @bo` b';
		const { view, users } = setup(doc, doc.indexOf('@bo') + 3);
		await completeNothing(view);
		expect(users).not.toHaveBeenCalled();
	});

	it('completes nothing at the start of an indented code block', async () => {
		const { view, users } = setup('para\n\n    @bo');
		await completeNothing(view);
		expect(users).not.toHaveBeenCalled();
	});

	it('completes nothing when the fetcher fails', async () => {
		const { view, users } = setup('hi @bo');
		users.mockRejectedValueOnce(new Error('offline'));
		await completeNothing(view);
		expect(users).toHaveBeenCalledWith('bo');
	});

	it('writes the chip markup and a space in place of the trigger', async () => {
		const { view } = setup('hi @bo there', 6);
		await complete(view);
		// `acceptCompletion` ignores keys pressed right after the list opens.
		await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
		const chip = `${buildMentionSpan('user', 7, 'Zed')} `;
		expect(view.state.doc.toString()).toBe(`hi ${chip} there`);
		expect(view.state.selection.main.head).toBe(3 + chip.length);
	});

	it('writes a case-object chip with its kind', async () => {
		const { view } = setup('see #ho');
		await complete(view);
		await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
		expect(view.state.doc.toString()).toBe(`see ${buildMentionSpan('asset', 12, 'host-1')} `);
	});
});
