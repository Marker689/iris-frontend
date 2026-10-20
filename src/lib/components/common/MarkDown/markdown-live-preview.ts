/**
 * Live preview for the markdown source editor (CodeMirror 6).
 *
 * The document is the markdown itself; this extension only changes how
 * it is drawn. Away from the caret, the syntax that formats text is
 * hidden — the `#` of a heading, the `**` around bold, the `[` `](url)`
 * of a link, the `\` of an escape — and comes back as soon as the caret or the selection
 * touches the construct, so it is edited as plain text. Headings are
 * sized, code blocks, quotes and tables get their own lines.
 *
 * Two things are always drawn as widgets, wherever the caret is:
 *
 *  - mention chips, the `<span data-mention …>` markup, as the same chip
 *    the preview shows. They are atomic: the caret steps over a chip and
 *    one Backspace removes it whole.
 *  - images, once the caret is off them, with a corner handle that
 *    resizes the image by rewriting it as `<img … width="N">`.
 *
 * Nothing inside code (a fenced or indented block, an inline code span)
 * is ever turned into a widget.
 */

import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';
import { authenticateDatastoreImages } from './authenticate-datastore-images';
import { decorateMentionChips } from './decorate-mention-chips';
import { imageHtml } from './html-to-markdown';
import { mentionTriggerChar, type MentionKind } from './mention-kinds';
import { findMentionSpans, readTagAttributes } from './mention-markup';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText']);
// Nodes whose first character is already code: an indented block starts
// after its indent, the text of a fenced block on its first content line.
// The others start on a fence or a backtick.
const CODE_FROM_START = new Set(['CodeBlock', 'CodeText']);

/** Whether `pos` is inside code, where markup is text. */
export const isInCode = (state: EditorState, pos: number): boolean => {
	const tree = syntaxTree(state);
	for (const side of [-1, 1] as const) {
		for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
			if (!CODE_NODES.has(node.name) || pos >= node.to) continue;
			if (node.from < pos || (node.from === pos && CODE_FROM_START.has(node.name))) return true;
		}
	}
	return false;
};

/** The innermost node named `name` around `pos`, if any. */
export const enclosingNode = (state: EditorState, pos: number, name: string): SyntaxNode | null => {
	const tree = syntaxTree(state);
	for (const side of [-1, 1] as const) {
		for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
			if (node.name === name) return node;
		}
	}
	return null;
};

// --- Widgets -------------------------------------------------------------

class MentionChipWidget extends WidgetType {
	constructor(
		readonly kind: MentionKind,
		readonly id: string,
		readonly label: string
	) {
		super();
	}

	eq(other: MentionChipWidget) {
		return other.kind === this.kind && other.id === this.id && other.label === this.label;
	}

	toDOM() {
		// Built bare and handed to the preview sweep, so a chip in the editor
		// is the chip the preview shows, and the editor's hover handlers —
		// which key off `.mention-chip` — find it.
		const holder = document.createElement('span');
		const chip = document.createElement('span');
		chip.setAttribute('data-mention', '');
		chip.setAttribute('data-kind', this.kind);
		chip.setAttribute('data-id', this.id);
		chip.setAttribute('data-label', this.label);
		chip.textContent = `${mentionTriggerChar(this.kind)}${this.label}`;
		holder.appendChild(chip);
		decorateMentionChips(holder);
		// Focusable chips would take the caret out of the editor.
		chip.removeAttribute('tabindex');
		return chip;
	}
}

const IMAGE_SOURCE_RE = /^(?:!\[[^\]\n]*\]\([^)\n]*\)|<img\b[^>\n]*>)/i;
const imageDisposers = new WeakMap<HTMLElement, () => void>();

const cssWidth = (width: string): string => (/^\d+$/.test(width) ? `${width}px` : width);

class ImageWidget extends WidgetType {
	constructor(
		readonly src: string,
		readonly alt: string,
		readonly width: string | null
	) {
		super();
	}

	eq(other: ImageWidget) {
		return other.src === this.src && other.alt === this.alt && other.width === this.width;
	}

	toDOM(view: EditorView) {
		const wrapper = document.createElement('span');
		wrapper.className = 'cm-md-image';

		const img = document.createElement('img');
		img.setAttribute('src', this.src);
		img.alt = this.alt;
		if (this.width) img.style.width = cssWidth(this.width);
		wrapper.appendChild(img);

		const handle = document.createElement('span');
		handle.className = 'cm-md-image-handle';
		handle.title = 'Drag to resize';
		wrapper.appendChild(handle);

		handle.addEventListener('mousedown', (event) => {
			if (view.state.readOnly) return;
			event.preventDefault();
			event.stopPropagation();
			const startX = event.clientX;
			const startWidth = img.getBoundingClientRect().width;
			const onMove = (e: MouseEvent) => {
				img.style.width = `${Math.max(32, Math.round(startWidth + e.clientX - startX))}px`;
			};
			const onUp = () => {
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
				this.commitWidth(view, wrapper, Math.round(img.getBoundingClientRect().width));
			};
			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
		});

		imageDisposers.set(wrapper, authenticateDatastoreImages(wrapper, { links: false }));
		return wrapper;
	}

	/** Rewrite the image's source as `<img … width>`, the one form that keeps a size. */
	private commitWidth(view: EditorView, wrapper: HTMLElement, width: number) {
		let from: number;
		try {
			from = view.posAtDOM(wrapper);
		} catch {
			return;
		}
		const line = view.state.doc.lineAt(from);
		const source = IMAGE_SOURCE_RE.exec(line.text.slice(from - line.from));
		if (!source) return;
		view.dispatch({
			changes: { from, to: from + source[0].length, insert: imageHtml(this.src, this.alt, width) },
			userEvent: 'input.resize'
		});
	}

	destroy(dom: HTMLElement) {
		imageDisposers.get(dom)?.();
		imageDisposers.delete(dom);
	}

	ignoreEvent() {
		return true;
	}
}

// --- Decorations ----------------------------------------------------------

const hidden = Decoration.replace({});
const linkText = Decoration.mark({ class: 'cm-md-link-text' });
const inlineCode = Decoration.mark({ class: 'cm-md-inline-code' });

const lineClass = (cls: string) => Decoration.line({ class: cls });

const HTML_IMG_RE = /<img\b[^>\n]*>/gi;
const HEADING_RE = /^ATXHeading(\d)$/;
const SETEXT_RE = /^SetextHeading(\d)$/;
const INLINE_MARKS: Record<string, string> = {
	StrongEmphasis: 'EmphasisMark',
	Emphasis: 'EmphasisMark',
	Strikethrough: 'StrikethroughMark',
	InlineCode: 'CodeMark'
};

type Built = { decorations: DecorationSet; atomic: DecorationSet };

const build = (view: EditorView): Built => {
	const { state } = view;
	const doc = state.doc;
	const tree = syntaxTree(state);
	// Unfocused, the whole note reads as rendered.
	const ranges = view.hasFocus ? state.selection.ranges : [];
	const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);
	const touchesLines = (from: number, to: number) =>
		touches(doc.lineAt(from).from, doc.lineAt(to).to);

	const decorations: Range<Decoration>[] = [];
	const atomic: Range<Decoration>[] = [];
	// Chips and images: nothing else may replace text inside them.
	const widgets: Array<[number, number]> = [];
	const overlapsWidget = (from: number, to: number) =>
		widgets.some(([wFrom, wTo]) => from < wTo && to > wFrom);
	const hide = (from: number, to: number) => {
		if (from < to && !overlapsWidget(from, to)) decorations.push(hidden.range(from, to));
	};
	const eachLine = (
		from: number,
		to: number,
		cls: (n: number, first: number, last: number) => string
	) => {
		const first = doc.lineAt(from).number;
		const last = doc.lineAt(Math.max(from, to - 1)).number;
		for (let n = first; n <= last; n++) {
			decorations.push(lineClass(cls(n, first, last)).range(doc.line(n).from));
		}
	};

	for (const { from, to } of view.visibleRanges) {
		const text = doc.sliceString(from, to);

		for (const chip of findMentionSpans(text, from)) {
			if (isInCode(state, chip.from)) continue;
			const deco = Decoration.replace({
				widget: new MentionChipWidget(chip.kind, chip.id, chip.label)
			}).range(chip.from, chip.to);
			decorations.push(deco);
			atomic.push(deco);
			widgets.push([chip.from, chip.to]);
		}

		for (const match of text.matchAll(HTML_IMG_RE)) {
			const start = from + (match.index ?? 0);
			const end = start + match[0].length;
			if (isInCode(state, start) || touches(start, end)) continue;
			const attrs = readTagAttributes(match[0]);
			if (!attrs.src) continue;
			decorations.push(
				Decoration.replace({
					widget: new ImageWidget(attrs.src, attrs.alt ?? '', attrs.width ?? null)
				}).range(start, end)
			);
			widgets.push([start, end]);
		}

		tree.iterate({
			from,
			to,
			enter: (ref) => {
				const name = ref.name;
				const node = ref.node;

				const heading = HEADING_RE.exec(name) ?? SETEXT_RE.exec(name);
				if (heading) {
					const line = doc.lineAt(ref.from);
					decorations.push(
						lineClass(`cm-md-heading cm-md-h${Math.min(Number(heading[1]), 6)}`).range(line.from)
					);
					const mark = node.firstChild;
					if (
						HEADING_RE.test(name) &&
						mark?.name === 'HeaderMark' &&
						!touchesLines(ref.from, ref.to)
					) {
						let end = mark.to;
						while (end < line.to && doc.sliceString(end, end + 1) === ' ') end++;
						hide(mark.from, end);
					}
					return;
				}

				if (name in INLINE_MARKS) {
					if (name === 'InlineCode') decorations.push(inlineCode.range(ref.from, ref.to));
					if (!touches(ref.from, ref.to)) {
						for (const mark of node.getChildren(INLINE_MARKS[name])) hide(mark.from, mark.to);
					}
					return;
				}

				// `\_`, `\\`, … and the `\` hard break that ends a line: notes
				// written with the previous editor are full of them. The
				// backslash reads as the view mode renders it, i.e. not at all.
				if (name === 'Escape' || name === 'HardBreak') {
					if (doc.sliceString(ref.from, ref.from + 1) === '\\' && !touches(ref.from, ref.to)) {
						hide(ref.from, ref.from + 1);
					}
					return false;
				}

				if (name === 'Link') {
					const marks = node.getChildren('LinkMark');
					if (!node.getChild('URL') || marks.length < 2) return;
					if (marks[0].to < marks[1].from) {
						decorations.push(linkText.range(marks[0].to, marks[1].from));
					}
					if (!touches(ref.from, ref.to)) {
						hide(marks[0].from, marks[0].to);
						hide(marks[1].from, ref.to);
					}
					return;
				}

				if (name === 'Image') {
					const url = node.getChild('URL');
					const marks = node.getChildren('LinkMark');
					if (!url || marks.length < 2) return false;
					if (touches(ref.from, ref.to) || overlapsWidget(ref.from, ref.to)) return false;
					const deco = Decoration.replace({
						widget: new ImageWidget(
							doc.sliceString(url.from, url.to),
							doc.sliceString(marks[0].to, marks[1].from),
							null
						)
					}).range(ref.from, ref.to);
					decorations.push(deco);
					widgets.push([ref.from, ref.to]);
					return false;
				}

				if (name === 'FencedCode' || name === 'CodeBlock') {
					eachLine(ref.from, ref.to, (n, first, last) => {
						const edges = `${n === first ? ' cm-md-codeblock-first' : ''}${n === last ? ' cm-md-codeblock-last' : ''}`;
						return `cm-md-codeblock${edges}`;
					});
					return false;
				}

				if (name === 'Blockquote') {
					eachLine(ref.from, ref.to, () => 'cm-md-quote');
					return;
				}

				if (name === 'Table') {
					eachLine(ref.from, ref.to, () => 'cm-md-table');
					return false;
				}
			}
		});
	}

	return {
		decorations: Decoration.set(decorations, true),
		atomic: Decoration.set(atomic, true)
	};
};

const livePreviewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		atomic: DecorationSet;

		constructor(view: EditorView) {
			({ decorations: this.decorations, atomic: this.atomic } = build(view));
		}

		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.selectionSet ||
				update.focusChanged ||
				syntaxTree(update.state) !== syntaxTree(update.startState)
			) {
				({ decorations: this.decorations, atomic: this.atomic } = build(update.view));
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations }
);

/** The URL of the link or bare URL at `pos`. */
const linkUrlAt = (state: EditorState, pos: number): string | null => {
	const link = enclosingNode(state, pos, 'Link');
	const url = link?.getChild('URL') ?? enclosingNode(state, pos, 'URL');
	if (!url) return null;
	return state.doc.sliceString(url.from, url.to).replace(/^<|>$/g, '');
};

// The link is note text, written by anyone with access to the note: a
// `javascript:` or `data:` URL must not run when a reader follows it.
const OPENABLE_URL_RE = /^(?:https?:|mailto:|\/(?!\/))/i;

/** Whether a link's URL is safe to open. */
export const isOpenableUrl = (url: string): boolean => OPENABLE_URL_RE.test(url.trim());

/** Ctrl/Cmd-click opens a link; a plain click places the caret in it, to edit it. */
const openLinkOnModClick = EditorView.domEventHandlers({
	mousedown: (event, view) => {
		if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos === null) return false;
		const url = linkUrlAt(view.state, pos);
		if (!url || !isOpenableUrl(url)) return false;
		event.preventDefault();
		window.open(url, '_blank', 'noopener');
		return true;
	}
});

export const markdownLivePreview = () => [
	livePreviewPlugin,
	EditorView.atomicRanges.of((view) => view.plugin(livePreviewPlugin)?.atomic ?? Decoration.none),
	openLinkOnModClick
];
