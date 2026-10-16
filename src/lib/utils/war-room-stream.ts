/**
 * War-room stream filters.
 *
 * Rows of kind `war_room_activity` are the war room's own activity log
 * (members added, notes renamed, folders moved, ...). Their
 * `activity_type` is a `<family>.<verb>` slug; the stream lets the
 * operator mute whole families.
 */

export const WAR_ROOM_ACTIVITY_FAMILIES = [
	{ key: 'room', label: 'War room' },
	{ key: 'member', label: 'Members' },
	{ key: 'team', label: 'Teams' },
	{ key: 'note', label: 'Notes' },
	{ key: 'folder', label: 'Note folders' },
	{ key: 'share', label: 'Note sharing' },
	{ key: 'task', label: 'Tasks' },
	{ key: 'timeline', label: 'Timelines' },
	{ key: 'event', label: 'Timeline events' },
	{ key: 'decision', label: 'Decisions' },
	{ key: 'sitrep', label: 'SitReps' },
	{ key: 'scope', label: 'Scope' },
	{ key: 'vulnerability', label: 'Vulnerabilities' },
	{ key: 'datastore', label: 'Datastore' }
] as const;

export type WarRoomActivityFamily = (typeof WAR_ROOM_ACTIVITY_FAMILIES)[number]['key'];

const FAMILY_KEYS = new Set<string>(WAR_ROOM_ACTIVITY_FAMILIES.map((f) => f.key));

/** Family of a `war_room_activity` slug; unknown or missing ones are `room`. */
export function warRoomActivityFamily(
	activityType: string | null | undefined
): WarRoomActivityFamily {
	const family = (activityType ?? '').split('.', 1)[0];
	return (FAMILY_KEYS.has(family) ? family : 'room') as WarRoomActivityFamily;
}

/**
 * Stream lanes to show from saved preferences: what was saved, plus every
 * lane the saved preferences never knew about (lanes are opt-out, so one
 * added since the save starts on). Preferences saved before `known` was
 * stored knew `legacyKeys`.
 */
export function mergeSavedStreamLanes(
	saved: readonly string[],
	known: readonly string[] | null | undefined,
	allKeys: readonly string[],
	legacyKeys: readonly string[]
): Set<string> {
	const seen = new Set(Array.isArray(known) ? known : legacyKeys);
	const lanes = new Set(saved.filter((key) => allKeys.includes(key)));
	for (const key of allKeys) if (!seen.has(key)) lanes.add(key);
	return lanes;
}
