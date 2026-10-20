/**
 * Syntax colours for the fenced code blocks of rendered markdown (the
 * editor's view mode, `MarkDownPreview`): showdown only emits
 * `<pre><code class="language-x">`. Same parsers and colours as the
 * editor (`./markdown-theme`), so a block reads the same in both.
 *
 * Text only: the code's `textContent` is re-tokenised into spans, so
 * nothing the sanitiser removed can come back.
 */

import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightCode } from '@lezer/highlight';
import { StyleModule } from 'style-mod';
import { codeHighlightStyle } from './markdown-theme';

const HIGHLIGHTED_ATTR = 'data-iris-highlighted';
const LANGUAGE_CLASS_PREFIX = 'language-';

const languageName = (code: HTMLElement): string | null => {
	for (const cls of code.classList) {
		if (cls.startsWith(LANGUAGE_CLASS_PREFIX)) return cls.slice(LANGUAGE_CLASS_PREFIX.length);
	}
	return null;
};

const highlighted = (source: string, support: LanguageSupport) => {
	const out = document.createDocumentFragment();
	highlightCode(
		source,
		support.language.parser.parse(source),
		codeHighlightStyle,
		(text, classes) => {
			if (!classes) {
				out.append(text);
				return;
			}
			const span = document.createElement('span');
			span.className = classes;
			span.textContent = text;
			out.append(span);
		},
		() => out.append('\n')
	);
	return out;
};

/** Colour the code blocks under `container` whose language is known. */
export const highlightCodeBlocks = (container: HTMLElement): void => {
	const blocks = container.querySelectorAll<HTMLElement>('pre > code');
	if (blocks.length === 0) return;
	// The editor mounts these rules itself; a page with no editor has none.
	if (codeHighlightStyle.module) StyleModule.mount(document, codeHighlightStyle.module);

	for (const code of blocks) {
		if (code.hasAttribute(HIGHLIGHTED_ATTR)) continue;
		const name = languageName(code);
		const description = name ? LanguageDescription.matchLanguageName(languages, name, true) : null;
		if (!description) continue;
		code.setAttribute(HIGHLIGHTED_ATTR, '');
		const source = code.textContent ?? '';
		description
			.load()
			.then((support) => {
				// Re-rendered meanwhile: that block is someone else's now.
				if (!code.isConnected || code.textContent !== source) return;
				code.replaceChildren(highlighted(source, support));
			})
			.catch(() => code.removeAttribute(HIGHLIGHTED_ATTR));
	}
};
