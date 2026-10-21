/**
 * Trackers and steps of the war room shown by the Scope page: loaded once
 * for the tab bar and shared with the tracker views and dialogs, which
 * write back through `setTrackers` / `setSteps` / `upsertTracker`.
 */
import {
	WarRoomTrackersService,
	sortTrackerSteps,
	type Tracker,
	type TrackerStep
} from '$lib/services/war-room-trackers.service';

const byOrder = (a: Tracker, b: Tracker) => a.sort_order - b.sort_order || a.id - b.id;

export class TrackersState {
	trackers = $state<Tracker[]>([]);
	steps = $state<TrackerStep[]>([]);
	/** True once the first listing came back (successfully or not). */
	loaded = $state(false);
	/** Bumped whenever the rows of the shown tracker should be re-read. */
	rowsVersion = $state(0);

	// Dialogs hosted by the tab bar, opened from anywhere.
	formOpen = $state(false);
	/** Tracker edited by the form; null = create. */
	formEditing = $state<Tracker | null>(null);
	stepsOpen = $state(false);
	saveTemplateOpen = $state(false);
	saveTemplateTrackerId = $state<number | null>(null);

	readonly #warRoomId: () => number;
	#trackersSeq = 0;
	#stepsSeq = 0;

	constructor(warRoomId: () => number) {
		this.#warRoomId = warRoomId;
	}

	get warRoomId(): number {
		return this.#warRoomId();
	}

	tracker(id: number | null): Tracker | null {
		if (id === null) return null;
		return this.trackers.find((t) => t.id === id) ?? null;
	}

	setTrackers(list: Tracker[]) {
		this.trackers = [...list].sort(byOrder);
	}

	upsertTracker(tracker: Tracker) {
		const exists = this.trackers.some((t) => t.id === tracker.id);
		this.setTrackers(
			exists
				? this.trackers.map((t) => (t.id === tracker.id ? tracker : t))
				: [...this.trackers, tracker]
		);
	}

	dropTracker(id: number) {
		this.trackers = this.trackers.filter((t) => t.id !== id);
	}

	setSteps(list: TrackerStep[]) {
		this.steps = sortTrackerSteps(list);
	}

	openForm(tracker: Tracker | null = null) {
		this.formEditing = tracker;
		this.formOpen = true;
	}

	openSaveTemplate(trackerId: number | null = null) {
		this.saveTemplateTrackerId = trackerId;
		this.saveTemplateOpen = true;
	}

	/** Move a tracker one place left (-1) or right (+1); false on failure. */
	async move(trackerId: number, delta: -1 | 1): Promise<boolean> {
		const from = this.trackers.findIndex((t) => t.id === trackerId);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= this.trackers.length) return true;
		const previous = this.trackers;
		const next = [...previous];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		this.trackers = next;
		const res = await WarRoomTrackersService.reorder(
			this.warRoomId,
			next.map((t) => t.id)
		);
		if (res.ok && Array.isArray(res.data)) {
			this.setTrackers(res.data);
			return true;
		}
		this.trackers = previous;
		return false;
	}

	async loadTrackers() {
		const seq = ++this.#trackersSeq;
		const res = await WarRoomTrackersService.list(this.warRoomId);
		if (seq !== this.#trackersSeq) return;
		if (res.ok && Array.isArray(res.data)) this.setTrackers(res.data);
		this.loaded = true;
	}

	async loadSteps() {
		const seq = ++this.#stepsSeq;
		const res = await WarRoomTrackersService.listSteps(this.warRoomId);
		if (seq !== this.#stepsSeq) return;
		if (res.ok && Array.isArray(res.data)) this.setSteps(res.data);
	}

	/** Everything, rows included (live push, after a template was applied). */
	async reload() {
		await Promise.all([this.loadTrackers(), this.loadSteps()]);
		this.rowsVersion += 1;
	}

	reset() {
		this.trackers = [];
		this.steps = [];
		this.loaded = false;
	}
}
