import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type HookObjectType =
	| 'case'
	| 'ioc'
	| 'asset'
	| 'note'
	| 'event'
	| 'task'
	| 'evidence'
	| 'datastore_file'
	| 'global_task'
	| 'alert'
	| 'war_room';

export interface HookOption {
	hook_name: string;
	manual_hook_ui_name: string;
	module_name: string;
	/** Set on entries of native webhooks subscribed to the manual trigger. */
	webhook_id?: number;
	/** Set on entries of manual AI workflows shown in this menu. */
	workflow_id?: number;
	/** With `workflow_id`: the manual trigger node the entry starts at. */
	workflow_trigger_id?: string;
}

export interface InvokeHookBody {
	hook_name: string;
	module_name: string;
	hook_ui_name: string;
	type: HookObjectType;
	targets: number[];
	/** Sends to this webhook instead of the modules. */
	webhook_id?: number;
	/** Starts this AI workflow, as the current user, instead of the modules. */
	workflow_id?: number;
	/** The workflow's trigger node to start at. */
	workflow_trigger_id?: string;
}

/** Same payload minus `type` — the alert endpoint only knows alerts. */
export type InvokeAlertHookBody = Omit<InvokeHookBody, 'type'>;

/** Same payload minus `type` and `targets` — the target is the war room of the URL. */
export type InvokeWarRoomHookBody = Omit<InvokeHookBody, 'type' | 'targets'>;

export interface InvokeHookResult {
	queued: number;
	logs?: string[];
}

export class HooksService {
	static async list(
		objectType: HookObjectType,
		options: ApiOptions = {}
	): Promise<RequestResponse<HookOption[]>> {
		return ApiService.get<HookOption[]>(
			`/dim-hooks?target=${encodeURIComponent(objectType)}`,
			options
		);
	}

	static async invoke(
		caseId: number,
		body: InvokeHookBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<InvokeHookResult>> {
		return ApiService.post<InvokeHookResult>(`/cases/${caseId}/dim-hooks/invoke`, body, options);
	}

	/**
	 * Alerts don't belong to a case, so they have their own invoker
	 * rather than a `type: 'alert'` target on the case-scoped one.
	 */
	static async invokeForAlerts(
		body: InvokeAlertHookBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<InvokeHookResult>> {
		return ApiService.post<InvokeHookResult>('/alerts/dim-hooks/invoke', body, options);
	}

	/**
	 * War rooms don't belong to a case either: the war room of the URL
	 * is the one target.
	 */
	static async invokeForWarRoom(
		warRoomId: number,
		body: InvokeWarRoomHookBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<InvokeHookResult>> {
		return ApiService.post<InvokeHookResult>(
			`/war-rooms/${warRoomId}/dim-hooks/invoke`,
			body,
			options
		);
	}
}
