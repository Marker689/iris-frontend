/**
 * The stored form of a mention chip — raw HTML inside the markdown:
 *
 *   <span data-mention data-kind="user" data-id="42" data-label="John Doe">@John Doe</span>
 *
 * `buildMentionSpan` writes it exactly like `build_mention_span` in
 * iris-backend (`iris_engine/collab/mentions.py`): kind, id and label
 * escaped, the trigger char in the body. `findMentionSpans` reads it back,
 * including the longer shape TipTap used to store for chips authored
 * outside collab (classes, role, an inline `<svg>` and a label `<span>` in
 * the body), so the editor shows both as one chip.
 */

import { isMentionKind, mentionTriggerChar, type MentionKind } from './mention-kinds';

export type MentionSpan = {
	from: number;
	to: number;
	kind: MentionKind;
	id: string;
	label: string;
};

const escapeHtml = (text: string): string =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');

const unescapeHtml = (text: string): string =>
	text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (match, hex, dec, named) => {
		if (hex) return String.fromCodePoint(parseInt(hex, 16));
		if (dec) return String.fromCodePoint(parseInt(dec, 10));
		const names: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
		return names[named.toLowerCase()] ?? match;
	});

export const buildMentionSpan = (kind: string, id: string | number, label: string): string => {
	const safeKind: MentionKind = isMentionKind(kind) ? kind : 'user';
	const safeLabel = escapeHtml(String(label));
	const safeId = escapeHtml(String(id));
	const char = mentionTriggerChar(safeKind);
	return `<span data-mention data-kind="${safeKind}" data-id="${safeId}" data-label="${safeLabel}">${char}${safeLabel}</span>`;
};

const OPEN_RE = /<span\b(?=[^>]*\bdata-mention\b)[^>\n]*>/gi;
const SPAN_TAG_RE = /<(\/?)span\b[^>\n]*>/gi;
const ATTR_RE = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
// A chip is a short inline run; past this the markup is something else.
const MAX_CHIP_LENGTH = 2000;

/** The attributes of one opening tag, unescaped, names lowercased. */
export const readTagAttributes = (tag: string): Record<string, string> => {
	const attrs: Record<string, string> = {};
	const inner = tag.replace(/^<[\w-]+/, '').replace(/\/?>$/, '');
	for (const [, name, dq, sq, bare] of inner.matchAll(ATTR_RE)) {
		attrs[name.toLowerCase()] = unescapeHtml(dq ?? sq ?? bare ?? '');
	}
	return attrs;
};

/** The text of the chip body, for chips written before `data-label`. */
const bodyLabel = (body: string): string =>
	unescapeHtml(body.replace(/<[^>]*>/g, ''))
		.trim()
		.replace(/^[@#!&%]/, '');

/** Every chip in `text`, in order. Chips never span lines. */
export const findMentionSpans = (text: string, offset = 0): MentionSpan[] => {
	const found: MentionSpan[] = [];
	OPEN_RE.lastIndex = 0;
	let open: RegExpExecArray | null;
	while ((open = OPEN_RE.exec(text))) {
		const start = open.index;
		SPAN_TAG_RE.lastIndex = start;
		let depth = 0;
		let end = -1;
		let tag: RegExpExecArray | null;
		while ((tag = SPAN_TAG_RE.exec(text))) {
			if (tag.index - start > MAX_CHIP_LENGTH) break;
			if (text.slice(start, tag.index).includes('\n')) break;
			depth += tag[1] ? -1 : 1;
			if (depth === 0) {
				end = tag.index + tag[0].length;
				break;
			}
		}
		if (end < 0) continue;
		const attrs = readTagAttributes(open[0]);
		const kindAttr = attrs['data-kind'];
		const kind: MentionKind = isMentionKind(kindAttr) ? kindAttr : 'user';
		const label = attrs['data-label'] ?? bodyLabel(text.slice(start + open[0].length, end));
		found.push({ from: offset + start, to: offset + end, kind, id: attrs['data-id'] ?? '', label });
		OPEN_RE.lastIndex = end;
	}
	return found;
};
