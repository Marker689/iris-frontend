import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type EventCategoryIdentifier = number;

export interface EventCategory {
	id: number;
	name: string;
}

type PaginatedEnvelope<T> = {
	data: T;
	total?: number;
};

export class EventCategoriesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<EventCategory[]>> {
		// The v2 endpoint returns a paginated envelope (`{total, data, ...}`)
		// and pages by 10 by default — fewer than the seeded categories.
		const url = ApiService.withQuery('/manage/event-categories', { per_page: 10000 });
		const res = await ApiService.get<PaginatedEnvelope<EventCategory[]>>(url, options);

		if (
			res.ok &&
			res.data !== null &&
			typeof res.data === 'object' &&
			Array.isArray(res.data.data)
		) {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}
}
