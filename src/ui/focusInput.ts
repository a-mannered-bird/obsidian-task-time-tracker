/**
 * Focus a modal's first field as it opens. Mobile web views raise the
 * keyboard only for a focus made while the tap that opened the modal is
 * still being handled, so the field is focused at once; the deferred pass
 * puts the focus back (and selects the value) once the modal has settled.
 */
export function focusInput(
	input: HTMLInputElement,
	{ select }: { select: boolean }
): void {
	input.focus()
	window.setTimeout(() => (select ? input.select() : input.focus()))
}
