import type { AiSuggestion, AiSuggestionActionStatus } from '$lib/services/ai-suggestions.service';
import { aiSuggestionSnippet } from './ai-suggestion-format';

/**
 * What a suggestion would run, one entry per action: the actions of a
 * bundled suggestion, or its single `proposed_action` (id 0).
 */
export interface AiSuggestionAction {
	id: number;
	label: string;
	tool: string;
	arguments: Record<string, unknown>;
	status: AiSuggestionActionStatus;
	error: string | null;
	bundled: boolean;
}

/** One argument of an action, readable: `long` text is folded, `json` shown as code. */
export interface AiSuggestionActionField {
	key: string;
	label: string;
	kind: 'text' | 'long' | 'json' | 'empty';
	text: string;
	/** `long`: a one-line preview. */
	preview?: string;
}

const VERBS = new Set([
	'add',
	'assign',
	'close',
	'create',
	'delete',
	'escalate',
	'link',
	'merge',
	'remove',
	'reopen',
	'set',
	'unlink',
	'update',
	'upload'
]);

// Arguments that name the object an action acts on, and its kind
const TARGETS: Record<string, string> = {
	case_identifier: 'case',
	case_id: 'case',
	cid: 'case',
	alert_identifier: 'alert',
	alert_id: 'alert',
	war_room_id: 'war room',
	war_room_identifier: 'war room',
	cluster_id: 'alert cluster',
	alert_cluster_id: 'alert cluster',
	cluster_identifier: 'alert cluster',
	note_id: 'note',
	note_identifier: 'note',
	task_id: 'task',
	task_identifier: 'task',
	asset_id: 'asset',
	asset_identifier: 'asset',
	ioc_id: 'IOC',
	ioc_identifier: 'IOC',
	event_id: 'event',
	event_identifier: 'event',
	evidence_id: 'evidence',
	evidence_identifier: 'evidence'
};

// Objects whose fields are the action's own (`{payload: {note_title}}`)
const WRAPPERS = new Set(['payload', 'data', 'fields', 'updates']);

const LONG_TEXT = 100;

function singular(word: string): string {
	if (word.length <= 3 || word.endsWith('ss')) return word;
	if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** `iris_case_notes_create` → `Create case note`. */
export function aiSuggestionToolLabel(tool: string): string {
	const words = String(tool ?? '')
		.replace(/^iris_/, '')
		.split('_')
		.filter(Boolean);
	if (words.length === 0) return String(tool ?? '');
	const verbAt = words.findIndex((w) => VERBS.has(w));
	const objects = (verbAt < 0 ? words : words.filter((_, i) => i !== verbAt)).map(singular);
	const text = verbAt < 0 ? objects.join(' ') : `${words[verbAt]} ${objects.join(' ')}`;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The objects an action acts on, most specific first: `note #12`, `case #3537`. */
export function aiSuggestionActionTargets(args: Record<string, unknown>): string[] {
	const found: string[] = [];
	const scan = (obj: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(obj)) {
			const kind = TARGETS[key.toLowerCase()];
			if (kind && (typeof value === 'number' || typeof value === 'string') && value !== '') {
				found.push(`${kind} #${value}`);
			} else if (WRAPPERS.has(key) && isPlainObject(value)) {
				scan(value);
			}
		}
	};
	scan(isPlainObject(args) ? args : {});
	const unique = [...new Set(found)];
	// The container (case, alert, war room) last
	const containers = ['case #', 'alert #', 'war room #'];
	return [
		...unique.filter((t) => !containers.some((c) => t.startsWith(c))),
		...unique.filter((t) => containers.some((c) => t.startsWith(c)))
	];
}

/** `Update case #3537`, `Create case note on case #3537`. */
export function aiSuggestionActionTitle(tool: string, args: Record<string, unknown>): string {
	const label = aiSuggestionToolLabel(tool);
	const [target] = aiSuggestionActionTargets(args);
	if (!target) return label;
	const noun = target.slice(0, target.lastIndexOf(' #')).toLowerCase();
	return label.toLowerCase().endsWith(` ${noun}`)
		? `${label}${target.slice(target.lastIndexOf(' #'))}`
		: `${label} on ${target}`;
}

export function aiSuggestionActions(s: AiSuggestion): AiSuggestionAction[] {
	if (Array.isArray(s.proposed_actions) && s.proposed_actions.length > 0) {
		return s.proposed_actions.map((a) => ({
			id: a.id,
			label: a.label?.trim() || aiSuggestionActionTitle(a.tool, a.arguments ?? {}),
			tool: a.tool,
			arguments: a.arguments ?? {},
			status: a.status ?? 'pending',
			error: a.error ?? null,
			bundled: true
		}));
	}
	if (s.proposed_action?.tool) {
		const args = s.proposed_action.arguments ?? {};
		return [
			{
				id: 0,
				label: aiSuggestionActionTitle(s.proposed_action.tool, args),
				tool: s.proposed_action.tool,
				arguments: args,
				status: s.status === 'accepted' ? 'done' : 'pending',
				error: null,
				bundled: false
			}
		];
	}
	return [];
}

/** `case_description` → `Case description`, `severity_id` → `Severity (id)`. */
export function aiSuggestionFieldLabel(key: string): string {
	const id = /_ids?$/.test(key) && key !== 'id';
	const text = key
		.replace(/_ids?$/, '')
		.replace(/[_.]+/g, ' ')
		.trim();
	const label = text.charAt(0).toUpperCase() + text.slice(1);
	return id ? `${label} (${key.endsWith('s') ? 'ids' : 'id'})` : label;
}

function field(key: string, value: unknown): AiSuggestionActionField {
	const label = aiSuggestionFieldLabel(key);
	if (value === null || value === undefined) return { key, label, kind: 'empty', text: 'None' };
	if (typeof value === 'string') {
		const text = value.trim();
		if (!text) return { key, label, kind: 'empty', text: 'Empty' };
		if (text.includes('\n') || text.length > LONG_TEXT) {
			return { key, label, kind: 'long', text: value, preview: aiSuggestionSnippet(text) };
		}
		return { key, label, kind: 'text', text };
	}
	if (typeof value === 'boolean') return { key, label, kind: 'text', text: value ? 'Yes' : 'No' };
	if (typeof value === 'number') return { key, label, kind: 'text', text: String(value) };
	if (Array.isArray(value) && value.every((v) => ['string', 'number'].includes(typeof v))) {
		const text = value.join(', ');
		if (!text) return { key, label, kind: 'empty', text: 'None' };
		if (text.length <= LONG_TEXT) return { key, label, kind: 'text', text };
	}
	return { key, label, kind: 'json', text: JSON.stringify(value, null, 2) };
}

/** The arguments to show, minus the targets (shown in the title). */
export function aiSuggestionActionFields(args: Record<string, unknown>): AiSuggestionActionField[] {
	const fields: AiSuggestionActionField[] = [];
	const walk = (obj: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(obj)) {
			if (TARGETS[key.toLowerCase()]) continue;
			if (WRAPPERS.has(key) && isPlainObject(value)) {
				walk(value);
				continue;
			}
			fields.push(field(key, value));
		}
	};
	walk(isPlainObject(args) ? args : {});
	return fields;
}

/** A one-line summary of the actions, for a folded card. */
export function aiSuggestionActionsSummary(actions: AiSuggestionAction[]): string {
	if (actions.length === 0) return '';
	if (actions.length === 1) return actions[0].label;
	return `${actions.length} actions: ${actions.map((a) => a.label).join(' · ')}`;
}
