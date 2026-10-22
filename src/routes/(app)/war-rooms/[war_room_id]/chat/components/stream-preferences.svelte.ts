import type { ChatMessage } from '$lib/services/war-room-chat.service';
import {
	defaultStreamSettings,
	muteTargetFor,
	streamDestination,
	type ActivityGroup,
	type LaneRoute,
	type LaneRoutes,
	type MuteTarget,
	type StreamLaneKey,
	type StreamSettings
} from './activity-rail';

/**
 * Reactive holder of the operator's stream settings, shared by the chat
 * page, the Activity rail and its settings panel. Every mutation replaces
 * the collection it touches so `$derived` readers re-run.
 */
export class StreamPreferences {
	routes = $state<LaneRoutes>(defaultStreamSettings().routes);
	foldBursts = $state(true);
	quietMode = $state(false);
	railOpen = $state(true);
	excludedCases = $state<Set<number>>(new Set());
	excludedCaseActivities = $state<Record<number, Set<string>>>({});
	excludedRoomActivities = $state<Set<string>>(new Set());

	settings = $derived<StreamSettings>({
		routes: this.routes,
		foldBursts: this.foldBursts,
		quietMode: this.quietMode,
		railOpen: this.railOpen,
		excludedCases: this.excludedCases,
		excludedCaseActivities: this.excludedCaseActivities,
		excludedRoomActivities: this.excludedRoomActivities
	});

	/** True when anything differs from the defaults (rail visibility aside). */
	customised = $derived.by(() => {
		const d = defaultStreamSettings();
		return (
			Object.entries(this.routes).some(([k, v]) => d.routes[k as StreamLaneKey] !== v) ||
			!this.foldBursts ||
			this.quietMode ||
			this.excludedCases.size > 0 ||
			Object.values(this.excludedCaseActivities).some((s) => s.size > 0) ||
			this.excludedRoomActivities.size > 0
		);
	});

	apply(s: StreamSettings) {
		this.routes = s.routes;
		this.foldBursts = s.foldBursts;
		this.quietMode = s.quietMode;
		this.railOpen = s.railOpen;
		this.excludedCases = s.excludedCases;
		this.excludedCaseActivities = s.excludedCaseActivities;
		this.excludedRoomActivities = s.excludedRoomActivities;
	}

	/** Back to the defaults, leaving the rail open or closed as it is. */
	reset() {
		this.apply({ ...defaultStreamSettings(), railOpen: this.railOpen });
	}

	destination(m: ChatMessage): LaneRoute {
		return streamDestination(m, this.settings);
	}

	setRoute(lane: StreamLaneKey, route: LaneRoute) {
		this.routes = { ...this.routes, [lane]: route };
	}

	isCaseOn(caseId: number) {
		return !this.excludedCases.has(caseId);
	}

	toggleCase(caseId: number) {
		const next = new Set(this.excludedCases);
		if (next.has(caseId)) next.delete(caseId);
		else next.add(caseId);
		this.excludedCases = next;
	}

	isCaseActivityOn(caseId: number, slug: string) {
		return !(this.excludedCaseActivities[caseId]?.has(slug) ?? false);
	}

	setCaseActivity(caseId: number, slug: string, on: boolean) {
		const next = new Set(this.excludedCaseActivities[caseId] ?? []);
		if (on) next.delete(slug);
		else next.add(slug);
		this.excludedCaseActivities = { ...this.excludedCaseActivities, [caseId]: next };
	}

	/** 'all' every type of the group on, 'none' all off, 'some' mixed. */
	groupState(caseId: number, group: ActivityGroup): 'all' | 'none' | 'some' {
		const excluded = this.excludedCaseActivities[caseId];
		const on = group.slugs.filter((s) => !excluded?.has(s.slug)).length;
		if (on === 0) return 'none';
		return on === group.slugs.length ? 'all' : 'some';
	}

	/** Mixed and all-on go all-off, all-off goes all-on. */
	toggleGroup(caseId: number, group: ActivityGroup) {
		const wantOn = this.groupState(caseId, group) === 'none';
		const next = new Set(this.excludedCaseActivities[caseId] ?? []);
		for (const s of group.slugs) {
			if (wantOn) next.delete(s.slug);
			else next.add(s.slug);
		}
		this.excludedCaseActivities = { ...this.excludedCaseActivities, [caseId]: next };
	}

	toggleRoomActivity(family: string) {
		const next = new Set(this.excludedRoomActivities);
		if (next.has(family)) next.delete(family);
		else next.add(family);
		this.excludedRoomActivities = next;
	}

	/** Switch off what a row's "Mute this kind" points at. */
	mute(m: ChatMessage): MuteTarget | null {
		const target = muteTargetFor(m);
		if (!target) return null;
		if (target.type === 'case_activity') {
			this.setCaseActivity(target.caseId, target.slug, false);
		} else if (target.type === 'room_family') {
			const next = new Set(this.excludedRoomActivities);
			next.add(target.family);
			this.excludedRoomActivities = next;
		} else {
			this.setRoute(target.lane, 'off');
		}
		return target;
	}
}
