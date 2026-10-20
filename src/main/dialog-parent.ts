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
