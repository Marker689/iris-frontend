import Showdown from 'showdown';

// Fences may sit in a list (the previous editor, TipTap, indented them past
// 3 spaces) or a quote.
const FENCE_RE = /^\s*(?:>\s?)*\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s*(?:>\s?)*\s*(`{3,}|~{3,})\s*$/;
const QUOTE_RE = /^\s*(?:>\s?)+/;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s/;
const INDENTED_RE = /^(?: {4}|\t)/;
const TABLE_DELIMITER_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;

/**
 * Render the hard breaks the previous editor (TipTap) wrote — a backslash
 * ending a line (`"line one\\\nline two"`), valid CommonMark that showdown
 * doesn't know — as `<br>`, joining the two lines.
 *
 * Joining rather than leaving a bare newline for `simpleLineBreaks`:
 * showdown applies `simpleLineBreaks` neither inside `*…*` / `**…**`
 * (an italic line break would be lost) nor to a newline right after
 * one it just produced (an empty line — two breaks in a row — would
 * show a literal `\`).
 *
 * In a quote the next line's `>` markers go with the joined newline
 * (`"> a\\\n> b"`).
 *
 * Left alone: an escaped backslash (`\\` ending the line — the user
 * wants a literal `\`), a backslash ending a paragraph (literal in
 * CommonMark too), and code — fenced (`ls \` continuations) or indented.
 */
export function renderHardBreaks(text: string): string {
	const lines = text.split('\n');
	let fence: string | null = null;
	let inList = false;
	let inIndentedCode = false;
	let previousBlank = true;
	// Whether the line being built (lines joined so far) is quoted.
	let quoted = false;
	let joining = false;
	let out = '';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const isLast = i === lines.length - 1;
		const keep = () => {
			out += isLast ? line : `${line}\n`;
			joining = false;
		};
		const blank = line.trim() === '';
		if (!joining) quoted = QUOTE_RE.test(line);

		if (fence !== null) {
			const closer = FENCE_CLOSE_RE.exec(line)?.[1];
			if (closer && closer[0] === fence[0] && closer.length >= fence.length) fence = null;
			keep();
			previousBlank = blank;
			continue;
		}
		// Indented code can't interrupt a paragraph, and in a list an
		// indented line is the item's content.
		if (!blank && !joining) {
			if (LIST_ITEM_RE.test(line)) inList = true;
			else if (!INDENTED_RE.test(line) && !/^\s/.test(line)) inList = false;
			inIndentedCode = !inList && INDENTED_RE.test(line) && (previousBlank || inIndentedCode);
		}
		previousBlank = blank;
		const opener = joining ? null : (FENCE_RE.exec(line)?.[1] ?? null);
		if (opener) {
			fence = opener;
			keep();
			continue;
		}
		if (inIndentedCode) {
			keep();
			continue;
		}

		let next = isLast ? null : lines[i + 1];
		if (next !== null && quoted) next = next.replace(QUOTE_RE, '');
		const backslashes = line.length - line.replace(/\\+$/, '').length;
		const isHardBreak =
			backslashes % 2 === 1 && next !== null && next.trim() !== '' && !FENCE_RE.test(next);
		if (isHardBreak && TABLE_DELIMITER_RE.test(next as string)) {
			// A header row: a `<br>` would hide the table, just drop the `\`.
			out += `${line.slice(0, -1)}\n`;
			joining = false;
		} else if (isHardBreak) {
			out += `${line.slice(0, -1)}<br>`;
			lines[i + 1] = next as string;
			joining = true;
		} else keep();
	}
	return out;
}

export const converter = new Showdown.Converter({
	tables: true,
	strikethrough: true,
	tasklists: true,
	simplifiedAutoLink: true,
	openLinksInNewWindow: true,
	parseImgDimensions: true,
	// Single newlines inside a paragraph become `<br>` rather than being
	// collapsed to a space. Analyst content (scanner exports, host lists,
	// `key: value` blocks) relies on every typed newline being kept.
	simpleLineBreaks: true,
	extensions: [{ type: 'lang', filter: renderHardBreaks }]
});
