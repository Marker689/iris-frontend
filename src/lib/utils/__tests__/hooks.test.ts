import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/hooks.service', () => ({
	HooksService: {
		invoke: vi.fn(),
		invokeForAlerts: vi.fn(),
		invokeForWarRoom: vi.fn()
	}
}));

import { HooksService } from '$lib/services/hooks.service';
import type { HookOption } from '$lib/services/hooks.service';
import {
	callAlertHook,
	callHook,
	callWarRoomHook,
	filterHookOptions,
	hookOptionKey
} from '../hooks';

const mockInvoke = HooksService.invoke as unknown as ReturnType<typeof vi.fn>;
const mockInvokeForAlerts = HooksService.invokeForAlerts as unknown as ReturnType<typeof vi.fn>;
const mockInvokeForWarRoom = HooksService.invokeForWarRoom as unknown as ReturnType<typeof vi.fn>;

const moduleOption: HookOption = {
	hook_name: 'on_manual_trigger_ioc',
	manual_hook_ui_name: 'Enrich',
	module_name: 'iris_misp_module'
};

const webhookOption: HookOption = {
	hook_name: 'on_manual_trigger_ioc',
	manual_hook_ui_name: 'Send to SOAR',
	module_name: 'IRIS webhooks',
	webhook_id: 4
};

describe('hooks utils', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockInvoke.mockResolvedValue({ ok: true, data: { queued: 1 } });
		mockInvokeForAlerts.mockResolvedValue({ ok: true, data: { queued: 2 } });
	});

	it('leaves webhook_id out for module hooks', async () => {
		const outcome = await callHook(3, 'ioc', [9], moduleOption);
		expect(mockInvoke).toHaveBeenCalledWith(3, {
			type: 'ioc',
			hook_name: 'on_manual_trigger_ioc',
			module_name: 'iris_misp_module',
			hook_ui_name: 'Enrich',
			targets: [9]
		});
		expect(outcome).toEqual({ status: 'success', message: 'Queued task with 1 object(s)' });
	});

	it('passes webhook_id through for webhook entries', async () => {
		await callHook(3, 'ioc', [9], webhookOption);
		expect(mockInvoke.mock.calls[0][1]).toMatchObject({ webhook_id: 4, targets: [9] });
		await callAlertHook([5, 6], { ...webhookOption, hook_name: 'on_manual_trigger_alert' });
		expect(mockInvokeForAlerts).toHaveBeenCalledWith({
			hook_name: 'on_manual_trigger_alert',
			module_name: 'IRIS webhooks',
			hook_ui_name: 'Send to SOAR',
			targets: [5, 6],
			webhook_id: 4
		});
	});

	it('passes the workflow and its trigger node through for workflow entries', async () => {
		const workflowOption: HookOption = {
			hook_name: 'on_manual_trigger_ioc',
			manual_hook_ui_name: 'Deep dive',
			module_name: 'IRIS workflows',
			workflow_id: 7,
			workflow_trigger_id: 'deep'
		};
		const outcome = await callHook(3, 'ioc', [9], workflowOption);
		expect(mockInvoke.mock.calls[0][1]).toMatchObject({
			workflow_id: 7,
			workflow_trigger_id: 'deep'
		});
		expect(outcome).toEqual({ status: 'success', message: 'Started 1 workflow run(s)' });
	});

	it('keys entries apart even when labels collide', () => {
		const other = { ...webhookOption, webhook_id: 5 };
		expect(hookOptionKey(webhookOption)).not.toBe(hookOptionKey(other));
		expect(hookOptionKey({ ...moduleOption, manual_hook_ui_name: 'Send to SOAR' })).not.toBe(
			hookOptionKey(webhookOption)
		);
		const workflow = { ...moduleOption, workflow_id: 7, workflow_trigger_id: 'a' };
		expect(hookOptionKey(workflow)).not.toBe(
			hookOptionKey({ ...workflow, workflow_trigger_id: 'b' })
		);
	});
});

describe('callWarRoomHook', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockInvokeForWarRoom.mockResolvedValue({ ok: true, data: { queued: 1 } });
	});

	it('sends the entry to the war-room invoker, without targets', async () => {
		const outcome = await callWarRoomHook(3, {
			...webhookOption,
			hook_name: 'on_manual_trigger_war_room'
		});
		expect(mockInvokeForWarRoom).toHaveBeenCalledWith(3, {
			hook_name: 'on_manual_trigger_war_room',
			module_name: 'IRIS webhooks',
			hook_ui_name: 'Send to SOAR',
			webhook_id: 4
		});
		expect(outcome).toEqual({ status: 'success', message: 'Queued task with 1 object(s)' });
	});
});

describe('filterHookOptions', () => {
	const options = [moduleOption, webhookOption];

	it('keeps every entry for an empty or blank query', () => {
		expect(filterHookOptions(options, '')).toEqual(options);
		expect(filterHookOptions(options, '   ')).toEqual(options);
	});

	it('matches the label case-insensitively', () => {
		expect(filterHookOptions(options, 'soar')).toEqual([webhookOption]);
	});

	it('matches the module name', () => {
		expect(filterHookOptions(options, 'misp')).toEqual([moduleOption]);
	});

	it('needs every word to match', () => {
		expect(filterHookOptions(options, 'send webhooks')).toEqual([webhookOption]);
		expect(filterHookOptions(options, 'send misp')).toEqual([]);
	});
});
