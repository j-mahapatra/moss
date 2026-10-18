import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { externalChange as external, mossTheme } from './cm-setup'
import './CodeEditor.css'

export type CodeEditorProps = {
  value: string
  onChange(value: string): void
  extensions?: Extension[]
  /** Accessible name placed on the contenteditable. */
  label: string
  className?: string
  /** Called with the live view after mount, and with null on unmount. */
  onView?(view: EditorView | null): void
}

/**
 * Minimal controlled CodeMirror 6 wrapper. The view is created once; external `value`
 * changes are applied only when they differ from the editor's own document, so a
 * re-render with the value the editor just emitted never moves the cursor.
 */
export function CodeEditor({
  value,
  onChange,
  extensions = [],
  label,
  className,
  onView
}: CodeEditorProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const initial = useRef({ value, extensions, label })
  const onViewRef = useRef(onView)

  useEffect(() => {
    onChangeRef.current = onChange
    onViewRef.current = onView
  })

  useEffect(() => {
    const init = initial.current
    const view = new EditorView({
      parent: host.current as HTMLDivElement,
      state: EditorState.create({
        doc: init.value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          mossTheme,
          EditorView.contentAttributes.of({ 'aria-label': init.label }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            if (u.transactions.every((t) => t.annotation(external))) return
            onChangeRef.current(u.state.doc.toString())
          }),
          ...init.extensions
        ]
      })
    })
    viewRef.current = view
    onViewRef.current?.(view)
    return () => {
      onViewRef.current?.(null)
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: external.of(true)
      })
    }
  }, [value])

  return <div ref={host} className={className ? `moss-code ${className}` : 'moss-code'} />
}
