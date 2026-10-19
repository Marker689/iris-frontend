/**
 * Case-chat service — REST wrappers for conversation CRUD and a
 * `ChatSocketClient` class that owns the `/chat` SocketIO connection
 * for one panel instance.
 *
 * The socket does the token streaming; the REST endpoints are for
 * listing / opening / archiving conversations without spinning up a
 * socket. Both paths speak the same envelope shape as every other v2
 * service in the app (`ApiService.get/post/delete`).
 */
import { io, type Socket } from 'socket.io-client';
import { apiOrigin, socketOrigin } from '$lib/config/api.config';
import { auth } from '$lib/stores/auth.store';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// ---------------------------------------------------------------------
// Types — mirror the backend Marshmallow schemas
// ---------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'tool';

/**
 * Anthropic-shaped content block, the same shape the backend
 * persists. Kept intentionally open — new block types (image, audio)
 * can appear without a TS change.
 */
export interface ChatContentBlock {
	type: 'text' | 'tool_use' | 'tool_result' | string;
	// text block
	text?: string;
	// tool_use block
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	// tool_result block
	tool_use_id?: string;
	content?: unknown;
	[k: string]: unknown;
}

/**
 * A file sent to Yuki, as the user message keeps it (`type:
 * 'attachment'` block) and as the upload returns it. The kind comes
 * from the bytes, server side.
 */
export interface ChatAttachment {
	type: 'attachment';
	attachment_id: number;
	filename: string;
	kind: 'image' | 'pdf' | 'text';
	media_type: string;
	size: number;
}

/** Mirrors the backend limits in `iris_engine/llm/attachments.py`. */
export const CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_ATTACHMENTS_MAX_PER_MESSAGE = 5;

export interface ChatMessage {
	id: number;
	conversation_id: number;
	role: ChatRole;
	content: ChatContentBlock[];
	tool_use_id?: string | null;
	created_at: string;
}

/**
 * The chatbot policy enforced on a conversation, when the case's (or
 * war room's) customer is bound to one. Null means the thread runs on
 * the global chatbot settings.
 *
 * A trimmed view of the admin `ChatbotPolicy`: no credentials, no
 * budgets (the usage bar covers those) — just what changes for the
 * analyst using the thread.
 */
export interface ChatConversationPolicy {
	id: number;
	name: string;
	description: string;
	/** Higher = stricter; ≥100 is a local-only provider. */
	restriction_level: number;
	provider: string;
	model: string;
	redact_ips: boolean;
	redact_emails: boolean;
	redact_hashes: boolean;
	/** 0 = keep forever. */
	retention_days: number;
}

export interface ChatConversation {
	id: number;
	case_id: number | null;
	war_room_id: number | null;
	user_id: number;
	model: string;
	title: string;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
	policy?: ChatConversationPolicy | null;
	/** User turns sent while Yuki was running, waiting for its next step. */
	queued_user_texts?: string[];
	/** The analyst's opt-in to run writes without the Approve/Deny card. */
	auto_approve_write_tools?: boolean;
	/** Whether the admin (or the enforced policy) lets the analyst opt in. */
	auto_approve_write_tools_allowed?: boolean;
}

export interface PendingToolCall {
	id: number;
	conversation_id: number;
	assistant_message_id: number;
	tool_use_id: string;
	tool_name: string;
	arguments: Record<string, unknown>;
	status: 'pending' | 'approved' | 'denied' | 'expired';
	created_at: string;
}

/**
 * Aggregate token/context stats for a conversation, emitted by the
 * backend on every `assistant_end` and included on the conversation GET.
 *
 * `avg_context_size` is the mean of `prompt_tokens` across all egress
 * rows for the conversation — i.e. the average size of the payload
 * shipped to the provider per turn. Grows monotonically as history
 * accumulates, so it's a useful "am I about to hit the limit?" signal
 * beside the token-total counter.
 *
 * `daily` is present only when the backend resolved it against the
 * caller's user id (own-conversation GET + assistant_end for the owning
 * user). Absent for cross-user admin views.
 */
export interface ChatUsage {
	prompt_tokens_total: number;
	completion_tokens_total: number;
	cache_read_tokens_total: number;
	cache_creation_tokens_total: number;
	total_tokens: number;
	avg_context_size: number;
	last_context_size: number;
	turn_count: number;
	daily?: {
		user_used: number;
		org_used: number;
		user_budget: number;
		org_budget: number;
	};
}

export interface ChatConversationDetail extends ChatConversation {
	messages: ChatMessage[];
	pending_tool_calls: PendingToolCall[];
	usage?: ChatUsage;
}

export interface ChatHealth {
	enabled: boolean;
	provider_available: boolean;
	model?: string;
	reason?: string | null;
}

// ---------------------------------------------------------------------
// REST facade
// ---------------------------------------------------------------------

export class ChatService {
	static async health(options: ApiOptions = {}): Promise<RequestResponse<ChatHealth>> {
		return ApiService.get<ChatHealth>('/case-chat/health', options);
	}

	static async listCaseConversations(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversations: ChatConversation[] }>> {
		return ApiService.get(`/case-chat/cases/${caseId}/conversations`, options);
	}

	static async createCaseConversation(
		caseId: number,
		body: { title?: string } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.post<ChatConversation>(
			`/case-chat/cases/${caseId}/conversations`,
			body,
			options
		);
	}

	static async listGlobalConversations(
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversations: ChatConversation[] }>> {
		return ApiService.get('/case-chat/global/conversations', options);
	}

	static async listWarRoomConversations(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversations: ChatConversation[] }>> {
		return ApiService.get(`/case-chat/war-rooms/${warRoomId}/conversations`, options);
	}

	static async createWarRoomConversation(
		warRoomId: number,
		body: { title?: string } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.post<ChatConversation>(
			`/case-chat/war-rooms/${warRoomId}/conversations`,
			body,
			options
		);
	}

	static async createGlobalConversation(
		body: { title?: string } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.post<ChatConversation>('/case-chat/global/conversations', body, options);
	}

	static async getConversation(
		conversationId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversationDetail>> {
		return ApiService.get<ChatConversationDetail>(
			`/case-chat/conversations/${conversationId}`,
			options
		);
	}

	static async archiveConversation(
		conversationId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.delete(`/case-chat/conversations/${conversationId}`, options);
	}

	/**
	 * Upload a file for the next turn. Multipart, so it bypasses
	 * ApiService (which forces JSON) and carries the bearer itself.
	 */
	static async uploadAttachment(
		conversationId: number,
		file: File
	): Promise<RequestResponse<ChatAttachment>> {
		const form = new FormData();
		form.append('file', file, file.name || 'pasted-file');
		const token = auth.getAccessToken();
		const headers: Record<string, string> = {};
		if (token) headers.Authorization = `Bearer ${token}`;
		try {
			const response = await fetch(
				`${apiOrigin()}/api/v2/case-chat/conversations/${conversationId}/attachments`,
				{ method: 'POST', body: form, headers }
			);
			let body: { data?: ChatAttachment; message?: string } | null = null;
			try {
				body = await response.json();
			} catch {
				body = null;
			}
			if (!response.ok) {
				return {
					status: response.status,
					data: null,
					ok: false,
					error: {
						message: body?.message ?? `Upload failed (${response.status})`,
						type: 'api-error',
						status: response.status
					}
				};
			}
			return {
				status: response.status,
				data: body?.data ?? (body as unknown as ChatAttachment),
				ok: true
			};
		} catch (err) {
			return {
				status: 0,
				data: null,
				ok: false,
				error: {
					message: err instanceof Error ? err.message : 'Network error',
					type: 'network',
					status: 0
				}
			};
		}
	}

	/** The bytes of a sent file, fetched with the bearer (a bare URL would 401). */
	static async fetchAttachment(attachmentId: number): Promise<Blob | null> {
		const token = auth.getAccessToken();
		const headers: Record<string, string> = {};
		if (token) headers.Authorization = `Bearer ${token}`;
		try {
			const response = await fetch(`${apiOrigin()}/api/v2/case-chat/attachments/${attachmentId}`, {
				headers
			});
			return response.ok ? await response.blob() : null;
		} catch {
			return null;
		}
	}

	static async renameConversation(
		conversationId: number,
		title: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.patch<ChatConversation>(
			`/case-chat/conversations/${conversationId}`,
			{ title },
			options
		);
	}

	static async setAutoApproveWriteTools(
		conversationId: number,
		enabled: boolean,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.patch<ChatConversation>(
			`/case-chat/conversations/${conversationId}`,
			{ auto_approve_write_tools: enabled },
			options
		);
	}
}

// ---------------------------------------------------------------------
// SocketIO client
// ---------------------------------------------------------------------

/**
 * Per-panel socket. Owns one `/chat` namespace connection and dispatches
 * inbound events into user-supplied handlers. Auth mirrors the
 * `/notifications` pattern in `notifications.store.ts`.
 */
export type ChatSocketHandlers = {
	onAssistantDelta?: (payload: { conversation_id: number; text: string }) => void;
	onAssistantToolStart?: (payload: {
		conversation_id: number;
		pending_tool_call_id?: number;
		tool_use_id: string;
		tool_name: string;
		arguments: Record<string, unknown>;
		is_write: boolean;
		pending: boolean;
	}) => void;
	onAssistantToolResult?: (payload: {
		conversation_id: number;
		tool_use_id: string;
		tool_name: string;
		result?: unknown;
		error?: string;
	}) => void;
	onAssistantEnd?: (payload: {
		conversation_id: number;
		message_id?: number;
		stop_reason?: string;
		usage?: ChatUsage;
	}) => void;
	onUserMessagePersisted?: (payload: { conversation_id: number; message_id?: number }) => void;
	onUserMessageQueued?: (payload: { conversation_id: number; queued_user_texts: string[] }) => void;
	onError?: (payload: { message: string }) => void;
	onConnectFailure?: () => void;
};

export class ChatSocketClient {
	private socket: Socket | null = null;
	private handlers: ChatSocketHandlers;

	constructor(handlers: ChatSocketHandlers = {}) {
		this.handlers = handlers;
	}

	connect(): void {
		if (this.socket) return;
		const token = auth.getAccessToken();
		const baseUrl = socketOrigin();

		this.socket = io(`${baseUrl}/chat`, {
			auth: token ? { token } : {},
			extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
			transports: ['websocket', 'polling'],
			reconnectionAttempts: 3
		});

		this.socket.on('assistant_delta', (p) => this.handlers.onAssistantDelta?.(p));
		this.socket.on('assistant_tool_start', (p) => this.handlers.onAssistantToolStart?.(p));
		this.socket.on('assistant_tool_result', (p) => this.handlers.onAssistantToolResult?.(p));
		this.socket.on('assistant_end', (p) => this.handlers.onAssistantEnd?.(p));
		this.socket.on('user_message_persisted', (p) => this.handlers.onUserMessagePersisted?.(p));
		this.socket.on('user_message_queued', (p) => this.handlers.onUserMessageQueued?.(p));
		this.socket.on('error', (p) => this.handlers.onError?.(p ?? {}));
		this.socket.on('connect_error', () => this.handlers.onConnectFailure?.());
	}

	disconnect(): void {
		this.socket?.disconnect();
		this.socket = null;
	}

	joinConversation(conversationId: number): void {
		this.socket?.emit('join_conversation', {
			conversation_id: conversationId
		});
	}

	leaveConversation(conversationId: number): void {
		this.socket?.emit('leave_conversation', {
			conversation_id: conversationId
		});
	}

	send(conversationId: number, userText: string, attachmentIds: number[] = []): void {
		this.socket?.emit('send', {
			conversation_id: conversationId,
			user_text: userText,
			...(attachmentIds.length ? { attachment_ids: attachmentIds } : {})
		});
	}

	/** Stop the running turn where it is. */
	stop(conversationId: number): void {
		this.socket?.emit('stop', {
			conversation_id: conversationId
		});
	}

	approveTool(pendingToolCallId: number, conversationId: number): void {
		this.socket?.emit('approve_tool', {
			pending_tool_call_id: pendingToolCallId,
			conversation_id: conversationId
		});
	}

	denyTool(pendingToolCallId: number, conversationId: number): void {
		this.socket?.emit('deny_tool', {
			pending_tool_call_id: pendingToolCallId,
			conversation_id: conversationId
		});
	}
}
