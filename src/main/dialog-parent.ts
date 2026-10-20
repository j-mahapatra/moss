/** An Electron dialog function: `show(parent, options)` or `show(options)`. */
export type DialogFn<W, O, R> = {
  (parent: W, options: O): Promise<R>
  (options: O): Promise<R>
}

/**
 * Shows a dialog attached to `parent` (a sheet on macOS), or unparented when there is none.
 * No `electron` import, so tests need none.
 */
export function withParent<W, O, R>(
  parent: W | null,
  show: DialogFn<W, O, R>,
  options: O
): Promise<R> {
  return parent ? show(parent, options) : show(options)
}

/**
 * A dialog opener that, at each call, reads the parent window and the dialog function afresh,
 * so a dialog function replaced after startup (as e2e does on Electron's `dialog`) is used.
 */
export function focusedDialog<W, O, R>(
  parent: () => W | null,
  lookup: () => DialogFn<W, O, R>
): (options: O) => Promise<R> {
  return (options) => withParent(parent(), lookup(), options)
}
