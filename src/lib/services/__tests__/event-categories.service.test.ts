import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { EventCategoriesService } from '../event-categories.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type { EventCategory } from '../event-categories.service';

describe('EventCategoriesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() unwraps the paginated envelope and asks for every category', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const categories: EventCategory[] = [{ id: 1, name: 'Unspecified' }];

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/event-categories?per_page=10000'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { total: 1, data: categories, last_page: 1, current_page: 1, next_page: null }
		});

		const res = await EventCategoriesService.list(options);

		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/event-categories', {
			per_page: 10000
		});
		expect(ApiService.get).toHaveBeenCalledWith('/manage/event-categories?per_page=10000', options);
		expect(res.ok).toBe(true);
		expect(res.data).toEqual(categories);
	});

	it('list() returns an empty list on failure', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 500,
			data: 'boom'
		});

		const res = await EventCategoriesService.list();

		expect(res.ok).toBe(false);
		expect(res.data).toEqual([]);
	});
});
