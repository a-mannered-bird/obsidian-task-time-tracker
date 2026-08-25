import { MarkdownRenderChild, parseYaml } from 'obsidian'
import { mount, unmount } from 'svelte'
import {
	normalizeStatsOptions,
	type StatsBlockOptions,
} from 'core/statsOptions'
import StatsView from '../components/StatsView.svelte'
import type TaskTimeTracker from '../main'

export const STATS_CODE_BLOCK = 'task-stats'

export function registerStatsCodeBlock(plugin: TaskTimeTracker) {
	plugin.registerMarkdownCodeBlockProcessor(
		STATS_CODE_BLOCK,
		(source, el, ctx) => {
			const parsed = parseOptions(source)
			if (!parsed.ok) {
				renderErrors(el, parsed.errors)
				return
			}
			const child = new StatsRenderChild(el, plugin, parsed.options)
			ctx.addChild(child)
		}
	)
}

function parseOptions(source: string) {
	try {
		return normalizeStatsOptions(parseYaml(source) as unknown)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		return { ok: false as const, errors: [`Invalid YAML: ${reason}`] }
	}
}

function renderErrors(el: HTMLElement, errors: string[]) {
	const box = el.createDiv({ cls: 'task-time-tracker-block-error' })
	box.createEl('strong', { text: `${STATS_CODE_BLOCK}: invalid options` })
	const list = box.createEl('ul')
	for (const error of errors) list.createEl('li', { text: error })
}

/** Ties the Svelte component's lifetime to the rendered markdown section. */
class StatsRenderChild extends MarkdownRenderChild {
	private view: ReturnType<typeof mount> | undefined

	constructor(
		containerEl: HTMLElement,
		private plugin: TaskTimeTracker,
		private options: StatsBlockOptions
	) {
		super(containerEl)
	}

	onload() {
		this.view = mount(StatsView, {
			target: this.containerEl,
			props: { plugin: this.plugin, options: this.options },
		})
	}

	onunload() {
		if (this.view) void unmount(this.view)
	}
}
