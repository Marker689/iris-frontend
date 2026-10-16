/**
 * Live refresh of the war-room views.
 *
 * Every successful write to a war room (or to a case attached to it),
 * from the UI, the API or Yuki, makes the backend send
 * `war_room_changed {war_room_id, topic}` on `/notifications`
 * to whoever joined the room (`war_room_watch {war_room_id}`, checked as
 * a REST read). A push never carries data: the views of that topic
 * re-read it over REST, with the reader's own access.
 *
 * The layout joins the room and feeds the pushes to a hub; each view
 * subscribes to the topics it shows. A subscriber is called once per
 * burst (debounced), never while its previous refresh is still running
 * (the next one starts when it ends), and not while the tab is hidden
 * (`flush` delivers what was held when it shows again).
 */

export const WAR_ROOM_LIVE_EVENT = 'war_room_changed';
export const WAR_ROOM_WATCH = 'war_room_watch';
export const WAR_ROOM_UNWATCH = 'war_room_unwatch';

export const WAR_ROOM_LIVE_TOPICS = [
	'room',
	'members',
	'cases',
	'tasks',
	'scope',
	'vulnerabilities',
	'timelines',
	'decisions',
	'teams',
	'datastore',
	'sitreps',
	'notes',
	'chat'
] as const;

export type WarRoomLiveTopic = (typeof WAR_ROOM_LIVE_TOPICS)[number];

export interface WarRoomLiveEvent {
	war_room_id: number;
	topic: WarRoomLiveTopic;
}

export type WarRoomLiveHandler = (topics: Set<WarRoomLiveTopic>) => void | Promise<void>;

export interface WarRoomLiveHub {
	/** Call `handler` when one of `topics` changes; returns the unsubscribe. */
	subscribe(topics: readonly WarRoomLiveTopic[], handler: WarRoomLiveHandler): () => void;
	/** A push for `topic`, unknown topics are ignored. */
	dispatch(topic: string): void;
	/** Everything may have changed (e.g. pushes missed while disconnected). */
	dispatchAll(): void;
	/** Deliver what was held while the tab was hidden. */
	flush(): void;
	dispose(): void;
}

interface Subscriber {
	topics: Set<WarRoomLiveTopic>;
	handler: WarRoomLiveHandler;
	pending: Set<WarRoomLiveTopic>;
	timer: ReturnType<typeof setTimeout> | null;
	running: boolean;
}

export function isWarRoomLiveTopic(topic: unknown): topic is WarRoomLiveTopic {
	return (WAR_ROOM_LIVE_TOPICS as readonly unknown[]).includes(topic);
}

export function createWarRoomLiveHub(
	options: { debounceMs?: number; isHidden?: () => boolean } = {}
): WarRoomLiveHub {
	const debounceMs = options.debounceMs ?? 400;
	const isHidden =
		options.isHidden ?? (() => typeof document !== 'undefined' && document.hidden === true);
	const subscribers = new Set<Subscriber>();

	function run(sub: Subscriber) {
		sub.timer = null;
		if (sub.running || sub.pending.size === 0 || !subscribers.has(sub)) return;
		const topics = sub.pending;
		sub.pending = new Set();
		sub.running = true;
		Promise.resolve()
			.then(() => sub.handler(topics))
			.catch(() => {
				// A failed refresh keeps what is shown; the next push retries
			})
			.finally(() => {
				sub.running = false;
				if (sub.pending.size) schedule(sub);
			});
	}

	function schedule(sub: Subscriber) {
		if (sub.timer || isHidden()) return;
		sub.timer = setTimeout(() => run(sub), debounceMs);
	}

	function push(topics: readonly WarRoomLiveTopic[]) {
		for (const sub of subscribers) {
			let hit = false;
			for (const topic of topics) {
				if (!sub.topics.has(topic)) continue;
				sub.pending.add(topic);
				hit = true;
			}
			if (hit) schedule(sub);
		}
	}

	return {
		subscribe(topics, handler) {
			const sub: Subscriber = {
				topics: new Set(topics),
				handler,
				pending: new Set(),
				timer: null,
				running: false
			};
			subscribers.add(sub);
			return () => {
				subscribers.delete(sub);
				if (sub.timer) clearTimeout(sub.timer);
				sub.timer = null;
			};
		},
		dispatch(topic) {
			if (isWarRoomLiveTopic(topic)) push([topic]);
		},
		dispatchAll() {
			push(WAR_ROOM_LIVE_TOPICS);
		},
		flush() {
			for (const sub of subscribers) if (sub.pending.size) schedule(sub);
		},
		dispose() {
			for (const sub of subscribers) if (sub.timer) clearTimeout(sub.timer);
			subscribers.clear();
		}
	};
}
