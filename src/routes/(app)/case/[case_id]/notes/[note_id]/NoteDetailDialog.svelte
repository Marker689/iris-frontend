<!--
  Modal wrapper around NoteDetailView. Reuses the exact same UI as the right
  pane of the notes list — no duplicated rendering. Used by mention chips in
  the markdown editor.

  Heads-up: when this dialog is opened from inside another MarkDownEditor
  (e.g. clicking a note mention while writing a different note), you get two
  editors mounted at once. Each has its own collab socket and works fine
  independently — they just happen to render in the same DOM.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import NoteDetailView from './NoteDetailView.svelte';
	import { confirmLeave } from '$lib/hooks/leave-guard';

	let {
		caseId,
		noteId,
		open = $bindable(false)
	}: {
		caseId: number;
		noteId: number;
		open?: boolean;
	} = $props();

	let leaveReason = $state<string | null>(null);

	// Closing (Escape, outside click, close button) unmounts the editor:
	// ask first, as leaving the page would
	const setOpen = (value: boolean) => {
		if (!value && !confirmLeave(leaveReason, 'Close this note anyway?')) return;
		if (!value) leaveReason = null;
		open = value;
	};
</script>

<Dialog.Root bind:open={() => open, setOpen}>
	<Dialog.Content
		class="flex h-[80vh] max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-3">
			<Dialog.Title class="text-base font-medium">Note</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-hidden">
			{#if open}
				<NoteDetailView
					{caseId}
					{noteId}
					onAfterDelete={() => (open = false)}
					onLeaveReasonChange={(reason) => (leaveReason = reason)}
				/>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
