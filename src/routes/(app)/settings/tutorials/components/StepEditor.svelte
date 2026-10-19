<!--
  One step of the tutorial editor: what the panel says, what it
  highlights, what it can fill in for the learner, and what makes the
  step move on by itself.
-->
<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowUpIcon,
		PlusIcon,
		Trash2Icon,
		TriangleAlertIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import type { ApiWait } from '$lib/tutorials/types';
	import type { FillKind, StepForm, WaitKind } from '../helpers/step-form';

	let {
		step = $bindable(),
		index,
		total,
		issues,
		onmove,
		onremove
	}: {
		step: StepForm;
		index: number;
		total: number;
		issues: string[];
		onmove: (delta: number) => void;
		onremove: () => void;
	} = $props();

	const WAIT_OPTIONS: { value: WaitKind; label: string }[] = [
		{ value: 'next', label: 'The learner clicks Next' },
		{ value: 'api', label: 'Something is saved (API call)' },
		{ value: 'route', label: 'A page is open' },
		{ value: 'element', label: 'An element is on screen' }
	];

	const METHODS: ApiWait['method'][] = ['POST', 'PUT', 'PATCH', 'DELETE'];

	const FILL_KINDS: { value: FillKind; label: string }[] = [
		{ value: 'text', label: 'Text' },
		{ value: 'on', label: 'Tick' },
		{ value: 'off', label: 'Untick' }
	];

	const id = (field: string) => `step-${step.key}-${field}`;
</script>

<article class="rounded-lg border bg-background" data-testid="tutorial-step-{index}">
	<header class="flex items-center gap-2 border-b px-3 py-2">
		<span
			class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold"
		>
			{index + 1}
		</span>
		<Input
			class="h-7 grow text-xs font-medium"
			placeholder="Step title"
			maxlength={200}
			aria-label="Step {index + 1} title"
			bind:value={step.title}
		/>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			aria-label="Move step up"
			disabled={index === 0}
			onclick={() => onmove(-1)}
		>
			<ArrowUpIcon size={12} />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			aria-label="Move step down"
			disabled={index === total - 1}
			onclick={() => onmove(1)}
		>
			<ArrowDownIcon size={12} />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6 text-destructive hover:text-destructive"
			aria-label="Delete step"
			onclick={onremove}
		>
			<Trash2Icon size={12} />
		</Button>
	</header>

	<div class="grid gap-3 p-3 text-xs md:grid-cols-2">
		<div class="flex flex-col gap-1 md:col-span-2">
			<label class="font-medium" for={id('body')}>What to do</label>
			<Textarea
				id={id('body')}
				rows={3}
				maxlength={4000}
				class="text-xs"
				placeholder="Click **New IOC** and paste one domain per line."
				bind:value={step.body}
			/>
			<p class="text-2xs text-muted-foreground">
				**bold**, `code`, and values captured earlier as {'{caseId}'}.
			</p>
		</div>

		<div class="flex flex-col gap-1">
			<label class="font-medium" for={id('anchors')}>Highlight</label>
			<Textarea
				id={id('anchors')}
				rows={2}
				class="font-mono text-xs"
				placeholder={'ioc-form\na[href="/case/{caseId}/iocs"]'}
				bind:value={step.anchors}
			/>
			<p class="text-2xs text-muted-foreground">
				A data-tour name or a CSS selector per line; the first one on screen is highlighted.
			</p>
		</div>

		<div class="flex flex-col gap-1">
			<label class="font-medium" for={id('goto')}>“Take me there” link</label>
			<Input
				id={id('goto')}
				class="h-8 font-mono text-xs"
				placeholder="/case/{'{caseId}'}/iocs"
				bind:value={step.goTo}
			/>
			<p class="text-2xs text-muted-foreground">Offered when the learner is on another page.</p>
		</div>

		<div class="flex flex-col gap-2 md:col-span-2">
			<span class="font-medium">Done when</span>
			<Select
				type="single"
				value={step.wait}
				onValueChange={(v: string) => (step.wait = v as WaitKind)}
			>
				<SelectTrigger class="h-8 text-xs" aria-label="Done when">
					{WAIT_OPTIONS.find((o) => o.value === step.wait)?.label}
				</SelectTrigger>
				<SelectContent>
					{#each WAIT_OPTIONS as opt (opt.value)}
						<SelectItem value={opt.value}>{opt.label}</SelectItem>
					{/each}
				</SelectContent>
			</Select>

			{#if step.wait === 'api'}
				<div class="flex gap-2">
					<Select
						type="single"
						value={step.method}
						onValueChange={(v: string) => (step.method = v as ApiWait['method'])}
					>
						<SelectTrigger class="h-8 w-28 text-xs" aria-label="Method">
							{step.method}
						</SelectTrigger>
						<SelectContent>
							{#each METHODS as method (method)}
								<SelectItem value={method}>{method}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
					<Input
						class="h-8 grow font-mono text-xs"
						placeholder="/cases/{'{caseId}'}/iocs"
						aria-label="API path"
						bind:value={step.apiPath}
					/>
				</div>
				<p class="text-2xs text-muted-foreground">
					Path after /api/v2. <code>*</code> matches any one segment; a {'{name}'} not known yet matches
					any segment and remembers it.
				</p>
				<div class="flex flex-col gap-1.5">
					{#each step.captures as capture, i (i)}
						<div class="flex items-center gap-2">
							<Input
								class="h-7 w-36 font-mono text-xs"
								placeholder="iocId"
								aria-label="Captured name"
								bind:value={capture.name}
							/>
							<span class="text-muted-foreground">=</span>
							<Input
								class="h-7 grow font-mono text-xs"
								placeholder="ioc_id"
								aria-label="Response field"
								bind:value={capture.field}
							/>
							<Button
								variant="ghost"
								size="icon"
								class="h-6 w-6"
								aria-label="Remove capture"
								onclick={() => (step.captures = step.captures.filter((_, j) => j !== i))}
							>
								<XIcon size={12} />
							</Button>
						</div>
					{/each}
					<Button
						variant="link"
						size="sm"
						class="h-6 self-start px-0 text-xs"
						onclick={() => (step.captures = [...step.captures, { name: '', field: '' }])}
					>
						<PlusIcon size={12} /> Remember a value of the response
					</Button>
				</div>
			{:else if step.wait === 'route'}
				<Input
					class="h-8 font-mono text-xs"
					placeholder="/case/{'{caseId}'}/timeline"
					aria-label="Page path"
					bind:value={step.routePath}
				/>
			{:else if step.wait === 'element'}
				<Input
					class="h-8 font-mono text-xs"
					placeholder="ioc-form"
					aria-label="Element"
					bind:value={step.elementAnchor}
				/>
			{/if}
		</div>

		<div class="flex flex-col gap-1.5 md:col-span-2">
			<span class="font-medium">Fill buttons</span>
			{#each step.fills as fill, i (i)}
				<div class="flex flex-wrap items-center gap-2">
					<Input
						class="h-7 w-32 text-xs"
						placeholder="Label"
						aria-label="Fill label"
						bind:value={fill.label}
					/>
					<Input
						class="h-7 w-40 font-mono text-xs"
						placeholder="ioc-values"
						aria-label="Field to fill"
						bind:value={fill.anchor}
					/>
					<Select
						type="single"
						value={fill.kind}
						onValueChange={(v: string) => (fill.kind = v as FillKind)}
					>
						<SelectTrigger class="h-7 w-24 text-xs" aria-label="Fill kind">
							{FILL_KINDS.find((o) => o.value === fill.kind)?.label}
						</SelectTrigger>
						<SelectContent>
							{#each FILL_KINDS as opt (opt.value)}
								<SelectItem value={opt.value}>{opt.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
					{#if fill.kind === 'text'}
						<Input
							class="h-7 min-w-32 grow text-xs"
							placeholder="Value"
							aria-label="Fill value"
							bind:value={fill.value}
						/>
					{/if}
					<Button
						variant="ghost"
						size="icon"
						class="h-6 w-6"
						aria-label="Remove fill button"
						onclick={() => (step.fills = step.fills.filter((_, j) => j !== i))}
					>
						<XIcon size={12} />
					</Button>
				</div>
			{/each}
			<Button
				variant="link"
				size="sm"
				class="h-6 self-start px-0 text-xs"
				onclick={() =>
					(step.fills = [...step.fills, { label: '', anchor: '', kind: 'text', value: '' }])}
			>
				<PlusIcon size={12} /> Add a value the learner can fill in with one click
			</Button>
		</div>

		{#if issues.length}
			<ul class="flex flex-col gap-1 md:col-span-2" data-testid="tutorial-step-{index}-issues">
				{#each issues as issue, i (i)}
					<li class="flex items-start gap-1.5 text-yellow-700 dark:text-yellow-300">
						<TriangleAlertIcon size={12} class="mt-0.5 shrink-0" />
						{issue}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</article>
