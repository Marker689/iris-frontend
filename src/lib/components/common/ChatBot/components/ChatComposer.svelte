<!--
  Chat composer — one textarea + a Send button.

  Enter submits; Shift+Enter inserts a newline. Stays open while the
  assistant runs: a turn sent then reaches the model at its next step
  (the backend queues it), and Stop — or Escape — ends the run where
  it is.
-->
<script lang="ts">
	import { SendIcon, SquareIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

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
		// in that case we keep the input's text so the analyst can
		// retry without retyping. Sync `void` returns are treated as
		// success (preserves the existing fire-and-forget path).
		onSend: (text: string) => void | Promise<boolean | void>;
		onStop?: () => void;
	} = $props();

	let text = $state('');

	async function submit() {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		// Clear optimistically — restore only if the caller explicitly
		// signals failure with `false`. Snappier UX for the 99% happy
		// path, no lost input on the 1% auto-create-failed path.
		const stash = text;
		text = '';
		try {
			const result = onSend(trimmed);
			if (result && typeof (result as Promise<boolean>).then === 'function') {
				const ok = await (result as Promise<boolean | void>);
				if (ok === false) text = stash;
			}
		} catch {
			text = stash;
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
</script>

<div class="flex items-end gap-2 border-t bg-background p-2">
	<Textarea
		bind:value={text}
		placeholder={streaming
			? 'Add details or redirect — Yuki reads this at its next step'
			: placeholder}
		{disabled}
		rows={2}
		class="flex-1 resize-none text-xs"
		onkeydown={onKeyDown}
	/>
	<div class="flex flex-col gap-1">
		{#if streaming && onStop}
			<Button
				size="sm"
				variant="outline"
				onclick={onStop}
				title="Stop Yuki (Esc)"
				aria-label="Stop Yuki"
			>
				<SquareIcon size={14} />
			</Button>
		{/if}
		<Button size="sm" onclick={submit} {disabled} aria-label="Send">
			<SendIcon size={14} />
		</Button>
	</div>
</div>
