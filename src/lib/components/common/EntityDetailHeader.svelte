<!--
  Identity + action strip for an entity detail pane (asset, IOC, task,
  evidence).

  Lives above the tab bar so the entity's name and state stay on screen
  whatever tab is open, and so the Edit / Delete / module-hook actions have
  one home instead of being repeated at the top of every Details tab — which
  is where all four of them used to sit, each with its own copy of the
  clipboard and hook plumbing. The hooks sit in a "Run" menu next to Edit,
  the same one the list's selection bar shows.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		EditIcon,
		EllipsisVerticalIcon,
		FileSymlinkIcon,
		ForwardIcon,
		SaveIcon,
		Trash2Icon,
		XIcon,
		type ServerIcon
	} from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { toast } from '$lib/stores/toast.store';
	import type { HookObjectType } from '$lib/services/hooks.service';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import BulkHooksMenu from './BulkHooksMenu.svelte';

	type IconComponent = typeof ServerIcon;

	type Props = {
		Icon: IconComponent;
		title: string;
		/** Second line under the title — type, id, uuid. */
		subtitle?: string;
		/** Monospace title: IOC values, filenames, hashes. */
		mono?: boolean;
		/** Tints the icon tile red for a compromised or malicious entity. */
		accent?: 'none' | 'danger';
		/** Status badges rendered right of the title. */
		badges?: Snippet;

		isEditing?: boolean;
		isSaving?: boolean;
		canEdit?: boolean;
		/** Verb on the edit button — "Edit asset", "Edit IOC"… */
		editLabel?: string;
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		/**
		 * Runs after the user confirms. The host owns the DELETE call (through
		 * its case store) — this strip only asks. It used to fire the request
		 * itself and then call this, so every delete hit the API twice and the
		 * second 404 made the store roll the entity back into the pane.
		 */
		onDelete?: () => void | Promise<void>;
		deletePrompt: string;

		/** Absolute URL copied by both Share and Markdown Link. */
		shareUrl: string;
		/** Font Awesome glyph embedded in the copied markdown link. */
		markdownIcon?: string;

		/** Module-hook target. The menu lists this type's manual hooks. */
		hookType: HookObjectType;
		caseId: number;
		objectId: number;
	};

	let {
		Icon,
		title,
		subtitle,
		mono = false,
		accent = 'none',
		badges,
		isEditing = false,
		isSaving = false,
		canEdit = true,
		editLabel = 'Edit',
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDelete = () => {},
		deletePrompt,
		shareUrl,
		markdownIcon = 'fa-bell',
		hookType,
		caseId,
		objectId
	}: Props = $props();

	let isMenuOpen = $state<boolean>(false);
	let isConfirmingDelete = $state<boolean>(false);
	let isDeleting = $state<boolean>(false);

	const confirmDelete = async () => {
		isDeleting = true;
		try {
			await onDelete();
		} finally {
			isDeleting = false;
		}
	};
	const copyToClipboard = (value: string) => {
		navigator.clipboard
			.writeText(value)
			.then(() => {
				toast({ title: 'Link copied', variant: 'success' });
			})
			.catch((e) => {
				console.error('Clipboard copy error:', e);

				toast({ title: 'Could not copy link', variant: 'destructive' });
			});
	};
</script>

<!--
  VISUAL TEST (lighter chrome): no `border-b` here. The tab row directly
  below keeps its own rule — that one is load-bearing (it is the baseline
  the active-tab underline sits on), so a second line 40px above it was
  pure noise.

  Asymmetric padding is deliberate: this strip is the first thing in the
  pane, so `pt-4` gives the title room to breathe below the case topbar,
  while the smaller `pb-2` keeps it visually attached to the tab row it
  labels rather than floating between the two.
-->
<div class="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-4">
	<div
		class={cn(
			'shrink-0 rounded-md p-1.5',
			accent === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
		)}
	>
		<Icon class="h-4 w-4" />
	</div>

	<div class="min-w-0">
		<h2
			class={cn('truncate font-semibold leading-tight', mono ? 'font-mono text-sm' : 'text-base')}
			{title}
		>
			{title}
		</h2>

		{#if subtitle}
			<p class="truncate text-2xs text-muted-foreground">{subtitle}</p>
		{/if}
	</div>

	{#if badges}
		<div class="flex shrink-0 items-center gap-1.5">
			{@render badges()}
		</div>
	{/if}

	<div class="ml-auto flex shrink-0 items-center gap-2">
		{#if canEdit}
			{#if isEditing}
				<Button variant="outline" size="sm" onclick={onCancelEditing} disabled={isSaving}>
					<XIcon class="h-4 w-4" />
					Cancel
				</Button>

				<Button size="sm" onclick={onSaveChanges} disabled={isSaving}>
					{#if isSaving}
						<span class="animate-spin">⟳</span>
						Saving...
					{:else}
						<SaveIcon class="h-4 w-4" />
						Save Changes
					{/if}
				</Button>
			{:else}
				<BulkHooksMenu {hookType} {caseId} targets={[objectId]} size="sm" align="end" />

				<Button variant="outline" size="sm" onclick={onStartEditing}>
					<EditIcon class="h-4 w-4" />
					{editLabel}
				</Button>

				<Button
					variant="destructive"
					size="sm"
					onclick={() => (isConfirmingDelete = true)}
					disabled={isDeleting}
				>
					{#if isDeleting}
						<span class="animate-spin">⟳</span>
						Deleting...
					{:else}
						<Trash2Icon class="h-4 w-4" />
						Delete
					{/if}
				</Button>
			{/if}
		{/if}

		<DropdownMenu bind:open={isMenuOpen}>
			<!--
			  The trigger renders its own <button>, so it takes the title and
			  class directly. Wrapping it in a second <button> is markup the
			  HTML parser rewrites into two siblings, which leaves the menu
			  anchored to an empty element.
			-->
			<DropdownMenuTrigger
				title="menu"
				class="text-muted-foreground transition-colors hover:text-foreground"
			>
				<EllipsisVerticalIcon size="16" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end">
				<DropdownMenuItem onclick={() => copyToClipboard(shareUrl)}>
					<ForwardIcon /> Share
				</DropdownMenuItem>

				<DropdownMenuItem
					onclick={() =>
						copyToClipboard(`[<i class="fa-solid ${markdownIcon}"></i> #${objectId}](${shareUrl})`)}
				>
					<FileSymlinkIcon /> Markdown Link
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</div>

{#if isConfirmingDelete}
	<ConfirmationDialog
		bind:open={isConfirmingDelete}
		title="Confirm Deletion"
		message={deletePrompt}
		onConfirm={confirmDelete}
		onCancel={() => (isConfirmingDelete = false)}
	/>
{/if}
