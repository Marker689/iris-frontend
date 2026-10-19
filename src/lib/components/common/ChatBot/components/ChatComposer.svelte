<!--
  Chat composer — one textarea with its actions (attach, Stop, Send)
  on a row underneath, inside the same bordered box.

  Enter submits; Shift+Enter inserts a newline. Stays open while the
  assistant runs: a turn sent then reaches the model at its next step
  (the backend queues it), and Stop — or Escape — ends the run where
  it is.

  Files go with the turn: pasted (a screenshot, a copied file), dropped
  on the composer, or picked with the paperclip. The backend decides
  what it accepts (images, PDF, text); only the size and the count are
  checked here, so the analyst hears about it before the upload.
-->
<script lang="ts">
	import { FileTextIcon, PaperclipIcon, SendIcon, SquareIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import {
		CHAT_ATTACHMENT_MAX_BYTES,
		CHAT_ATTACHMENTS_MAX_PER_MESSAGE
	} from '$lib/services/chat.service';

	let {
		disabled,
		streaming = false,
		placeholder = 'Ask Yuki anything — summarise, extract, draft…',
		onSend,
		onStop
	}: {
		disabled: boolean;
		/** The assistant is running — offer Stop, and say where a turn goes. */
		streaming?: boolean;
		placeholder?: string;
		// May return a promise resolving to `false` if the send failed —
		// in that case we keep the input's text and files so the analyst
		// can retry. Sync `void` returns are treated as success.
		onSend: (text: string, files: File[]) => void | Promise<boolean | void>;
		onStop?: () => void;
	} = $props();

	interface PickedFile {
		file: File;
		/** Object URL of an image, for its thumbnail. */
		preview: string | null;
	}

	let text = $state('');
	let picked = $state<PickedFile[]>([]);
	let sending = $state(false);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const maxMb = CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024);

	function addFiles(files: Iterable<File>) {
		const next = [...picked];
		for (const file of files) {
			if (next.length >= CHAT_ATTACHMENTS_MAX_PER_MESSAGE) {
				toast({
					title: `At most ${CHAT_ATTACHMENTS_MAX_PER_MESSAGE} files per message.`,
					variant: 'destructive'
				});
				break;
			}
			if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
				toast({
					title: `${file.name || 'The file'} exceeds ${maxMb} MB.`,
					variant: 'destructive'
				});
				continue;
			}
			if (file.size === 0) {
				toast({ title: `${file.name || 'The file'} is empty.`, variant: 'destructive' });
				continue;
			}
			const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
			next.push({ file, preview });
		}
		picked = next;
	}

	function removeFile(index: number) {
		const [gone] = picked.splice(index, 1);
		if (gone?.preview) URL.revokeObjectURL(gone.preview);
		picked = [...picked];
	}

	function clearFiles() {
		for (const p of picked) if (p.preview) URL.revokeObjectURL(p.preview);
		picked = [];
	}

	$effect(() => clearFiles);

	async function submit() {
		const trimmed = text.trim();
		if ((!trimmed && picked.length === 0) || disabled || sending) return;
		// Clear optimistically — restore only if the caller explicitly
		// signals failure with `false`.
		const stash = text;
		const stashFiles = picked;
		text = '';
		picked = [];
		let ok: boolean | void = true;
		sending = true;
		try {
			const result = onSend(
				trimmed,
				stashFiles.map((p) => p.file)
			);
			if (result && typeof (result as Promise<boolean>).then === 'function') {
				ok = await (result as Promise<boolean | void>);
			}
		} catch {
			ok = false;
		} finally {
			sending = false;
		}
		if (ok === false) {
			text = stash;
			picked = stashFiles;
		} else {
			for (const p of stashFiles) if (p.preview) URL.revokeObjectURL(p.preview);
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		} else if (e.key === 'Escape' && streaming && onStop) {
			e.preventDefault();
			onStop();
		}
	}

	function onPaste(e: ClipboardEvent) {
		const files = e.clipboardData?.files;
		if (!files || files.length === 0 || disabled) return;
		// A copied file or screenshot: attach it instead of pasting its name.
		e.preventDefault();
		addFiles(files);
	}

	function onDragOver(e: DragEvent) {
		if (disabled || !e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragging = true;
	}

	function onDrop(e: DragEvent) {
		dragging = false;
		if (disabled || !e.dataTransfer?.files.length) return;
		e.preventDefault();
		addFiles(e.dataTransfer.files);
	}

	function onPicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files) addFiles(input.files);
		input.value = '';
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div
	class={`flex flex-col gap-1.5 border-t bg-background p-2 ${dragging ? 'ring-2 ring-inset ring-primary' : ''}`}
	role="group"
	aria-label="Message composer"
	ondragover={onDragOver}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	{#if picked.length}
		<div class="flex flex-wrap gap-1.5" data-testid="chat-composer-attachments">
			{#each picked as p, i (p)}
				<div
					class="flex max-w-[12rem] items-center gap-1.5 rounded-md border bg-muted/50 py-1 pl-1 pr-0.5 text-2xs"
					title={p.file.name}
				>
					{#if p.preview}
						<img src={p.preview} alt="" class="h-7 w-7 shrink-0 rounded object-cover" />
					{:else}
						<FileTextIcon size={14} class="shrink-0 text-muted-foreground" />
					{/if}
					<div class="flex min-w-0 flex-col">
						<span class="truncate">{p.file.name || 'Pasted file'}</span>
						<span class="text-muted-foreground">{formatSize(p.file.size)}</span>
					</div>
					<button
						type="button"
						class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label={`Remove ${p.file.name || 'file'}`}
						onclick={() => removeFile(i)}
						disabled={sending}
					>
						<XIcon size={12} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
	<!-- One bordered box: the textarea grows on top, the actions sit on a
	     row under it — attach on the left, Stop + Send on the right. -->
	<div
		class="flex flex-col rounded-md border border-input bg-transparent shadow-sm focus-within:ring-1 focus-within:ring-ring"
	>
		<Textarea
			bind:value={text}
			placeholder={streaming
				? 'Add details or redirect — Yuki reads this at its next step'
				: placeholder}
			disabled={disabled || sending}
			rows={2}
			class="min-h-[44px] flex-1 resize-none border-0 text-xs shadow-none focus-visible:ring-0 md:text-xs"
			onkeydown={onKeyDown}
			onpaste={onPaste}
		/>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			class="hidden"
			onchange={onPicked}
			data-testid="chat-composer-file-input"
		/>
		<div class="flex items-center gap-1 px-1.5 pb-1.5">
			<Button
				size="icon"
				variant="ghost"
				class="h-7 w-7 text-muted-foreground"
				onclick={() => fileInput?.click()}
				disabled={disabled || sending}
				title={`Attach images, PDF or text files (up to ${maxMb} MB each)`}
				aria-label="Attach files"
			>
				<PaperclipIcon size={14} />
			</Button>
			<div class="ml-auto flex items-center gap-1">
				{#if streaming && onStop}
					<Button
						size="icon"
						variant="outline"
						class="h-7 w-7"
						onclick={onStop}
						title="Stop Yuki (Esc)"
						aria-label="Stop Yuki"
					>
						<SquareIcon size={12} />
					</Button>
				{/if}
				<Button
					size="icon"
					class="h-7 w-7"
					onclick={submit}
					disabled={disabled || sending}
					title="Send (Enter)"
					aria-label="Send"
				>
					<SendIcon size={14} />
				</Button>
			</div>
		</div>
	</div>
</div>
