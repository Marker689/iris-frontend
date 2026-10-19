<!--
  Thinking indicator — three bouncing dots and a label, shown for as
  long as Yuki is running.

  Two shapes:
    * standalone (default): its own bubble under the assistant avatar,
      while nothing has streamed yet — the latency after `send`.
    * `inline`: just the dots and the label, at the foot of the
      streaming bubble once text or tool cards have arrived, so the
      analyst can still tell Yuki is working between steps (reasoning
      on a tool result, running the next tool).

  CSS-only (no JS animation loop) so it costs nothing when offscreen,
  and still under `prefers-reduced-motion`.
-->
<script lang="ts">
	import { SparklesIcon } from 'lucide-svelte';

	let { label = 'Yuki is thinking', inline = false }: { label?: string; inline?: boolean } =
		$props();
</script>

{#snippet indicator()}
	<span class="flex items-center gap-1.5 text-2xs text-muted-foreground" aria-live="polite">
		<span class="dots" aria-hidden="true">
			<span></span>
			<span></span>
			<span></span>
		</span>
		<span class="italic">{label}…</span>
	</span>
{/snippet}

{#if inline}
	<div class="mt-2">{@render indicator()}</div>
{:else}
	<div class="flex gap-2 text-xs">
		<div
			class="avatar flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
		>
			<SparklesIcon size={12} />
		</div>
		<div class="rounded-md bg-muted px-3 py-2">
			{@render indicator()}
		</div>
	</div>
{/if}

<style>
	.dots {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.dots span {
		width: 5px;
		height: 5px;
		border-radius: 9999px;
		background: hsl(var(--primary));
		animation: bounce 1.2s ease-in-out infinite;
	}

	.dots span:nth-child(2) {
		animation-delay: 0.15s;
	}

	.dots span:nth-child(3) {
		animation-delay: 0.3s;
	}

	.avatar :global(svg) {
		animation: pulse 1.6s ease-in-out infinite;
	}

	@keyframes bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.35;
		}
		30% {
			transform: translateY(-3px);
			opacity: 1;
		}
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.5;
			transform: scale(0.9);
		}
		50% {
			opacity: 1;
			transform: scale(1.1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dots span,
		.avatar :global(svg) {
			animation: none;
			opacity: 1;
		}
	}
</style>
