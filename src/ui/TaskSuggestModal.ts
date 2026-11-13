import {
	FuzzySuggestModal,
	prepareFuzzySearch,
	type App,
	type FuzzyMatch,
	type SearchResult,
} from 'obsidian'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import {
	groupBreaks,
	prepareWordSearch,
	suggestionChoice,
	suggestionGroup,
	suggestionLabel,
	suggestionMeta,
	suggestionRunning,
	taskSuggestions,
	VAULT_DISPLAY_LIMIT,
	type GroupBreak,
	type RowGroup,
	type TaskSuggestion,
	type VaultPickerEntries,
} from 'core/taskPicker'
import type { TaskChoice } from 'core/toggle'

/** What the picker shows of one version of the note. */
export type PickerNote = {
	/** The tasks offered. */
	tasks: Task[]
	/**
	 * Every task name of the note, running ones included: neither the create
	 * row nor the vault entries may offer a twin of a task merely left out of
	 * the offered ones.
	 */
	names: string[]
}

type Options = {
	placeholder: string
	tagMappings: TagMapping[]
	note: PickerNote
	/**
	 * Subscribe to newer versions of the note while the picker is open, so
	 * the rows follow a background change (sync, the tracker tab); returns
	 * the unsubscribe function.
	 */
	watch?: (update: (note: PickerNote) => void) => () => void
	/**
	 * Vault-wide suggestions shown below the note's tasks. May resolve after
	 * the modal opened; a loading row is shown until then. Omit for a
	 * note-only picker (which also disables creating tasks from the typed
	 * text).
	 */
	vaultEntries?: Promise<VaultPickerEntries>
	/** Heading over the note's tasks: `Today`, or the note's day. */
	noteHeading: string
	/**
	 * Offer, on the create row, to add the typed task to the plan without
	 * starting it; the picker then closes as dismissed.
	 */
	onAddToPlan?: (name: string, tags: string[]) => void
}

/** Row shown while the vault index is still scanning; choosing it is a no-op. */
const LOADING = { kind: 'loading' } as const
type ModalItem = TaskSuggestion<SearchResult> | typeof LOADING

/**
 * Fuzzy picker over the note's tasks plus the optional vault entries.
 * Resolves with the choice (a vault or created task is not running), or
 * null when the modal is dismissed without one.
 */
export function pickTask(
	app: App,
	options: Options
): Promise<TaskChoice | null> {
	return new Promise((resolve) => {
		new TaskSuggestModal(app, options, resolve).open()
	})
}

class TaskSuggestModal extends FuzzySuggestModal<ModalItem> {
	private chosen = false
	private note: PickerNote
	/** Null while loading. */
	private vaultEntries: VaultPickerEntries | null = null
	private unwatch: (() => void) | null = null
	/** The heading or separator shown above a row, by row. */
	private breaks = new Map<ModalItem, GroupBreak>()

	constructor(
		app: App,
		private options: Options,
		private resolve: (task: TaskChoice | null) => void
	) {
		super(app)
		this.setPlaceholder(options.placeholder)
		this.note = options.note
		this.limitToNote()
		if (options.vaultEntries) {
			void options.vaultEntries.then((entries) => {
				this.vaultEntries = entries
				this.refreshSuggestions()
			})
		}
	}

	onOpen(): void {
		void super.onOpen()
		this.unwatch =
			this.options.watch?.((note) => {
				this.note = note
				this.limitToNote()
				this.refreshSuggestions()
			}) ?? null
	}

	getItems(): ModalItem[] {
		return this.rankedSuggestions('').map((match) => match.item)
	}

	/**
	 * The rows of taskSuggestions, shared with the tracker's bar. The create
	 * row comes last, so Enter keeps selecting the best match and creating a
	 * near-duplicate takes a deliberate arrow-down.
	 */
	getSuggestions(query: string): FuzzyMatch<ModalItem>[] {
		const suggestions = this.rankedSuggestions(query)
		const breaks = groupBreaks(
			suggestions.map((match) => rowGroup(match.item)),
			this.options.noteHeading
		)
		this.breaks = new Map()
		for (const [index, entry] of breaks) {
			const item = suggestions[index]?.item
			if (item) this.breaks.set(item, entry)
		}
		return suggestions
	}

	private rankedSuggestions(query: string): FuzzyMatch<ModalItem>[] {
		// Not super.getSuggestions: it matches the query as one string, so
		// words typed in another order than the task name's would not match.
		const rows = taskSuggestions({
			query,
			tasks: this.note.tasks,
			noteNames: this.note.names,
			vault: this.vaultEntries,
			match: prepareWordSearch(query, prepareFuzzySearch),
			otherLimit: VAULT_DISPLAY_LIMIT,
			offersCreate: this.options.vaultEntries !== undefined,
		})
		const matches: FuzzyMatch<ModalItem>[] = rows.map((row) => ({
			item: row,
			match: this.highlight(row),
		}))
		if (!this.options.vaultEntries || this.vaultEntries) return matches
		// Where the vault rows will appear, before the create row. Not a
		// fuzzy item: it would vanish as soon as the query stopped matching
		// its own text.
		const last = matches[matches.length - 1]
		const loading = { item: LOADING, match: NO_MATCH }
		return last?.item.kind === 'create'
			? [...matches.slice(0, -1), loading, last]
			: [...matches, loading]
	}

	/**
	 * The match on the task name, moved past the emoji the shown text
	 * starts with.
	 */
	private highlight(row: TaskSuggestion<SearchResult>): SearchResult {
		if (row.kind === 'create' || !row.match) return NO_MATCH
		const name = row.kind === 'note' ? row.task.name : row.info.name
		const offset = this.getItemText(row).length - name.length
		return {
			score: row.match.score,
			matches: row.match.matches.map(([start, end]) => [
				start + offset,
				end + offset,
			]),
		}
	}

	getItemText(item: ModalItem): string {
		if (item.kind === 'loading') return 'Scanning vault tasks…'
		return suggestionLabel(item, this.options.tagMappings)
	}

	renderSuggestion(match: FuzzyMatch<ModalItem>, el: HTMLElement): void {
		super.renderSuggestion(match, el)
		const { item } = match
		if (item.kind !== 'loading' && suggestionRunning(item)) {
			el.addClass('task-time-tracker-running-suggestion')
		}
		if (item.kind === 'vault') {
			el.addClass('task-time-tracker-vault-suggestion')
		} else if (item.kind === 'loading') {
			el.addClass('task-time-tracker-loading-suggestion')
		} else if (item.kind === 'create') {
			el.addClass('task-time-tracker-create-suggestion')
			this.renderAddToPlan(item, el)
		}
		const meta = item.kind === 'loading' ? null : suggestionMeta(item)
		if (meta) {
			el.createSpan({ cls: 'task-time-tracker-suggestion-meta', text: meta })
		}
		const entry = this.breaks.get(item)
		if (entry) insertBreak(el, entry)
	}

	private renderAddToPlan(
		item: { name: string; tags: string[] },
		el: HTMLElement
	) {
		const { onAddToPlan } = this.options
		if (!onAddToPlan) return
		const button = el.createEl('button', {
			text: 'Add to list',
			cls: 'task-time-tracker-suggestion-action',
		})
		// The row chooses itself on a click: keep the button's click to it.
		button.addEventListener('mousedown', (event) => event.stopPropagation())
		button.addEventListener('click', (event) => {
			event.stopPropagation()
			onAddToPlan(item.name, item.tags)
			this.close()
		})
	}

	onChooseItem(item: ModalItem): void {
		if (item.kind === 'loading') return
		this.chosen = true
		this.resolve(suggestionChoice(item))
	}

	onClose(): void {
		super.onClose()
		this.unwatch?.()
		// Obsidian closes the modal before calling onChooseItem, so decide
		// whether this was a dismissal only after the current tick.
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(null)
		})
	}

	/**
	 * taskSuggestions already caps the vault rows; room for every note task,
	 * those rows and the last rows (loading, resurfaced, create).
	 */
	private limitToNote() {
		this.limit = this.note.tasks.length + VAULT_DISPLAY_LIMIT + 3
	}

	/**
	 * Re-run the suggestion query, keeping the highlighted row on the same
	 * task: the rows may reorder under a user about to press Enter.
	 */
	private refreshSuggestions() {
		const chooser = suggestionChooser(this)
		const highlighted = chooser?.values?.[chooser.selectedItem]?.item
		if (hasUpdateSuggestions(this)) this.updateSuggestions()
		else this.inputEl.dispatchEvent(new Event('input'))
		if (!chooser?.values || !highlighted) return
		const key = itemKey(highlighted)
		const index = chooser.values.findIndex(
			(match) => itemKey(match.item) === key
		)
		if (index >= 0) chooser.setSelectedItem(index, undefined)
	}
}

function rowGroup(item: ModalItem): RowGroup {
	return item.kind === 'loading' ? 'vault' : suggestionGroup(item)
}

/**
 * Put a heading or separator above the row, outside it: inside, it would
 * be highlighted and chosen with the row. The rows are in the list when
 * rendered; should one not be yet, the break goes at the row's top.
 */
function insertBreak(el: HTMLElement, entry: GroupBreak) {
	const breakEl = el.doc.createElement('div')
	if ('heading' in entry) {
		breakEl.addClass('task-time-tracker-suggestion-group')
		breakEl.setText(entry.heading)
	} else {
		breakEl.addClass('task-time-tracker-suggestion-separator')
	}
	if (el.parentElement) el.before(breakEl)
	else el.prepend(breakEl)
}

/** Identity of a row across refreshes: a task by its name. */
function itemKey(item: ModalItem): string {
	if (item.kind === 'note') return `task:${item.task.name}`
	if (item.kind === 'vault') return `task:${item.info.name}`
	return item.kind
}

const NO_MATCH: SearchResult = { score: 0, matches: [] }

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

/**
 * The rows and highlight of a SuggestModal live in its undocumented
 * `chooser` (see obsidian-typings); null when it is not there, in which case
 * a refresh highlights the first row again.
 */
type SuggestionChooser = {
	values: FuzzyMatch<ModalItem>[] | null
	selectedItem: number
	setSelectedItem(index: number, event: Event | undefined): void
}

function suggestionChooser(modal: object): SuggestionChooser | null {
	if (!('chooser' in modal)) return null
	return isSuggestionChooser(modal.chooser) ? modal.chooser : null
}

function isSuggestionChooser(value: unknown): value is SuggestionChooser {
	return (
		typeof value === 'object' &&
		value !== null &&
		'selectedItem' in value &&
		typeof value.selectedItem === 'number' &&
		'setSelectedItem' in value &&
		typeof value.setSelectedItem === 'function' &&
		'values' in value &&
		(value.values === null || Array.isArray(value.values))
	)
}
