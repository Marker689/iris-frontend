<!--
  Activity rail: everything IRIS posts on its own (case activity,
  war-room activity, tasks, trackers, ...), newest at the bottom like the
  chat, so the chat
  next to it only carries what people say.

  The rail can be paused (new rows queue behind a pill instead of
  pushing the list down), filtered by lane or text, folded into bursts,
  resized from its left edge, and collapsed into a thin strip counting
  what arrived since. Its settings panel decides which lanes land here.
-->
<script lang="ts">
	import { tick, untrack, type ComponentProps } from 'svelte';
	import {
		Activity,
		ArrowDown,
		Loader2,
		BellOff,
		ChevronDown,
		ChevronUp,
		ExternalLink,
		EyeOff,
		Inbox,
		Layers,
		MessageSquareQuote,
		PanelRightClose,
		PanelRightOpen,
		Pause,
		Play,
		Search,
		SlidersHorizontal,
		X
	} from 'lucide-svelte';
	import type { ChatMessage } from '$lib/services/war-room-chat.service';
	import type { WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import { dayKey, formatDayHeading, formatTime, zonedDateTime } from '$lib/utils/time-formatter';
	import ChatMessageBody from './ChatMessageBody.svelte';
	import StreamRefCard from './StreamRefCard.svelte';
	import ActivityRailSettings from './ActivityRailSettings.svelte';
	import {
		STREAM_LANES,
		burstSummary,
		foldBursts,
		isPlainTextKind,
		latestTime,
		messageTime,
		muteTargetFor,
		streamLane,
		type RailEntry,
		type StreamLaneKey
	} from './activity-rail';
	import { LANE_ICONS, systemColor, systemIcon } from './stream-icons';
	import { resolveStreamRef } from './stream-ref';
	import type { StreamPreferences } from './stream-preferences.svelte';

	type Props = {
		warRoomId: number;
		/** Rows routed to the rail, oldest first like the stream. */
		items: ChatMessage[];
		/** Rows that arrived while the rail was hidden. */
		unseen: ChatMessage[];
		open: boolean;
		settingsOpen?: boolean;
		prefs: StreamPreferences;
		attachedCases: WarRoomCaseAttachment[];
		laneCounts: Record<StreamLaneKey, number>;
		/** Loaded automatic rows the mutes hide. */
		hiddenCount: number;
		/** Lanes switched off, never fetched. */
		offLanes: number;
		/** First page still on its way. */
		loading: boolean;
		loadingOlder: boolean;
		/** Nothing older left to load. */
		exhausted: boolean;
		/** Load the page before the oldest row. */
		onLoadOlder: () => Promise<void>;
		onToggle: () => void;
		onDiscuss: (m: ChatMessage) => void;
		onMute: (m: ChatMessage) => void;
		onAttachmentClick?: ComponentProps<typeof ChatMessageBody>['onAttachmentClick'];
	};
	let {
		warRoomId,
		items,
		unseen,
		open,
		settingsOpen = $bindable(false),
		prefs,
		attachedCases,
		laneCounts,
		hiddenCount,
		offLanes,
		loading,
		loadingOlder,
		exhausted,
		onLoadOlder,
		onToggle,
		onDiscuss,
		onMute,
		onAttachmentClick
	}: Props = $props();

	// --- Width -----------------------------------------------------------
	// Per device like the other pane sizes, not in the profile.
	const WIDTH_KEY = 'war-room-activity-rail-width';
	const MIN_WIDTH = 280;
	const MAX_WIDTH = 560;
	const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));
	const readWidth = () => {
		try {
			const saved = Number(localStorage.getItem(WIDTH_KEY));
			return saved ? clampWidth(saved) : 360;
		} catch {
			return 360;
		}
	};
	let width = $state(readWidth());

	const startResize = (e: PointerEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = width;
		const move = (ev: PointerEvent) => {
			width = clampWidth(startWidth + startX - ev.clientX);
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			try {
				localStorage.setItem(WIDTH_KEY, String(width));
			} catch {
				// Private mode: the width just won't survive a reload.
			}
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	};

	const nudgeWidth = (e: KeyboardEvent) => {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		width = clampWidth(width + (e.key === 'ArrowLeft' ? 20 : -20));
		try {
			localStorage.setItem(WIDTH_KEY, String(width));
		} catch {
			// See above.
		}
	};

	// --- List ------------------------------------------------------------

	// Rows newer than this stay queued while paused.
	let pausedAfter = $state<number | null>(null);
	let laneFilter = $state<StreamLaneKey | 'all'>('all');
	let query = $state('');
	let expanded = $state<Set<number>>(new Set());
	let highlightId = $state<number | null>(null);
	let scrollEl: HTMLDivElement | null = $state(null);

	const railLanes = $derived(STREAM_LANES.filter((l) => prefs.routes[l.key] === 'rail'));

	// A lane routed away while selected falls back to everything.
	$effect(() => {
		if (laneFilter !== 'all' && prefs.routes[laneFilter] !== 'rail') laneFilter = 'all';
	});

	const laneOf = (m: ChatMessage) => streamLane(m.kind);
	const countFor = (lane: StreamLaneKey | 'all') =>
		lane === 'all' ? items.length : items.filter((m) => laneOf(m) === lane).length;

	const pending = $derived(
		pausedAfter == null ? 0 : items.filter((m) => messageTime(m) > pausedAfter!).length
	);

	const entries = $derived.by((): RailEntry[] => {
		const needle = query.trim().toLowerCase();
		const shown = items.filter(
			(m) =>
				(pausedAfter == null || messageTime(m) <= pausedAfter) &&
				(laneFilter === 'all' || laneOf(m) === laneFilter) &&
				(!needle ||
					`${m.author_name ?? m.author_login ?? ''} ${m.body ?? ''}`.toLowerCase().includes(needle))
		);
		return foldBursts(shown, prefs.foldBursts);
	});

	// Oldest on top, newest at the bottom, like the chat: the list follows
	// new rows while the operator is at the bottom and stays put once they
	// scroll up to read. Scrolling near the top loads the previous page.
	const LOAD_THRESHOLD = 200;
	let atBottom = $state(true);
	const onScroll = () => {
		if (!scrollEl) return;
		atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 40;
		if (scrollEl.scrollTop < LOAD_THRESHOLD) void onLoadOlder();
	};
	const scrollToBottom = async () => {
		await tick();
		if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
		atBottom = true;
	};

	// A page landing on top must not move what the operator is reading:
	// measure before the DOM update, shift by what was added after it.
	const entryKey = (e: RailEntry) => {
		const first = firstOf(e);
		return `${e.type}:${first.message_id}:${first.created_at}`;
	};
	const rowKey = (m: ChatMessage) => `${m.message_id}:${m.created_at}`;
	let heightBefore = 0;
	let firstBefore: string | null = null;
	$effect.pre(() => {
		void entries;
		heightBefore = untrack(() => scrollEl?.scrollHeight ?? 0);
	});
	$effect(() => {
		void entries;
		// Older rows arrived: the previous first row is still there, below.
		const first = items.length > 0 ? rowKey(items[0]) : null;
		const prepended =
			firstBefore != null &&
			first !== firstBefore &&
			untrack(() => items.some((m) => rowKey(m) === firstBefore));
		firstBefore = first;
		if (!open || settingsOpen) return;
		untrack(() => {
			if (atBottom) void scrollToBottom();
			else if (prepended && scrollEl) {
				scrollEl.scrollTop += scrollEl.scrollHeight - heightBefore;
			}
		});
	});

	// A page that doesn't fill the rail can't be scrolled up: keep loading
	// until it does. Not while filtering, which could walk the whole
	// history looking for a match.
	$effect(() => {
		void entries;
		if (!open || settingsOpen || loading || loadingOlder || exhausted) return;
		if (laneFilter !== 'all' || query.trim()) return;
		void tick().then(() => {
			if (scrollEl && scrollEl.scrollHeight - scrollEl.clientHeight < LOAD_THRESHOLD) {
				void onLoadOlder();
			}
		});
	});

	const togglePause = () => {
		pausedAfter = pausedAfter == null ? latestTime(items) : null;
		if (pausedAfter == null) void scrollToBottom();
	};

	const toggleExpanded = (id: number) => {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	};

	// Hour headers in the display timezone; earlier days carry the date.
	const hourOf = (m: ChatMessage): { key: string; label: string } => {
		const zoned = zonedDateTime(m.created_at);
		if (!zoned) return { key: 'unknown', label: 'Unknown time' };
		const day = dayKey(m.created_at);
		const top = messageTime(m) - (zoned.minute * 60 + zoned.second) * 1000 - zoned.millisecond;
		const hour = formatTime(top, { hour: '2-digit', minute: '2-digit' });
		const label = day === dayKey(Date.now()) ? hour : `${formatDayHeading(day)} · ${hour}`;
		return { key: `${day} ${zoned.hour}`, label };
	};

	const timeOf = (m: ChatMessage) =>
		formatTime(m.created_at, { hour: '2-digit', minute: '2-digit' });
	const actorOf = (m: ChatMessage) => m.author_name ?? m.author_login ?? 'IRIS';
	const firstOf = (e: RailEntry) => (e.type === 'one' ? e.item : e.items[0]);

	/**
	 * Bring a row into view: drop the rail filters and the pause, open
	 * the burst it sits in, then ring it. False when the row isn't in the
	 * rail (routed to the chat, muted, or not loaded).
	 */
	export const locate = async (messageId: number): Promise<boolean> => {
		const target = items.find((m) => m.message_id === messageId);
		if (!target) return false;
		settingsOpen = false;
		laneFilter = 'all';
		query = '';
		pausedAfter = null;
		await tick();
		const burst = entries.find(
			(e) => e.type === 'burst' && e.items.some((m) => m.message_id === messageId)
		);
		if (burst && burst.type === 'burst' && !expanded.has(burst.items[0].message_id)) {
			toggleExpanded(burst.items[0].message_id);
			await tick();
		}
		const el = scrollEl?.querySelector(`[data-rail-id="${messageId}"]`) as HTMLElement | null;
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		highlightId = messageId;
		setTimeout(() => {
			if (highlightId === messageId) highlightId = null;
		}, 1600);
		return true;
	};

	const unseenByLane = $derived(
		STREAM_LANES.map((l) => ({
			lane: l,
			count: unseen.filter((m) => laneOf(m) === l.key).length
		})).filter((x) => x.count > 0)
	);
</script>

{#snippet rowBody(m: ChatMessage)}
	{#if isPlainTextKind(m.kind)}
		<!-- Activity and tracker lines quote names verbatim (see PLAIN_TEXT_KINDS). -->
		<span>{m.body ?? ''}</span>
	{:else}
		<ChatMessageBody
			body={m.body ?? ''}
			attachments={m.attachments}
			{warRoomId}
			{onAttachmentClick}
			inline
		/>
	{/if}
{/snippet}

{#snippet rowActions(m: ChatMessage)}
	{@const mute = muteTargetFor(m)}
	{@const ref = resolveStreamRef(warRoomId, m.ref_type, m.ref_id, m.ref_case_id)}
	<div
		class="absolute right-1 top-1 z-10 hidden items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-sm focus-within:flex group-hover/row:flex"
	>
		<button
			type="button"
			class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => onDiscuss(m)}
			aria-label="Discuss in chat"
			title="Discuss in chat"
		>
			<MessageSquareQuote class="h-3.5 w-3.5" />
		</button>
		{#if mute}
			<button
				type="button"
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={() => onMute(m)}
				aria-label={mute.label}
				title={mute.label}
			>
				<BellOff class="h-3.5 w-3.5" />
			</button>
		{/if}
		{#if ref?.href}
			<a
				href={ref.href}
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label={`Open ${ref.label}`}
				title={`Open ${ref.label}`}
			>
				<ExternalLink class="h-3.5 w-3.5" />
			</a>
		{/if}
	</div>
{/snippet}

{#snippet rowIcon(m: ChatMessage)}
	{@const Icon = systemIcon(m.kind, m.activity_type)}
	<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/70">
		{#if Icon}
			<Icon class={`h-3.5 w-3.5 ${systemColor(m.kind, m.activity_type)}`} />
		{/if}
	</span>
{/snippet}

{#if open}
	<aside
		class="relative flex h-full min-h-0 max-w-[45%] shrink-0 flex-col border-l bg-card/40"
		style:width={`${width}px`}
		aria-label="Activity"
	>
		<!-- Drag to resize, arrow keys to nudge. A button rather than a
		     `role="separator"` div, like the alert queue divider. -->
		<button
			type="button"
			class="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize transition-colors hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline-none"
			aria-label="Resize activity — arrow keys to resize"
			title="Drag to resize"
			onpointerdown={startResize}
			onkeydown={nudgeWidth}
		></button>

		<div class="flex shrink-0 items-center gap-1 border-b px-3 py-2">
			<span class="relative mr-1 flex h-2 w-2" aria-hidden="true">
				{#if pausedAfter == null}
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"
					></span>
				{/if}
				<span
					class={[
						'relative inline-flex h-2 w-2 rounded-full',
						pausedAfter == null ? 'bg-emerald-500' : 'bg-amber-500'
					]}
				></span>
			</span>
			<p class="text-sm font-semibold">Activity</p>
			<span class="text-2xs tabular-nums text-muted-foreground">{items.length}</span>
			<div class="ml-auto flex items-center gap-0.5">
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={togglePause}
					aria-label={pausedAfter == null ? 'Pause activity' : 'Resume activity'}
					title={pausedAfter == null ? 'Pause' : 'Resume'}
				>
					{#if pausedAfter == null}
						<Pause class="h-4 w-4" />
					{:else}
						<Play class="h-4 w-4" />
					{/if}
				</button>
				<button
					type="button"
					class={[
						'rounded-md p-1.5',
						settingsOpen
							? 'bg-accent text-foreground'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'
					]}
					onclick={() => (settingsOpen = !settingsOpen)}
					aria-pressed={settingsOpen}
					aria-label="Activity settings"
					title="Activity settings"
				>
					<SlidersHorizontal class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={onToggle}
					aria-label="Hide activity"
					title="Hide activity  ]"
				>
					<PanelRightClose class="h-4 w-4" />
				</button>
			</div>
		</div>

		{#if !settingsOpen}
			<div class="shrink-0 space-y-2 border-b px-3 py-2">
				<div class="relative">
					<Search
						class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						value={query}
						oninput={(e) => (query = (e.target as HTMLInputElement).value)}
						onkeydown={(e) => {
							if (e.key === 'Escape') query = '';
						}}
						placeholder="Filter activity…"
						aria-label="Filter activity"
						class="h-7 w-full rounded-md border bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
					/>
					{#if query}
						<button
							type="button"
							class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
							onclick={() => (query = '')}
							aria-label="Clear filter"
						>
							<X class="h-3 w-3" />
						</button>
					{/if}
				</div>
				<div class="flex flex-wrap gap-1">
					{#each [{ key: 'all' as const, label: 'All' }, ...railLanes] as chip (chip.key)}
						{@const ChipIcon = chip.key === 'all' ? Layers : LANE_ICONS[chip.key].Icon}
						<button
							type="button"
							class={[
								'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-2xs transition-colors',
								laneFilter === chip.key
									? 'border-primary/40 bg-primary/10 font-medium text-primary'
									: 'text-muted-foreground hover:bg-muted hover:text-foreground'
							]}
							aria-pressed={laneFilter === chip.key}
							onclick={() => (laneFilter = chip.key)}
						>
							<ChipIcon class="h-3 w-3" />
							{chip.label}
							<span class="tabular-nums opacity-70">{countFor(chip.key)}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div
			bind:this={scrollEl}
			onscroll={onScroll}
			class={[
				'stream-thin-scroll min-h-0 flex-1 overflow-y-auto',
				!settingsOpen && 'px-1 pb-4 pt-1'
			]}
		>
			{#if settingsOpen}
				<ActivityRailSettings
					{prefs}
					{attachedCases}
					{laneCounts}
					onDone={() => (settingsOpen = false)}
				/>
			{:else if entries.length === 0}
				<div
					class="flex flex-col items-center gap-2 px-6 py-12 text-center text-xs text-muted-foreground"
				>
					{#if loading}
						<Loader2 class="h-5 w-5 animate-spin" />
						Loading activity…
					{:else}
						<Inbox class="h-6 w-6" />
						{items.length === 0 ? 'No activity yet.' : 'Nothing here with the current filters.'}
					{/if}
				</div>
			{:else}
				<!-- Fixed height whatever it shows, see the scroll anchoring. -->
				<div
					class="flex h-6 items-center justify-center text-2xs text-muted-foreground"
					aria-live="polite"
				>
					{#if loadingOlder}
						<Loader2 class="mr-1 h-3 w-3 animate-spin" />
						Loading older activity…
					{:else if exhausted}
						Start of the activity
					{/if}
				</div>
				<ul class="space-y-0.5">
					{#each entries as entry, i (entryKey(entry))}
						{@const first = firstOf(entry)}
						{@const hour = hourOf(first)}
						{#if i === 0 || hourOf(firstOf(entries[i - 1])).key !== hour.key}
							<li
								class="sticky top-0 z-10 -mx-1 bg-card/95 px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
							>
								{hour.label}
							</li>
						{/if}
						{#if entry.type === 'one'}
							<li
								data-rail-id={first.message_id}
								class={[
									'group/row relative flex gap-2 rounded-md px-2 py-1.5 transition-shadow hover:bg-muted/50',
									highlightId === first.message_id && 'ring-2 ring-primary/60'
								]}
							>
								{@render rowIcon(first)}
								<div class="min-w-0 flex-1 break-words text-xs leading-snug">
									<span class="font-medium">{actorOf(first)}</span>
									<span class="text-muted-foreground">{@render rowBody(first)}</span>
									<div class="mt-0.5 flex flex-wrap items-center gap-1.5">
										<StreamRefCard
											{warRoomId}
											refType={first.ref_type}
											refId={first.ref_id}
											refCaseId={first.ref_case_id}
											{attachedCases}
										/>
										<span class="text-2xs tabular-nums text-muted-foreground">{timeOf(first)}</span>
									</div>
								</div>
								{@render rowActions(first)}
							</li>
						{:else}
							{@const burst = entry.items}
							{@const last = burst[burst.length - 1]}
							{@const isOpen = expanded.has(first.message_id)}
							{@const summary = burstSummary(burst)}
							<li
								data-rail-id={first.message_id}
								class={[
									'group/row relative rounded-md px-2 py-1.5 hover:bg-muted/50',
									highlightId === first.message_id && 'ring-2 ring-primary/60'
								]}
							>
								<div class="flex gap-2">
									{@render rowIcon(first)}
									<div class="min-w-0 flex-1 break-words text-xs leading-snug">
										<span class="font-medium">{actorOf(first)}</span>
										{#if summary}
											<span class="text-muted-foreground">{summary}</span>
										{:else}
											<span class="text-muted-foreground">{@render rowBody(first)}</span>
											<span
												class="ml-0.5 rounded bg-muted px-1 text-2xs font-semibold tabular-nums text-foreground"
											>
												{burst.length}×
											</span>
										{/if}
										<div class="mt-0.5 flex flex-wrap items-center gap-1.5">
											<StreamRefCard
												{warRoomId}
												refType={first.ref_type}
												refId={first.ref_id}
												refCaseId={first.ref_case_id}
												{attachedCases}
											/>
											<span class="text-2xs tabular-nums text-muted-foreground">
												{timeOf(first)}–{timeOf(last)}
											</span>
											<button
												type="button"
												class="ml-auto inline-flex items-center gap-0.5 text-2xs text-primary hover:underline"
												onclick={() => toggleExpanded(first.message_id)}
												aria-expanded={isOpen}
											>
												{isOpen ? 'Hide' : 'Show all'}
												{#if isOpen}
													<ChevronUp class="h-3 w-3" />
												{:else}
													<ChevronDown class="h-3 w-3" />
												{/if}
											</button>
										</div>
									</div>
								</div>
								{#if isOpen}
									<ul class="ml-8 mt-1 space-y-0.5 border-l pl-2">
										{#each burst as m (`${m.message_id}:${m.created_at}`)}
											<li
												data-rail-id={m.message_id}
												class={[
													'group/sub relative flex items-baseline gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/60',
													highlightId === m.message_id && 'ring-2 ring-primary/60'
												]}
											>
												<span class="min-w-0 flex-1 break-words text-muted-foreground">
													{@render rowBody(m)}
												</span>
												<span class="shrink-0 text-2xs tabular-nums text-muted-foreground">
													{timeOf(m)}
												</span>
												<button
													type="button"
													class="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted focus:visible group-hover/sub:visible"
													onclick={() => onDiscuss(m)}
													aria-label="Discuss in chat"
													title="Discuss in chat"
												>
													<MessageSquareQuote class="h-3 w-3" />
												</button>
											</li>
										{/each}
									</ul>
								{/if}
								{@render rowActions(first)}
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
		</div>

		{#if !settingsOpen && pending > 0}
			<button
				type="button"
				class="mx-3 mb-2 mt-1 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-1 text-2xs font-semibold text-primary-foreground shadow-md"
				onclick={togglePause}
			>
				<ArrowDown class="h-3 w-3" />
				{pending} new event{pending === 1 ? '' : 's'} · resume
			</button>
		{/if}

		{#if !settingsOpen && (hiddenCount > 0 || offLanes > 0)}
			<div class="shrink-0 border-t px-3 py-1.5 text-2xs text-muted-foreground">
				<EyeOff class="mr-1 inline h-3 w-3" />
				{#if hiddenCount > 0}
					{hiddenCount} event{hiddenCount === 1 ? '' : 's'} muted ·
				{/if}
				{#if offLanes > 0}
					{offLanes} lane{offLanes === 1 ? '' : 's'} off ·
				{/if}
				<button
					type="button"
					class="text-primary hover:underline"
					onclick={() => (settingsOpen = true)}
				>
					Edit
				</button>
			</div>
		{/if}
	</aside>
{:else}
	<button
		type="button"
		class="flex h-full w-11 shrink-0 flex-col items-center gap-3 border-l bg-card/40 py-2 transition-colors hover:bg-muted/40"
		onclick={onToggle}
		aria-label={`Show activity${unseen.length ? `, ${unseen.length} new` : ''}`}
		title="Show activity  ]"
	>
		<span class="rounded-md p-1.5 text-muted-foreground">
			<PanelRightOpen class="h-4 w-4" />
		</span>
		<span class="relative text-muted-foreground">
			<Activity class="h-4 w-4" />
			{#if unseen.length > 0}
				<span
					class="absolute -right-2.5 -top-2 rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground"
				>
					{unseen.length > 99 ? '99+' : unseen.length}
				</span>
			{/if}
		</span>
		<span
			class="text-2xs font-medium uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl]"
		>
			Activity
		</span>
		<span class="mt-1 flex flex-col items-center gap-2.5">
			{#each unseenByLane as { lane, count } (lane.key)}
				{@const meta = LANE_ICONS[lane.key]}
				<span class="flex flex-col items-center gap-0.5" title={lane.label}>
					<meta.Icon class={`h-3.5 w-3.5 ${meta.color}`} />
					<span class="text-[9px] tabular-nums text-muted-foreground">{count}</span>
				</span>
			{/each}
		</span>
	</button>
{/if}

<style>
	.stream-thin-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
	}

	.stream-thin-scroll:hover {
		scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
	}
</style>
