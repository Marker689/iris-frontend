/**
 * Toolbar and shortcut commands of the markdown source editor. Each one
 * edits the markdown text the way a user would type it — wrapping a
 * selection in `**`, prefixing lines with `- `, rewriting a pipe table —
 * and toggles: run inside what it would create, it takes it away (bold
 * text loses its `**`, a link turns back into its text).
 */

import { EditorSelection, type EditorState, type Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { enclosingNode } from './markdown-live-preview';
import { applyTableOp, blankTable, tableColumnAt, type TableOp } from './markdown-tables';

export type InlineMarker = '**' | '*' | '~~' | '`';

const NODE_FOR_MARKER: Record<InlineMarker, string> = {
	'**': 'StrongEmphasis',
	'*': 'Emphasis',
	'~~': 'Strikethrough',
	'`': 'InlineCode'
};

const MARK_FOR_NODE: Record<string, string> = {
	StrongEmphasis: 'EmphasisMark',
	Emphasis: 'EmphasisMark',
	Strikethrough: 'StrikethroughMark',
	InlineCode: 'CodeMark'
};

export type ActiveFormats = {
	bold: boolean;
	italic: boolean;
	strike: boolean;
	heading: number;
	bulletList: boolean;
	orderedList: boolean;
	blockquote: boolean;
	codeBlock: boolean;
	table: boolean;
	link: boolean;
};

export const NO_ACTIVE_FORMATS: ActiveFormats = {
	bold: false,
	italic: false,
	strike: false,
	heading: 0,
	bulletList: false,
	orderedList: false,
	blockquote: false,
	codeBlock: false,
	table: false,
	link: false
};

const HEADING_PREFIX_RE = /^(\s{0,3})(#{1,6})(?:\s+|$)/;
const BULLET_RE = /^(\s*)([-*+])\s+/;
const ORDERED_RE = /^(\s*)(\d+[.)])\s+/;
const QUOTE_RE = /^(\s*)>\s?/;
const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})\s*$/;

/** What the caret is in, for the toolbar's pressed buttons. */
export const activeFormats = (state: EditorState): ActiveFormats => {
	const head = state.selection.main.head;
	const line = state.doc.lineAt(head).text;
	const has = (name: string) => enclosingNode(state, head, name) !== null;
	const codeBlock = has('FencedCode');
	return {
		bold: has('StrongEmphasis'),
		italic: has('Emphasis'),
		strike: has('Strikethrough'),
		heading: codeBlock ? 0 : (HEADING_PREFIX_RE.exec(line)?.[2].length ?? 0),
		bulletList: !codeBlock && BULLET_RE.test(line),
		orderedList: !codeBlock && ORDERED_RE.test(line),
		blockquote: has('Blockquote'),
		codeBlock,
		table: has('Table'),
		link: has('Link')
	};
};

const trimRange = (state: EditorState, from: number, to: number): [number, number] => {
	const text = state.sliceDoc(from, to);
	const lead = text.length - text.trimStart().length;
	const trail = text.length - text.trimEnd().length;
	return lead === text.length ? [from, to] : [from + lead, to - trail];
};

/** Wrap the selection in `marker`, or unwrap the formatting around it. */
export const toggleInlineMark = (view: EditorView, marker: InlineMarker): boolean => {
	const { state } = view;
	const nodeName = NODE_FOR_MARKER[marker];
	const tr = state.changeByRange((range) => {
		const node = enclosingNode(state, range.from, nodeName);
		if (node && node.to >= range.to) {
			const marks = node.getChildren(MARK_FOR_NODE[nodeName]);
			if (marks.length >= 2) {
				const open = marks[0];
				const close = marks[marks.length - 1];
				const changes = state.changes([
					{ from: open.from, to: open.to },
					{ from: close.from, to: close.to }
				]);
				return { changes, range: range.map(changes) };
			}
		}
		if (range.empty) {
			return {
				changes: { from: range.from, insert: `${marker}${marker}` },
				range: EditorSelection.cursor(range.from + marker.length)
			};
		}
		const [from, to] = trimRange(state, range.from, range.to);
		return {
			changes: [
				{ from, insert: marker },
				{ from: to, insert: marker }
			],
			range: EditorSelection.range(from + marker.length, to + marker.length)
		};
	});
	view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
	view.focus();
	return true;
};

/** Every line a selection range touches, once each, in order. */
const selectedLines = (state: EditorState): Line[] => {
	const seen = new Map<number, Line>();
	for (const range of state.selection.ranges) {
		const last = state.doc.lineAt(range.to).number;
		for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
			if (!seen.has(n)) seen.set(n, state.doc.line(n));
		}
	}
	return [...seen.values()].sort((a, b) => a.number - b.number);
};

/** Make the selected lines headings of `level`, or plain lines when they already are. */
export const toggleHeading = (view: EditorView, level: number): boolean => {
	const changes = selectedLines(view.state).map((line) => {
		const prefix = `${'#'.repeat(level)} `;
		const m = HEADING_PREFIX_RE.exec(line.text);
		if (!m) return { from: line.from, insert: prefix };
		const from = line.from + m[1].length;
		const to = line.from + m[0].length;
		return { from, to, insert: m[2].length === level ? '' : prefix };
	});
	view.dispatch({ changes, scrollIntoView: true, userEvent: 'input.format' });
	view.focus();
	return true;
};

export type LinePrefix = 'bullet' | 'ordered' | 'quote';

/** Turn the selected lines into a list or a quote, or back into plain lines. */
export const toggleLinePrefix = (view: EditorView, kind: LinePrefix): boolean => {
	const { state } = view;
	let lines = selectedLines(state);
	if (lines.length > 1) lines = lines.filter((line) => line.text.trim() !== '');
	if (lines.length === 0) return false;
	const own = kind === 'quote' ? QUOTE_RE : kind === 'bullet' ? BULLET_RE : ORDERED_RE;
	const allHave = lines.every((line) => own.test(line.text));

	const changes = lines.map((line, i) => {
		const ownMatch = own.exec(line.text);
		if (allHave && ownMatch) {
			return { from: line.from + ownMatch[1].length, to: line.from + ownMatch[0].length };
		}
		if (ownMatch) return { from: line.from };
		if (kind === 'quote') return { from: line.from, insert: '> ' };
		const marker = kind === 'bullet' ? '- ' : `${i + 1}. `;
		// A bullet becomes a number and back, in place.
		const other = (kind === 'bullet' ? ORDERED_RE : BULLET_RE).exec(line.text);
		if (other) {
			return {
				from: line.from + other[1].length,
				to: line.from + other[0].length,
				insert: marker
			};
		}
		const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
		return { from: line.from + indent, insert: marker };
	});
	view.dispatch({ changes, scrollIntoView: true, userEvent: 'input.format' });
	view.focus();
	return true;
};

/** Fence the selected lines as a code block, or remove the fences of the block around the caret. */
export const toggleCodeBlock = (view: EditorView): boolean => {
	const { state } = view;
	const { doc } = state;
	const sel = state.selection.main;
	const block = enclosingNode(state, sel.head, 'FencedCode');
	if (block) {
		const first = doc.lineAt(block.from);
		const last = doc.lineAt(Math.max(block.from, block.to - 1));
		const changes = [{ from: first.from, to: Math.min(first.to + 1, doc.length) }];
		if (last.number > first.number && FENCE_LINE_RE.test(last.text)) {
			changes.push({ from: Math.max(last.from - 1, first.to + 1), to: last.to });
		}
		view.dispatch({ changes, userEvent: 'input.format' });
		view.focus();
		return true;
	}
	const startLine = doc.lineAt(sel.from);
	const endLine = doc.lineAt(sel.to);
	if (sel.empty && startLine.text.trim() === '') {
		view.dispatch({
			changes: { from: startLine.from, to: startLine.to, insert: '```\n\n```' },
			selection: EditorSelection.cursor(startLine.from + 4),
			userEvent: 'input.format'
		});
	} else {
		view.dispatch({
			changes: [
				{ from: startLine.from, insert: '```\n' },
				{ from: endLine.to, insert: '\n```' }
			],
			userEvent: 'input.format'
		});
	}
	view.focus();
	return true;
};

/**
 * Remove the link around the caret, keeping its text; otherwise link the
 * selection to the URL `askUrl` returns.
 */
export const toggleLink = (view: EditorView, askUrl: () => string | null): boolean => {
	const { state } = view;
	const sel = state.selection.main;
	const link = enclosingNode(state, sel.head, 'Link');
	if (link) {
		const marks = link.getChildren('LinkMark');
		if (marks.length >= 2) {
			const text = state.sliceDoc(marks[0].to, marks[1].from);
			view.dispatch({
				changes: { from: link.from, to: link.to, insert: text },
				selection: EditorSelection.range(link.from, link.from + text.length),
				userEvent: 'input.format'
			});
			view.focus();
			return true;
		}
	}
	const url = askUrl()?.trim();
	if (!url) return false;
	const target = /[\s()]/.test(url) ? `<${url}>` : url;
	const text = state.sliceDoc(sel.from, sel.to) || url;
	const insert = `[${text}](${target})`;
	view.dispatch({
		changes: { from: sel.from, to: sel.to, insert },
		selection: EditorSelection.range(sel.from + 1, sel.from + 1 + text.length),
		userEvent: 'input.format'
	});
	view.focus();
	return true;
};

/** Insert `text` at the caret, replacing the selection. */
export const insertAtCaret = (view: EditorView, text: string): void => {
	const { from, to } = view.state.selection.main;
	view.dispatch({
		changes: { from, to, insert: text },
		selection: EditorSelection.cursor(from + text.length),
		scrollIntoView: true,
		userEvent: 'input'
	});
	view.focus();
};

/** Insert a blank table as a block of its own, the caret in its first header cell. */
export const insertTable = (view: EditorView): boolean => {
	const { state } = view;
	const line = state.doc.lineAt(state.selection.main.head);
	const table = blankTable().join('\n');
	const blankLine = line.text.trim() === '';
	const at = blankLine ? line.from : line.to;
	const before = blankLine ? '' : '\n\n';
	const after = at < state.doc.length ? '\n' : '';
	view.dispatch({
		changes: { from: at, to: blankLine ? line.to : at, insert: `${before}${table}${after}` },
		selection: EditorSelection.cursor(at + before.length + 2),
		scrollIntoView: true,
		userEvent: 'input'
	});
	view.focus();
	return true;
};

const tableAround = (state: EditorState) => {
	const node = enclosingNode(state, state.selection.main.head, 'Table');
	if (!node) return null;
	const first = state.doc.lineAt(node.from);
	const last = state.doc.lineAt(Math.max(node.from, node.to - 1));
	const lines: string[] = [];
	for (let n = first.number; n <= last.number; n++) lines.push(state.doc.line(n).text);
	return { first, last, lines };
};

/** Replace `old` by `next` at `from` with the smallest change, so a peer's edits elsewhere in it survive. */
const minimalChange = (from: number, old: string, next: string) => {
	let prefix = 0;
	const max = Math.min(old.length, next.length);
	while (prefix < max && old[prefix] === next[prefix]) prefix++;
	let suffix = 0;
	while (suffix < max - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) {
		suffix++;
	}
	return {
		from: from + prefix,
		to: from + old.length - suffix,
		insert: next.slice(prefix, next.length - suffix)
	};
};

/** Add or remove a row or a column of the table around the caret. */
export const runTableOp = (view: EditorView, op: TableOp): boolean => {
	const { state } = view;
	const table = tableAround(state);
	if (!table) return false;
	const head = state.selection.main.head;
	const caretLine = state.doc.lineAt(head);
	const row = caretLine.number - table.first.number;
	const column = tableColumnAt(caretLine.text, head - caretLine.from);
	const result = applyTableOp(table.lines, row, column, op);
	if (result === null) return false;
	if (result.length === 0) return deleteTable(view);

	const old = table.lines.join('\n');
	const next = result.join('\n');
	const change = minimalChange(table.first.from, old, next);
	let selection: { anchor: number } | undefined;
	if (op === 'addRowAfter') {
		// The new row is the one line of `result` the table did not have.
		const newRow = result.findIndex(
			(line, i) => line !== table.lines[i] && line.replace(/[|\s]/g, '') === ''
		);
		const offset = result
			.slice(0, Math.max(newRow, 0))
			.reduce((sum, line) => sum + line.length + 1, 0);
		selection = { anchor: table.first.from + offset + 2 };
	}
	view.dispatch({
		changes: change,
		...(selection ? { selection } : {}),
		scrollIntoView: true,
		userEvent: 'input.table'
	});
	view.focus();
	return true;
};

/** Remove the table around the caret, with the line break that ends it. */
export const deleteTable = (view: EditorView): boolean => {
	const { state } = view;
	const table = tableAround(state);
	if (!table) return false;
	const to = Math.min(table.last.to + 1, state.doc.length);
	view.dispatch({
		changes: { from: table.first.from, to },
		userEvent: 'delete.table'
	});
	view.focus();
	return true;
};
