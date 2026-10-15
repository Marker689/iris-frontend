import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	CategoriesService,
	categoryMatches,
	countByCategory,
	effectiveCategoryId,
	type Category
} from '../categories.service';
import { ApiService } from '../api.service';

const category = (id: number, name = `Cat ${id}`): Category => ({
	id,
	name,
	created_at: null,
	created_by_id: null
});

const categories = [category(1, 'Phishing'), category(2, 'Ransomware')];

describe('CategoriesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('lists the categories of a kind', async () => {
		await CategoriesService.list('war-rooms');
		expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/categories', {});
		await CategoriesService.list('ai-workflows');
		expect(ApiService.get).toHaveBeenCalledWith('/ai-workflows/categories', {});
	});

	it('creates, renames and deletes a category', async () => {
		await CategoriesService.create('war-rooms', { name: 'Phishing' });
		expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/categories', { name: 'Phishing' }, {});
		await CategoriesService.rename('ai-workflows', 4, { name: 'Triage' });
		expect(ApiService.patch).toHaveBeenCalledWith(
			'/ai-workflows/categories/4',
			{ name: 'Triage' },
			{}
		);
		await CategoriesService.remove('war-rooms', 4);
		expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/categories/4', {});
	});

	it('forwards options', async () => {
		const options = { skipAuthRedirect: true };
		await CategoriesService.list('war-rooms', options);
		expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/categories', options);
	});
});

describe('effectiveCategoryId', () => {
	it('keeps a known category', () => {
		expect(effectiveCategoryId(2, categories)).toBe(2);
	});

	it('is null for none or an unknown (deleted) category', () => {
		expect(effectiveCategoryId(null, categories)).toBeNull();
		expect(effectiveCategoryId(undefined, categories)).toBeNull();
		expect(effectiveCategoryId(9, categories)).toBeNull();
	});
});

describe('categoryMatches', () => {
	it('matches everything under all', () => {
		expect(categoryMatches('all', 1, categories)).toBe(true);
		expect(categoryMatches('all', null, categories)).toBe(true);
	});

	it('matches the uncategorised, unknown categories included, under none', () => {
		expect(categoryMatches('none', null, categories)).toBe(true);
		expect(categoryMatches('none', 9, categories)).toBe(true);
		expect(categoryMatches('none', 1, categories)).toBe(false);
	});

	it('matches only its own category under a category', () => {
		expect(categoryMatches(1, 1, categories)).toBe(true);
		expect(categoryMatches(1, 2, categories)).toBe(false);
		expect(categoryMatches(1, null, categories)).toBe(false);
	});
});

describe('countByCategory', () => {
	it('counts per category, unknown categories as uncategorised', () => {
		const items = [
			{ category_id: 1 },
			{ category_id: 1 },
			{ category_id: 2 },
			{ category_id: null },
			{},
			{ category_id: 9 }
		];
		expect(countByCategory(items, categories)).toEqual({ none: 3, byId: { 1: 2, 2: 1 } });
	});

	it('is empty for no items', () => {
		expect(countByCategory([], categories)).toEqual({ none: 0, byId: {} });
	});
});
