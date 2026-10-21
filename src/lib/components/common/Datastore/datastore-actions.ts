/**
 * File actions shared by the case and war-room datastore panels, so both
 * behave the same: open / save a file fetched with the bearer token, copy
 * the links that paste into notes, summaries and sitreps (the markdown
 * renderer turns them into an authenticated image or file chip), and
 * upload dropped files into a datastore folder.
 */
import type { DatastoreContext } from '$lib/contexts/datastore.context';
import { toast } from '$lib/stores/toast.store';

export const datastoreCopyToClipboard = async (text: string, label: string): Promise<void> => {
	try {
		await navigator.clipboard.writeText(text);
		toast({ title: `${label} copied`, variant: 'success' });
	} catch {
		toast({ title: 'Copy failed', variant: 'destructive' });
	}
};

// Plain links only work where the reader performs its own authenticated
// fetch, so preview and download go through a blob URL instead.
export const datastoreOpenBlobUrl = (url: string | null): void => {
	if (!url) {
		toast({
			title: 'Could not open file',
			description: 'The server rejected the request.',
			variant: 'destructive'
		});
		return;
	}
	const w = window.open(url, '_blank', 'noopener');
	// Revoke after the new tab has had a chance to take ownership of the
	// blob URL. 60s is generous and avoids the tab losing the resource if
	// the user takes a moment to focus it.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
	if (!w) {
		toast({ title: 'Pop-up blocked', variant: 'warning' });
	}
};

export const datastoreDownloadBlobUrl = (url: string | null, filename: string): void => {
	if (!url) {
		toast({
			title: 'Could not download file',
			description: 'The server rejected the request.',
			variant: 'destructive'
		});
		return;
	}
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
};

export const datastoreUploadFiles = async (
	datastore: DatastoreContext,
	folderId: number,
	files: FileList
): Promise<void> => {
	// Sequential uploads keep the toast count and error reporting clear,
	// and avoid hammering the server with N concurrent multipart writes.
	let ok = 0;
	let failed = 0;
	for (const file of Array.from(files)) {
		const created = await datastore.uploadFile(folderId, { file_original_name: file.name }, file);
		if (created) ok++;
		else failed++;
	}
	if (ok > 0) {
		toast({ title: `Uploaded ${ok} file${ok === 1 ? '' : 's'}`, variant: 'success' });
	}
	if (failed > 0) {
		toast({
			title: `Failed to upload ${failed} file${failed === 1 ? '' : 's'}`,
			variant: 'destructive'
		});
	}
};
