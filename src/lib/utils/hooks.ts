import {
	HooksService,
	type HookObjectType,
	type HookOption,
	type InvokeHookResult
} from '$lib/services/hooks.service';
import type { RequestResponse } from '$lib/services/api.service';

type HookCallOutcome = { status: string; message: string };

/**
 * Turn an invoke response into a `{status, message}` pair the caller can
 * drop straight into a toast.
 *
 * The v2 backend returns `{queued, logs?}` where a non-empty `logs`
 * means "queued fewer than requested" — every listed line is a target
 * that couldn't be resolved. We surface that as an error toast so the
 * user knows something was skipped; otherwise we report the queued
 * count.
 */
const toOutcome = (
	response: RequestResponse<InvokeHookResult>,
	hookOption: HookOption
): HookCallOutcome => {
	if (!response.ok || response.error) {
		return {
			status: 'error',
			message: response.error?.message ?? 'Failed to trigger hook'
		};
	}

	const body = response.data as InvokeHookResult | null;
	const queued = body?.queued ?? 0;
	const logs = body?.logs ?? [];

	const started =
		hookOption.workflow_id !== undefined
			? `Started ${queued} workflow run(s)`
			: `Queued task with ${queued} object(s)`;

	if (logs.length > 0) {
		return {
			status: 'error',
			message: `${started}. ${logs.join('; ')}`
		};
	}

	return {
		status: 'success',
		message: started
	};
};

/**
 * Stable `{#each}` key of a menu entry. Labels alone collide: a module
 * can register one hook under several labels, and two webhooks can
 * share a label.
 */
export const hookOptionKey = (hookOption: HookOption): string =>
	`${hookOption.module_name}|${hookOption.hook_name}|${hookOption.webhook_id ?? ''}|${hookOption.workflow_id ?? ''}|${hookOption.workflow_trigger_id ?? ''}|${hookOption.manual_hook_ui_name}`;

/** Only webhook and workflow entries carry one; module entries leave them out. */
const entryTarget = (hookOption: HookOption) => ({
	...(hookOption.webhook_id !== undefined ? { webhook_id: hookOption.webhook_id } : {}),
	...(hookOption.workflow_id !== undefined ? { workflow_id: hookOption.workflow_id } : {}),
	...(hookOption.workflow_trigger_id !== undefined
		? { workflow_trigger_id: hookOption.workflow_trigger_id }
		: {})
});

/** Fire a manual module hook (or webhook, or AI workflow) against `targets` in `case_id`. */
export const callHook = async (
	case_id: number,
	hookType: HookObjectType,
	targets: Array<number>,
	hookOption: HookOption
): Promise<HookCallOutcome> =>
	toOutcome(
		await HooksService.invoke(case_id, {
			type: hookType,
			hook_name: hookOption.hook_name,
			module_name: hookOption.module_name,
			hook_ui_name: hookOption.manual_hook_ui_name,
			targets,
			...entryTarget(hookOption)
		}),
		hookOption
	);

/**
 * Fire a manual module hook against alerts. Alerts live outside any
 * case, so this goes to the alert-scoped invoker rather than
 * `callHook`'s case one.
 */
export const callAlertHook = async (
	targets: Array<number>,
	hookOption: HookOption
): Promise<HookCallOutcome> =>
	toOutcome(
		await HooksService.invokeForAlerts({
			hook_name: hookOption.hook_name,
			module_name: hookOption.module_name,
			hook_ui_name: hookOption.manual_hook_ui_name,
			targets,
			...entryTarget(hookOption)
		}),
		hookOption
	);
