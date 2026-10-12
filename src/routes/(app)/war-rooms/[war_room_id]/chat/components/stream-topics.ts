import type { ChatMessage, ChatTopic } from '$lib/services/war-room-chat.service';

/** Topic a stream row belongs to: NULL on a chat row means Main. Case
 * activity rows (negative ids) belong to no topic. */
export function messageTopicId(m: ChatMessage, mainId: number | null): number | null {
	if (m.message_id < 0) return null;
	return m.topic_id ?? mainId;
}

/** Whether a row shows under the selected topics. Case activity shows
 * under every topic; with no topics (or no selection) everything shows. */
export function matchesTopics(
	m: ChatMessage,
	selected: ReadonlySet<number>,
	mainId: number | null
): boolean {
	if (selected.size === 0 || m.message_id < 0) return true;
	const topicId = messageTopicId(m, mainId);
	return topicId != null && selected.has(topicId);
}

/**
 * New messages per unselected topic, from one unfiltered poll.
 *
 * Only chat ids above `watermark` count, so a message is counted once
 * however many polls return it. The first poll (`watermark` null) only
 * sets the baseline: what was posted before the page opened is not new.
 */
export function unreadByTopic(
	incoming: ChatMessage[],
	watermark: number | null,
	selected: ReadonlySet<number>,
	mainId: number | null
): { counts: Map<number, number>; watermark: number | null } {
	const counts = new Map<number, number>();
	let next = watermark;
	for (const m of incoming) {
		if (m.message_id < 0) continue;
		if (next == null || m.message_id > next) next = m.message_id;
		if (watermark == null || m.message_id <= watermark) continue;
		const topicId = messageTopicId(m, mainId);
		if (topicId != null && !selected.has(topicId)) {
			counts.set(topicId, (counts.get(topicId) ?? 0) + 1);
		}
	}
	return { counts, watermark: next };
}

/** The composer target once the selection changed: kept while still
 * selected, else Main when selected, else the first selected live topic,
 * else Main. Never a topic the stream no longer shows when avoidable. */
export function composerTopicFor(
	current: number | null,
	selected: ReadonlySet<number>,
	topics: ChatTopic[],
	mainId: number | null
): number | null {
	if (current != null && selected.has(current)) return current;
	const live = topics.filter((t) => selected.has(t.topic_id) && !t.archived_at);
	if (mainId != null && live.some((t) => t.topic_id === mainId)) return mainId;
	return live[0]?.topic_id ?? mainId;
}
