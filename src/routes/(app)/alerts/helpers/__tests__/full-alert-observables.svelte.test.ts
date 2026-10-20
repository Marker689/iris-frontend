import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/alerts.service', () => ({
	AlertService: { get: vi.fn() }
}));

import { AlertService } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';
import { fullAlertObservables } from '../full-alert-observables.svelte';

const get = AlertService.get as unknown as ReturnType<typeof vi.fn>;

const alert = (id: number, assets: number, assetsCount?: number, extra: object = {}) =>
	({
		alert_id: id,
		assets: Array.from({ length: assets }, (_, i) => ({ asset_id: i })),
		iocs: [],
		assets_count: assetsCount,
		...extra
	}) as unknown as Alert;

describe('fullAlertObservables', () => {
	let cleanup: (() => void) | null = null;

	const mount = (getAlert: () => Alert | undefined, delayMs = 0) => {
		let loader!: ReturnType<typeof fullAlertObservables>;
		cleanup = $effect.root(() => {
			loader = fullAlertObservables(getAlert, delayMs);
		});
		flushSync();
		return loader;
	};

	beforeEach(() => {
		vi.useFakeTimers();
		get.mockReset();
	});

	afterEach(() => {
		cleanup?.();
		cleanup = null;
		vi.useRealTimers();
	});

	it('fetches a cut-short alert and shows its observables over the listed ones', async () => {
		get.mockResolvedValueOnce({ ok: true, status: 200, data: alert(1, 500) });
		const listed = alert(1, 10, 500, { alert_status_id: 4 });
		const loader = mount(() => listed);

		expect(loader.alert?.assets).toHaveLength(10);
		await vi.runAllTimersAsync();

		expect(get).toHaveBeenCalledWith(1);
		expect(loader.alert?.assets).toHaveLength(500);
		// The rest of the alert is still the listed one.
		expect((loader.alert as unknown as { alert_status_id: number }).alert_status_id).toBe(4);
	});

	it('does not fetch an alert that is already complete', async () => {
		const loader = mount(() => alert(1, 3));
		await vi.runAllTimersAsync();

		expect(get).not.toHaveBeenCalled();
		expect(loader.alert?.assets).toHaveLength(3);
	});

	it('does not fetch an alert the cursor only passed over', async () => {
		let current = $state(alert(1, 10, 500));
		mount(() => current, 150);

		await vi.advanceTimersByTimeAsync(50);
		current = alert(2, 10, 20);
		flushSync();
		get.mockResolvedValueOnce({ ok: true, status: 200, data: alert(2, 20) });
		await vi.runAllTimersAsync();

		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith(2);
	});

	it('keeps the listed alert when the fetch fails', async () => {
		get.mockResolvedValueOnce({ ok: false, status: 500, data: null, error: { message: 'x' } });
		const listed = alert(1, 10, 500);
		const loader = mount(() => listed);
		await vi.runAllTimersAsync();

		expect(loader.alert).toBe(listed);
	});
});
