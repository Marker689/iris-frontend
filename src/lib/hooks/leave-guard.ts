import { beforeNavigate } from '$app/navigation';

/**
 * Ask the user before they leave the page while `reason()` returns a
 * message. Call during component initialisation; the guard lives as long
 * as the component.
 *
 * In-app navigations get a confirm dialog showing the message. Closing or
 * reloading the tab gets the browser's own prompt instead, which can't
 * show custom text.
 */
export function guardLeave(reason: () => string | null) {
	beforeNavigate((navigation) => {
		const message = reason();
		if (!message) return;
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		if (navigation.to?.url.pathname === navigation.from?.url.pathname) return;
		if (!confirmLeave(message)) navigation.cancel();
	});
}

/**
 * Whether the user agrees to leave despite `reason`. True when there is
 * no reason to ask.
 */
export function confirmLeave(reason: string | null, question = 'Leave this page anyway?') {
	return !reason || confirm(`${reason}\n\n${question}`);
}

/**
 * The leave-guard message of a collaborative editor, or null when leaving
 * loses nothing.
 *
 * `unsynced`: edits the server hasn't stored yet, lost on leaving.
 * `unsaved`: edits made here since the last Save. They are stored, but
 * only Save records them as a revision.
 */
export function editorLeaveReason({ unsynced, unsaved }: { unsynced: boolean; unsaved: boolean }) {
	if (unsynced) {
		return 'Some of your latest edits have not reached the server yet and will be lost.';
	}
	if (unsaved) {
		return 'You have unsaved changes. They are kept in the document, but only Save records them as a revision.';
	}
	return null;
}
