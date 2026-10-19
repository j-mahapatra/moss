import type { EditorView } from '@codemirror/view'
import { useEffect, useState } from 'react'
import type { VariableScope } from '../../../shared/variables'
import { CodeEditor } from './CodeEditor'
import { setPasteHandler, setScope, setSubmit, urlExtensions } from './url-extensions'

type UrlBarProps = {
  value: string
  onChange(url: string): void
  onSubmit(): void
  /** Called with a pasted `curl …` command; return true when it was applied. */
  onPasteCurl?(text: string): boolean
  scope: VariableScope
}

/** Single-line URL editor with `{{variable}}` highlighting; Enter submits; curl pastes convert. */
export function UrlBar({
  value,
  onChange,
  onSubmit,
  onPasteCurl,
  scope
}: UrlBarProps): React.JSX.Element {
  const [view, setView] = useState<EditorView | null>(null)

  useEffect(() => {
    view?.dispatch({ effects: setScope.of(scope) })
  }, [view, scope])

  useEffect(() => {
    view?.dispatch({ effects: setSubmit.of(onSubmit) })
  }, [view, onSubmit])

  useEffect(() => {
    view?.dispatch({ effects: setPasteHandler.of(onPasteCurl ?? null) })
  }, [view, onPasteCurl])

  return (
    <CodeEditor
      label="Request URL"
      className="moss-urlbar"
      value={value}
      onChange={onChange}
      extensions={urlExtensions}
      onView={setView}
    />
  )
}
