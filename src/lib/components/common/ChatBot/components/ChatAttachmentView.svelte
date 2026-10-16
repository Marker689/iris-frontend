<!--
  A file the analyst sent to Yuki, inside their bubble. An image shows
  as a thumbnail; a PDF or text file as a chip. Clicking either opens
  the file — fetched with the bearer token, as an object URL, since an
  <img src> or a link can't carry it.
-->
<script lang="ts">
	import { FileTextIcon } from 'lucide-svelte';
	import { ChatService, type ChatAttachment } from '$lib/services/chat.service';
	import { toast } from '$lib/components/ui/toast';
	import { onDestroy, onMount } from 'svelte';

	let { attachment }: { attachment: ChatAttachment } = $props();

	let url = $state<string | null>(null);
	let failed = $state(false);

	async function load(): Promise<string | null> {
		if (url) return url;
		const blob = await ChatService.fetchAttachment(attachment.attachment_id);
		if (!blob) {
			failed = true;
			return null;
		}
		url = URL.createObjectURL(blob);
		return url;
	}

	onMount(() => {
		if (attachment.kind === 'image') void load();
	});

	onDestroy(() => {
		if (url) URL.revokeObjectURL(url);
	});

	async function open() {
		const target = await load();
		if (!target) {
			toast({ title: `${attachment.filename} is no longer available.`, variant: 'destructive' });
			return;
		}
		const link = document.createElement('a');
		link.href = target;
		link.download = attachment.filename;
		if (attachment.kind === 'image') {
			link.removeAttribute('download');
			link.target = '_blank';
			link.rel = 'noopener';
		}
		link.click();
	}
</script>

{#if attachment.kind === 'image' && url && !failed}
	<button
		type="button"
		class="block overflow-hidden rounded border border-primary-foreground/20"
		title={attachment.filename}
		onclick={open}
	>
		<img src={url} alt={attachment.filename} class="max-h-40 max-w-full object-contain" />
	</button>
{:else}
	<button
		type="button"
		class="flex max-w-full items-center gap-1.5 rounded border border-primary-foreground/30 px-2 py-1 text-2xs hover:bg-primary-foreground/10"
		title={failed ? 'No longer available' : `Download ${attachment.filename}`}
		onclick={open}
	>
		<FileTextIcon size={12} class="shrink-0" />
		<span class="truncate" class:line-through={failed}>{attachment.filename}</span>
	</button>
{/if}
