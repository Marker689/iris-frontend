/**
 * Page state of a categorised list (war rooms, AI workflows): the
 * categories of the kind, the selected filter (kept per browser) and
 * the create / rename / delete actions with their toasts. Moving an
 * object stays with the page, which owns the objects.
 */
import { toast } from '$lib/components/ui/toast';
import {
	CategoriesService,
	type Category,
	type CategoryFilter,
	type CategoryKind
} from '$lib/services/categories.service';

const message = (data: unknown, fallback: string) =>
	typeof data === 'string' && data ? data : fallback;

export class CategoryState {
	categories = $state<Category[]>([]);
	filter = $state<CategoryFilter>('all');
	readonly kind: CategoryKind;
	readonly #storageKey: string;

	constructor(kind: CategoryKind) {
		this.kind = kind;
		this.#storageKey = `iris_${kind}_category`;
	}

	/** Fetch the categories and restore the stored filter if still valid. */
	async load() {
		const res = await CategoriesService.list(this.kind);
		if (res.ok && Array.isArray(res.data)) this.categories = res.data;
		const stored = localStorage.getItem(this.#storageKey);
		if (stored === 'all' || stored === 'none') this.filter = stored;
		else if (stored && this.categories.some((c) => c.id === Number(stored))) {
			this.filter = Number(stored);
		} else this.filter = 'all';
	}

	select(filter: CategoryFilter) {
		this.filter = filter;
		localStorage.setItem(this.#storageKey, String(filter));
	}

	name(id: number | null | undefined) {
		return id == null ? null : (this.categories.find((c) => c.id === id)?.name ?? null);
	}

	#sort() {
		this.categories = [...this.categories].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
	}

	async create(name: string): Promise<Category | null> {
		const res = await CategoriesService.create(this.kind, { name });
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not create the category',
				description: message(res.data, res.error?.message ?? 'Unknown error'),
				variant: 'destructive'
			});
			return null;
		}
		this.categories = [...this.categories, res.data];
		this.#sort();
		return res.data;
	}

	async rename(category: Category, name: string): Promise<boolean> {
		const res = await CategoriesService.rename(this.kind, category.id, { name });
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Could not rename the category',
				description: message(res.data, res.error?.message ?? 'Unknown error'),
				variant: 'destructive'
			});
			return false;
		}
		const renamed = res.data;
		this.categories = this.categories.map((c) => (c.id === category.id ? renamed : c));
		this.#sort();
		return true;
	}

	async remove(category: Category): Promise<boolean> {
		const res = await CategoriesService.remove(this.kind, category.id);
		if (!res.ok) {
			toast({
				title: 'Could not delete the category',
				description: message(res.data, res.error?.message ?? 'Unknown error'),
				variant: 'destructive'
			});
			return false;
		}
		this.categories = this.categories.filter((c) => c.id !== category.id);
		if (this.filter === category.id) this.select('all');
		toast({ title: `Category "${category.name}" deleted` });
		return true;
	}
}
