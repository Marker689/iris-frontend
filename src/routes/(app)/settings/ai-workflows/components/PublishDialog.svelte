<!--
  Publishes the saved version of a workflow to the library, where every
  user who can read workflows can add a copy of it. What is published is
  the exported document: no secret, owner or customer scope.
-->
<script lang="ts">
	import { LibraryIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { AiWorkflowsService, type AiLibraryEntry } from '$lib/services/ai-workflows.service';
	import { describeApiError, LABEL_CLASS } from '../helpers/ui';

	type Props = {
		open: boolean;
		workflowId: number;
		workflowName: string;
		workflowDescription?: string | null;
		/** The workflow has unsaved changes: the saved version is published. */
		dirty?: boolean;
		onPublished?: (entry: AiLibraryEntry) => void;
	};

	let {
		open = $bindable(),
		workflowId,
		workflowName,
		workflowDescription = null,
		dirty = false,
		onPublished
	}: Props = $props();

	let name = $state('');
	let description = $state('');
	let category = $state('');
	let categories = $state<string[]>([]);
	let publishing = $state(false);

	async function loadCategories() {
		const res = await AiWorkflowsService.library();
		if (!res.ok || !Array.isArray(res.data)) return;
		categories = [...new Set(res.data.map((e) => e.category))].sort((a, b) => a.localeCompare(b));
	}

	$effect(() => {
		if (open) {
			name = workflowName;
			description = workflowDescription ?? '';
			category = '';
			loadCategories();
		}
	});

	async function submit(e: Event) {
		e.preventDefault();
		if (!name.trim()) return;
		publishing = true;
		const res = await AiWorkflowsService.publishToLibrary({
			workflow_id: workflowId,
			name: name.trim(),
			description: description.trim() || null,
			category: category.trim() || null
		});
		publishing = false;
		if (!res.ok) {
			toast({
				title: 'Publish failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const entry = res.data as AiLibraryEntry;
		const replaced = entry.document?.warnings?.length ?? 0;
		toast({
			title: `“${entry.name}” published to the library`,
			description: replaced
				? `${replaced} literal credential${replaced > 1 ? 's were' : ' was'} replaced by keystore references.`
				: 'Every user who can read workflows can now add a copy of it.',
			variant: replaced ? 'warning' : 'success'
		});
		open = false;
		onPublished?.(entry);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<LibraryIcon size={14} /> Publish “{workflowName}” to the library
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				Every user who can read workflows will be able to add a copy of it. The published workflow
				holds no secret (keystore references are kept, literal credentials become references), no
				owner and no customer scope. You can change or remove it later from the library.
			</Dialog.Description>
		</Dialog.Header>
		<form class="flex flex-col gap-3" onsubmit={submit} data-testid="wf-publish-dialog">
			{#if dirty}
				<p class="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs">
					You have unsaved changes: the last saved version is published.
				</p>
			{/if}
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Name</span>
				<Input
					class="h-8 text-xs"
					bind:value={name}
					maxlength={255}
					required
					data-testid="wf-publish-name"
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Category</span>
				<Input
					class="h-8 text-xs"
					bind:value={category}
					maxlength={64}
					list="wf-publish-categories"
					placeholder="Other"
					data-testid="wf-publish-category"
				/>
				<datalist id="wf-publish-categories">
					{#each categories as c (c)}
						<option value={c}></option>
					{/each}
				</datalist>
			</label>
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Description (what it does, what it needs)</span>
				<Textarea
					class="min-h-24 text-xs"
					bind:value={description}
					data-testid="wf-publish-description"
				/>
			</label>
			<Dialog.Footer>
				<Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					size="sm"
					disabled={publishing || !name.trim()}
					data-testid="wf-publish-submit"
				>
					{publishing ? 'Publishing…' : 'Publish'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
