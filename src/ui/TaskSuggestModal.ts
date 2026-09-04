import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import {
	buildPickerEntries,
	createEntryFromQuery,
	entryLabel,
	noteMatchesFirst,
	resurfacedEntry,
	VAULT_DISPLAY_LIMIT,
	type PickerEntry,
} from 'core/taskPicker'
import type { VaultTaskInfo } from 'core/vaultTaskIndex'

/** Vault suggestions, split by the hide flags of the management panel. */
export type VaultPickerEntries = {
	visible: VaultTaskInfo[]
	/** Only offered when the query names one exactly (see resurfacedEntry). */
	hidden: VaultTaskInfo[]
}

/**
 * The user's choice: a task of the note, a vault task to add to it, or a
 * brand-new task typed into the query (tags parsed from the text).
 */
export type PickedTask =
	| { kind: 'note'; task: Task }
	| { kind: 'vault'; name: string; tags: string[] }
	| { kind: 'create'; name: string; tags: string[] }

type Options = {
	placeholder: string
	tagMappings: TagMapping[]
	/**
	 * Vault-wide suggestions shown below the note's tasks, deduplicated by
	 * the caller against the whole note. May resolve after the modal opened;
	 * a loading row is shown until then. Omit for a note-only picker (which
	 * also disables creating tasks from the typed text).
	 */
	vaultEntries?: Promise<VaultPickerEntries>
	/**
	 * Every task name of the note, running ones included — the create row
	 * must not offer a twin of a task merely excluded from the candidates.
	 */
	noteNames?: string[]
}

/** Row shown while the vault index is still scanning; choosing it is a no-op. */
const LOADING = { kind: 'loading' } as const
type ModalItem =
	| PickerEntry
	| typeof LOADING
	| { kind: 'create'; name: string; tags: string[] }

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
	private vaultEntries: VaultPickerEntries | null = null

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
			void options.vaultEntries.then((entries) => {
				this.vaultEntries = entries
				this.refreshSuggestions()
			})
		}
	}

	getItems(): ModalItem[] {
		const entries = buildPickerEntries(
			this.tasks,
			this.vaultEntries?.visible ?? []
		)
		const loading = this.options.vaultEntries && this.vaultEntries === null
		return loading ? [...entries, LOADING] : entries
	}

	/**
	 * Fuzzy results with the note's tasks first, then the vault ones, plus a
	 * create row as the very last suggestion when the typed text names no
	 * existing task — Enter keeps selecting the best note match, so creating
	 * a near-duplicate takes a deliberate arrow-down. A query naming a hidden
	 * task exactly resurfaces it instead.
	 */
	getSuggestions(query: string): FuzzyMatch<ModalItem>[] {
		const ranked = super.getSuggestions(query)
		const suggestions = [
			...noteMatchesFirst(ranked.filter(isEntryMatch)),
			...ranked.filter((match) => !isEntryMatch(match)),
		]
		if (!this.options.vaultEntries) return suggestions
		const resurfaced = resurfacedEntry(query, this.vaultEntries?.hidden ?? [])
		if (resurfaced) {
			return [...suggestions, lastRow({ kind: 'vault', info: resurfaced })]
		}
		const create = createEntryFromQuery(query, this.knownNames())
		return create
			? [...suggestions, lastRow({ kind: 'create', ...create })]
			: suggestions
	}

	getItemText(item: ModalItem): string {
		if (item.kind === 'loading') return 'Scanning vault tasks…'
		if (item.kind === 'create') {
			return `➕ Create "${[item.name, ...item.tags].join(' ')}"`
		}
		return entryLabel(item, this.options.tagMappings)
	}

	renderSuggestion(match: FuzzyMatch<ModalItem>, el: HTMLElement): void {
		super.renderSuggestion(match, el)
		if (match.item.kind === 'vault') {
			el.addClass('task-time-tracker-vault-suggestion')
		} else if (match.item.kind === 'loading') {
			el.addClass('task-time-tracker-loading-suggestion')
		} else if (match.item.kind === 'create') {
			el.addClass('task-time-tracker-create-suggestion')
		}
	}

	onChooseItem(item: ModalItem): void {
		if (item.kind === 'loading') return
		this.chosen = true
		if (item.kind === 'note') {
			this.resolve({ kind: 'note', task: item.task })
		} else if (item.kind === 'vault') {
			this.resolve({
				kind: 'vault',
				name: item.info.name,
				tags: item.info.tags,
			})
		} else {
			this.resolve({ kind: 'create', name: item.name, tags: item.tags })
		}
	}

	/**
	 * Names the create row checks against: whole note plus vault entries,
	 * hidden ones included — hiding must never enable a duplicate.
	 */
	private knownNames(): string[] {
		return [
			...(this.options.noteNames ?? this.tasks.map((task) => task.name)),
			...(this.vaultEntries?.visible ?? []).map((info) => info.name),
			...(this.vaultEntries?.hidden ?? []).map((info) => info.name),
		]
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

function isEntryMatch(
	match: FuzzyMatch<ModalItem>
): match is FuzzyMatch<PickerEntry> {
	return match.item.kind === 'note' || match.item.kind === 'vault'
}

/** Appended suggestion that never outranks a fuzzy match. */
function lastRow(item: ModalItem): FuzzyMatch<ModalItem> {
	return { item, match: { score: Number.NEGATIVE_INFINITY, matches: [] } }
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
