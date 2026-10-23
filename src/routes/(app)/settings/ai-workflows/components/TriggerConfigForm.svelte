<!--
  The trigger of one trigger node: its type and that type's settings,
  edited in place in the node's config (`{trigger_type, ...}`). A
  workflow may hold several trigger nodes; webhook and workflow triggers
  once each.
-->
<script lang="ts">
	import { CopyIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { cronPreview } from '$lib/utils/cron-preview';
	import {
		AiWorkflowsService,
		type AiEntityType,
		type AiInboundToken,
		type AiTriggerType,
		type AiWorkflowCatalogue
	} from '$lib/services/ai-workflows.service';
	import MultiSelect from './MultiSelect.svelte';
	import { defaultTriggerConfig, SINGLE_TRIGGERS, TRIGGERS } from '../helpers/editor';
	import {
		describeApiError,
		ENTITY_LABELS,
		ENTITY_TYPES,
		LABEL_CLASS,
		SELECT_CLASS,
		TRIGGER_LABELS
	} from '../helpers/ui';

	type Props = {
		/** The trigger node's config. */
		config: Record<string, unknown>;
		/** Trigger types of the workflow's other trigger nodes. */
		otherTypes: AiTriggerType[];
		catalogue: AiWorkflowCatalogue | null;
		readOnly?: boolean;
		/** Saved workflow id (null while creating). */
		workflowId: number | null;
		/** Trigger types as saved on the server (the token needs a saved webhook workflow). */
		savedTriggerTypes: AiTriggerType[];
		hasInboundToken: boolean;
		hasSigningSecret?: boolean;
		inboundUrl: string | null;
		/** `withSecret`: the rotation issued a signing secret as well. */
		onTokenRotated?: (withSecret: boolean) => void;
		onSigningSecretRotated?: () => void;
	};

	let {
		config = $bindable(),
		otherTypes,
		catalogue,
		readOnly = false,
		workflowId,
		savedTriggerTypes,
		hasInboundToken,
		hasSigningSecret = false,
		inboundUrl,
		onTokenRotated,
		onSigningSecretRotated
	}: Props = $props();

	const TRIGGER_HINTS: Record<AiTriggerType, string> = {
		event: 'Runs when an IRIS event fires (alert created, case updated…).',
		cron: 'Runs on a schedule.',
		manual: 'Runs from the Run button or an object menu.',
		webhook: 'Runs when an external system POSTs to its URL.',
		workflow: 'Runs when another workflow calls it with a Run workflow node.'
	};

	const type = $derived(
		TRIGGERS.includes(config.trigger_type as AiTriggerType)
			? (config.trigger_type as AiTriggerType)
			: null
	);
	/** Webhook and workflow triggers are once per workflow. */
	const taken = (t: AiTriggerType) =>
		t !== type && SINGLE_TRIGGERS.includes(t) && otherTypes.includes(t);

	function setType(next: AiTriggerType) {
		if (next === type) return;
		// Another type: its own defaults, nothing kept from the previous one
		config = { trigger_type: next, ...defaultTriggerConfig(next) };
	}

	const hookItems = $derived(
		(catalogue?.hooks ?? []).map((h) => ({
			value: h.name,
			label: h.name,
			description: h.description
		}))
	);
	const entityItems = ENTITY_TYPES.map((t) => ({ value: t, label: ENTITY_LABELS[t] }));

	// Object menus a manual workflow can show in, and the entity it then runs on
	const MENUS: Array<{ value: string; label: string; entity: AiEntityType }> = [
		{ value: 'alert', label: 'Alert', entity: 'alert' },
		{ value: 'case', label: 'Case', entity: 'case' },
		{ value: 'asset', label: 'Asset', entity: 'case' },
		{ value: 'ioc', label: 'IOC', entity: 'case' },
		{ value: 'note', label: 'Note', entity: 'case' },
		{ value: 'event', label: 'Timeline event', entity: 'case' },
		{ value: 'evidence', label: 'Evidence', entity: 'case' },
		{ value: 'datastore_file', label: 'Datastore file', entity: 'case' },
		{ value: 'task', label: 'Task', entity: 'case' },
		{ value: 'war_room', label: 'War room', entity: 'war_room' }
	];
	const menuItems = MENUS.map(({ value, label }) => ({ value, label }));
	const missingMenuEntities = $derived.by(() => {
		if (type !== 'manual') return [];
		const menus = asStrings(config.menus);
		const accepted = asStrings(config.entity_types);
		const needed = MENUS.filter((m) => menus.includes(m.value)).map((m) => m.entity);
		return [...new Set(needed)].filter((e) => !accepted.includes(e));
	});

	// One run for the whole selection: objects of one case only
	const SINGLE_RUN_MENUS = ['alert', 'case', 'war_room'];
	const singleRunMenus = $derived.by(() => {
		if (type !== 'manual') return [];
		return asStrings(config.menus).filter((m) => SINGLE_RUN_MENUS.includes(m));
	});

	const preview = $derived(type === 'cron' ? cronPreview(String(config.cron ?? '')) : null);

	const fmtUtc = (d: Date) =>
		`${d.toISOString().slice(0, 16).replace('T', ' ')} UTC · ${d.toLocaleString()}`;

	let rotating = $state(false);
	let confirmRotate = $state(false);
	let token = $state<AiInboundToken | null>(null);

	async function rotate() {
		if (!workflowId) return;
		rotating = true;
		const res = await AiWorkflowsService.rotateInboundToken(workflowId);
		rotating = false;
		if (!res.ok) {
			toast({
				title: 'Could not rotate the token',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		token = res.data as AiInboundToken;
		signingSecret = null;
		onTokenRotated?.(Boolean(token.signing_secret));
	}

	let confirmRotateSecret = $state(false);
	let signingSecret = $state<string | null>(null);

	async function rotateSecret() {
		if (!workflowId) return;
		rotating = true;
		const res = await AiWorkflowsService.rotateSigningSecret(workflowId);
		rotating = false;
		if (!res.ok) {
			toast({
				title: 'Could not rotate the signing secret',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		signingSecret = (res.data as { signing_secret?: string } | null)?.signing_secret ?? null;
		if (token) token = { ...token, signing_secret: null };
		onSigningSecretRotated?.();
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: 'Copied' });
		} catch {
			toast({ title: 'Copy failed', variant: 'destructive' });
		}
	}

	const asStrings = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
</script>

<div class="flex flex-col gap-3" data-testid="wf-trigger-form">
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>Starts the run</span>
		<select
			class={SELECT_CLASS}
			disabled={readOnly}
			value={type ?? ''}
			onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value as AiTriggerType)}
			data-testid="wf-trigger-type"
		>
			{#if !type}
				<option value="" disabled>Select what starts the run</option>
			{/if}
			{#each TRIGGERS as t (t)}
				<option value={t} disabled={taken(t)}>
					{TRIGGER_LABELS[t] ?? t}{taken(t) ? ' (already in this workflow)' : ''}
				</option>
			{/each}
		</select>
		{#if type}
			<span class="text-2xs text-muted-foreground">
				{TRIGGER_HINTS[type]} Add more trigger nodes from the palette for other ways to start it;
				<code class="font-mono">trigger.node_id</code> says which one did.
			</span>
		{/if}
	</label>

	{#if type}
		<section class="flex flex-col gap-3" data-testid={`wf-trigger-card-${type}`}>
			{#if type === 'event'}
				<div class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Hooks</span>
					<MultiSelect
						items={hookItems}
						values={asStrings(config.hooks)}
						placeholder="Select hooks…"
						disabled={readOnly}
						onChange={(v) => (config.hooks = v)}
						testId="wf-trigger-hooks"
					/>
				</div>
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Condition (optional Jinja expression)</span>
					<Input
						class="h-8 font-mono text-xs"
						placeholder={'payload.alert_severity_id >= 4'}
						disabled={readOnly}
						value={String(config.condition ?? '')}
						oninput={(e) => (config.condition = (e.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}
						>De-duplicate: skip a new run on the same entity within (minutes)</span
					>
					<Input
						type="number"
						min="0"
						class="h-8 w-32 text-xs"
						disabled={readOnly}
						value={String(config.dedup_minutes ?? 0)}
						oninput={(e) =>
							(config.dedup_minutes = Number((e.currentTarget as HTMLInputElement).value))}
					/>
				</label>
			{:else if type === 'cron'}
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Cron expression (UTC)</span>
					<Input
						class="h-8 font-mono text-xs"
						placeholder="*/15 * * * *"
						disabled={readOnly}
						value={String(config.cron ?? '')}
						oninput={(e) => (config.cron = (e.currentTarget as HTMLInputElement).value)}
						data-testid="wf-trigger-cron"
					/>
				</label>
				{#if preview}
					<div
						class="rounded-md border bg-muted/30 px-2 py-1.5 text-2xs"
						data-testid="wf-cron-preview"
					>
						{#if preview.ok}
							<p class="font-medium">{preview.text} (UTC)</p>
							{#each preview.next as d (d.getTime())}
								<p class="text-muted-foreground">{fmtUtc(d)}</p>
							{:else}
								<p class="text-muted-foreground">Never fires.</p>
							{/each}
						{:else}
							<p class="text-destructive">{preview.error}</p>
						{/if}
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-2">
					<label class="flex flex-col gap-1">
						<span class={LABEL_CLASS}>Run once per</span>
						<select
							class={SELECT_CLASS}
							disabled={readOnly}
							value={String(config.target ?? 'none')}
							onchange={(e) => (config.target = (e.currentTarget as HTMLSelectElement).value)}
						>
							<option value="none">Nothing (one run, no entity)</option>
							<option value="war_rooms">Open war room</option>
							<option value="cases">Open case</option>
						</select>
					</label>
					<label class="flex flex-col gap-1">
						<span class={LABEL_CLASS}>Max targets per tick</span>
						<Input
							type="number"
							min="1"
							class="h-8 text-xs"
							disabled={readOnly || config.target === 'none'}
							value={String(config.max_targets ?? 50)}
							oninput={(e) =>
								(config.max_targets = Number((e.currentTarget as HTMLInputElement).value))}
						/>
					</label>
				</div>
			{:else if type === 'manual'}
				<div class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Entity types the Run button accepts (none = no entity)</span>
					<MultiSelect
						items={entityItems}
						values={asStrings(config.entity_types)}
						placeholder="No entity needed"
						disabled={readOnly}
						onChange={(v) => (config.entity_types = v as AiEntityType[])}
						testId="wf-trigger-entity-types"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Show in object menus</span>
					<MultiSelect
						items={menuItems}
						values={asStrings(config.menus)}
						placeholder="Not in any menu"
						disabled={readOnly}
						onChange={(v) => (config.menus = v)}
						testId="wf-trigger-menus"
					/>
					<span class="text-2xs text-muted-foreground">
						Listed next to the module actions of these objects. A click runs the workflow as the
						analyst who clicked: their access, their personal keys plus the shared ones, and their
						daily budget. The object is the run's <code class="font-mono">trigger.payload</code>.
					</span>
					{#if missingMenuEntities.length > 0}
						<span class="flex items-center gap-1 text-2xs text-destructive">
							<TriangleAlertIcon class="size-3 shrink-0" />
							These menus need the Run button to accept {missingMenuEntities
								.map((e) => ENTITY_LABELS[e])
								.join(', ')}.
						</span>
					{/if}
				</div>
				{#if asStrings(config.menus).length > 0}
					<label class="flex flex-col gap-1">
						<span class={LABEL_CLASS}>Menu label (optional, defaults to the workflow name)</span>
						<Input
							class="h-8 text-xs"
							maxlength={64}
							disabled={readOnly}
							value={String(config.menu_label ?? '')}
							oninput={(e) => (config.menu_label = (e.currentTarget as HTMLInputElement).value)}
							data-testid="wf-trigger-menu-label"
						/>
					</label>
					<label class="flex items-center justify-between gap-2 text-xs">
						<span>
							One run for the whole selection
							<span class="block text-2xs text-muted-foreground">
								Several selected objects start a single run on their case, with their list in
								<code class="font-mono">trigger.payload.data</code>, instead of one run each.
							</span>
						</span>
						<Switch
							checked={config.batch === true}
							disabled={readOnly || (singleRunMenus.length > 0 && config.batch !== true)}
							onCheckedChange={(v) => (config.batch = v)}
							data-testid="wf-trigger-batch"
						/>
					</label>
					{#if config.batch === true && singleRunMenus.length > 0}
						<span class="flex items-center gap-1 text-2xs text-destructive">
							<TriangleAlertIcon class="size-3 shrink-0" />
							Not for the {singleRunMenus.join(', ')} menu: their objects each run on their own entity.
						</span>
					{/if}
				{/if}
			{:else if type === 'webhook'}
				<label class="flex items-center justify-between gap-2 text-xs">
					<span>
						Require an HMAC signature
						<span class="block text-2xs text-muted-foreground">
							<code class="font-mono">X-IRIS-Signature</code> over the timestamp and body, keyed by the
							signing secret shown when the token is generated.
						</span>
					</span>
					<Switch
						checked={Boolean(config.require_signature)}
						disabled={readOnly}
						onCheckedChange={(v) => (config.require_signature = v)}
					/>
				</label>
				<div class="grid grid-cols-2 gap-2">
					<label class="flex flex-col gap-1">
						<span class={LABEL_CLASS}>Entity type (optional)</span>
						<select
							class={SELECT_CLASS}
							disabled={readOnly}
							value={String(config.entity_type ?? '')}
							onchange={(e) =>
								(config.entity_type = (e.currentTarget as HTMLSelectElement).value || null)}
						>
							<option value="">None</option>
							{#each ENTITY_TYPES as t (t)}
								<option value={t}>{ENTITY_LABELS[t]}</option>
							{/each}
						</select>
					</label>
					<label class="flex flex-col gap-1">
						<span class={LABEL_CLASS}>Entity id path in the payload</span>
						<Input
							class="h-8 font-mono text-xs"
							placeholder="data.alert.id"
							disabled={readOnly || !config.entity_type}
							value={String(config.entity_id_path ?? '')}
							oninput={(e) => (config.entity_id_path = (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
				</div>

				<div class="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2 text-2xs">
					{#if !savedTriggerTypes.includes('webhook') || !workflowId}
						<p class="text-muted-foreground">
							Save the workflow with the webhook trigger to generate its inbound token.
						</p>
					{:else}
						{#if inboundUrl}
							<div class="flex items-center gap-1">
								<span class="text-muted-foreground">URL</span>
								<code class="truncate font-mono">{inboundUrl}</code>
								<button type="button" aria-label="Copy URL" onclick={() => copy(inboundUrl)}>
									<CopyIcon size={11} />
								</button>
							</div>
						{/if}
						<p class="text-muted-foreground">
							{hasInboundToken
								? 'A token is set. Rotating it invalidates the current one immediately.'
								: 'No token yet: the endpoint rejects every call until one is generated.'}
						</p>
						<p class="text-muted-foreground" data-testid="wf-signing-secret-state">
							{hasSigningSecret
								? 'A signing secret is set.'
								: 'No signing secret yet: signed requests cannot be verified.'}
						</p>
						{#if !readOnly}
							<div class="flex flex-wrap gap-1">
								<Button
									type="button"
									size="sm"
									variant="outline"
									class="h-7 w-fit gap-1 text-xs"
									disabled={rotating}
									onclick={() => (hasInboundToken ? (confirmRotate = true) : rotate())}
									data-testid="wf-rotate-token"
								>
									<RefreshCwIcon size={12} />
									{hasInboundToken ? 'Rotate inbound token' : 'Generate inbound token'}
								</Button>
								{#if hasInboundToken}
									<Button
										type="button"
										size="sm"
										variant="outline"
										class="h-7 w-fit gap-1 text-xs"
										disabled={rotating}
										onclick={() =>
											hasSigningSecret ? (confirmRotateSecret = true) : rotateSecret()}
										data-testid="wf-rotate-signing-secret"
									>
										<RefreshCwIcon size={12} />
										{hasSigningSecret ? 'Rotate signing secret' : 'Generate signing secret'}
									</Button>
								{/if}
							</div>
						{/if}
						{#if signingSecret}
							<div
								class="flex flex-col gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2"
								data-testid="wf-new-signing-secret"
							>
								<p class="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
									<TriangleAlertIcon size={12} />
									Copy it now: the signing secret is shown only once.
								</p>
								<div class="flex items-center gap-1">
									<span class="w-10 shrink-0 text-muted-foreground">Secret</span>
									<code class="truncate font-mono">{signingSecret}</code>
									<button
										type="button"
										aria-label="Copy signing secret"
										onclick={() => copy(signingSecret ?? '')}
									>
										<CopyIcon size={11} />
									</button>
								</div>
							</div>
						{/if}
						{#if token}
							<div
								class="flex flex-col gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2"
								data-testid="wf-inbound-token"
							>
								<p class="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
									<TriangleAlertIcon size={12} />
									{token.signing_secret
										? 'Copy them now: the token and signing secret are shown only once.'
										: 'Copy it now: the token is shown only once.'}
								</p>
								<div class="flex items-center gap-1">
									<span class="w-10 shrink-0 text-muted-foreground">Token</span>
									<code class="truncate font-mono">{token.token}</code>
									<button type="button" aria-label="Copy token" onclick={() => copy(token!.token)}>
										<CopyIcon size={11} />
									</button>
								</div>
								<div class="flex items-center gap-1">
									<span class="w-10 shrink-0 text-muted-foreground">URL</span>
									<code class="truncate font-mono">{token.url}</code>
									<button type="button" aria-label="Copy URL" onclick={() => copy(token!.url)}>
										<CopyIcon size={11} />
									</button>
								</div>
								{#if token.signing_secret}
									<div class="flex items-center gap-1" data-testid="wf-inbound-signing-secret">
										<span class="w-10 shrink-0 text-muted-foreground">Secret</span>
										<code class="truncate font-mono">{token.signing_secret}</code>
										<button
											type="button"
											aria-label="Copy signing secret"
											onclick={() => copy(token!.signing_secret ?? '')}
										>
											<CopyIcon size={11} />
										</button>
									</div>
								{/if}
								<p class="text-muted-foreground">
									Send it as <code class="font-mono">Authorization: Bearer &lt;token&gt;</code>.
								</p>
								{#if token.signing_secret}
									<p class="text-muted-foreground">
										Sign requests with HMAC-SHA256(key=signing secret, msg=<code class="font-mono"
											>&lt;X-IRIS-Timestamp&gt;.</code
										>
										+ raw body) →
										<code class="font-mono">X-IRIS-Signature: sha256=&lt;hex&gt;</code>.
									</p>
								{/if}
							</div>
						{/if}
					{/if}
				</div>
			{:else if type === 'workflow'}
				<p class="text-2xs text-muted-foreground" data-testid="wf-trigger-workflow-help">
					No settings. The caller's inputs are in <code class="font-mono"
						>trigger.payload.inputs</code
					>
					and the calling run in <code class="font-mono">trigger.payload.caller</code>. The run acts
					as the caller's user, on the caller's entity. Only workflows with the same owner (or owned
					by an administrator) may call it.
				</p>
			{/if}
		</section>
	{/if}
</div>

<ConfirmationDialog
	bind:open={confirmRotate}
	title="Rotate the inbound token?"
	message="The current token stops working immediately. Every caller must be updated with the new one."
	confirmText="Rotate"
	confirmButtonVariant="destructive"
	onConfirm={rotate}
/>

<ConfirmationDialog
	bind:open={confirmRotateSecret}
	title="Rotate the signing secret?"
	message="Signatures made with the current secret stop verifying immediately. Every caller must be updated with the new one."
	confirmText="Rotate"
	confirmButtonVariant="destructive"
	onConfirm={rotateSecret}
/>
