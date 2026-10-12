/**
 * "Copy link" / "Copy as markdown link" for datastore files, shared by
 * the case and war-room datastore panels so both paste the same thing
 * into notes, summaries and sitreps: the file's API URL, which the
 * markdown renderer turns into an authenticated image or file chip.
 */
import { toast } from '$lib/stores/toast.store';

export const datastoreCopyToClipboard = async (text: string, label: string): Promise<void> => {
	try {
		await navigator.clipboard.writeText(text);
		toast({ title: `${label} copied`, variant: 'success' });
	} catch {
		toast({ title: 'Copy failed', variant: 'destructive' });
	}
};
