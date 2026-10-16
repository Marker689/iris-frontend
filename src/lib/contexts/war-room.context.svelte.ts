/**
 * Shared state for a single war-room workspace.
 *
 * The layout owns one of these per route — every sub-tab (chat, graph,
 * timelines, tasks, …) reads the loaded `room` from here so they
 * don't each re-fetch the same row. Sub-tabs that mutate the war room
 * itself (rename, state flip) call `setRoom` to broadcast the new
 * value back to the layout.
 *
 * `live` carries the pushes of the war room (see `war-room-live.ts`):
 * the layout joins the room and feeds it, the sub-tabs subscribe to the
 * topics they show with `useWarRoomLive`.
 */
import { getContext, onMount } from 'svelte';
import type { WarRoom } from '$lib/services/war-rooms.service';
import {
	createWarRoomLiveHub,
	type WarRoomLiveHandler,
	type WarRoomLiveHub,
	type WarRoomLiveTopic
} from '$lib/utils/war-room-live';

export const WAR_ROOM_CTX = Symbol('war-room-ctx');

export interface WarRoomContext {
	readonly idGetter: () => number;
	readonly room: WarRoom | null;
	readonly live: WarRoomLiveHub;
	setRoom(room: WarRoom): void;
	clear(): void;
}

export function createWarRoomContext(idGetter: () => number): WarRoomContext {
	let room = $state<WarRoom | null>(null);
	const live = createWarRoomLiveHub();

	return {
		idGetter,
		live,
		get room() {
			return room;
		},
		setRoom(next: WarRoom) {
			room = next;
		},
		clear() {
			room = null;
		}
	};
}

export function useWarRoom(): WarRoomContext {
	const ctx = getContext<WarRoomContext>(WAR_ROOM_CTX);
	if (!ctx) {
		throw new Error('useWarRoom must be called inside a war-room layout');
	}
	return ctx;
}

/**
 * Re-read what the calling view shows when one of `topics` changes in
 * the war room — call it while the component initialises.
 */
export function useWarRoomLive(topics: readonly WarRoomLiveTopic[], handler: WarRoomLiveHandler) {
	const ctx = useWarRoom();
	onMount(() => ctx.live.subscribe(topics, handler));
}
