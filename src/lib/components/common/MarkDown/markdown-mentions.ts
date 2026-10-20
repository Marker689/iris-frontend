/**
 * `@` and `#` mention completion for the markdown source editor.
 *
 * Typing `@` lists users and teams, `#` lists case objects; picking one
 * writes the chip's stored markup (`buildMentionSpan`), which the live
 * preview then draws as a chip. Nothing is completed inside code, where
 * `@` and `#` are just characters.
 */

import {
	autocompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';
import type { MentionItem } from './MentionList.svelte';
import { isInCode } from './markdown-live-preview';
import { mentionKindStyle } from './mention-kinds';
import { buildMentionSpan } from './mention-markup';

export type MentionFetchers = {
	users: (query: string) => Promise<MentionItem[]>;
	caseObjects: (query: string) => Promise<MentionItem[]>;
};

const TRIGGER_RE = /[@#][^\s@#<>()[\]]*/;

const toCompletion = (item: MentionItem, index: number): Completion => ({
	label: item.label,
	detail: item.sublabel,
	type: item.kind,
	// The server already ranked the items; keep its order.
	boost: -index,
	apply: (view, _completion, from, to) => {
		const insert = `${buildMentionSpan(item.kind, item.id, item.label)} `;
		view.dispatch({
			changes: { from, to, insert },
			selection: { anchor: from + insert.length },
			userEvent: 'input.complete'
		});
	}
});

const mentionSource =
	(fetchers: MentionFetchers) =>
	async (context: CompletionContext): Promise<CompletionResult | null> => {
		const match = context.matchBefore(TRIGGER_RE);
		if (!match) return null;
		const { state } = context;
		const before = match.from > 0 ? state.sliceDoc(match.from - 1, match.from) : '';
		// `name@host`, `issue#4` and the like are not mentions.
		if (before !== '' && !/[\s(]/.test(before)) return null;
		const trigger = match.text[0];
		const query = match.text.slice(1);
		const lineStart = state.doc.lineAt(match.from).from === match.from;
		// `#` opening a line starts a heading; wait for a word to tell them apart.
		if (trigger === '#' && lineStart && query === '') return null;
		if (isInCode(state, match.from)) return null;

		const fetch = trigger === '@' ? fetchers.users : fetchers.caseObjects;
		let items: MentionItem[];
		try {
			items = await fetch(query);
		} catch {
			return null;
		}
		if (context.aborted) return null;
		return {
			from: match.from,
			to: context.pos,
			options: items.map(toCompletion),
			filter: false
		};
	};

const kindBadge = (completion: Completion): Node => {
	const style = mentionKindStyle(completion.type);
	const badge = document.createElement('span');
	badge.className = `cm-md-mention-badge ${style.popoverBgClass} ${style.popoverFgClass}`;
	const svgNs = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(svgNs, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('width', '12');
	svg.setAttribute('height', '12');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	const path = document.createElementNS(svgNs, 'path');
	path.setAttribute('d', style.iconPath);
	svg.appendChild(path);
	badge.appendChild(svg);
	return badge;
};

export const markdownMentions = (fetchers: MentionFetchers) =>
	autocompletion({
		override: [mentionSource(fetchers)],
		icons: false,
		addToOptions: [{ render: kindBadge, position: 20 }],
		maxRenderedOptions: 24
	});
