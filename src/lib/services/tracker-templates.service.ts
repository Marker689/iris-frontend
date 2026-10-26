/**
 * Tracker templates — global bundles of tracker steps and tracker
 * definitions, managed in Settings > Tracker templates (server
 * administrators). Applying one to a war room or a case merges its steps
 * by name and creates its trackers (those of a source the target does
 * not have are skipped); the steps and trackers of either can be saved
 * back as a template.
 *
 * Wraps `/api/v2/manage/tracker-templates`. The presets are defined by
 * the server (`/presets`) and created there on demand.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type {
	BoardPanelColumn,
	BoardProgressDisplay,
	BoardRowFilter
} from './war-room-board.service';
import type { CaseTrackerSource } from './case-trackers.service';
import type {
	TrackerColumn,
	TrackerSource,
	TrackerTimelineSync,
	TrackerUserRef
} from './war-room-trackers.service';

/** A war-room source, or a case one (tasks, evidences). */
export type TrackerTemplateSource = TrackerSource | CaseTrackerSource;

export const TRACKER_TEMPLATE_SOURCES: { value: TrackerTemplateSource; label: string }[] = [
	{ value: 'manual', label: 'Manual' },
	{ value: 'assets', label: 'Assets' },
	{ value: 'iocs', label: 'IOCs' },
	{ value: 'customers', label: 'Customers (war rooms only)' },
	{ value: 'cases', label: 'Cases (war rooms only)' },
	{ value: 'registry_assets', label: 'Registry assets (war rooms only)' },
	{ value: 'tasks', label: 'Tasks (cases only)' },
	{ value: 'evidences', label: 'Evidences (cases only)' }
];

export interface TrackerTemplateStep {
	name: string;
	color: string;
	icon: string | null;
	description: string | null;
}

export interface TrackerTemplateTracker {
	name: string;
	icon: string | null;
	description: string | null;
	source: TrackerTemplateSource;
	/** Names of the template steps offered; null = all of them. */
	step_names: string[] | null;
	columns: TrackerColumn[];
	show_asset_flags: boolean;
	/** The war-room timeline is never kept: a new war room has its own. */
	timeline_sync?: TrackerTimelineSync | null;
	/** Widgets added to the war-room board with the tracker. */
	board_widgets?: TrackerTemplateBoardWidget[];
}

/**
 * A tracker widget of the war-room board (see `WarRoomBoardWidget`), with
 * the steps by name and without its tracker: the template tracker's.
 */
export interface TrackerTemplateBoardWidget {
	type: 'tracker_count' | 'tracker_progress' | 'tracker_list' | 'tracker_breakdown';
	title: string | null;
	column: BoardPanelColumn | null;
	config: {
		/** Names of template steps; null = every step the tracker offers. */
		step_names: string[] | null;
		display?: BoardProgressDisplay;
		of_total?: boolean;
		filter?: BoardRowFilter | null;
		column_key?: string;
	};
}

export interface TrackerTemplate {
	id: number;
	name: string;
	description: string | null;
	steps: TrackerTemplateStep[];
	trackers: TrackerTemplateTracker[];
	created_by: TrackerUserRef | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface TrackerTemplateInput {
	name: string;
	description?: string | null;
	steps: TrackerTemplateStep[];
	trackers: TrackerTemplateTracker[];
}

export const TRACKER_TEMPLATE_FORMAT = 'iris-tracker-template';

/**
 * The portable JSON of a template (export / import). The server stamps
 * `format` / `version` on export and only checks them when present.
 */
export type TrackerTemplateExport = TrackerTemplateInput & {
	format?: typeof TRACKER_TEMPLATE_FORMAT;
	version?: number;
};

/** A built-in preset, created server-side on demand. */
export interface TrackerTemplatePreset {
	key: string;
	name: string;
	description: string | null;
}

/**
 * The portable part of a template, ready for `JSON.stringify` — ids,
 * authors and dates are left out.
 */
export const trackerTemplateToExport = (
	template: Pick<TrackerTemplate, 'name' | 'description' | 'steps' | 'trackers'>
): TrackerTemplateExport => ({
	name: template.name,
	description: template.description ?? null,
	steps: template.steps.map((s) => ({
		name: s.name,
		color: s.color,
		icon: s.icon ?? null,
		description: s.description ?? null
	})),
	trackers: template.trackers.map((t) => ({
		name: t.name,
		icon: t.icon ?? null,
		description: t.description ?? null,
		source: t.source,
		step_names: t.step_names ?? null,
		columns: t.columns ?? [],
		show_asset_flags: !!t.show_asset_flags,
		timeline_sync: t.timeline_sync ? { ...t.timeline_sync, war_room_timeline_id: null } : null,
		board_widgets: (t.board_widgets ?? []).map((w) => structuredClone(w))
	}))
});

/**
 * Parse an imported file. Throws an Error with a readable message when
 * the JSON is not a template; the server validates the details.
 */
export const parseTrackerTemplateJson = (text: string): TrackerTemplateExport => {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('The file is not valid JSON.');
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('The file does not hold a tracker template.');
	}
	const obj = data as Record<string, unknown>;
	if (obj.format !== undefined && obj.format !== TRACKER_TEMPLATE_FORMAT) {
		throw new Error('The file is not an IRIS tracker template.');
	}
	if (typeof obj.name !== 'string' || !obj.name.trim()) {
		throw new Error('The template has no name.');
	}
	if (!Array.isArray(obj.steps) || !Array.isArray(obj.trackers)) {
		throw new Error('The template must have a "steps" and a "trackers" list.');
	}
	return {
		format: TRACKER_TEMPLATE_FORMAT,
		version: typeof obj.version === 'number' ? obj.version : 1,
		...trackerTemplateToExport(obj as unknown as TrackerTemplate)
	};
};

const base = '/manage/tracker-templates';

export class TrackerTemplatesService {
	static list(options: ApiOptions = {}): Promise<RequestResponse<TrackerTemplate[]>> {
		return ApiService.get(base, options);
	}

	static get(
		templateId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.get(`${base}/${templateId}`, options);
	}

	static create(
		body: TrackerTemplateInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.post(base, body, options);
	}

	static update(
		templateId: number,
		body: Partial<TrackerTemplateInput>,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.patch(`${base}/${templateId}`, body, options);
	}

	static remove(templateId: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete(`${base}/${templateId}`, options);
	}

	static exportTemplate(
		templateId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplateExport>> {
		return ApiService.get(`${base}/${templateId}/export`, options);
	}

	static importTemplate(
		body: TrackerTemplateExport,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.post(`${base}/import`, body, options);
	}

	static listPresets(options: ApiOptions = {}): Promise<RequestResponse<TrackerTemplatePreset[]>> {
		return ApiService.get(`${base}/presets`, options);
	}

	/** Create a template from one of the built-in presets (400 if its name is taken). */
	static createFromPreset(
		key: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.post(`${base}/presets/${encodeURIComponent(key)}`, {}, options);
	}
}
