<!--
  Shares a workflow with groups. Their members see the workflow and run it
  manually, as themselves (their permissions and keys, not the owner's);
  those of the edit groups may also edit, test and replay it, within the
  limits its owner set. Only the owner, or an administrator, shares it.
-->
<script lang="ts">
	import { TriangleAlertIcon, UsersIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { AiWorkflowsService, type AiWorkflow } from '$lib/services/ai-workflows.service';
	import MultiSelect, { type MultiSelectItem } from './MultiSelect.svelte';
	import { describeApiError, LABEL_CLASS } from '../helpers/ui';

	type Props = {
		open: boolean;
		workflowId: number;
		workflowName: string;
		groupIds: number[];
		editGroupIds?: number[];
		onShared?: (workflow: AiWorkflow) => void;
	};

	let {
		open = $bindable(),
		workflowId,
		workflowName,
		groupIds,
		editGroupIds = [],
		onShared
	}: Props = $props();

	let groups = $state<MultiSelectItem[]>([]);
	let selected = $state<string[]>([]);
	let editors = $state<string[]>([]);
	let saving = $state(false);

	async function loadGroups() {
		const res = await AiWorkflowsService.shareGroups();
		if (!res.ok || !Array.isArray(res.data)) return;
		groups = res.data.map((g) => ({ value: String(g.id), label: g.name ?? `Group #${g.id}` }));
	}

	$effect(() => {
		if (open) {
			selected = groupIds.map(String);
			editors = editGroupIds.map(String);
			loadGroups();
		}
	});

	const allItems = $derived([
		...groups,
		...selected
			.filter((id) => !groups.some((g) => g.value === id))
			.map((id) => ({ value: id, label: `Group #${id}` }))
	]);
	const selectedItems = $derived(allItems.filter((g) => selected.includes(g.value)));

	async function submit(e: Event) {
		e.preventDefault();
		saving = true;
		const res = await AiWorkflowsService.setSharing(
			workflowId,
			selected.map(Number),
			editors.filter((id) => selected.includes(id)).map(Number)
		);
		saving = false;
		if (!res.ok) {
			toast({
				title: 'Could not share the workflow',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		toast({
			title: selected.length
				? `“${workflowName}” shared with ${selected.length} group${selected.length > 1 ? 's' : ''}`
				: `“${workflowName}” is private again`,
			variant: 'success'
		});
		open = false;
		onShared?.(res.data as AiWorkflow);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<UsersIcon size={14} /> Share “{workflowName}”
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				Members of these groups who can read workflows see this one; those who can write workflows
				can also run it manually. Their runs act as them: their permissions, the cases they can
				reach and their keys, never yours. Its automatic triggers keep running as you. Only you (or
				an administrator) can change it, unless you let a group edit it too.
			</Dialog.Description>
		</Dialog.Header>
		<form class="flex flex-col gap-3" onsubmit={submit} data-testid="wf-share-dialog">
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Groups</span>
				<MultiSelect
					items={allItems}
					values={selected}
					placeholder="Nobody (private)"
					onChange={(v) => {
						selected = v;
						editors = editors.filter((id) => v.includes(id));
					}}
					testId="wf-share-groups"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>May also edit it</span>
				<MultiSelect
					items={selectedItems}
					values={editors}
					placeholder={selected.length ? 'No one (view and run only)' : 'Share with a group first'}
					onChange={(v) => (editors = v)}
					testId="wf-share-editors"
				/>
				{#if editors.length}
					<p
						class="flex gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-2xs text-amber-700 dark:text-amber-400"
						data-testid="wf-share-editors-warning"
					>
						<TriangleAlertIcon size={12} class="mt-px shrink-0" />
						<span>
							Its triggers keep running as you: what they change in the workflow then acts with your
							access, within the limits you set (activation, write allowlist, customer scope,
							budgets), which they cannot change. Their own runs and tests act as them.
						</span>
					</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={saving} data-testid="wf-share-submit">
					{saving ? 'Saving…' : 'Save'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
