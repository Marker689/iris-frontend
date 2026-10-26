/**
 * Trackers and steps of the case shown by the Trackers page: loaded once
 * for the tab bar and shared with the tracker views and dialogs, which
 * write back through `setTrackers` / `setSteps` / `upsertTracker`.
 */
import { toast } from '$lib/components/ui/toast';
import {
	CaseTrackersService,
	caseTrackerTimelineSyncTitle,
	type CaseTracker
} from '$lib/services/case-trackers.service';
import { sortTrackerSteps, type TrackerStep } from '$lib/services/war-room-trackers.service';
import { UsersService } from '$lib/services/users.service';
import { apiErrorMessage } from '$lib/utils/error-handler';
import {
	isTrackerView,
	okObject,
	type TrackerView
} from '$lib/components/common/trackers/tracker-helpers';

const byOrder = (a: CaseTracker, b: CaseTracker) => a.sort_order - b.sort_order || a.id - b.id;

export class CaseTrackersState {
	trackers = $state<CaseTracker[]>([]);
	steps = $state<TrackerStep[]>([]);
	/** True once the first listing came back (successfully or not). */
	loaded = $state(false);
	/** Bumped whenever the rows of the shown tracker should be re-read. */
	rowsVersion = $state(0);

	// Dialogs hosted by the tab bar, opened from anywhere.
	formOpen = $state(false);
	/** Tracker edited by the form; null = create. */
	formEditing = $state<CaseTracker | null>(null);
	stepsOpen = $state(false);
	saveTemplateOpen = $state(false);
	saveTemplateTrackerId = $state<number | null>(null);

	/** This user's view of each tracker (the list when unset). */
	views = $state<Record<string, TrackerView>>({});

	readonly #caseId: () => number;
	#viewsCase: number | null = null;
	#trackersSeq = 0;
	#stepsSeq = 0;

	constructor(caseId: () => number) {
		this.#caseId = caseId;
	}

	get caseId(): number {
		return this.#caseId();
	}

	tracker(id: number | null): CaseTracker | null {
		if (id === null) return null;
		return this.trackers.find((t) => t.id === id) ?? null;
	}

	setTrackers(list: CaseTracker[]) {
		this.trackers = [...list].sort(byOrder);
	}

	upsertTracker(tracker: CaseTracker) {
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

	openForm(tracker: CaseTracker | null = null) {
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
		const res = await CaseTrackersService.reorder(
			this.caseId,
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
		const res = await CaseTrackersService.list(this.caseId);
		if (seq !== this.#trackersSeq) return;
		if (res.ok && Array.isArray(res.data)) this.setTrackers(res.data);
		this.loaded = true;
	}

	async loadSteps() {
		const seq = ++this.#stepsSeq;
		const res = await CaseTrackersService.listSteps(this.caseId);
		if (seq !== this.#stepsSeq) return;
		if (res.ok && Array.isArray(res.data)) this.setSteps(res.data);
	}

	/** Everything, rows included (after a template was applied). */
	async reload() {
		await Promise.all([this.loadTrackers(), this.loadSteps()]);
		this.rowsVersion += 1;
	}

	/**
	 * Write a tracker to the timeline after the fact (its state, or its
	 * past changes not written yet), toast the outcome and refresh the
	 * pending counts. False on failure.
	 */
	async writeTimeline(trackerId: number): Promise<boolean> {
		const res = await CaseTrackersService.syncTimeline(this.caseId, trackerId);
		const summary = okObject(res);
		if (!summary) {
			if (res.status !== 403) {
				toast({
					title: 'Could not write to the timeline',
					description: apiErrorMessage(res, 'The server refused the request.'),
					variant: 'destructive'
				});
			}
			return false;
		}
		toast({ title: caseTrackerTimelineSyncTitle(summary), variant: 'success' });
		if (summary.remaining !== undefined) void this.loadTrackers();
		return true;
	}

	get #viewsKey(): string {
		return `case_tracker_views_${this.caseId}`;
	}

	/** Read this user's tracker views, once per case. */
	async loadViews() {
		const caseId = this.caseId;
		if (this.#viewsCase === caseId) return;
		this.#viewsCase = caseId;
		const res = await UsersService.getMyPreference<unknown>(this.#viewsKey);
		const value = res.ok && res.data && typeof res.data === 'object' ? res.data.value : null;
		if (caseId !== this.caseId || !value || typeof value !== 'object') return;
		const read: Record<string, TrackerView> = {};
		for (const [id, view] of Object.entries(value)) if (isTrackerView(view)) read[id] = view;
		// A view picked before the preference landed wins.
		this.views = { ...read, ...this.views };
	}

	view(trackerId: number): TrackerView {
		return this.views[String(trackerId)] ?? 'list';
	}

	setView(trackerId: number, view: TrackerView) {
		if (this.view(trackerId) === view) return;
		const next = { ...this.views, [String(trackerId)]: view };
		if (view === 'list') delete next[String(trackerId)];
		this.views = next;
		void UsersService.setMyPreference(
			this.#viewsKey,
			Object.keys(next).length ? $state.snapshot(next) : null
		);
	}

	reset() {
		this.trackers = [];
		this.steps = [];
		this.loaded = false;
		this.views = {};
		this.#viewsCase = null;
	}
}
