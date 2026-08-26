import { setIcon, type IconName } from 'obsidian'

/** Svelte action rendering an Obsidian (Lucide) icon inside the element. */
export function icon(el: HTMLElement, name: IconName) {
	setIcon(el, name)
	return {
		update(next: IconName) {
			setIcon(el, next)
		},
	}
}
