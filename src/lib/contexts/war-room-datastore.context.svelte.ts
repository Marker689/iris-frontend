/**
 * War-room datastore context — same contract as the case datastore
 * context (`DatastoreContext`), so the war room reuses the case tree,
 * menus, dialogs and drag-and-drop. The war-room API speaks its own field
 * names (`filename`, `size_bytes`, …); they are mapped to the case
 * `DataStoreFile` shape here so the shared components need no branching
 * beyond `kind`.
 */
import type { ApiOptions, RequestResponse } from '$lib/services/api.service';
import type { DatastoreContext, DatastoreUIState } from '$lib/contexts/datastore.context';
import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';
import type {
	WarRoomDatastoreFile,
	WarRoomDatastoreTree
} from '$lib/services/war-room-datastore.service';
import type {
	CreateFolderBody,
	RenameFolderBody,
	UpdateFileMetadataFields,
	UploadFileFields
} from '$lib/services/case-datastore.service';
import type { DataStoreFile, DataStoreTree } from '$lib/types/resources/datastore';

type Status = 'idle' | 'loading' | 'error';

const toDataStoreFile = (file: WarRoomDatastoreFile, rootId: number): DataStoreFile => ({
	file_id: file.file_id,
	file_uuid: '',
	file_original_name: file.filename,
	file_description: file.description,
	file_date_added: file.uploaded_at,
	file_tags: file.tags,
	file_size: file.size_bytes,
	file_is_ioc: null,
	file_is_evidence: null,
	file_password: null,
	file_parent_id: file.file_parent_id ?? rootId,
	file_sha256: file.sha256,
	added_by_user_id: file.uploaded_by_id,
	file_case_id: null,
	modification_history: null
});

const toDataStoreTree = (tree: WarRoomDatastoreTree, rootId: number): DataStoreTree => {
	const out: DataStoreTree = {};
	for (const [key, node] of Object.entries(tree)) {
		if (node.type === 'directory') {
			out[key] = { ...node, children: toDataStoreTree(node.children, rootId) };
		} else {
			out[key] = { type: 'file', ...toDataStoreFile(node, rootId) };
		}
	}
	return out;
};

const collectFiles = (tree: DataStoreTree): DataStoreFile[] => {
	const out: DataStoreFile[] = [];
	const walk = (subtree: DataStoreTree) => {
		for (const node of Object.values(subtree)) {
			if (node.type === 'file') out.push(node as DataStoreFile);
			else walk(node.children);
		}
	};
	walk(tree);
	return out;
};

// Backend may wrap payloads in { data } — accept both.
const unwrap = <T>(res: RequestResponse<T>): T | null => {
	if (!res.ok || res.data === null || typeof res.data === 'string') return null;
	const payload = res.data as unknown as { data?: T } | T;
	return payload && typeof payload === 'object' && 'data' in payload && payload.data
		? (payload.data as T)
		: (payload as T);
};

export const createWarRoomDatastoreContext = (
	getWarRoomId: () => number | null
): DatastoreContext => {
	const tree = $state<{
		data: DataStoreTree;
		rootId: number | null;
		status: Status;
		error: string | null;
	}>({
		data: {},
		rootId: null,
		status: 'idle',
		error: null
	});

	const fileById = $state<Record<number, DataStoreFile>>({});

	const ui = $state<DatastoreUIState>({
		selectedFolderId: undefined,
		selectedFileId: undefined,
		showAddFileModal: false,
		showAddFolderModal: false
	});

	const loadTree = async (options: ApiOptions = {}) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) {
			tree.status = 'error';
			tree.error = 'Missing war room id';
			return;
		}

		tree.status = 'loading';
		tree.error = null;

		const res = await WarRoomDatastoreService.getTree(warRoomId, options);
		const raw = unwrap(res);
		if (!raw) {
			tree.status = 'error';
			tree.error =
				res.status === 403
					? 'You do not have access to this war room'
					: res.status === 404
						? 'War room not found'
						: (res.error?.message ?? 'Failed to load datastore tree');
			return;
		}

		const rootKey = Object.keys(raw)[0];
		const rootId = rootKey ? Number(rootKey.replace('d-', '')) : null;
		const treeData = rootId === null ? {} : toDataStoreTree(raw, rootId);

		tree.data = treeData;
		tree.rootId = rootId;
		tree.status = 'idle';

		for (const id of Object.keys(fileById)) delete fileById[Number(id)];
		for (const f of collectFiles(treeData)) fileById[f.file_id] = f;
	};

	const createFolder = async (body: CreateFolderBody, options: ApiOptions = {}) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;
		const res = await WarRoomDatastoreService.createFolder(warRoomId, body, options);
		await loadTree(options);
		return unwrap(res);
	};

	const renameFolder = async (
		folderId: number,
		body: RenameFolderBody,
		options: ApiOptions = {}
	) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;
		const res = await WarRoomDatastoreService.renameFolder(warRoomId, folderId, body, options);
		await loadTree(options);
		return res.ok ?? false;
	};

	const moveFolder = async (
		folderId: number,
		destinationNode: number,
		options: ApiOptions = {}
	) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;
		const res = await WarRoomDatastoreService.moveFolder(
			warRoomId,
			folderId,
			{ destination_node: destinationNode },
			options
		);
		await loadTree(options);
		return res.ok ?? false;
	};

	const deleteFolder = async (folderId: number, options: ApiOptions = {}) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;
		const res = await WarRoomDatastoreService.deleteFolder(warRoomId, folderId, options);
		if (ui.selectedFolderId === folderId) ui.selectedFolderId = undefined;
		await loadTree(options);
		return res.ok ?? false;
	};

	const uploadFile = async (
		folderId: number,
		fields: UploadFileFields,
		file: File
	): Promise<DataStoreFile | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;
		const res = await WarRoomDatastoreService.uploadToFolder(warRoomId, folderId, file, {
			filename: fields.file_original_name,
			description: fields.file_description,
			tags: fields.file_tags
		});
		await loadTree();
		const created = unwrap(res);
		if (!created) return null;
		ui.selectedFileId = created.file_id;
		return fileById[created.file_id] ?? toDataStoreFile(created, tree.rootId ?? folderId);
	};

	const updateFile = async (
		fileId: number,
		fields: UpdateFileMetadataFields,
		file?: File
	): Promise<DataStoreFile | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;
		const res = await WarRoomDatastoreService.updateFile(
			warRoomId,
			fileId,
			{
				filename: fields.file_original_name,
				description: fields.file_description,
				tags: fields.file_tags
			},
			file
		);
		await loadTree();
		const updated = unwrap(res);
		if (!updated) return null;
		return fileById[updated.file_id] ?? toDataStoreFile(updated, tree.rootId ?? 0);
	};

	const moveFile = async (fileId: number, destinationNode: number, options: ApiOptions = {}) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;
		const res = await WarRoomDatastoreService.moveFile(
			warRoomId,
			fileId,
			{ destination_node: destinationNode },
			options
		);
		await loadTree(options);
		return res.ok ?? false;
	};

	const deleteFile = async (fileId: number, options: ApiOptions = {}) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;
		const res = await WarRoomDatastoreService.remove(warRoomId, fileId, options);
		if (ui.selectedFileId === fileId) ui.selectedFileId = undefined;
		await loadTree(options);
		return res.ok ?? false;
	};

	const selectFile = (id?: number) => {
		ui.selectedFileId = id;
	};

	const fetchFileBlobUrl = async (fileId: number) => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;
		const url = await WarRoomDatastoreService.fetchFileBlobUrl(warRoomId, fileId);
		return url ? { url, filename: fileById[fileId]?.file_original_name ?? null } : null;
	};

	const getViewUrl = (fileId: number) =>
		WarRoomDatastoreService.getViewUrl(getWarRoomId() ?? 0, fileId);

	const getMarkdownLink = (fileId: number, label: string) =>
		WarRoomDatastoreService.getMarkdownLink(getWarRoomId() ?? 0, fileId, label);

	return {
		kind: 'war-room',
		tree,
		fileById,
		ui,
		loadTree,
		createFolder,
		renameFolder,
		moveFolder,
		deleteFolder,
		uploadFile,
		updateFile,
		moveFile,
		deleteFile,
		selectFile,
		fetchFileBlobUrl,
		getViewUrl,
		getMarkdownLink
	};
};
