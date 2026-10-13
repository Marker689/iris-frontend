import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/case.service', () => ({
	CaseService: {
		list: vi.fn(),
		filter: vi.fn(),
		get: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/services/case-states.service', async () => {
	// `findStateIdByName` is a pure helper covered by its own service test —
	// keep the real one so this suite exercises the actual name→id lookup.
	const actual = await vi.importActual<typeof import('$lib/services/case-states.service')>(
		'$lib/services/case-states.service'
	);

	return {
		...actual,
		CaseStatesService: { list: vi.fn() }
	};
});

vi.mock('$lib/services/cases-filters.service', () => ({
	CasesFiltersService: {
		list: vi.fn(),
		get: vi.fn(),
		create: vi.fn(),
		remove: vi.fn()
	}
}));

const { CaseService } = await import('$lib/services/case.service');
const { createCasesContext } = await import('../cases.context.svelte');

const update = vi.mocked(CaseService.update);
const get = vi.mocked(CaseService.get);
const list = vi.mocked(CaseService.list);

// `createCasesContext` only reads `app.state.currentCaseID`.
const appStub = { state: { currentCaseID: 73 } } as never;

const makeContext = () => createCasesContext((c) => (c as { case_id: number }).case_id, appStub);

const stored = { case_id: 73, case_name: 'Case 73', case_description: 'saved' };

beforeEach(() => {
	vi.clearAllMocks();
	get.mockResolvedValue({ ok: true, error: undefined, data: stored } as never);
	list.mockResolvedValue({ ok: true, error: undefined, data: { data: [] } } as never);
});

describe('cases context — patch', () => {
	it('clears the mutation error when the update is stored', async () => {
		const cases = makeContext();
		cases.mutation.error = 'previous failure';
		update.mockResolvedValue({
			ok: true,
			error: undefined,
			data: { ...stored, case_description: 'new' }
		} as never);

		const result = await cases.patch(73, { case_description: 'new' });

		expect(cases.mutation.error).toBeNull();
		expect(result?.case_description).toBe('new');
	});

	it('reports a failed update even though it returns the stored case', async () => {
		// Callers such as the case summary must not mark their content as
		// saved because a case came back
		const cases = makeContext();
		update.mockResolvedValue({
			ok: false,
			error: { message: 'Forbidden' },
			data: null
		} as never);

		const result = await cases.patch(73, { case_description: 'new' });

		expect(cases.mutation.error).toBe('Forbidden');
		expect(result?.case_description).toBe('saved');
	});
});
