import { FuzzySuggestModal, type App } from 'obsidian'
import type { TagMapping } from 'types/tags'
import type { Task } from 'types/tasks'
import { pickerLabel, sortForPicker } from 'core/taskPicker'

type Options = {
	placeholder: string
	tagMappings: TagMapping[]
}

/**
 * Fuzzy picker over the given tasks. Resolves with the chosen task, or null
 * when the modal is dismissed without a choice.
 */
export function pickTask(
	app: App,
	tasks: Task[],
	options: Options
): Promise<Task | null> {
	return new Promise((resolve) => {
		new TaskSuggestModal(app, tasks, options, resolve).open()
	})
}

class TaskSuggestModal extends FuzzySuggestModal<Task> {
	private chosen = false

	constructor(
		app: App,
		private tasks: Task[],
		private options: Options,
		private resolve: (task: Task | null) => void
	) {
		super(app)
		this.setPlaceholder(options.placeholder)
	}

	getItems(): Task[] {
		return sortForPicker(this.tasks)
	}

	getItemText(task: Task): string {
		return pickerLabel(task, this.options.tagMappings)
	}

	onChooseItem(task: Task): void {
		this.chosen = true
		this.resolve(task)
	}

	onClose(): void {
		super.onClose()
		if (!this.chosen) this.resolve(null)
	}
}
