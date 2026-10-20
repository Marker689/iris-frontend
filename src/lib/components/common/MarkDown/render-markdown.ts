/**
 * Markdown → sanitized HTML for analyst content: the view mode of
 * `MarkDownEditor` and `MarkDownPreview`. AI output goes through the
 * strict profile of `./untrusted-markdown` instead.
 *
 * Showdown writes `target="_blank"` on every link, but DOMPurify drops
 * `target` — links then replaced the IRIS page. Put back after
 * sanitizing, with `rel` so the opened page gets no `window.opener`.
 * In-page `#anchors` stay in the tab.
 */
import DOMPurify from 'dompurify';
import { converter } from './converter';
import { normalizeLegacyContent } from './legacy-content';

const NEW_TAB_REL = 'noopener noreferrer';

function openLinksInNewTab(root: ParentNode): void {
	for (const a of Array.from(root.querySelectorAll('a[href]'))) {
		if ((a.getAttribute('href') ?? '').trim().startsWith('#')) continue;
		a.setAttribute('target', '_blank');
		a.setAttribute('rel', NEW_TAB_REL);
	}
}

export function renderMarkdown(markdown: string | null | undefined): string {
	const html = converter.makeHtml(normalizeLegacyContent(markdown ?? ''));
	if (!DOMPurify.isSupported) return DOMPurify.sanitize(html);
	const body = DOMPurify.sanitize(html, { RETURN_DOM: true }) as HTMLElement;
	openLinksInNewTab(body);
	return body.innerHTML;
}
