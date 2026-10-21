<!--
  Shares a workflow with groups. Their members see the workflow and run it
  manually, as themselves (their permissions and keys, not the owner's);
  only the owner, or an administrator, changes it.
-->
<script lang="ts">
	import { UsersIcon } from 'lucide-svelte';
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
		onShared?: (workflow: AiWorkflow) => void;
	};

	let { open = $bindable(), workflowId, workflowName, groupIds, onShared }: Props = $props();

	let groups = $state<MultiSelectItem[]>([]);
	let selected = $state<string[]>([]);
	let saving = $state(false);

	async function loadGroups() {
		const res = await AiWorkflowsService.shareGroups();
		if (!res.ok || !Array.isArray(res.data)) return;
		groups = res.data.map((g) => ({ value: String(g.id), label: g.name ?? `Group #${g.id}` }));
	}

	$effect(() => {
		if (open) {
			selected = groupIds.map(String);
			loadGroups();
		}
	});

	async function submit(e: Event) {
		e.preventDefault();
		saving = true;
		const res = await AiWorkflowsService.setSharing(workflowId, selected.map(Number));
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
				reach and their keys, never yours. Only you (or an administrator) can change it. Its
				automatic triggers keep running as you.
			</Dialog.Description>
		</Dialog.Header>
		<form class="flex flex-col gap-3" onsubmit={submit} data-testid="wf-share-dialog">
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Groups</span>
				<MultiSelect
					items={[
						...groups,
						...selected
							.filter((id) => !groups.some((g) => g.value === id))
							.map((id) => ({ value: id, label: `Group #${id}` }))
					]}
					values={selected}
					placeholder="Nobody (private)"
					onChange={(v) => (selected = v)}
					testId="wf-share-groups"
				/>
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
