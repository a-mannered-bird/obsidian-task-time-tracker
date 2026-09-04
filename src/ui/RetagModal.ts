import { Modal, Setting, type App, type ButtonComponent } from 'obsidian'
import {
	diffTags,
	isTag,
	tagChangeApplies,
	type TagChange,
} from 'core/taskEdits'
import { TagSuggest } from './TagSuggest'

type Options = {
	names: string[]
	/** Tags of every line of the tasks, one entry per line. */
	lineTags: string[][]
	/** Every tag of the vault, for the autocomplete. */
	knownTags: string[]
}

/**
 * Edit the tags of a task as chips: remove any with their cross, add
 * existing or new ones by typing. Applying gives every line exactly the
 * chips' tags, which is how tag drift gets settled; a chip missing on some
 * lines shows its coverage. Resolves with the change, or null when
 * dismissed.
 */
export function promptRetag(
	app: App,
	options: Options
): Promise<TagChange | null> {
	return new Promise((resolve) => {
		new RetagModal(app, options, resolve).open()
	})
}

class RetagModal extends Modal {
	/** Union of the lines' tags, in order of first appearance. */
	private readonly currentTags: string[]
	private tags: string[]
	private applied = false
	private chipsEl: HTMLElement | null = null
	private inputEl: HTMLInputElement | null = null
	private errorEl: HTMLElement | null = null
	private applyButton: ButtonComponent | null = null

	constructor(
		app: App,
		private options: Options,
		private resolve: (change: TagChange | null) => void
	) {
		super(app)
		this.currentTags = [...new Set(options.lineTags.flat())]
		this.tags = [...this.currentTags]
	}

	onOpen(): void {
		const { names, knownTags } = this.options
		this.setTitle(
			names.length === 1
				? `Tags of "${names[0]}"`
				: `Tags of ${names.length} tasks`
		)
		this.contentEl.createEl('p', {
			text: `Remove tags with their cross, type to add existing or new ones. Once applied, every line of ${names.length === 1 ? 'the task' : 'these tasks'} in every daily note carries exactly these tags.`,
		})

		const field = this.contentEl.createDiv({
			cls: 'task-time-tracker-chips',
		})
		this.chipsEl = field.createSpan()
		this.inputEl = field.createEl('input', {
			type: 'text',
			placeholder: 'Add a tag…',
			cls: 'task-time-tracker-chips-input',
		})
		new TagSuggest(this.app, this.inputEl, knownTags, () => this.addTyped())
		this.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ',') {
				event.preventDefault()
				this.addTyped()
			} else if (event.key === 'Backspace' && !this.inputEl?.value) {
				this.removeTag(this.tags[this.tags.length - 1])
			}
		})
		field.addEventListener('click', () => this.inputEl?.focus())

		this.errorEl = this.contentEl.createEl('p', {
			cls: 'task-time-tracker-prompt-error',
		})

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((button) => {
				this.applyButton = button
				button
					.setButtonText('Apply')
					.setCta()
					.onClick(() => this.apply())
			})

		this.render()
		window.setTimeout(() => this.inputEl?.focus())
	}

	onClose(): void {
		this.contentEl.empty()
		this.resolve(this.applied ? this.change() : null)
	}

	private change(): TagChange {
		return diffTags(this.currentTags, this.tags)
	}

	/** Whether applying would alter at least one line. */
	private hasEffect(): boolean {
		const change = this.change()
		return this.options.lineTags.some((tags) => tagChangeApplies(tags, change))
	}

	/**
	 * `7/12` for a tag some lines lack; nothing for a tag on every line or
	 * a newly added one (a `0/485` would read like a problem to fix).
	 */
	private coverage(tag: string): string | null {
		const total = this.options.lineTags.length
		const count = this.options.lineTags.filter((tags) =>
			tags.includes(tag)
		).length
		return count > 0 && count < total ? `${count}/${total}` : null
	}

	private render(): void {
		const chips = this.chipsEl
		if (!chips) return
		chips.empty()
		for (const tag of this.tags) {
			const chip = chips.createSpan({ cls: 'task-time-tracker-chip' })
			chip.createSpan({ text: tag })
			const coverage = this.coverage(tag)
			if (coverage) {
				chip.createSpan({
					text: coverage,
					cls: 'task-time-tracker-chip-coverage',
					attr: { 'aria-label': `on ${coverage} lines` },
				})
			}
			const remove = chip.createEl('button', {
				cls: 'task-time-tracker-chip-remove',
				text: '×',
				attr: { 'aria-label': `Remove ${tag}` },
			})
			remove.addEventListener('click', (event) => {
				event.stopPropagation()
				this.removeTag(tag)
			})
		}
		this.applyButton?.setDisabled(!this.hasEffect())
	}

	private addTyped(): void {
		const typed = this.inputEl?.value.trim() ?? ''
		if (!typed) return
		const tag = typed.startsWith('#') ? typed : `#${typed}`
		if (!isTag(tag)) {
			this.errorEl?.setText(
				'A tag is one word: letters, digits, "_", "-" or "/".'
			)
			return
		}
		this.errorEl?.setText('')
		if (!this.tags.includes(tag)) this.tags.push(tag)
		if (this.inputEl) this.inputEl.value = ''
		this.render()
	}

	private removeTag(tag: string | undefined): void {
		if (tag === undefined) return
		this.tags = this.tags.filter((other) => other !== tag)
		this.render()
	}

	private apply(): void {
		if (!this.hasEffect()) return
		this.applied = true
		this.close()
	}
}
