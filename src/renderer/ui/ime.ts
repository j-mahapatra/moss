/** Escape handler for dialogs with text entry: Esc that cancels an IME composition stays open. */
export function keepOpenWhileComposing(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) event.preventDefault()
}
