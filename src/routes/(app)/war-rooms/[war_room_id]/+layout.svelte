<script lang="ts">
	import { onDestroy, onMount, setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { toast } from '$lib/components/ui/toast';
	import { WarRoomsService, type WarRoom } from '$lib/services/war-rooms.service';
	import {
		createWarRoomContext,
		WAR_ROOM_CTX,
		type WarRoomContext
	} from '$lib/contexts/war-room.context.svelte';
	import {
		createWarRoomDatastorePanelContext,
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import { notifications } from '$lib/stores/notifications.store';
	import {
		WAR_ROOM_LIVE_EVENT,
		WAR_ROOM_UNWATCH,
		WAR_ROOM_WATCH,
		type WarRoomLiveEvent
	} from '$lib/utils/war-room-live';
	import WarRoomTopbar from './components/WarRoomTopbar.svelte';
	// WarRoomPeopleBanner now lives inside WarRoomTopbar's metadata
	// row as a compact inline summary — no longer mounted as a
	// standalone row here.
	import WarRoomTabs from './components/WarRoomTabs.svelte';
	import WarRoomWorkspace from './components/WarRoomWorkspace.svelte';

	let { children }: { children: Snippet } = $props();

	const warRoomId = $derived(Number(page.params.war_room_id));

	const ctx = createWarRoomContext(() => warRoomId);
	setContext<WarRoomContext>(WAR_ROOM_CTX, ctx);

	// Datastore side-panel toggle. One instance per layout so navigating
	// between sub-tabs (Stream / Graph / Timelines / …) doesn't tear
	// down the panel if the operator already has it open.
	const datastorePanel = createWarRoomDatastorePanelContext();
	setContext<WarRoomDatastorePanelContext>(WAR_ROOM_DATASTORE_PANEL_CTX, datastorePanel);

	let _loadingFirst = $state(true);

	const refresh = async (silent = false) => {
		const res = await WarRoomsService.get(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data as WarRoom);
		} else if (!silent) {
			toast({
				title: 'Could not load war room',
				description: typeof res.data === 'string' ? res.data : (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
		_loadingFirst = false;
	};

	onMount(() => refresh());

	// Live views: join the room of this war room (again after each
	// reconnect, which may have dropped pushes: everything is re-read
	// then) and hand its pushes to the sub-tabs subscribed to them.
	$effect(() => {
		const id = warRoomId;
		if (!id) return;
		let joined = false;
		const offEvent = notifications.onSocketEvent<WarRoomLiveEvent>(WAR_ROOM_LIVE_EVENT, (event) => {
			if (event?.war_room_id === id) ctx.live.dispatch(event.topic);
		});
		const offRoom = notifications.watchRoom(
			WAR_ROOM_WATCH,
			WAR_ROOM_UNWATCH,
			{ war_room_id: id },
			(ack) => {
				if (!(ack as { ok?: boolean } | null)?.ok) return;
				if (joined) ctx.live.dispatchAll();
				joined = true;
			}
		);
		return () => {
			offEvent();
			offRoom();
		};
	});

	// The header (name, state, people, attached cases) is the layout's own
	onMount(() => ctx.live.subscribe(['room', 'members', 'cases'], () => refresh(true)));

	const onVisibility = () => {
		if (!document.hidden) ctx.live.flush();
	};
	onMount(() => {
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});
	onDestroy(() => ctx.live.dispose());

	// Reactive guard — if the route changes to a different war room, refetch.
	$effect(() => {
		if (warRoomId && ctx.room?.war_room_id !== warRoomId) {
			_loadingFirst = true;
			refresh();
		}
	});
</script>

<svelte:head>
	<title>{ctx.room?.name ?? 'War Room'}</title>
</svelte:head>

<div class="flex h-full w-full flex-col bg-background">
	<WarRoomTopbar />
	<WarRoomTabs />

	<div class="flex-1 overflow-hidden">
		<WarRoomWorkspace>
			{@render children()}
		</WarRoomWorkspace>
	</div>
</div>
