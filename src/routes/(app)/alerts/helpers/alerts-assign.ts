import type { Alert } from '$lib/types/resources/alert';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';

type AlertOwnerDeps = {
	updateAlert: (alertId: AlertIdentifier, changes: UpdateAlertBody) => Promise<Alert | null>;
};

type ReassignAlertPayload = {
	ownerId: string;
};

/**
 * Owner-picker value meaning "nobody". Sent to the API as an explicit
 * `null` — omitting the owner instead would let the backend claim the
 * alert for the caller.
 */
export const UNASSIGNED_OWNER_VALUE = 'none';

export const assignAlertsToOwner = async (
	{ updateAlert }: AlertOwnerDeps,
	alertIds: AlertIdentifier[],
	alert_owner_id: UpdateAlertBody['alert_owner_id']
) => await Promise.all(alertIds.map((alertId) => updateAlert(alertId, { alert_owner_id })));

export const unassignAlert = async ({ updateAlert }: AlertOwnerDeps, alertId: AlertIdentifier) =>
	await updateAlert(alertId, { alert_owner_id: null });

export const reassignAlertOwner = async (
	{ updateAlert }: AlertOwnerDeps,
	alertId: AlertIdentifier,
	payload: ReassignAlertPayload
) =>
	await updateAlert(alertId, {
		alert_owner_id: payload.ownerId === UNASSIGNED_OWNER_VALUE ? null : Number(payload.ownerId)
	});
