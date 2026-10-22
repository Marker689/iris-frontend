import {
	AlertCircle,
	AlertOctagon,
	ClipboardCheck,
	Clock,
	Crosshair,
	Database,
	FileText,
	Folder,
	Gavel,
	ListChecks,
	Pin,
	Settings2,
	Share2,
	ShieldAlert,
	StickyNote,
	Users,
	UsersRound,
	WaypointsIcon,
	RadioTower,
	Link
} from 'lucide-svelte';
import type { ChatMessageKind } from '$lib/services/war-room-chat.service';
import { warRoomActivityFamily } from '$lib/utils/war-room-stream';
import type { StreamLaneKey } from './activity-rail';

const ROOM_ACTIVITY_ICONS: Record<string, typeof Users> = {
	room: Settings2,
	member: Users,
	team: UsersRound,
	note: StickyNote,
	folder: Folder,
	share: Share2,
	task: ListChecks,
	timeline: Clock,
	event: Clock,
	decision: Gavel,
	sitrep: FileText,
	scope: Crosshair,
	vulnerability: ShieldAlert,
	datastore: Database
};

const ROOM_ACTIVITY_COLORS: Record<string, string> = {
	member: 'text-violet-600 dark:text-violet-400',
	team: 'text-violet-600 dark:text-violet-400',
	note: 'text-amber-600 dark:text-amber-400',
	folder: 'text-amber-600 dark:text-amber-400',
	share: 'text-amber-600 dark:text-amber-400',
	task: 'text-emerald-600 dark:text-emerald-400',
	decision: 'text-indigo-600 dark:text-indigo-400',
	sitrep: 'text-amber-600 dark:text-amber-400',
	vulnerability: 'text-red-600 dark:text-red-400'
};

export const systemIcon = (k: ChatMessageKind, activityType: string | null = null) => {
	switch (k) {
		case 'war_room_activity':
			return ROOM_ACTIVITY_ICONS[warRoomActivityFamily(activityType)] ?? Settings2;
		case 'task_assigned':
		case 'task_completed':
			return ListChecks;
		case 'case_attached':
		case 'case_detached':
		case 'case_activity':
			return WaypointsIcon;
		case 'sitrep_published':
			return FileText;
		case 'note':
			return StickyNote;
		case 'pin':
			return Pin;
		case 'decision':
			return Gavel;
		case 'tracker':
			return ClipboardCheck;
		case 'priority':
			return AlertOctagon;
		case 'system':
			return AlertCircle;
		default:
			return null;
	}
};

export const systemColor = (k: ChatMessageKind, activityType: string | null = null) => {
	switch (k) {
		case 'war_room_activity':
			return (
				ROOM_ACTIVITY_COLORS[warRoomActivityFamily(activityType)] ??
				'text-sky-600 dark:text-sky-400'
			);
		case 'task_assigned':
		case 'task_completed':
			return 'text-emerald-600 dark:text-emerald-400';
		case 'case_attached':
		case 'case_detached':
		case 'case_activity':
			return 'text-sky-600 dark:text-sky-400';
		case 'sitrep_published':
			return 'text-amber-600 dark:text-amber-400';
		case 'note':
			return 'text-amber-600 dark:text-amber-400';
		case 'pin':
			return 'text-violet-600 dark:text-violet-400';
		case 'decision':
			return 'text-indigo-600 dark:text-indigo-400';
		case 'tracker':
			return 'text-teal-600 dark:text-teal-400';
		case 'priority':
			return 'text-red-600 dark:text-red-400';
		default:
			return 'text-muted-foreground';
	}
};

/** Icon and tint of a whole lane, for the rail chips, strip and settings. */
export const LANE_ICONS: Record<StreamLaneKey, { Icon: typeof Users; color: string }> = {
	case_activity: { Icon: WaypointsIcon, color: 'text-sky-600 dark:text-sky-400' },
	room_activity: { Icon: RadioTower, color: 'text-muted-foreground' },
	tasks: { Icon: ListChecks, color: 'text-emerald-600 dark:text-emerald-400' },
	trackers: { Icon: ClipboardCheck, color: 'text-teal-600 dark:text-teal-400' },
	system: { Icon: AlertCircle, color: 'text-muted-foreground' },
	notes: { Icon: StickyNote, color: 'text-amber-600 dark:text-amber-400' },
	decisions: { Icon: Gavel, color: 'text-indigo-600 dark:text-indigo-400' },
	sitreps: { Icon: FileText, color: 'text-amber-600 dark:text-amber-400' },
	case_link: { Icon: Link, color: 'text-violet-600 dark:text-violet-400' }
};
