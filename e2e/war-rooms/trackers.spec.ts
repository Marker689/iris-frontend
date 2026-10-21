import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson, seed, cleanup } from '../helpers/api';

// War room · Trackers: an "assets" tracker mirrors the assets of the
// attached cases; a step is ticked on a row from the Steps popover, then
// shows up in the row history.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('War room · trackers', () => {
	test('tick a step on a mirrored asset row and read it in the history', async ({ page }) => {
		const api = await adminApi();
		const assetName = rand('tracker-asset');
		const stepName = rand('Isolated');
		const trackerName = rand('Remediation');

		const wrId = await seed.warRoom(api);
		const caseId = await seed.case(api, { case_name: rand('e2e trackers') });

		try {
			const link = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			expect(link.ok(), await link.text()).toBeTruthy();
			const assetId = await seed.asset(api, caseId, { asset_name: assetName });

			const stepRes = await api.post(`/api/v2/war-rooms/${wrId}/tracker-steps`, {
				data: { name: stepName, color: 'orange', icon: 'unplug' }
			});
			expect(stepRes.status(), await stepRes.text()).toBe(201);
			const stepId = (await apiJson<{ id: number }>(stepRes)).id;

			const trackerRes = await api.post(`/api/v2/war-rooms/${wrId}/trackers`, {
				data: { name: trackerName, source: 'assets', icon: 'wrench', show_asset_flags: true }
			});
			expect(trackerRes.status(), await trackerRes.text()).toBe(201);
			const trackerId = (await apiJson<{ id: number }>(trackerRes)).id;

			await login(page);
			await page.goto(`/war-rooms/${wrId}/scope?tab=tracker-${trackerId}`);

			await expect(page.getByTestId(`scope-tab-tracker-${trackerId}`)).toContainText(trackerName);
			const table = page.getByTestId('tracker-table');
			await expect(table).toBeVisible({ timeout: 15_000 });
			const row = table.locator(`[data-testid="tracker-row"][data-row-key="asset:${assetId}"]`);
			await expect(row).toBeVisible();
			await expect(row).toContainText(assetName);

			// --- Tick the step ------------------------------------------------
			await row.getByTestId('tracker-steps-trigger').click();
			const toggle = page.getByTestId('tracker-step-toggle').filter({ hasText: stepName });
			await toggle.click();
			await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
			await page.keyboard.press('Escape');

			const rows = await apiJson<{
				data: { key: string; steps: { step_id: number }[] }[];
			}>(await api.get(`/api/v2/war-rooms/${wrId}/trackers/${trackerId}/rows`));
			const stored = rows.data.find((r) => r.key === `asset:${assetId}`);
			expect(stored?.steps.map((s) => s.step_id)).toContain(stepId);

			// The step filter counts the row.
			await expect(
				page.getByTestId('tracker-step-filter').filter({ hasText: stepName })
			).toContainText('1');

			// --- Row history --------------------------------------------------
			await row.getByTestId('tracker-row-history').click();
			const history = page.getByTestId('tracker-history');
			await expect(history).toBeVisible();
			await expect(
				history.getByTestId('tracker-history-event').filter({ hasText: `added step ${stepName}` })
			).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});
