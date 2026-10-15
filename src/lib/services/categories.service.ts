/**
 * Categories of war rooms (`/war-rooms/categories`) and AI workflows
 * (`/ai-workflows/categories`): one flat, shared list per kind. An
 * object is in at most one category (`category_id`, null for none).
 * Moving an object is on the object's own service (`setCategory`).
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CategoryKind = 'war-rooms' | 'ai-workflows';

export interface Category {
	id: number;
	name: string;
	created_at: string | null;
	created_by_id: number | null;
}

/** What a category list shows: everything, the uncategorised, or one category. */
export type CategoryFilter = 'all' | 'none' | number;

export interface CategoryBody {
	name: string;
}

const base = (kind: CategoryKind) => `/${kind}/categories`;

export class CategoriesService {
	static list(kind: CategoryKind, options: ApiOptions = {}): Promise<RequestResponse<Category[]>> {
		return ApiService.get<Category[]>(base(kind), options);
	}

	static create(
		kind: CategoryKind,
		body: CategoryBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Category>> {
		return ApiService.post<Category>(base(kind), body, options);
	}

	static rename(
		kind: CategoryKind,
		id: number,
		body: CategoryBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Category>> {
		return ApiService.patch<Category>(`${base(kind)}/${id}`, body, options);
	}

	static remove(
		kind: CategoryKind,
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${base(kind)}/${id}`, options);
	}
}

/**
 * The category an object shows under: null when it has none, or when
 * its category isn't in `categories` (deleted meanwhile — the server
 * shows it uncategorised on the next load).
 */
export function effectiveCategoryId(
	categoryId: number | null | undefined,
	categories: Category[]
): number | null {
	if (categoryId == null) return null;
	return categories.some((c) => c.id === categoryId) ? categoryId : null;
}

/** Whether an object with `categoryId` belongs under `filter`. */
export function categoryMatches(
	filter: CategoryFilter,
	categoryId: number | null | undefined,
	categories: Category[]
): boolean {
	if (filter === 'all') return true;
	const effective = effectiveCategoryId(categoryId, categories);
	return filter === 'none' ? effective === null : effective === filter;
}

/** Objects per category id, `none` for the uncategorised. */
export function countByCategory<T extends { category_id?: number | null }>(
	items: T[],
	categories: Category[]
): { none: number; byId: Record<number, number> } {
	const byId: Record<number, number> = {};
	let none = 0;
	for (const item of items) {
		const id = effectiveCategoryId(item.category_id, categories);
		if (id === null) none += 1;
		else byId[id] = (byId[id] ?? 0) + 1;
	}
	return { none, byId };
}
