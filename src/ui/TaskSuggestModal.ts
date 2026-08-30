import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import {
	buildPickerEntries,
	entryLabel,
	VAULT_DISPLAY_LIMIT,
	type PickerEntry,
} from 'core/taskPicker'
import type { VaultTaskInfo } from 'core/vaultTaskIndex'

/** The user's choice: a task of the note, or a vault task to add to it. */
export type PickedTask =
	| { kind: 'note'; task: Task }
	| { kind: 'vault'; name: string; tags: string[] }

type Options = {
	placeholder: string
	tagMappings: TagMapping[]
	/**
	 * Vault-wide suggestions shown below the note's tasks, deduplicated by
	 * the caller against the whole note. May resolve after the modal opened;
	 * a loading row is shown until then. Omit for a note-only picker.
	 */
	vaultEntries?: Promise<VaultTaskInfo[]>
}

/** Row shown while the vault index is still scanning; choosing it is a no-op. */
const LOADING = { kind: 'loading' } as const
type ModalItem = PickerEntry | typeof LOADING

/**
 * Fuzzy picker over the note's tasks plus the optional vault entries.
 * Resolves with the choice, or null when the modal is dismissed without one.
 */
export function pickTask(
	app: App,
	tasks: Task[],
	options: Options
): Promise<PickedTask | null> {
	return new Promise((resolve) => {
		new TaskSuggestModal(app, tasks, options, resolve).open()
	})
}

class TaskSuggestModal extends FuzzySuggestModal<ModalItem> {
	private chosen = false
	private vaultInfos: VaultTaskInfo[] | null = null

	constructor(
		app: App,
		private tasks: Task[],
		private options: Options,
		private resolve: (task: PickedTask | null) => void
	) {
		super(app)
		this.setPlaceholder(options.placeholder)
		// Cap what is rendered, not what is searched: every note task plus
		// the best vault matches.
		this.limit = tasks.length + VAULT_DISPLAY_LIMIT
		if (options.vaultEntries) {
			void options.vaultEntries.then((infos) => {
				this.vaultInfos = infos
				this.refreshSuggestions()
			})
		}
	}

	getItems(): ModalItem[] {
		const entries = buildPickerEntries(this.tasks, this.vaultInfos ?? [])
		const loading = this.options.vaultEntries && this.vaultInfos === null
		return loading ? [...entries, LOADING] : entries
	}

	getItemText(item: ModalItem): string {
		if (item.kind === 'loading') return 'Scanning vault tasks…'
		return entryLabel(item, this.options.tagMappings)
	}

	renderSuggestion(match: FuzzyMatch<ModalItem>, el: HTMLElement): void {
		super.renderSuggestion(match, el)
		if (match.item.kind === 'vault') {
			el.addClass('task-time-tracker-vault-suggestion')
		} else if (match.item.kind === 'loading') {
			el.addClass('task-time-tracker-loading-suggestion')
		}
	}

	onChooseItem(item: ModalItem): void {
		if (item.kind === 'loading') return
		this.chosen = true
		if (item.kind === 'note') {
			this.resolve({ kind: 'note', task: item.task })
		} else {
			this.resolve({
				kind: 'vault',
				name: item.info.name,
				tags: item.info.tags,
			})
		}
	}

	onClose(): void {
		super.onClose()
		// Obsidian closes the modal before calling onChooseItem, so decide
		// whether this was a dismissal only after the current tick.
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(null)
		})
	}

	/** Re-run the suggestion query after the vault entries arrived. */
	private refreshSuggestions() {
		if (hasUpdateSuggestions(this)) this.updateSuggestions()
		else this.inputEl.dispatchEvent(new Event('input'))
	}
}

/** SuggestModal re-queries through this undocumented but stable method. */
function hasUpdateSuggestions(
	value: unknown
): value is { updateSuggestions(): void } {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { updateSuggestions?: unknown }).updateSuggestions ===
			'function'
	)
}
