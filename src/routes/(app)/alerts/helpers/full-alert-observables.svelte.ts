import { untrack } from 'svelte';
import { AlertService } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';
import { hasPartialObservables } from './alert-observables';

/**
 * `getAlert()`, with every one of its assets and IOCs.
 *
 * The queue lists alerts with only the first few of each
 * (`observables: 'summary'`). Whatever shows an alert's observables in
 * full calls this while it initialises: an alert that comes up cut short
 * is fetched once, after `delayMs` — enough for j/k to walk past a row
 * without fetching it — and its observables replace the listed ones. The
 * rest of the alert stays the listed one, so a status change applied to
 * the queue still shows. Until the fetch lands, or if it fails, the
 * listed alert is shown as is.
 */
export const fullAlertObservables = (getAlert: () => Alert | undefined, delayMs = 0) => {
	let loaded = $state<Alert | null>(null);

	$effect(() => {
		const alert = getAlert();
		if (!alert || !hasPartialObservables(alert)) return;

		const alertId = alert.alert_id;
		if (untrack(() => loaded?.alert_id) === alertId) return;

		let cancelled = false;
		const timer = setTimeout(async () => {
			const response = await AlertService.get(alertId);
			if (cancelled) return;
			if (response.ok && !response.error && response.data && typeof response.data !== 'string') {
				loaded = response.data;
			}
		}, delayMs);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	return {
		get alert(): Alert | undefined {
			const alert = getAlert();
			if (!alert || !loaded || loaded.alert_id !== alert.alert_id) return alert;
			if (!hasPartialObservables(alert)) return alert;

			return { ...alert, assets: loaded.assets, iocs: loaded.iocs };
		}
	};
};
