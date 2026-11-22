/**
 * Svelte action selecting the whole value when the input gets the focus,
 * so a typed value replaces it.
 */
export function selectOnFocus(input: HTMLInputElement) {
	let justFocused = false
	const onFocus = () => {
		input.select()
		justFocused = true
	}
	// The mouseup that ends a focusing click would put the caret back.
	const onMouseUp = (event: MouseEvent) => {
		if (justFocused) event.preventDefault()
		justFocused = false
	}
	const onBlur = () => (justFocused = false)
	input.addEventListener('focus', onFocus)
	input.addEventListener('mouseup', onMouseUp)
	input.addEventListener('blur', onBlur)
	return {
		destroy() {
			input.removeEventListener('focus', onFocus)
			input.removeEventListener('mouseup', onMouseUp)
			input.removeEventListener('blur', onBlur)
		},
	}
}
