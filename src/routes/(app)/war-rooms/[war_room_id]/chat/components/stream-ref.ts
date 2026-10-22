import {
	ClipboardCheckIcon,
	ClipboardListIcon,
	FileTextIcon,
	FileSearchIcon,
	FilesIcon,
	ShieldAlertIcon,
	WaypointsIcon
} from 'lucide-svelte';
import { trackerTabKey } from '$lib/services/war-room-trackers.service';

/**
 * Where a stream row's `(ref_type, ref_id)` pointer leads. `href` is empty
 * for self-referential rows (the war room, the chat itself): they get a
 * badge, not a link to the page the operator is already on.
 */
export type StreamRef = {
	href: string;
	label: string;
	Icon: typeof FileTextIcon;
	cls: string;
};

export const resolveStreamRef = (
	warRoomId: number,
	refType: string | null,
	refId: number | null,
	refCaseId: number | null
): StreamRef | null => {
	if (refType === 'sitrep' && refId != null) {
		return {
			href: `/war-rooms/${warRoomId}/sitreps?sitrep=${refId}`,
			label: `SitRep #${refId}`,
			Icon: FilesIcon,
			cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200'
		};
	}
	if (refType === 'war_room_task' && refId != null) {
		return {
			href: `/war-rooms/${warRoomId}/tasks#${refId}`,
			label: `Task #${refId}`,
			Icon: ClipboardListIcon,
			cls: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-200'
		};
	}
	if (refType === 'war_room_decision' && refId != null) {
		return {
			href: `/war-rooms/${warRoomId}/decisions?d=${refId}`,
			label: 'Decision',
			Icon: ClipboardListIcon,
			cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
		};
	}
	if (refType === 'war_room_note' && refId != null) {
		return {
			href: `/war-rooms/${warRoomId}/notes/${refId}`,
			label: `Note #${refId}`,
			Icon: FileTextIcon,
			cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200'
		};
	}
	if (refType === 'war_room_tracker' && refId != null) {
		return {
			href: `/war-rooms/${warRoomId}/scope?tab=${trackerTabKey(refId)}`,
			label: 'Tracker',
			Icon: ClipboardCheckIcon,
			cls: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:border-teal-400/40 dark:bg-teal-500/15 dark:text-teal-200'
		};
	}
	if (refType === 'case' && (refId != null || refCaseId != null)) {
		const id = refId ?? refCaseId;
		return {
			href: `/case/${id}`,
			label: `Case #${id}`,
			Icon: WaypointsIcon,
			cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
		};
	}
	// `user_activity` is the live-merged case-activity firehose — its
	// ref points at a UserActivity row, but the meaningful jump is to
	// the case itself. Use ref_case_id as the link target.
	if (refType === 'user_activity' && refCaseId != null) {
		return {
			href: `/case/${refCaseId}`,
			label: `Case #${refCaseId}`,
			Icon: WaypointsIcon,
			cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
		};
	}
	// `war_room` refs (state, priority) point at the room itself —
	// rendered as a non-clickable chip so the operator sees the type
	// without offering a useless link to the page they're already on.
	if (refType === 'war_room') {
		return {
			href: '',
			label: 'War room',
			Icon: ShieldAlertIcon,
			cls: 'border-border bg-muted/60 text-muted-foreground'
		};
	}
	if (refType === 'war_room_chat') {
		// `/note`, `/pin`, `/decision` rows all point at the chat
		// itself — also a non-link chip to avoid a self-link.
		return {
			href: '',
			label: 'Stream',
			Icon: FileSearchIcon,
			cls: 'border-border bg-muted/60 text-muted-foreground'
		};
	}
	return null;
};
