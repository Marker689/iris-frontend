<!--
  Approve / Deny UI for a pending write tool call.

  Shows a **diff-of-state** description in analyst language via
  `_describeAction()` — falls back to a JSON dump for tools without a
  hand-written renderer. Includes an untrusted-content banner (§7 of
  the plan) so the analyst is nudged to evaluate the suggestion
  independently of the case data that may have inspired it.
-->
<script lang="ts">
	import { AlertTriangleIcon, CheckIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PendingToolCall } from '$lib/services/chat.service';

	let {
		pending,
		onApprove,
		onDeny
	}: {
		pending: PendingToolCall;
		onApprove: (id: number) => void;
		onDeny: (id: number) => void;
	} = $props();

	// Per-tool state-diff descriptions. Extending this dict is the
	// canonical way to make the Approve card readable for a new write
	// tool. Fall-through renders raw JSON with a warning.
	function describeAction(pc: PendingToolCall): string | null {
		const a = pc.arguments as Record<string, unknown>;
		switch (pc.tool_name) {
			case 'iris_cases_close':
				return `Close case #${a.case_identifier}.`;
			case 'iris_cases_reopen':
				return `Reopen case #${a.case_identifier}.`;
			case 'iris_cases_update': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				return typeof p.case_description === 'string'
					? `Update case #${a.case_identifier} and rewrite its summary.`
					: `Update case #${a.case_identifier}.`;
			}
			case 'iris_cases_create':
				return `Create a new case${
					a.payload && typeof a.payload === 'object'
						? ` named ${JSON.stringify((a.payload as Record<string, unknown>).case_name ?? '')}`
						: ''
				}.`;
			case 'iris_case_iocs_create':
				return `Create a new IOC on case #${a.case_identifier}.`;
			case 'iris_case_iocs_update':
				return `Update IOC #${a.ioc_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_iocs_delete':
				return `Delete IOC #${a.ioc_identifier} from case #${a.case_identifier}.`;
			case 'iris_case_assets_create':
				return `Create a new asset on case #${a.case_identifier}.`;
			case 'iris_case_assets_update':
				return `Update asset #${a.asset_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_assets_delete':
				return `Delete asset #${a.asset_identifier} from case #${a.case_identifier}.`;
			case 'iris_case_events_create': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				return `Add the event${p.event_title ? ` "${p.event_title}"` : ''} to the timeline of case #${
					a.case_identifier
				}.`;
			}
			case 'iris_case_events_update':
				return `Update event #${a.event_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_events_delete':
				return `Delete event #${a.event_identifier} from case #${a.case_identifier}.`;
			case 'iris_case_notes_create': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				return `Create a note${p.note_title ? ` titled "${p.note_title}"` : ''} on case #${a.case_identifier}.`;
			}
			case 'iris_case_notes_update': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				return describeNoteEdit(
					`note #${a.note_identifier} on case #${a.case_identifier}`,
					p.note_title,
					p.note_content
				);
			}
			case 'iris_war_room_notes_create':
				return `Create a note${a.title ? ` titled "${a.title}"` : ''} in this war room.`;
			case 'iris_war_room_notes_update':
				return describeNoteEdit(`war-room note #${a.note_id}`, a.title, a.content);
			case 'iris_war_rooms_update': {
				const changes = [
					typeof a.name === 'string' ? `rename it to "${a.name}"` : '',
					a.state ? `set its state to ${a.state}` : '',
					a.severity_id !== undefined ? `set its severity to #${a.severity_id}` : '',
					typeof a.description === 'string' ? 'rewrite its summary' : ''
				].filter(Boolean);
				return `Update this war room${changes.length ? `: ${changes.join(', ')}` : ''}.`;
			}
			case 'iris_war_room_sitreps_update':
				return describeNoteEdit(`sitrep #${a.sitrep_id}`, a.title, a.body_md);
			case 'iris_war_room_tasks_update':
				return a.closed === true
					? `Close war-room task #${a.task_id}.`
					: a.closed === false
						? `Reopen war-room task #${a.task_id}.`
						: `Update war-room task #${a.task_id}.`;
			case 'iris_war_room_decisions_update':
				return `Update decision #${a.decision_id}${a.status ? ` and set it to ${a.status}` : ''}.`;
			case 'iris_war_room_timeline_events_create':
				return `Add the event${a.title ? ` "${a.title}"` : ''} to war-room timeline #${a.timeline_id}.`;
			case 'iris_war_room_timeline_events_update':
				return `Update war-room timeline event #${a.event_id}.`;
			case 'iris_war_room_scope_assets_create': {
				const asset = (a.asset as Record<string, unknown>) ?? {};
				return `Create the asset${asset.asset_name ? ` "${asset.asset_name}"` : ''} in ${cases(a.case_ids)}.`;
			}
			case 'iris_war_room_scope_iocs_create': {
				const ioc = (a.ioc as Record<string, unknown>) ?? {};
				return `Create the IOC${ioc.ioc_value ? ` "${ioc.ioc_value}"` : ''} in ${cases(a.case_ids)}.`;
			}
			case 'iris_war_room_scope_assets_push':
				return `Copy ${count(a.asset_ids, 'asset')} into ${cases(a.case_ids)}.`;
			case 'iris_war_room_scope_iocs_push':
				return `Copy ${count(a.ioc_ids, 'IOC')} into ${cases(a.case_ids)}.`;
			case 'iris_war_room_scope_assets_flag':
				return `${a.action === 'clear' ? 'Remove' : 'Set'} flag #${a.flag_id} ${
					a.action === 'clear' ? 'from' : 'on'
				} ${count(a.asset_ids, 'asset')}.`;
			case 'iris_war_room_scope_assets_status':
				return `Change the status of ${count(a.asset_ids, 'asset')}.`;
			case 'iris_war_room_scope_registry_assets_attach':
				return `Attach ${count(a.managed_asset_ids, 'registry asset')} to this war room${
					a.case_id ? `, linked to case #${a.case_id}` : ''
				}.`;
			case 'iris_war_room_scope_staging_create': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				const label = a.object_type === 'ioc' ? p.ioc_value : p.asset_name;
				return `Stage the ${a.object_type === 'ioc' ? 'IOC' : 'asset'}${label ? ` "${label}"` : ''} in this war room.`;
			}
			case 'iris_war_room_scope_staging_push':
				return `Create staged object #${a.staged_id} in ${
					Array.isArray(a.case_ids) ? cases(a.case_ids) : 'its proposed cases'
				}.`;
			case 'iris_case_notes_directories_create':
				return `Create a note folder${a.name ? ` named "${a.name}"` : ''} on case #${
					a.case_identifier
				}${a.parent_id ? ` under folder #${a.parent_id}` : ''}.`;
			case 'iris_case_datastore_files_create':
				return `Write the file${a.filename ? ` "${a.filename}"` : ''} into the datastore of case #${
					a.case_identifier
				}${a.folder ? `, folder "${a.folder}"` : ''}.`;
			case 'iris_case_tasks_create':
				return `Create a task on case #${a.case_identifier}.`;
			case 'iris_case_tasks_update':
				return `Update task #${a.task_identifier} on case #${a.case_identifier}.`;
			case 'iris_case_tasks_set_status':
				return `Set task #${a.task_identifier} to status ${a.task_status_id}.`;
			case 'iris_alerts_escalate':
				return `Escalate alert #${a.alert_identifier} into a new case.`;
			case 'iris_alerts_merge':
				return `Merge alert #${a.alert_identifier} into case #${a.target_case_id}.`;
			case 'iris_alerts_create': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				const iocs = Array.isArray(a.alert_iocs) ? a.alert_iocs.length : 0;
				const assets = Array.isArray(a.alert_assets) ? a.alert_assets.length : 0;
				const extras = [
					iocs ? `${iocs} IOC${iocs === 1 ? '' : 's'}` : '',
					assets ? `${assets} asset${assets === 1 ? '' : 's'}` : ''
				].filter(Boolean);
				return `Create an alert${p.alert_title ? ` "${p.alert_title}"` : ''} for customer #${
					a.alert_customer_id
				}${extras.length ? ` with ${extras.join(' and ')}` : ''}.`;
			}
			case 'iris_alerts_update': {
				const p = (a.payload as Record<string, unknown>) ?? {};
				const changed = Object.keys(p);
				if (changed.length === 0) {
					return `Update alert #${a.alert_identifier}.`;
				}
				const preview = changed
					.slice(0, 4)
					.map((k) => `${k}=${JSON.stringify(p[k])}`)
					.join(', ');
				const extra = changed.length > 4 ? ` (+${changed.length - 4} more)` : '';
				return `Update alert #${a.alert_identifier}: ${preview}${extra}.`;
			}
			default:
				return null;
		}
	}

	function count(ids: unknown, noun: string): string {
		const n = Array.isArray(ids) ? ids.length : 0;
		return `${n} ${noun}${n === 1 ? '' : 's'}`;
	}

	function cases(ids: unknown): string {
		return Array.isArray(ids) && ids.length
			? `case${ids.length === 1 ? '' : 's'} ${ids.map((id) => `#${id}`).join(', ')}`
			: 'no case';
	}

	function describeNoteEdit(target: string, title: unknown, content: unknown): string {
		const rename = typeof title === 'string';
		const rewrite = typeof content === 'string';
		if (rename && rewrite) return `Rewrite ${target} and rename it to "${title}".`;
		if (rename) return `Rename ${target} to "${title}".`;
		if (rewrite) return `Rewrite the content of ${target}.`;
		return `Update ${target}.`;
	}

	// A note, summary or sitrep edit replaces the whole body, so the
	// analyst has to see what would be written — the one-line summary
	// isn't enough to approve it.
	function proposedNoteBody(pc: PendingToolCall): string | null {
		const a = pc.arguments as Record<string, unknown>;
		const payload = (a.payload as Record<string, unknown>) ?? {};
		let body: unknown;
		switch (pc.tool_name) {
			case 'iris_case_notes_update':
				body = payload.note_content;
				break;
			case 'iris_cases_update':
				body = payload.case_description;
				break;
			case 'iris_war_room_notes_update':
				body = a.content;
				break;
			case 'iris_war_rooms_update':
				body = a.description;
				break;
			case 'iris_war_room_sitreps_update':
				body = a.body_md;
				break;
		}
		return typeof body === 'string' ? body : null;
	}

	const description = $derived(describeAction(pending));
	const noteBody = $derived(proposedNoteBody(pending));
</script>

<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
	<div class="flex items-start gap-2">
		<AlertTriangleIcon size={14} class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
		<div class="flex flex-col gap-2">
			<div class="font-medium">
				Yuki proposes to run
				<code class="rounded bg-muted px-1 py-0.5 font-mono text-2xs">
					{pending.tool_name}
				</code>
			</div>
			{#if description}
				<div class="text-xs">{description}</div>
				{#if noteBody !== null}
					<div class="text-2xs uppercase tracking-wide text-muted-foreground">New content</div>
					<pre
						class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-2xs">{noteBody ||
							'(empty)'}</pre>
				{/if}
			{:else}
				<pre
					class="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-2xs">{JSON.stringify(
						pending.arguments,
						null,
						2
					)}</pre>
			{/if}
			<p class="text-2xs text-muted-foreground">
				This suggestion may have been influenced by content in your case data. Approve only if the
				action matches what you intended to do.
			</p>
			<div class="mt-1 flex gap-2">
				<Button size="sm" onclick={() => onApprove(pending.id)}>
					<CheckIcon size={12} class="mr-1" />
					Approve
				</Button>
				<Button size="sm" variant="outline" onclick={() => onDeny(pending.id)}>
					<XIcon size={12} class="mr-1" />
					Deny
				</Button>
			</div>
		</div>
	</div>
</div>
