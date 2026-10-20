/**
 * Look of the markdown source editor: sized headings, boxed code blocks,
 * quotes with a rule, chips and images in line, all in the app's colours.
 * The live preview (`./markdown-live-preview`) adds the `cm-md-*` classes
 * styled here.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const MONO =
	'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const theme = EditorView.theme({
	'&': {
		backgroundColor: 'transparent',
		color: 'hsl(var(--foreground))',
		fontSize: '0.875rem'
	},
	'&.cm-focused': { outline: 'none' },
	'.cm-scroller': {
		fontFamily: 'inherit',
		lineHeight: '1.5'
	},
	'.cm-content': {
		minHeight: '5rem',
		padding: '0.375rem 0.75rem',
		caretColor: 'hsl(var(--foreground))'
	},
	'.cm-line': { padding: '0' },
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'hsl(var(--primary) / 0.2) !important'
	},
	'.cm-placeholder': { color: 'hsl(var(--muted-foreground) / 0.6)' },

	'.cm-md-heading': { fontWeight: '600' },
	'.cm-md-h1': { fontSize: '1.125rem', paddingTop: '0.5rem !important' },
	'.cm-md-h2': { fontSize: '1rem', paddingTop: '0.375rem !important' },
	'.cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6': { fontSize: '0.875rem' },

	'.cm-md-codeblock': {
		fontFamily: MONO,
		fontSize: '0.75rem',
		backgroundColor: 'hsl(var(--muted) / 0.6)',
		padding: '0 0.75rem !important'
	},
	'.cm-md-codeblock-first': {
		borderTopLeftRadius: '0.375rem',
		borderTopRightRadius: '0.375rem',
		paddingTop: '0.25rem !important'
	},
	'.cm-md-codeblock-last': {
		borderBottomLeftRadius: '0.375rem',
		borderBottomRightRadius: '0.375rem',
		paddingBottom: '0.25rem !important'
	},
	'.cm-md-inline-code': {
		fontFamily: MONO,
		fontSize: '0.75rem',
		backgroundColor: 'hsl(var(--muted) / 0.8)',
		borderRadius: '0.25rem',
		padding: '0.05rem 0.2rem'
	},
	'.cm-md-quote': {
		borderLeft: '3px solid hsl(var(--border))',
		paddingLeft: '0.75rem !important',
		color: 'hsl(var(--muted-foreground))'
	},
	'.cm-md-table': { fontFamily: MONO, fontSize: '0.75rem' },
	'.cm-md-link-text': {
		color: '#3b82f6',
		textDecoration: 'underline',
		cursor: 'text'
	},

	'.cm-md-image': {
		position: 'relative',
		display: 'inline-block',
		maxWidth: '100%',
		verticalAlign: 'bottom'
	},
	'.cm-md-image img': {
		maxWidth: '100%',
		height: 'auto',
		borderRadius: '0.375rem'
	},
	'.cm-md-image-handle': {
		position: 'absolute',
		right: '2px',
		bottom: '2px',
		width: '10px',
		height: '10px',
		borderRadius: '2px',
		backgroundColor: 'hsl(var(--primary))',
		cursor: 'nwse-resize',
		opacity: '0',
		transition: 'opacity 100ms ease'
	},
	'.cm-md-image:hover .cm-md-image-handle': { opacity: '1' },

	'.cm-tooltip': {
		backgroundColor: 'hsl(var(--popover))',
		color: 'hsl(var(--popover-foreground))',
		border: '1px solid hsl(var(--border))',
		borderRadius: '0.375rem',
		boxShadow: '0 4px 12px hsl(var(--foreground) / 0.1)'
	},
	'.cm-tooltip.cm-tooltip-autocomplete > ul': {
		fontFamily: 'inherit',
		fontSize: '0.8125rem',
		maxHeight: '16rem',
		minWidth: '16rem',
		padding: '0.25rem'
	},
	'.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.25rem 0.5rem',
		borderRadius: '0.25rem'
	},
	'.cm-tooltip-autocomplete ul li[aria-selected]': {
		backgroundColor: 'hsl(var(--accent))',
		color: 'hsl(var(--accent-foreground))'
	},
	'.cm-completionDetail': {
		marginLeft: 'auto',
		fontStyle: 'normal',
		fontSize: '0.75rem',
		color: 'hsl(var(--muted-foreground))'
	},
	'.cm-md-mention-badge': {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '1.25rem',
		height: '1.25rem',
		flexShrink: '0',
		borderRadius: '9999px'
	}
});

/** Token colours, shared with the rendered views (`./highlight-code-blocks`). */
export const codeHighlightStyle = HighlightStyle.define([
	{ tag: t.strong, fontWeight: '600' },
	{ tag: t.emphasis, fontStyle: 'italic' },
	{ tag: t.strikethrough, textDecoration: 'line-through' },
	{ tag: t.heading, fontWeight: '600' },
	{ tag: [t.url, t.link], color: '#3b82f6' },
	{ tag: t.processingInstruction, color: 'hsl(var(--muted-foreground))' },
	{ tag: t.quote, color: 'hsl(var(--muted-foreground))' },
	{ tag: t.contentSeparator, color: 'hsl(var(--muted-foreground))' },
	// Code inside fenced blocks, coloured by the block's language.
	{ tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#a855f7' },
	{ tag: [t.string, t.special(t.string), t.regexp], color: '#16a34a' },
	{ tag: [t.number, t.bool, t.null, t.atom], color: '#ea580c' },
	{ tag: [t.comment, t.meta], color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
	{ tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#2563eb' },
	{ tag: [t.typeName, t.className, t.tagName], color: '#0891b2' },
	{ tag: [t.attributeName, t.propertyName], color: '#b45309' },
	{ tag: t.invalid, color: '#dc2626' }
]);

export const markdownTheme = () => [theme, syntaxHighlighting(codeHighlightStyle)];
