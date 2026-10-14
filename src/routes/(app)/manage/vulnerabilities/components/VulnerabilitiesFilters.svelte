<!--
  Filter bar for the vulnerability catalogue. Same contract as the asset
  registry's: every control writes into the bound page state and calls
  `onSubmit`, which pushes the URL and re-runs the query.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import SearchSelect from '$lib/components/common/selects/SearchSelect.svelte';
	import {
		VULNERABILITY_KINDS,
		VULNERABILITY_SEVERITIES,
		type VulnerabilityKind,
		type VulnerabilitySeverity,
		type VulnerabilityTechnology
	} from '$lib/services/vulnerabilities.service';
	import { KIND_LABELS, SEVERITY_LABELS } from '$lib/components/vulnerabilities/labels';

	type Props = {
		search: string;
		severity: VulnerabilitySeverity[];
		kind: VulnerabilityKind[];
		vendor: string[];
		product: string[];
		/** Vendor / product pairs of the catalogue, for the two pickers. */
		technologies?: VulnerabilityTechnology[];
		kev: boolean | null;
		isPrivate: boolean | null;
		affected: boolean;
		loading?: boolean;
		hasActiveFilters?: boolean;
		onSubmit: () => void;
		onClear: () => void;
	};

	let {
		search = $bindable(''),
		severity = $bindable([]),
		kind = $bindable([]),
		vendor = $bindable([]),
		product = $bindable([]),
		technologies = [],
		kev = $bindable(null),
		isPrivate = $bindable(null),
		affected = $bindable(false),
		loading = false,
		hasActiveFilters = false,
		onSubmit,
		onClear
	}: Props = $props();

	const TRISTATE = [
		{ label: 'Any', value: null },
		{ label: 'Yes', value: true },
		{ label: 'No', value: false }
	];

	const SEVERITY_OPTIONS = VULNERABILITY_SEVERITIES.map((value) => ({
		value,
		label: SEVERITY_LABELS[value]
	}));
	const KIND_OPTIONS = VULNERABILITY_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }));

	// Names compare case-insensitively, as the backend matches them.
	const key = (name: string) => name.toLowerCase();

	/** Selected names stay listed (and removable) even when no longer offered. */
	const withSelected = (options: { value: string; label: string }[], selected: string[]) => {
		const offered = new Set(options.map((option) => key(option.value)));
		const missing = selected.filter((name) => !offered.has(key(name)));
		return [...missing.map((name) => ({ value: name, label: name })), ...options];
	};

	const vendorOptions = $derived.by(() => {
		const counts = new Map<string, { name: string; count: number }>();
		for (const t of technologies) {
			if (!t.vendor) continue;
			const entry = counts.get(key(t.vendor)) ?? { name: t.vendor, count: 0 };
			entry.count += t.vulnerabilities;
			counts.set(key(t.vendor), entry);
		}
		const options = [...counts.values()]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(({ name, count }) => ({ value: name, label: `${name} (${count})` }));
		return withSelected(options, vendor);
	});

	// Narrowed to the selected vendors; a product shipped by several
	// vendors is one option naming them all.
	const productOptions = $derived.by(() => {
		const vendors = new Set(vendor.map(key));
		const products = new Map<string, { name: string; vendors: string[] }>();
		for (const t of technologies) {
			if (vendors.size && !(t.vendor && vendors.has(key(t.vendor)))) continue;
			const entry = products.get(key(t.product)) ?? { name: t.product, vendors: [] };
			if (t.vendor && !entry.vendors.includes(t.vendor)) entry.vendors.push(t.vendor);
			products.set(key(t.product), entry);
		}
		const options = [...products.values()]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(({ name, vendors: owners }) => ({
				value: name,
				label: owners.length ? `${name} — ${owners.join(', ')}` : name
			}));
		return withSelected(options, product);
	});

	const many = (value: string | string[]) => (Array.isArray(value) ? value : value ? [value] : []);

	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			onSubmit();
		}
	};
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
		<Input
			bind:value={search}
			onkeydown={onKey}
			placeholder="Search by identifier, alias, title, tag, vendor or product…"
			class="flex-1"
			aria-label="Search vulnerabilities"
		/>
		<Button onclick={onSubmit} disabled={loading}>
			{loading ? 'Searching…' : 'Search'}
		</Button>
	</div>

	<div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Severity</span>
			<div class="w-40">
				<SearchSelect
					value={severity}
					options={SEVERITY_OPTIONS}
					multiple
					placeholder="Any"
					searchPlaceholder="Search severities…"
					size="sm"
					onChange={(value) => {
						severity = many(value) as VulnerabilitySeverity[];
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Kind</span>
			<div class="w-44">
				<SearchSelect
					value={kind}
					options={KIND_OPTIONS}
					multiple
					placeholder="Any"
					searchPlaceholder="Search kinds…"
					size="sm"
					onChange={(value) => {
						kind = many(value) as VulnerabilityKind[];
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Vendor</span>
			<div class="w-44">
				<SearchSelect
					value={vendor}
					options={vendorOptions}
					multiple
					placeholder="Any"
					searchPlaceholder="Search vendors…"
					size="sm"
					onChange={(value) => {
						vendor = many(value);
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Product</span>
			<div class="w-52">
				<SearchSelect
					value={product}
					options={productOptions}
					multiple
					placeholder="Any"
					searchPlaceholder="Search products…"
					size="sm"
					onChange={(value) => {
						product = many(value);
						onSubmit();
					}}
				/>
			</div>
		</div>

		{#each [{ label: 'KEV', get: () => kev, set: (v: boolean | null) => (kev = v) }, { label: 'Private', get: () => isPrivate, set: (v: boolean | null) => (isPrivate = v) }] as group (group.label)}
			<div class="flex items-center gap-1.5 text-xs">
				<span class="text-muted-foreground">{group.label}:</span>
				{#each TRISTATE as choice (String(choice.value))}
					{@const active = group.get() === choice.value}
					<button
						type="button"
						aria-pressed={active}
						onclick={() => {
							group.set(choice.value);
							onSubmit();
						}}
						class="rounded-md border px-2 py-1 transition-colors {active
							? 'border-primary/40 bg-primary/10 text-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						{choice.label}
					</button>
				{/each}
			</div>
		{/each}

		<button
			type="button"
			aria-pressed={affected}
			title="Only entries with an open finding in a case you can access"
			onclick={() => {
				affected = !affected;
				onSubmit();
			}}
			class="rounded-md border px-2 py-1 text-xs transition-colors {affected
				? 'border-primary/40 bg-primary/10 text-foreground'
				: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
		>
			Affected only
		</button>

		{#if hasActiveFilters}
			<button
				type="button"
				class="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={onClear}
			>
				Clear all filters
			</button>
		{/if}
	</div>
</div>
