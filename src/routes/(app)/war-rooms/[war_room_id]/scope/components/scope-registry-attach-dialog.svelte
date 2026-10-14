<!--
  Attach registry assets (Assets Manager) to the war-room scope, or edit
  the links of one attachment. Each link is optional: an attached case,
  a catalogue vulnerability, both or neither. Nothing is created in the
  case; the asset is only listed in the room's scope.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Search, XIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { SearchableSelect } from '$lib/components/ui/searchable-select';
	import { toast } from '$lib/components/ui/toast';
	import VulnerabilityPicker from '$lib/components/vulnerabilities/findings/VulnerabilityPicker.svelte';
	import {
		choiceIdentifier,
		normalizeIdentifierInput,
		validateChoice,
		type VulnerabilityChoice
	} from '$lib/components/vulnerabilities/findings/finding-form';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import { VulnerabilitiesService } from '$lib/services/vulnerabilities.service';
	import {
		WarRoomScopeService,
		type ScopeCase,
		type ScopeRegistryAsset
	} from '$lib/services/war-room-scope.service';
	import type { ManagedAsset } from '$lib/types/resources/managed-asset';
	import { SELECT_CHECKBOX_CLASS, caseLabel, errorMessage } from './helpers';

	type Props = {
		open: boolean;
		warRoomId: number;
		cases: ScopeCase[];
		/** Set: edit the links of this attachment instead of attaching. */
		editing?: ScopeRegistryAsset | null;
		/** Without vulnerability read the vulnerability link is hidden. */
		showVulnerabilities?: boolean;
		onDone?: () => void;
	};

	let {
		open = $bindable(false),
		warRoomId,
		cases,
		editing = null,
		showVulnerabilities = true,
		onDone
	}: Props = $props();

	const NOTE_MAX = 2000;
	const MAX_BATCH = 200;
	const NO_CASE = 'none';

	let query = $state('');
	let results = $state<ManagedAsset[]>([]);
	let resultsTotal = $state(0);
	let searching = $state(false);
	let picked = $state<ManagedAsset[]>([]);
	let caseValue = $state(NO_CASE);
	let linkVulnerability = $state(false);
	let choice = $state<VulnerabilityChoice | null>(null);
	let note = $state('');
	let attempted = $state(false);
	let saving = $state(false);
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			query = '';
			results = [];
			picked = [];
			caseValue = editing?.case_id != null ? String(editing.case_id) : NO_CASE;
			const linked = editing?.vulnerability ?? null;
			linkVulnerability = linked !== null;
			choice = linked ? { type: 'existing', vulnerability: linked } : null;
			note = editing?.note ?? '';
			attempted = false;
			saving = false;
			if (!editing) void runSearch('');
		}
		wasOpen = open;
	});

	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;
	const runSearch = async (text: string) => {
		const mine = ++seq;
		searching = true;
		try {
			const res = await ManagedAssetsService.list({
				search: text.trim() || undefined,
				per_page: 25,
				order_by: 'name',
				sort_dir: 'asc'
			});
			if (mine !== seq) return;
			if (res.ok && res.data && typeof res.data === 'object') {
				results = res.data.data;
				resultsTotal = res.data.total;
			} else {
				results = [];
				resultsTotal = 0;
			}
		} finally {
			if (mine === seq) searching = false;
		}
	};
	const onQuery = (value: string) => {
		query = value;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void runSearch(value), 250);
	};
	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	const pickedIds = $derived(new Set(picked.map((a) => a.managed_asset_id)));
	const togglePick = (asset: ManagedAsset, on: boolean) => {
		if (on) {
			if (!pickedIds.has(asset.managed_asset_id) && picked.length < MAX_BATCH) {
				picked = [...picked, asset];
			}
		} else {
			picked = picked.filter((a) => a.managed_asset_id !== asset.managed_asset_id);
		}
	};

	const caseItems = $derived([
		{ value: NO_CASE, label: 'No case' },
		...cases.map((c) => ({ value: String(c.case_id), label: caseLabel(c) }))
	]);
	const caseId = $derived(caseValue === NO_CASE ? null : Number(caseValue));

	const choiceError = $derived(linkVulnerability ? validateChoice(choice) : null);
	const noteError = $derived(note.length > NOTE_MAX ? `At most ${NOTE_MAX} characters.` : null);
	const assetsError = $derived(!editing && picked.length === 0 ? 'Pick at least one asset.' : null);
	const invalid = $derived(choiceError !== null || noteError !== null || assetsError !== null);

	/** The catalogue id of the choice; a quick add creates the entry first. */
	const resolveVulnerabilityId = async (c: VulnerabilityChoice): Promise<number | null> => {
		if (c.type === 'existing') return c.vulnerability.vulnerability_id;
		const identifier = normalizeIdentifierInput(c.identifier);
		const title = c.title.trim();
		const created = await VulnerabilitiesService.create({
			identifier,
			...(title ? { title } : {})
		});
		if (created.ok && created.data && typeof created.data === 'object') {
			return created.data.vulnerability_id;
		}
		// Already in the catalogue (added meanwhile): use that entry.
		const found = await VulnerabilitiesService.search({ search: identifier, per_page: 5 });
		const match =
			found.ok && found.data && typeof found.data === 'object'
				? found.data.data.find((v) => v.identifier.toUpperCase() === identifier.toUpperCase())
				: undefined;
		if (match) return match.vulnerability_id;
		toast({
			title: `Could not add ${identifier} to the catalogue`,
			description: errorMessage(created, 'The server refused the request.'),
			variant: 'destructive'
		});
		return null;
	};

	const failed = (res: Parameters<typeof errorMessage>[0]) => {
		if (res.status === 403) return; // Already reported by ApiService.
		toast({
			title: editing ? 'Could not update the links' : 'Could not attach the assets',
			description: errorMessage(res, 'The server refused the request.'),
			variant: 'destructive'
		});
	};

	const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

	const submit = async (event?: Event) => {
		event?.preventDefault();
		attempted = true;
		if (invalid || saving) return;
		saving = true;
		try {
			let vulnerabilityId: number | null = null;
			if (showVulnerabilities && linkVulnerability && choice) {
				vulnerabilityId = await resolveVulnerabilityId(choice);
				if (vulnerabilityId === null) return;
			}
			const trimmedNote = note.trim();

			if (editing) {
				const res = await WarRoomScopeService.updateRegistryAsset(warRoomId, editing.id, {
					case_id: caseId,
					...(showVulnerabilities ? { vulnerability_id: vulnerabilityId } : {}),
					note: trimmedNote || null
				});
				if (!res.ok) {
					failed(res);
					return;
				}
				toast({ title: `${editing.asset_name} updated`, variant: 'success' });
			} else {
				const res = await WarRoomScopeService.attachRegistryAssets(warRoomId, {
					managed_asset_ids: picked.map((a) => a.managed_asset_id),
					case_id: caseId,
					vulnerability_id: vulnerabilityId,
					...(trimmedNote ? { note: trimmedNote } : {})
				});
				if (!res.ok || !res.data || typeof res.data !== 'object') {
					failed(res);
					return;
				}
				const { created, existing, not_found } = res.data;
				const parts = [`${plural(created.length, 'asset')} attached`];
				if (existing.length) parts.push(`${existing.length} already attached with these links`);
				if (not_found.length) parts.push(`${not_found.length} not found`);
				toast({
					title: created.length ? 'Attached to the scope' : 'Nothing new attached',
					description: parts.join(' · '),
					variant: created.length ? 'success' : 'default'
				});
			}
			onDone?.();
			open = false;
		} finally {
			saving = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">
				{editing ? `Links of ${editing.asset_name}` : 'Attach assets from the Assets Manager'}
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				{editing
					? 'Link the attachment to an attached case, a vulnerability, both or neither.'
					: 'Puts registered assets in the war-room scope without creating them in a case. Linking a case or a vulnerability is optional.'}
			</Dialog.Description>
		</Dialog.Header>

		<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit}>
			<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
				{#if !editing}
					<section class="flex flex-col gap-2">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Assets
						</h3>
						{#if picked.length > 0}
							<div class="flex flex-wrap gap-1" data-testid="scope-registry-picked">
								{#each picked as a (a.managed_asset_id)}
									<span
										class="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs"
									>
										{a.name}
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground"
											onclick={() => togglePick(a, false)}
											aria-label={`Remove ${a.name}`}
										>
											<XIcon class="h-3 w-3" />
										</button>
									</span>
								{/each}
							</div>
						{/if}
						<div class="relative">
							<Search
								class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								class="h-9 pl-8"
								placeholder="Search the registry by name, IP, domain…"
								value={query}
								oninput={(e) => onQuery((e.target as HTMLInputElement).value)}
								disabled={saving}
								data-testid="scope-registry-search"
							/>
						</div>
						<div class="max-h-60 overflow-y-auto rounded-md border">
							{#each results as a (a.managed_asset_id)}
								{@const checked = pickedIds.has(a.managed_asset_id)}
								<label
									class="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0 hover:bg-muted/50"
									data-testid="scope-registry-result"
								>
									<Checkbox
										class={SELECT_CHECKBOX_CLASS}
										{checked}
										onCheckedChange={(v) => togglePick(a, !!v)}
										disabled={saving || (!checked && picked.length >= MAX_BATCH)}
									/>
									<span class="min-w-0 flex-1 truncate font-medium">{a.name}</span>
									<span class="shrink-0 text-muted-foreground">
										{a.asset_type?.asset_name ?? ''}
									</span>
									{#if a.ip}
										<span class="shrink-0 font-mono text-2xs text-muted-foreground">{a.ip}</span>
									{/if}
									<span class="w-28 shrink-0 truncate text-right text-muted-foreground">
										{a.client?.customer_name ?? ''}
									</span>
								</label>
							{:else}
								<p class="px-3 py-4 text-center text-xs text-muted-foreground">
									{searching ? 'Searching…' : 'No registered asset matches.'}
								</p>
							{/each}
						</div>
						{#if resultsTotal > results.length}
							<p class="text-2xs text-muted-foreground">
								{results.length} of {resultsTotal} shown, refine the search to find the others.
							</p>
						{/if}
						{#if attempted && assetsError}
							<p class="text-xs text-destructive">{assetsError}</p>
						{/if}
					</section>
				{/if}

				<section class="flex flex-col gap-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Case <span class="font-normal normal-case">(optional)</span>
					</h3>
					<SearchableSelect
						id="scope-registry-case"
						class="w-full text-xs"
						items={caseItems}
						value={caseValue}
						onValueChange={(v) => (caseValue = v || NO_CASE)}
						placeholder="No case"
						searchPlaceholder="Search #id, name…"
						aria-label="Linked case"
					/>
				</section>

				{#if showVulnerabilities}
					<section class="flex flex-col gap-2">
						<label class="flex items-center gap-2 text-xs" for="scope-registry-link-vuln">
							<Checkbox
								id="scope-registry-link-vuln"
								checked={linkVulnerability}
								onCheckedChange={(v) => (linkVulnerability = !!v)}
								disabled={saving}
							/>
							<span class="font-semibold uppercase tracking-wide text-muted-foreground">
								Link a vulnerability
							</span>
						</label>
						{#if linkVulnerability}
							<VulnerabilityPicker
								bind:choice
								disabled={saving}
								error={attempted ? choiceError : null}
							/>
						{/if}
					</section>
				{/if}

				<section class="flex flex-col gap-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Note <span class="font-normal normal-case">(optional)</span>
					</h3>
					<Textarea
						bind:value={note}
						rows={2}
						disabled={saving}
						placeholder="Why it is in scope, e.g. exposed edge device, same vendor as the breached one…"
					/>
					{#if noteError}
						<p class="text-xs text-destructive">{noteError}</p>
					{/if}
				</section>
			</div>

			<Dialog.Footer class="shrink-0 items-center gap-2 border-t px-6 py-3">
				{#if !editing && picked.length > 0}
					<span class="mr-auto text-xs text-muted-foreground">
						{plural(picked.length, 'asset')}
						{#if caseId !== null || (linkVulnerability && choice)}
							→
							{[
								caseId !== null ? `case #${caseId}` : null,
								linkVulnerability && choice ? choiceIdentifier(choice) : null
							]
								.filter(Boolean)
								.join(' + ')}
						{/if}
					</span>
				{/if}
				<Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					size="sm"
					disabled={saving || (attempted && invalid)}
					data-testid="scope-registry-submit"
				>
					{saving ? 'Saving…' : editing ? 'Save' : 'Attach'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
