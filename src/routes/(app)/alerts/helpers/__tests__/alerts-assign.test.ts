import { describe, expect, it, vi } from 'vitest';
import { reassignAlertOwner, unassignAlert, UNASSIGNED_OWNER_VALUE } from '../alerts-assign';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';

const makeDeps = () => ({
	updateAlert: vi.fn(
		async (alertId: AlertIdentifier, _changes: UpdateAlertBody) => ({ alert_id: alertId }) as Alert
	)
});

describe('unassignAlert', () => {
	it('sends an explicit null owner so the backend does not claim the alert for the caller', async () => {
		const deps = makeDeps();

		await unassignAlert(deps, 7);

		expect(deps.updateAlert).toHaveBeenCalledWith(7, { alert_owner_id: null });
	});
});

describe('reassignAlertOwner', () => {
	it('sends the picked user id as a number', async () => {
		const deps = makeDeps();

		await reassignAlertOwner(deps, 7, { ownerId: '42' });

		expect(deps.updateAlert).toHaveBeenCalledWith(7, { alert_owner_id: 42 });
	});

	it('sends a null owner when "Unassigned" is picked', async () => {
		const deps = makeDeps();

		await reassignAlertOwner(deps, 7, { ownerId: UNASSIGNED_OWNER_VALUE });

		expect(deps.updateAlert).toHaveBeenCalledWith(7, { alert_owner_id: null });
	});
});
