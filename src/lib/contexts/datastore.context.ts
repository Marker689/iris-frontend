/**
 * What the datastore tree, its menus and its dialogs need from a
 * datastore. The case datastore and the war-room datastore both provide
 * it, so the war room gets the same folders, moves, uploads and edits as
 * a case. `kind` hides what only exists on cases (IOC / evidence flags,
 * encryption password, manual hooks).
 */
import type { ApiOptions } from '$lib/services/api.service';
import type {
	CreateFolderBody,
	RenameFolderBody,
	UpdateFileMetadataFields,
	UploadFileFields
} from '$lib/services/case-datastore.service';
import type { DataStoreFile, DataStoreTree } from '$lib/types/resources/datastore';

// The datastore the dialogs act on. Distinct from CASE_DATASTORE_CTX,
// which case-only consumers (markdown editor, quick-add) read.
export const DATASTORE_CTX = Symbol('datastore');

export type DatastoreUIState = {
	selectedFolderId?: number;
	selectedFileId?: number;
	showAddFileModal: boolean;
	showAddFolderModal: boolean;
};

export interface DatastoreContext {
	kind: 'case' | 'war-room';
	tree: {
		data: DataStoreTree;
		rootId: number | null;
		status: 'idle' | 'loading' | 'error';
		error: string | null;
	};
	fileById: Record<number, DataStoreFile>;
	ui: DatastoreUIState;
	loadTree: (options?: ApiOptions) => Promise<void>;
	createFolder: (body: CreateFolderBody, options?: ApiOptions) => Promise<unknown>;
	renameFolder: (
		folderId: number,
		body: RenameFolderBody,
		options?: ApiOptions
	) => Promise<boolean>;
	moveFolder: (folderId: number, destinationNode: number, options?: ApiOptions) => Promise<boolean>;
	deleteFolder: (folderId: number, options?: ApiOptions) => Promise<boolean>;
	uploadFile: (
		folderId: number,
		fields: UploadFileFields,
		file: File
	) => Promise<DataStoreFile | null>;
	updateFile: (
		fileId: number,
		fields: UpdateFileMetadataFields,
		file?: File
	) => Promise<DataStoreFile | null>;
	moveFile: (fileId: number, destinationNode: number, options?: ApiOptions) => Promise<boolean>;
	deleteFile: (fileId: number, options?: ApiOptions) => Promise<boolean>;
	selectFile: (id?: number) => void;
	/** Blob URL of the file fetched with the bearer token, for preview / download. */
	fetchFileBlobUrl: (fileId: number) => Promise<{ url: string; filename: string | null } | null>;
	/** Link that pastes into notes, summaries and sitreps. */
	getViewUrl: (fileId: number) => string;
	getMarkdownLink: (fileId: number, label: string) => string;
}
