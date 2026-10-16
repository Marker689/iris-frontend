import Showdown from 'showdown';

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Render the hard breaks TipTap writes — a backslash ending a line
 * (`"line one\\\nline two"`), valid CommonMark that showdown doesn't
 * know — as `<br>`, joining the two lines.
 *
 * Joining rather than leaving a bare newline for `simpleLineBreaks`:
 * showdown applies `simpleLineBreaks` neither inside `*…*` / `**…**`
 * (an italic line break would be lost) nor to a newline right after
 * one it just produced (an empty line — two breaks in a row — would
 * show a literal `\`).
 *
 * Left alone: an escaped backslash (`\\` ending the line — the user
 * wants a literal `\`), a backslash ending a paragraph (literal in
 * CommonMark too), and fenced code (`ls \` continuations).
 */
export function renderHardBreaks(text: string): string {
	const lines = text.split('\n');
	let fence: string | null = null;
	let out = '';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const isLast = i === lines.length - 1;
		const opener = FENCE_RE.exec(line)?.[1] ?? null;
		if (fence !== null) {
			if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null;
			out += isLast ? line : `${line}\n`;
			continue;
		}
		if (opener) {
			fence = opener;
			out += isLast ? line : `${line}\n`;
			continue;
		}
		const next = isLast ? null : lines[i + 1];
		const backslashes = line.length - line.replace(/\\+$/, '').length;
		const isHardBreak =
			backslashes % 2 === 1 && next !== null && next.trim() !== '' && !FENCE_RE.test(next);
		if (isHardBreak) out += `${line.slice(0, -1)}<br>`;
		else out += isLast ? line : `${line}\n`;
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
