import { notifications } from '$lib/stores/notifications.store';
import {
	AI_EDITOR_EVENT,
	AI_EDITOR_JOIN,
	AI_EDITOR_LEAVE,
	AI_EDITOR_UPDATE,
	AI_WORKFLOW_SAVED_EVENT,
	type AiEditorPresenceAck,
	type AiEditorPresenceEvent,
	type AiWorkflowSavedEvent
} from '$lib/services/ai-workflows.service';
import {
	PRESENCE_HEARTBEAT_MS,
	presenceApply,
	presenceByNode,
	presenceExpire,
	presenceLockHolder,
	presenceUsers,
	type AiEditorPeer,
	type AiEditorPeers,
	type AiEditorSelf
} from './presence';

/**
 * This tab's presence in a workflow's editor: joins the editors' room
 * (again on every reconnect), tells the room which node it configures,
 * keeps the list of the other editors, and hands the saves made
 * elsewhere to `onSaved`.
 */
export class EditorPresence {
	peers = $state<AiEditorPeers>({});
	self = $state<AiEditorSelf>({ peerId: null, nodeId: null, focusedAt: null });
	readonly users = $derived(presenceUsers(this.peers));
	readonly byNode = $derived(presenceByNode(this.peers));

	readonly #workflowId: number;
	readonly #onSaved: (event: AiWorkflowSavedEvent) => void;
	#offs: (() => void)[] = [];
	#timer: ReturnType<typeof setInterval> | null = null;

	constructor(workflowId: number, onSaved: (event: AiWorkflowSavedEvent) => void) {
		this.#workflowId = workflowId;
		this.#onSaved = onSaved;
	}

	start() {
		if (this.#offs.length) return;
		this.#offs.push(
			notifications.onSocketEvent<AiEditorPresenceEvent>(AI_EDITOR_EVENT, (e) => this.#receive(e)),
			notifications.onSocketEvent<AiWorkflowSavedEvent>(AI_WORKFLOW_SAVED_EVENT, (e) => {
				if (e?.workflow_id === this.#workflowId) this.#onSaved(e);
			}),
			notifications.watchRoom(
				AI_EDITOR_JOIN,
				AI_EDITOR_LEAVE,
				() => this.#payload(),
				(ack) => this.#ack(ack as AiEditorPresenceAck)
			)
		);
		this.#timer = setInterval(() => {
			this.#announce();
			this.peers = presenceExpire(this.peers, Date.now());
		}, PRESENCE_HEARTBEAT_MS);
	}

	stop() {
		for (const off of this.#offs) off();
		this.#offs = [];
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
		this.peers = {};
	}

	/** The node this tab now configures, null for none. */
	focus(nodeId: string | null) {
		if (this.self.nodeId === nodeId) return;
		// Not ours until the server stamps it
		this.self = { ...this.self, nodeId, focusedAt: null };
		this.#announce();
	}

	/** Who holds `nodeId` when it is not this tab, else null. */
	lockHolder(nodeId: string | null | undefined): AiEditorPeer | null {
		return nodeId ? presenceLockHolder(this.peers, nodeId, this.self) : null;
	}

	#payload() {
		return { workflow_id: this.#workflowId, node_id: this.self.nodeId };
	}

	#announce() {
		notifications.emit(AI_EDITOR_UPDATE, this.#payload(), (ack) =>
			this.#ack(ack as AiEditorPresenceAck)
		);
	}

	#ack(ack: AiEditorPresenceAck | null | undefined) {
		if (!ack?.ok || !ack.peer_id) return;
		// The answer to an older focus says nothing of the current one
		const current = (ack.node_id ?? null) === this.self.nodeId;
		this.self = {
			...this.self,
			peerId: ack.peer_id,
			focusedAt: current ? (ack.focused_at ?? null) : this.self.focusedAt
		};
	}

	#receive(event: AiEditorPresenceEvent) {
		if (event?.workflow_id !== this.#workflowId) return;
		this.peers = presenceApply(this.peers, event, Date.now(), this.self.peerId);
		// A newcomer builds its list from the answers
		if (event.type === 'hello' && event.peer_id !== this.self.peerId) this.#announce();
	}
}
