import type {
	AiBlockDefinition,
	AiGraphEdge,
	AiGraphNode
} from '$lib/services/ai-workflows.service';

/**
 * Nodes copied from the workflow editor travel through the system
 * clipboard as JSON, so they paste into another tab or workflow. What
 * this browser copied last is remembered (a fingerprint, in
 * localStorage): anything else pasted is someone else's and is
 * reviewed before it lands.
 */

const MARKER = 'iris_ai_workflow_nodes';
const FORMAT = 1;
const STORAGE_KEY = 'iris_ai_wf_clipboard';
/** Larger than any real selection. */
export const MAX_CLIPBOARD_CHARS = 2 * 1024 * 1024;

export function clipboardEncode(definition: AiBlockDefinition): string {
	return JSON.stringify({ [MARKER]: FORMAT, nodes: definition.nodes, edges: definition.edges });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

const isText = (value: unknown, max = 128): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= max;

function readNode(raw: unknown): AiGraphNode | null {
	if (!isRecord(raw) || !isText(raw.id) || !isText(raw.type, 64)) return null;
	const position = isRecord(raw.position) ? raw.position : {};
	const x = Number(position.x);
	const y = Number(position.y);
	return {
		...(raw as unknown as AiGraphNode),
		config: isRecord(raw.config) ? raw.config : {},
		position: { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
	};
}

function readEdge(raw: unknown): AiGraphEdge | null {
	if (!isRecord(raw) || !isText(raw.source) || !isText(raw.target)) return null;
	return raw as unknown as AiGraphEdge;
}

/**
 * The nodes and edges of clipboard text copied from the editor, or null
 * when it is something else. Edges to a node not in the text are dropped.
 */
export function clipboardDecode(text: string | null | undefined): AiBlockDefinition | null {
	if (!text || text.length > MAX_CLIPBOARD_CHARS || !text.includes(MARKER)) return null;
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(data) || data[MARKER] !== FORMAT || !Array.isArray(data.nodes)) return null;
	const nodes = data.nodes.map(readNode);
	if (!nodes.length || nodes.some((n) => n === null)) return null;
	const ids = new Set(nodes.map((n) => n!.id));
	const edges = (Array.isArray(data.edges) ? data.edges : [])
		.map(readEdge)
		.filter((e): e is AiGraphEdge => !!e && ids.has(e.source) && ids.has(e.target));
	return { nodes: nodes as AiGraphNode[], edges };
}

/** cyrb53: a fast 53-bit string hash. */
function fingerprint(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return `${text.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

/** Remember `text` as copied by this browser. */
export function clipboardRemember(text: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, fingerprint(text));
	} catch {
		// Storage full or blocked: the next paste is reviewed, which is safe
	}
}

/** Whether `text` is what this browser copied last. */
export function clipboardIsOwn(text: string): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === fingerprint(text);
	} catch {
		return false;
	}
}

/** Where pasted nodes go without a pointer: next to where they came from. */
export const PASTE_OFFSET = 40;
