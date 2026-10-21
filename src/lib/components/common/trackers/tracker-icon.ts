import {
	Bell,
	Building2,
	Calendar,
	ClipboardList,
	CircleDot,
	FileText,
	Folder,
	Globe,
	ListChecks,
	Lock,
	Mail,
	MessageSquare,
	Network,
	Phone,
	Send,
	Server,
	UserCheck,
	Users
} from 'lucide-svelte';
import { ASSET_FLAG_ICONS } from '$lib/components/common/assets/asset-flag-icon';

// Allow-list of the icons offered for tracker tabs and steps: the asset
// flag icons plus a few for communication and bookkeeping. Unknown names
// fall back to a neutral dot rather than resolving arbitrary input.
export const TRACKER_ICONS = {
	...ASSET_FLAG_ICONS,
	'list-checks': ListChecks,
	'clipboard-list': ClipboardList,
	mail: Mail,
	send: Send,
	phone: Phone,
	'message-square': MessageSquare,
	bell: Bell,
	users: Users,
	'user-check': UserCheck,
	'building-2': Building2,
	server: Server,
	network: Network,
	globe: Globe,
	lock: Lock,
	folder: Folder,
	'file-text': FileText,
	calendar: Calendar
} as const;

export type TrackerIconName = keyof typeof TRACKER_ICONS;

export function getTrackerIcon(name: string | null | undefined) {
	if (name && Object.hasOwn(TRACKER_ICONS, name)) {
		return TRACKER_ICONS[name as TrackerIconName];
	}
	return CircleDot;
}
