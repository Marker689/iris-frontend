import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatTopic } from '$lib/services/war-room-chat.service';
import { composerTopicFor, matchesTopics, messageTopicId, unreadByTopic } from '../stream-topics';

const MAIN = 1;
const IOC = 2;
const COMMS = 3;

const message = (message_id: number, topic_id: number | null = null) =>
	({ message_id, topic_id }) as ChatMessage;

const topic = (topic_id: number, archived = false) =>
	({
		topic_id,
		is_main: topic_id === MAIN,
		archived_at: archived ? '2026-10-01T00:00:00' : null
	}) as ChatTopic;

describe('messageTopicId', () => {
	it('puts a chat row without topic on Main and case activity on none', () => {
		expect(messageTopicId(message(10), MAIN)).toBe(MAIN);
		expect(messageTopicId(message(10, IOC), MAIN)).toBe(IOC);
		expect(messageTopicId(message(-7), MAIN)).toBeNull();
	});
});

describe('matchesTopics', () => {
	it('keeps only the rows of the selected topics', () => {
		const selected = new Set([IOC]);
		expect(matchesTopics(message(10, IOC), selected, MAIN)).toBe(true);
		expect(matchesTopics(message(11, COMMS), selected, MAIN)).toBe(false);
		expect(matchesTopics(message(12), selected, MAIN)).toBe(false);
	});

	it('shows Main rows stored without topic when Main is selected', () => {
		expect(matchesTopics(message(12), new Set([MAIN]), MAIN)).toBe(true);
	});

	it('shows case activity under every topic, and everything without a selection', () => {
		expect(matchesTopics(message(-7), new Set([IOC]), MAIN)).toBe(true);
		expect(matchesTopics(message(11, COMMS), new Set(), MAIN)).toBe(true);
	});
});

describe('unreadByTopic', () => {
	const selected = new Set([MAIN]);

	it('only sets the baseline on the first poll', () => {
		const out = unreadByTopic([message(12, IOC), message(9, COMMS)], null, selected, MAIN);
		expect(out.counts.size).toBe(0);
		expect(out.watermark).toBe(12);
	});

	it('counts each new message once, however many polls return it', () => {
		const incoming = [message(14, IOC), message(13, IOC), message(12, COMMS), message(11)];
		const first = unreadByTopic(incoming, 12, selected, MAIN);
		expect(Object.fromEntries(first.counts)).toEqual({ [IOC]: 2 });
		expect(first.watermark).toBe(14);
		expect(unreadByTopic(incoming, first.watermark, selected, MAIN).counts.size).toBe(0);
	});

	it('ignores the selected topics and case activity', () => {
		const out = unreadByTopic([message(-50), message(13), message(14, IOC)], 12, selected, MAIN);
		expect(Object.fromEntries(out.counts)).toEqual({ [IOC]: 1 });
		expect(out.watermark).toBe(14);
	});
});

describe('composerTopicFor', () => {
	const topics = [topic(MAIN), topic(IOC), topic(COMMS, true)];

	it('keeps the composer on a topic still selected', () => {
		expect(composerTopicFor(IOC, new Set([MAIN, IOC]), topics, MAIN)).toBe(IOC);
	});

	it('moves off a deselected topic to Main, else to another selected live topic', () => {
		expect(composerTopicFor(IOC, new Set([MAIN]), topics, MAIN)).toBe(MAIN);
		expect(composerTopicFor(MAIN, new Set([IOC, COMMS]), topics, MAIN)).toBe(IOC);
	});

	it('falls back to Main when only archived topics are selected', () => {
		expect(composerTopicFor(IOC, new Set([COMMS]), topics, MAIN)).toBe(MAIN);
	});
});
