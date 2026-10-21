/** War-room datastore REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomDatastoreFile {
	file_id: number;
	war_room_id: number;
	filename: string;
	description: string | null;
	size_bytes: number;
	mime_type: string | null;
	sha256: string | null;
	uploaded_at: string | null;
	uploaded_by_id: number | null;
	tags: string | null;
	/** Folder holding the file, null for the root. */
	file_parent_id: number | null;
}

export interface WarRoomDatastoreListing {
	files: WarRoomDatastoreFile[];
	attached_case_ids: number[];
}

export interface WarRoomDatastoreFolder {
	path_id: number;
	path_name: string;
	path_parent_id: number | null;
	path_is_root: boolean;
	war_room_id: number;
}

// Same shape as the case datastore tree: folders under `d-<id>` keys with
// `children`, files under `f-<id>` keys.
export type WarRoomDatastoreTreeNode =
	| { type: 'directory'; name: string; is_root?: boolean; children: WarRoomDatastoreTree }
	| ({ type: 'file' } & WarRoomDatastoreFile);

export type WarRoomDatastoreTree = Record<string, WarRoomDatastoreTreeNode>;

export interface WarRoomDatastoreFileFields {
	filename?: string;
	description?: string;
	tags?: string;
}

// FormData requests bypass ApiService (which forces JSON); we mirror the
// pattern used by case-datastore.service.ts so the auth header, base
// URL, and RequestResponse shape stay consistent across the SPA.
const multipart = async <T>(url: string, formData: FormData): Promise<RequestResponse<T>> => {
	const { auth } = await import('$lib/stores/auth.store');
	const { AuthService } = await import('./auth.service');
	const { browser } = await import('$app/environment');
	const { apiOrigin } = await import('$lib/config/api.config');

	if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
		await AuthService.refreshToken();
	}

	const baseUrl = apiOrigin();
	const fullUrl = `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;

	const headers: Record<string, string> = { Accept: 'application/json' };
	const token = auth.getAccessToken();
	if (token) headers.Authorization = `Bearer ${token}`;

	const response = await (browser ? window.fetch : global.fetch)(fullUrl, {
		method: 'POST',
		headers,
		body: formData
	});

	let data: T | string | null = null;
	try {
		const ct = response.headers.get('content-type') ?? '';
		if (ct.includes('application/json')) {
			data = (await response.json()) as T;
		} else {
			data = await response.text();
		}
	} catch {
		data = null;
	}

	return { data, status: response.status, headers: response.headers, ok: response.ok };
};

export class WarRoomDatastoreService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreListing>> {
		return ApiService.get(`/war-rooms/${warRoomId}/datastore`, options);
	}

	static upload(
		warRoomId: number,
		file: File,
		extras: { description?: string; tags?: string } = {}
	): Promise<RequestResponse<WarRoomDatastoreFile>> {
		const form = new FormData();
		form.append('file', file, file.name);
		if (extras.description) form.append('description', extras.description);
		if (extras.tags) form.append('tags', extras.tags);
		return multipart<WarRoomDatastoreFile>(`/api/v2/war-rooms/${warRoomId}/datastore`, form);
	}

	static downloadUrl(warRoomId: number, fileId: number): string {
		return `/api/v2/war-rooms/${warRoomId}/datastore/${fileId}/content`;
	}

	// Same shapes as `CaseDatastoreService.getViewUrl` / `getMarkdownLink`:
	// pasted into a note, the markdown renderer fetches them with the
	// bearer token.
	static getViewUrl(warRoomId: number, fileId: number): string {
		const path = WarRoomDatastoreService.downloadUrl(warRoomId, fileId);
		if (typeof window === 'undefined') return path;
		const base = (ApiService.baseUrl ?? '').replace(/\/$/, '');
		return base ? `${base}${path}` : path;
	}

	static getMarkdownLink(warRoomId: number, fileId: number, label: string): string {
		const safeLabel = label.replace(/[[\]]/g, '');
		return `[${safeLabel}](${WarRoomDatastoreService.getViewUrl(warRoomId, fileId)})`;
	}

	/**
	 * Fetch a file's bytes with the current bearer token and return an
	 * object URL suitable for `<img src>` or `<a href download>`. The
	 * caller is responsible for `URL.revokeObjectURL(...)` when the
	 * element goes away — otherwise the blob leaks.
	 */
	static async fetchFileBlobUrl(warRoomId: number, fileId: number): Promise<string | null> {
		const { auth } = await import('$lib/stores/auth.store');
		const { AuthService } = await import('./auth.service');
		const { browser } = await import('$app/environment');
		const { apiOrigin } = await import('$lib/config/api.config');

		if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
			await AuthService.refreshToken();
		}

		const baseUrl = apiOrigin();
		const fullUrl = `${baseUrl}/api/v2/war-rooms/${warRoomId}/datastore/${fileId}/content`;
		const headers: Record<string, string> = {};
		const token = auth.getAccessToken();
		if (token) headers.Authorization = `Bearer ${token}`;
		try {
			const resp = await (browser ? window.fetch : global.fetch)(fullUrl, { headers });
			if (!resp.ok) return null;
			const blob = await resp.blob();
			return URL.createObjectURL(blob);
		} catch {
			return null;
		}
	}

	static remove(
		warRoomId: number,
		fileId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/datastore/${fileId}`, options);
	}

	// ------------------------------------------------------------------
	// Folders — same endpoints and bodies as the case datastore.
	// ------------------------------------------------------------------
	static getTree(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreTree>> {
		return ApiService.get(`/war-rooms/${warRoomId}/datastore/tree`, options);
	}

	static createFolder(
		warRoomId: number,
		body: { parent_node: number; folder_name: string },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreFolder>> {
		return ApiService.post(`/war-rooms/${warRoomId}/datastore/folders`, body, options);
	}

	static renameFolder(
		warRoomId: number,
		folderId: number,
		body: { folder_name: string },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreFolder>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/datastore/folders/${folderId}/rename`,
			body,
			options
		);
	}

	static moveFolder(
		warRoomId: number,
		folderId: number,
		body: { destination_node: number },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreFolder>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/datastore/folders/${folderId}/move`,
			body,
			options
		);
	}

	static deleteFolder(
		warRoomId: number,
		folderId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/datastore/folders/${folderId}`,
			options
		);
	}

	static uploadToFolder(
		warRoomId: number,
		folderId: number,
		file: File,
		fields: WarRoomDatastoreFileFields = {}
	): Promise<RequestResponse<WarRoomDatastoreFile>> {
		const form = new FormData();
		form.append('file', file, file.name);
		if (fields.filename) form.append('filename', fields.filename);
		if (fields.description) form.append('description', fields.description);
		if (fields.tags) form.append('tags', fields.tags);
		return multipart<WarRoomDatastoreFile>(
			`/api/v2/war-rooms/${warRoomId}/datastore/folders/${folderId}/files`,
			form
		);
	}

	/** Fields left undefined are left as they are; `file` replaces the contents. */
	static updateFile(
		warRoomId: number,
		fileId: number,
		fields: WarRoomDatastoreFileFields,
		file?: File
	): Promise<RequestResponse<WarRoomDatastoreFile>> {
		const form = new FormData();
		for (const [key, value] of Object.entries(fields)) {
			if (value !== undefined) form.append(key, value);
		}
		if (file) form.append('file', file, file.name);
		return multipart<WarRoomDatastoreFile>(
			`/api/v2/war-rooms/${warRoomId}/datastore/${fileId}`,
			form
		);
	}

	static moveFile(
		warRoomId: number,
		fileId: number,
		body: { destination_node: number },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreFile>> {
		return ApiService.post(`/war-rooms/${warRoomId}/datastore/${fileId}/move`, body, options);
	}
}
