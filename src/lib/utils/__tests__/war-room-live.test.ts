import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	WAR_ROOM_LIVE_TOPICS,
	createWarRoomLiveHub,
	isWarRoomLiveTopic,
	resolveWarRoomLiveTopic,
	type WarRoomLiveTopic
} from '../war-room-live';

describe('war-room live hub', () => {
	let hidden: boolean;

	beforeEach(() => {
		vi.useFakeTimers();
		hidden = false;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const hub = () => createWarRoomLiveHub({ debounceMs: 100, isHidden: () => hidden });

	it('knows the topics', () => {
		expect(isWarRoomLiveTopic('tasks')).toBe(true);
		expect(isWarRoomLiveTopic('nope')).toBe(false);
		expect(isWarRoomLiveTopic(3)).toBe(false);
	});

	it('calls a subscriber once per burst, with the topics that changed', async () => {
		const h = hub();
		const handler = vi.fn();
		h.subscribe(['tasks', 'scope'], handler);

		h.dispatch('tasks');
		h.dispatch('scope');
		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(99);
		expect(handler).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(handler).toHaveBeenCalledTimes(1);
		expect([...handler.mock.calls[0][0]].sort()).toEqual(['scope', 'tasks']);
	});

	it('only calls the subscribers of the topic', async () => {
		const h = hub();
		const tasks = vi.fn();
		const scope = vi.fn();
		h.subscribe(['tasks'], tasks);
		h.subscribe(['scope'], scope);

		h.dispatch('scope');
		await vi.advanceTimersByTimeAsync(100);
		expect(tasks).not.toHaveBeenCalled();
		expect(scope).toHaveBeenCalledTimes(1);
	});

	it('resolves the trackers_changed push onto the trackers topic', async () => {
		expect(resolveWarRoomLiveTopic('trackers')).toBe('trackers');
		expect(resolveWarRoomLiveTopic('trackers_changed')).toBe('trackers');
		expect(resolveWarRoomLiveTopic('nope')).toBeNull();
		const h = hub();
		const handler = vi.fn();
		h.subscribe(['trackers'], handler);
		h.dispatch('trackers_changed');
		await vi.advanceTimersByTimeAsync(100);
		expect(handler).toHaveBeenCalledTimes(1);
		expect([...handler.mock.calls[0][0]]).toEqual(['trackers']);
	});

	it('ignores unknown topics', async () => {
		const h = hub();
		const handler = vi.fn();
		h.subscribe([...WAR_ROOM_LIVE_TOPICS], handler);

		h.dispatch('everything');
		await vi.advanceTimersByTimeAsync(1000);
		expect(handler).not.toHaveBeenCalled();
	});

	it('never runs a subscriber twice at once, and reruns once it is done', async () => {
		const h = hub();
		let release: () => void = () => {};
		const handler = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		h.subscribe(['tasks'], handler);

		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(100);
		expect(handler).toHaveBeenCalledTimes(1);

		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(500);
		expect(handler).toHaveBeenCalledTimes(1);

		release();
		await vi.advanceTimersByTimeAsync(100);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it('keeps going after a failed refresh', async () => {
		const h = hub();
		const handler = vi.fn().mockRejectedValueOnce(new Error('down'));
		h.subscribe(['tasks'], handler);

		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(100);
		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(100);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it('holds the pushes while the tab is hidden, until flushed', async () => {
		const h = hub();
		const handler = vi.fn();
		h.subscribe(['tasks'], handler);

		hidden = true;
		h.dispatch('tasks');
		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(1000);
		expect(handler).not.toHaveBeenCalled();

		hidden = false;
		h.flush();
		await vi.advanceTimersByTimeAsync(100);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('stops calling a subscriber once unsubscribed', async () => {
		const h = hub();
		const handler = vi.fn();
		const unsubscribe = h.subscribe(['tasks'], handler);

		h.dispatch('tasks');
		unsubscribe();
		await vi.advanceTimersByTimeAsync(1000);
		expect(handler).not.toHaveBeenCalled();
	});

	it('refreshes every subscriber on dispatchAll', async () => {
		const h = hub();
		const seen: WarRoomLiveTopic[][] = [];
		h.subscribe(['tasks'], (topics) => {
			seen.push([...topics]);
		});
		h.subscribe(['chat', 'notes'], (topics) => {
			seen.push([...topics].sort());
		});

		h.dispatchAll();
		await vi.advanceTimersByTimeAsync(100);
		expect(seen).toEqual([['tasks'], ['chat', 'notes']]);
	});

	it('drops everything on dispose', async () => {
		const h = hub();
		const handler = vi.fn();
		h.subscribe(['tasks'], handler);

		h.dispatch('tasks');
		h.dispose();
		h.dispatch('tasks');
		await vi.advanceTimersByTimeAsync(1000);
		expect(handler).not.toHaveBeenCalled();
	});
});
