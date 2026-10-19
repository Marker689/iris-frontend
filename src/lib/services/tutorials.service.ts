import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { Tutorial, TutorialStep } from '$lib/tutorials/types';

/** A tutorial written by an administrator in Settings → Tutorials. */
export interface CustomTutorial {
	id: number;
	title: string;
	summary: string;
	duration: string;
	/** Same shape as the built-in steps, except paths are always strings. */
	steps: TutorialStep[];
	published: boolean;
	/**
	 * Set when this is an administrator's version of a built-in tutorial
	 * (`overrides.ts`). Fixed at creation.
	 */
	builtin_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface CustomTutorialBody {
	title?: string;
	summary?: string;
	duration?: string;
	steps?: TutorialStep[];
	published?: boolean;
	/** Only read on creation. */
	builtin_id?: string | null;
}

/** Engine ids of custom tutorials, kept apart from the built-in ones. */
export const CUSTOM_TUTORIAL_PREFIX = 'custom-';

export const customTutorialId = (id: number): string => `${CUSTOM_TUTORIAL_PREFIX}${id}`;

export const toEngineTutorial = (custom: CustomTutorial): Tutorial => ({
	id: customTutorialId(custom.id),
	title: custom.title,
	summary: custom.summary,
	duration: custom.duration,
	steps: custom.steps
});

export class TutorialsService {
	/**
	 * Published tutorials, for the catalogue, and the versions of built-in
	 * ones even unpublished (without steps). Any authenticated user can
	 * read this.
	 */
	static async listPublished(options: ApiOptions = {}): Promise<RequestResponse<CustomTutorial[]>> {
		return ApiService.get<CustomTutorial[]>(`/manage/tutorials/published`, options);
	}

	/** Admin-only. Drafts included. */
	static async list(options: ApiOptions = {}): Promise<RequestResponse<CustomTutorial[]>> {
		return ApiService.get<CustomTutorial[]>(`/manage/tutorials`, options);
	}

	static async get(id: number, options: ApiOptions = {}): Promise<RequestResponse<CustomTutorial>> {
		return ApiService.get<CustomTutorial>(`/manage/tutorials/${id}`, options);
	}

	static async create(
		body: CustomTutorialBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomTutorial>> {
		return ApiService.post<CustomTutorial>(`/manage/tutorials`, body, options);
	}

	static async update(
		id: number,
		body: CustomTutorialBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomTutorial>> {
		return ApiService.put<CustomTutorial>(`/manage/tutorials/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/tutorials/${id}`, options);
	}
}
