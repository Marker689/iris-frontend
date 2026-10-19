import {
	BellIcon,
	BotIcon,
	BracesIcon,
	CircleIcon,
	GitBranchIcon,
	GlobeIcon,
	LightbulbIcon,
	ListChecksIcon,
	MessageCircleQuestionIcon,
	OctagonXIcon,
	PlayIcon,
	SearchIcon,
	SquareArrowOutUpRightIcon,
	StickyNoteIcon,
	TimerIcon,
	VariableIcon,
	ZapIcon
} from 'lucide-svelte';
import type { Icon } from 'lucide-svelte';
import type {
	AiBlock,
	AiBlockDefinition,
	AiEntityType,
	AiExecutionMode,
	AiGraphNode,
	AiRunStatus,
	AiStepStatus,
	AiSuggestionAudience,
	AiTriggerType,
	AiUserRef,
	AiValidationError,
	AiWaitStatus,
	AiWorkflowSummary
} from '$lib/services/ai-workflows.service';
import { aiWorkflowTriggers } from '$lib/services/ai-workflows.service';
import type { NoteColor } from '$lib/utils/ai-workflow-graph';

export const NODE_ICONS: Record<string, typeof Icon> = {
	trigger: ZapIcon,
	ai_agent: BotIcon,
	condition: GitBranchIcon,
	http_request: GlobeIcon,
	ask_analyst: MessageCircleQuestionIcon,
	find_related: SearchIcon,
	find_war_room_tasks: ListChecksIcon,
	suggest: LightbulbIcon,
	action: PlayIcon,
	notify: BellIcon,
	delay: TimerIcon,
	run_workflow: SquareArrowOutUpRightIcon,
	set_variables: VariableIcon,
	python: BracesIcon,
	stop: OctagonXIcon,
	note: StickyNoteIcon
};

export const nodeIcon = (type: string): typeof Icon => NODE_ICONS[type] ?? CircleIcon;

/** Accent per node type, for the icon chip on the canvas. */
export const NODE_TONES: Record<string, string> = {
	trigger: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	ai_agent: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
	condition: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	http_request: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
	ask_analyst: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
	suggest: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	action: 'bg-red-500/15 text-red-700 dark:text-red-300',
	run_workflow: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
	python: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
	stop: 'bg-muted text-muted-foreground',
	note: 'bg-yellow-400/25 text-yellow-800 dark:text-yellow-200'
};

/** Paper and border of a note on the canvas, per note colour. */
export const NOTE_TONES: Record<NoteColor, string> = {
	yellow:
		'border-yellow-300 bg-yellow-100 text-yellow-950 dark:border-yellow-700 dark:bg-yellow-950/70 dark:text-yellow-50',
	blue: 'border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-700 dark:bg-sky-950/70 dark:text-sky-50',
	green:
		'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-50',
	pink: 'border-pink-300 bg-pink-100 text-pink-950 dark:border-pink-700 dark:bg-pink-950/70 dark:text-pink-50',
	purple:
		'border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-700 dark:bg-violet-950/70 dark:text-violet-50',
	gray: 'border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-50'
};

export const noteTone = (color: unknown): string =>
	NOTE_TONES[color as NoteColor] ?? NOTE_TONES.yellow;

export const nodeTone = (type: string): string => NODE_TONES[type] ?? 'bg-muted text-foreground/80';

export const TRIGGER_LABELS: Record<AiTriggerType, string> = {
	event: 'Event',
	cron: 'Schedule',
	manual: 'Manual',
	webhook: 'Inbound webhook',
	workflow: 'Called by a workflow'
};

/** What fires a workflow, in a few words: its hook, or its schedule. */
export function triggerDetail(type: AiTriggerType, config: Record<string, unknown> | null): string {
	const c = config ?? {};
	if (type === 'event') {
		const hooks = Array.isArray(c.hooks) ? (c.hooks as string[]) : [];
		return hooks.length === 1 ? hooks[0] : `${hooks.length} hooks`;
	}
	if (type === 'cron') return String(c.cron ?? '');
	return '';
}

/**
 * Whether a workflow matches a free-text search, case-insensitively: on
 * its name, description, owner, and each trigger's label, type, hooks and
 * schedule. An empty search matches everything.
 */
export function workflowMatchesSearch(workflow: AiWorkflowSummary, search: string): boolean {
	const needle = search.trim().toLowerCase();
	if (!needle) return true;
	const haystack = [
		workflow.name,
		workflow.description ?? '',
		workflow.owner ? userLabel(workflow.owner) : '',
		workflow.owner?.login ?? '',
		...aiWorkflowTriggers(workflow).flatMap((trigger) => {
			const config = trigger.config ?? {};
			const hooks = Array.isArray(config.hooks) ? (config.hooks as string[]) : [];
			return [
				TRIGGER_LABELS[trigger.type] ?? '',
				trigger.type,
				...hooks,
				trigger.type === 'cron' ? String(config.cron ?? '') : ''
			];
		})
	];
	return haystack.some((value) => value.toLowerCase().includes(needle));
}

export const ENTITY_LABELS: Record<AiEntityType, string> = {
	alert: 'Alert',
	alert_cluster: 'Alert cluster',
	case: 'Case',
	war_room: 'War room'
};

export const ENTITY_TYPES: AiEntityType[] = ['alert', 'alert_cluster', 'case', 'war_room'];

export const entityLabel = (type: string | null | undefined): string =>
	type ? (ENTITY_LABELS[type as AiEntityType] ?? type) : '';

/** In-app link to an entity, or null for an unknown type. */
export function entityHref(type: string | null | undefined, id: number | null | undefined) {
	// Only a positive safe integer goes into a URL path.
	if (!type || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
	switch (type) {
		case 'alert':
			return `/alerts/${id}`;
		case 'alert_cluster':
			return `/alert-clusters/${id}`;
		case 'case':
			return `/case/${id}`;
		case 'war_room':
			return `/war-rooms/${id}`;
		default:
			return null;
	}
}

export const RUN_STATUS_TONES: Record<AiRunStatus, string> = {
	running: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
	waiting: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	succeeded: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
	cancelled: 'bg-muted text-muted-foreground',
	skipped: 'bg-muted text-muted-foreground'
};

export const RUN_STATUSES: AiRunStatus[] = [
	'running',
	'waiting',
	'succeeded',
	'failed',
	'cancelled',
	'skipped'
];

export const runTone = (status: string): string =>
	RUN_STATUS_TONES[status as AiRunStatus] ?? 'bg-muted text-muted-foreground';

export const STEP_STATUS_TONES: Record<AiStepStatus, string> = {
	running: 'animate-pulse bg-blue-500/15 text-blue-700 dark:text-blue-300',
	succeeded: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
	waiting: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	resumed: 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
};

export const stepTone = (status: string): string =>
	STEP_STATUS_TONES[status as AiStepStatus] ?? 'bg-muted text-muted-foreground';

export const WAIT_STATUS_TONES: Record<AiWaitStatus, string> = {
	pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	expired: 'bg-red-500/15 text-red-700 dark:text-red-300',
	cancelled: 'bg-muted text-muted-foreground'
};

export const EXEC_MODE_LABELS: Record<AiExecutionMode, string> = {
	auto_read: 'auto read',
	allowlisted_write: 'allowlisted write',
	suggested: 'suggested',
	accepted_by_user: 'accepted by user',
	denied: 'denied'
};

export const EXEC_MODE_TONES: Record<AiExecutionMode, string> = {
	auto_read: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	allowlisted_write: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
	suggested: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
	accepted_by_user: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	denied: 'bg-red-500/15 text-red-700 dark:text-red-300'
};

export const CLASSIFICATION_TONES: Record<string, string> = {
	read: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	write: 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
};

/** `{id, login, name}` (or a bare string from older payloads) → label. */
export function userLabel(user: AiUserRef | string | null | undefined): string {
	if (!user) return '—';
	if (typeof user === 'string') return user;
	return user.name || user.login || `#${user.id}`;
}

/** Duration between two ISO dates, `end` defaulting to now. */
export function formatDuration(start: string | null | undefined, end?: string | null): string {
	if (!start) return '—';
	const a = Date.parse(start);
	const b = end ? Date.parse(end) : Date.now();
	if (Number.isNaN(a) || Number.isNaN(b)) return '—';
	const ms = Math.max(0, b - a);
	if (ms < 1000) return `${ms} ms`;
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Offer `data` as a JSON file download. */
export function downloadJson(filename: string, data: unknown): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Larger than any real workflow or block; the backend caps request bodies too. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Let the user pick a JSON file and parse it; null when cancelled. */
export function pickJsonFile(): Promise<{ name: string; data: unknown } | null> {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json,.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return resolve(null);
			if (file.size > MAX_IMPORT_BYTES) {
				return reject(new Error(`${file.name} is larger than 2 MB`));
			}
			try {
				resolve({ name: file.name, data: JSON.parse(await file.text()) });
			} catch {
				reject(new Error(`${file.name} is not valid JSON`));
			}
		};
		input.oncancel = () => resolve(null);
		input.click();
	});
}

/** File name for an exported document: `Name of it` → `name-of-it.<kind>.json`. */
export function exportFilename(name: string, kind: 'workflow' | 'block'): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return `${slug || kind}.${kind}.json`;
}

/** Import warnings → one line each, for a toast. */
export function describeWarnings(warnings: AiValidationError[] | undefined): string {
	return (warnings ?? [])
		.map((w) => (w.node_id ? `${w.node_id}: ${w.message}` : w.message))
		.join(' · ');
}

/** 400 body `{message, data: {field: [msgs]}}` → one line. */
export function describeApiError(data: unknown, fallback: string): string {
	if (!data || typeof data !== 'object') return fallback;
	const body = data as { message?: string; data?: unknown };
	const parts: string[] = [];
	const structured = workflowErrorsFrom(data);
	if (structured.length) {
		return structured
			.map((e) => [e.node_id, e.field, e.message].filter((p) => p).join(' · '))
			.join(' | ');
	}
	if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
		for (const [field, msgs] of Object.entries(body.data as Record<string, unknown>)) {
			parts.push(`${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`);
		}
	}
	if (parts.length) return parts.join(' · ');
	return body.message || fallback;
}

/** A save rejected by validation: `{message, data: {errors: [{node_id, field, message}]}}`. */
export function workflowErrorsFrom(data: unknown): AiValidationError[] {
	const errors = (data as { data?: { errors?: unknown } } | null)?.data?.errors;
	if (!Array.isArray(errors)) return [];
	return errors.filter(
		(e): e is AiValidationError => !!e && typeof e === 'object' && 'message' in e
	);
}

/**
 * Who the workflow's suggestions are addressed to (`suggestion_audience`).
 * Administrators see every suggestion whatever the audience.
 */
export const SUGGESTION_AUDIENCE_LABELS: Record<AiSuggestionAudience, string> = {
	entity: 'The owner of the entity (a war room: its members) and the workflow owner',
	owner: 'Only the workflow owner'
};

export const WORKFLOW_EDITOR_CTX = Symbol('ai-workflow-editor');
export const TEMPLATE_FIELD_CTX = Symbol('ai-workflow-template-field');

/** Shared form styling (native selects, like the other settings pages). */
export const SELECT_CLASS = 'h-8 w-full rounded-md border bg-background px-2 text-xs';
export const LABEL_CLASS = 'text-2xs font-medium text-muted-foreground';
export const TEXTAREA_CLASS =
	'min-h-[72px] w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring';

const KEY_CALL = /\bkey\(\s*(['"])([^'"]{1,128})\1\s*\)/g;

/** Keystore names referenced with `key("NAME")` anywhere in `value`. */
export function keyReferences(value: unknown): string[] {
	const names = new Set<string>();
	const walk = (item: unknown) => {
		if (typeof item === 'string') {
			for (const match of item.matchAll(KEY_CALL)) names.add(match[2]);
		} else if (Array.isArray(item)) item.forEach(walk);
		else if (item && typeof item === 'object') Object.values(item).forEach(walk);
	};
	walk(value);
	return [...names].sort();
}

/** Tool names the nodes call or propose. */
export function toolReferences(nodes: AiGraphNode[]): string[] {
	const tools = new Set<string>();
	for (const node of nodes) {
		const config = (node.config ?? {}) as Record<string, unknown>;
		if (node.type === 'action' && typeof config.tool === 'string') tools.add(config.tool);
		else if (node.type === 'ai_agent' && Array.isArray(config.tools)) {
			for (const tool of config.tools) if (typeof tool === 'string') tools.add(tool);
		} else if (node.type === 'suggest') {
			const tool = (config.proposed_action as Record<string, unknown> | undefined)?.tool;
			if (typeof tool === 'string') tools.add(tool);
			if (Array.isArray(config.actions)) {
				for (const action of config.actions as Record<string, unknown>[]) {
					if (typeof action?.tool === 'string') tools.add(action.tool);
				}
			}
		}
	}
	return [...tools].sort();
}

/**
 * What nodes someone else wrote would do once inserted, for a review
 * before they land in the workflow: the hosts they call, the keystore
 * entries they send, the tools they run, their Python scripts and the
 * workflows they start. `requirements` (computed by the server for a
 * saved block) wins over what is read here.
 */
export function definitionReview(
	definition: AiBlockDefinition,
	requirements?: { keystore?: string[]; tools?: string[] } | null
): string[] {
	const nodes = definition.nodes ?? [];
	const hosts = new Set<string>();
	for (const node of nodes) {
		if (node.type !== 'http_request') continue;
		const url = String(node.config?.url ?? '');
		const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim())?.[1];
		hosts.add(host ? host.replace(/^.*@/, '') : url || '(no URL)');
	}
	const python = nodes.filter((n) => n.type === 'python').length;
	const workflows = nodes.filter((n) => n.type === 'run_workflow').length;
	const keys = requirements?.keystore ?? keyReferences(nodes);
	const tools = requirements?.tools ?? toolReferences(nodes);
	return [
		hosts.size ? `Calls: ${[...hosts].join(', ')}` : '',
		keys.length ? `Sends keystore entries: ${keys.join(', ')}` : '',
		tools.length ? `Runs tools: ${tools.join(', ')}` : '',
		python ? `Runs ${python} Python script${python === 1 ? '' : 's'}` : '',
		workflows ? `Starts ${workflows} other workflow${workflows === 1 ? '' : 's'}` : ''
	].filter(Boolean);
}

/** `definitionReview` of a saved block. */
export function blockReview(block: AiBlock): string[] {
	return definitionReview(block.definition, block.requirements);
}
