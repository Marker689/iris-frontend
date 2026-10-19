import { browser } from '$app/environment';
import { onApiEvent, type ApiEvent } from '$lib/services/api-events';
import { normalisePath } from '$lib/tutorials/logic';
import {
	apiStep,
	deriveAnchor,
	describeElement,
	isRecordableApiEvent,
	isRecordableRoute,
	pruneCaptures,
	routeStep
} from '$lib/tutorials/recorder';
import type { TutorialStep, TutorialVars } from '$lib/tutorials/types';

/**
 * The tutorial recorder of Settings → Tutorials. The administrator
 * starts it from the editor, does the thing on the real UI, and stops
 * it: the steps recorded meanwhile are handed back to the editor of
 * that tutorial, which appends them.
 *
 * Lives in `sessionStorage` so it survives reloads and full-page
 * navigations in this tab only.
 */
const STORAGE_KEY = 'iris_tutorial_recording';
const RESULT_KEY = 'iris_tutorial_recorded';

type Recording = {
	tutorialId: number;
	steps: TutorialStep[];
	/** Values of the variables recorded so far, to write later paths with them. */
	known: TutorialVars;
	lastRoute: string | null;
	/** Variables the last step bound, when it is a page change that may be replaced. */
	routeVars: string[] | null;
};

type RecordedResult = { tutorialId: number; steps: TutorialStep[] };

const state = $state<{ recording: Recording | null; picking: boolean }>({
	recording: null,
	picking: false
});

let hydrated = false;
let unsubscribeApi: (() => void) | null = null;

const persist = () => {
	if (!browser) return;
	if (state.recording) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.recording));
	else sessionStorage.removeItem(STORAGE_KEY);
};

const isRecording = (value: unknown): value is Recording => {
	if (!value || typeof value !== 'object') return false;
	const rec = value as Partial<Recording>;
	return (
		typeof rec.tutorialId === 'number' &&
		Array.isArray(rec.steps) &&
		!!rec.known &&
		typeof rec.known === 'object'
	);
};

const push = (step: TutorialStep, captured: TutorialVars = {}) => {
	const rec = state.recording;
	if (!rec) return;
	state.recording = {
		...rec,
		steps: [...rec.steps, step],
		known: { ...rec.known, ...captured },
		routeVars: null
	};
	persist();
};

const handleApiEvent = (event: ApiEvent) => {
	const rec = state.recording;
	if (!rec || !isRecordableApiEvent(event)) return;
	const { step, captured } = apiStep(event, rec.known);
	push(step, captured);
};

const listen = () => {
	if (!unsubscribeApi) unsubscribeApi = onApiEvent(handleApiEvent);
};

const stopListening = () => {
	unsubscribeApi?.();
	unsubscribeApi = null;
};

const clear = () => {
	state.recording = null;
	state.picking = false;
	stopListening();
	persist();
};

export const tutorialRecorder = {
	get recording() {
		return state.recording;
	},
	get steps(): TutorialStep[] {
		return state.recording?.steps ?? [];
	},
	get picking() {
		return state.picking;
	},
	set picking(value: boolean) {
		state.picking = value && !!state.recording;
	},

	hydrate() {
		if (!browser || hydrated) return;
		hydrated = true;
		try {
			const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
			if (isRecording(parsed)) {
				state.recording = parsed;
				listen();
			} else {
				sessionStorage.removeItem(STORAGE_KEY);
			}
		} catch {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	},

	start(tutorialId: number) {
		state.recording = { tutorialId, steps: [], known: {}, lastRoute: null, routeVars: null };
		state.picking = false;
		listen();
		persist();
	},

	/** Records a page change; called by the recorder panel on navigation. */
	observe(pathname: string) {
		const rec = state.recording;
		const path = normalisePath(pathname);
		if (!rec || path === rec.lastRoute || !isRecordableRoute(path)) return;
		let { steps, known } = rec;
		// Passing through pages on the way is not a step: keep the last one.
		if (rec.routeVars) {
			steps = steps.slice(0, -1);
			known = Object.fromEntries(
				Object.entries(known).filter(([name]) => !rec.routeVars?.includes(name))
			);
		}
		const { step, captured } = routeStep(path, known);
		state.recording = {
			...rec,
			steps: [...steps, step],
			known: { ...known, ...captured },
			lastRoute: path,
			routeVars: Object.keys(captured)
		};
		persist();
	},

	/** Records a step highlighting the element; `false` if no stable anchor was found. */
	pick(el: Element): boolean {
		const rec = state.recording;
		if (!rec) return false;
		const anchor = deriveAnchor(el, rec.known);
		state.picking = false;
		if (!anchor) return false;
		const what = describeElement(el);
		push({ title: what ? `Click “${what}”` : 'Click here', body: '', anchor });
		return true;
	},

	addExplanation(title: string, body: string) {
		push({ title: title.trim() || 'Note', body: body.trim() });
	},

	undo() {
		const rec = state.recording;
		if (!rec || rec.steps.length === 0) return;
		state.recording = { ...rec, steps: rec.steps.slice(0, -1), routeVars: null };
		persist();
	},

	/** Ends the recording and hands the steps to the editor of the tutorial. */
	stop(): number | null {
		const rec = state.recording;
		if (!rec) return null;
		const result: RecordedResult = { tutorialId: rec.tutorialId, steps: pruneCaptures(rec.steps) };
		if (browser) sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
		clear();
		return rec.tutorialId;
	},

	cancel() {
		clear();
	},

	/** Steps recorded for this tutorial, once; `[]` when there are none. */
	takeResult(tutorialId: number): TutorialStep[] {
		if (!browser) return [];
		try {
			const parsed = JSON.parse(sessionStorage.getItem(RESULT_KEY) ?? 'null') as RecordedResult;
			if (parsed?.tutorialId !== tutorialId || !Array.isArray(parsed.steps)) return [];
			sessionStorage.removeItem(RESULT_KEY);
			return parsed.steps;
		} catch {
			sessionStorage.removeItem(RESULT_KEY);
			return [];
		}
	}
};
