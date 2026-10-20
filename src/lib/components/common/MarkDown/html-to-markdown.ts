/**
 * Clipboard HTML → markdown, for pastes into the markdown source editor.
 *
 * Only HTML that carries structure is converted (`hasStructuredHtml`):
 * a paste from a code editor or a terminal comes as styled `<div>` /
 * `<span>` soup whose `text/plain` is what the user wants, while a paste
 * from a web page or from an IRIS preview loses its headings, lists,
 * tables and links if only the text is kept.
 *
 * Mention chips are written back in their stored form whatever the shape
 * they were copied in (a decorated preview chip carries an icon and
 * classes), so they become chips again in the editor.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { buildMentionSpan } from './mention-markup';

const STRUCTURE_SELECTOR =
	'h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, pre, strong, b, em, i, a[href], img[src], span[data-mention]';

let service: TurndownService | null = null;

const turndown = (): TurndownService => {
	if (service) return service;
	service = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
		emDelimiter: '*',
		strongDelimiter: '**',
		hr: '---'
	});
	service.use(gfm);
	service.addRule('mention', {
		filter: (node) => node.nodeName === 'SPAN' && node.hasAttribute('data-mention'),
		replacement: (_content, node) => {
			const el = node as HTMLElement;
			const label =
				el.getAttribute('data-label') ?? (el.textContent ?? '').trim().replace(/^[@#!&%]/, '');
			return buildMentionSpan(
				el.getAttribute('data-kind') ?? 'user',
				el.getAttribute('data-id') ?? '',
				label
			);
		}
	});
	// Resized images keep their width, which `![]()` cannot carry.
	service.addRule('sizedImage', {
		filter: (node) => node.nodeName === 'IMG' && node.hasAttribute('width'),
		replacement: (_content, node) => {
			const el = node as HTMLImageElement;
			return imageHtml(
				el.getAttribute('src') ?? '',
				el.getAttribute('alt') ?? '',
				el.getAttribute('width')
			);
		}
	});
	return service;
};

const escapeAttribute = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `<img>` markup for an image with a width. */
export const imageHtml = (src: string, alt: string, width: string | number | null): string => {
	const widthAttr = width ? ` width="${escapeAttribute(String(width))}"` : '';
	return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${widthAttr}>`;
};

const parse = (html: string): HTMLElement => {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return doc.body;
};

export const hasStructuredHtml = (html: string): boolean => {
	if (!html) return false;
	return parse(html).querySelector(STRUCTURE_SELECTOR) !== null;
};

export const htmlToMarkdown = (html: string): string => {
	const body = parse(html);
	// Office and browsers wrap the fragment in comments and `<meta>`.
	body.querySelectorAll('meta, style, script, title').forEach((el) => el.remove());
	return turndown().turndown(body).trim();
};
