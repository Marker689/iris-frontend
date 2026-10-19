import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEvent } from '$lib/services/api-events';

vi.mock('$app/environment', () => ({ browser: true }));

const STORAGE_KEY = 'iris_tutorial_recording';

const load = async () => {
	vi.resetModules();
	const [store, events] = await Promise.all([
		import('../tutorial-recorder.store.svelte'),
		import('$lib/services/api-events')
	]);
	return { recorder: store.tutorialRecorder, emit: events.emitApiEvent };
};

const post = (path: string, data: unknown = {}): ApiEvent => ({
	method: 'POST',
	path,
	status: 201,
	ok: true,
	data
});

beforeEach(() => {
	sessionStorage.clear();
	document.body.innerHTML = '';
});

describe('tutorial recorder', () => {
	it('records writes and pages with variables, then hands the steps to the editor', async () => {
		const { recorder, emit } = await load();
		recorder.start(7);
		recorder.observe('/cases');
		emit(post('/cases', { case_id: 12, client_id: 1 }));
		emit({ ...post('/cases/12'), method: 'GET' });
		recorder.observe('/case/12');
		recorder.observe('/case/12/iocs');
		emit(post('/cases/12/iocs', { ioc_id: 5 }));
		recorder.addExplanation(' Why ', ' Because ');

		expect(recorder.steps.map((s) => s.title)).toEqual([
			'Go to /cases',
			'Create cases',
			'Go to /case/{caseId}/iocs',
			'Create IOCs',
			'Why'
		]);

		expect(recorder.stop()).toBe(7);
		expect(recorder.recording).toBeNull();
		emit(post('/cases', { case_id: 13 }));

		expect(recorder.takeResult(8)).toEqual([]);
		const steps = recorder.takeResult(7);
		expect(steps[1].waitFor).toEqual({
			kind: 'api',
			method: 'POST',
			path: '/cases',
			capture: { caseId: 'case_id' }
		});
		expect(steps[2].goTo).toBe('/case/{caseId}/iocs');
		expect(steps[3].waitFor).toEqual({ kind: 'api', method: 'POST', path: '/cases/{caseId}/iocs' });
		expect(steps[4]).toEqual({ title: 'Why', body: 'Because' });
		expect(recorder.takeResult(7)).toEqual([]);
	});

	it('forgets what a page passed through had bound', async () => {
		const { recorder } = await load();
		recorder.start(1);
		recorder.observe('/case/4');
		recorder.observe('/case/5/iocs');
		expect(recorder.steps).toHaveLength(1);
		expect(recorder.steps[0].waitFor).toEqual({ kind: 'route', path: '/case/{caseId}/iocs' });
		expect(recorder.recording?.known).toEqual({ caseId: 5 });
	});

	it('ignores its own pages and the page it is already on', async () => {
		const { recorder } = await load();
		recorder.start(1);
		recorder.observe('/settings/tutorials/1');
		recorder.observe('/alerts');
		recorder.observe('/alerts?view=split');
		expect(recorder.steps.map((s) => s.title)).toEqual(['Go to /alerts']);
	});

	it('picks elements with a stable anchor only', async () => {
		const { recorder } = await load();
		document.body.innerHTML = '<button data-tour="case-new"><svg></svg></button><span>plain</span>';
		recorder.start(1);
		recorder.picking = true;
		expect(recorder.picking).toBe(true);
		expect(recorder.pick(document.querySelector('svg') as Element)).toBe(true);
		expect(recorder.picking).toBe(false);
		expect(recorder.pick(document.querySelector('span') as Element)).toBe(false);
		expect(recorder.steps).toEqual([{ title: 'Click here', body: '', anchor: 'case-new' }]);

		recorder.undo();
		expect(recorder.steps).toEqual([]);
	});

	it('cannot pick without a recording', async () => {
		const { recorder } = await load();
		recorder.picking = true;
		expect(recorder.picking).toBe(false);
	});

	it('survives a reload, and discarding leaves nothing behind', async () => {
		const first = await load();
		first.recorder.start(3);
		first.emit(post('/cases', { case_id: 12 }));

		const { recorder, emit } = await load();
		expect(recorder.recording).toBeNull();
		recorder.hydrate();
		expect(recorder.recording?.tutorialId).toBe(3);
		emit(post('/cases/12/tasks', { task_id: 2 }));
		expect(recorder.steps.map((s) => s.waitFor)).toEqual([
			{ kind: 'api', method: 'POST', path: '/cases', capture: { caseId: 'case_id' } },
			{
				kind: 'api',
				method: 'POST',
				path: '/cases/{caseId}/tasks',
				capture: { taskId: 'task_id' }
			}
		]);

		recorder.cancel();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(recorder.takeResult(3)).toEqual([]);
	});

	it('drops a corrupt recording', async () => {
		sessionStorage.setItem(STORAGE_KEY, '{"tutorialId": "x"}');
		const { recorder } = await load();
		recorder.hydrate();
		expect(recorder.recording).toBeNull();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
