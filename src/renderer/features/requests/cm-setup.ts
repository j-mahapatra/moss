import { Annotation } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** Marks transactions that come from a prop update, not from the user. */
export const externalChange = Annotation.define<boolean>()

export const mossTheme = EditorView.theme({
  '&': {
    color: 'var(--moss-text)',
    backgroundColor: 'var(--moss-surface-raised)',
    fontSize: 'var(--moss-text-md)',
    border: '1px solid var(--moss-border)',
    borderRadius: 'var(--moss-radius-md)'
  },
  '&.cm-focused': { outline: '1px solid var(--moss-focus)', borderColor: 'var(--moss-focus)' },
  '.cm-scroller': { fontFamily: 'var(--moss-font-mono)', lineHeight: 'var(--moss-leading-normal)' },
  '.cm-content': { caretColor: 'var(--moss-text)', padding: '6px var(--moss-space-2)' },
  '.cm-cursor': { borderLeftColor: 'var(--moss-text)' },
  '.cm-gutters': {
    backgroundColor: 'var(--moss-surface-raised)',
    color: 'var(--moss-text-muted)',
    borderRight: '1px solid var(--moss-border)'
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--moss-accent-soft)' },
  '.cm-tooltip': {
    border: '1px solid var(--moss-border)',
    backgroundColor: 'var(--moss-surface-raised)',
    color: 'var(--moss-text)',
    borderRadius: 'var(--moss-radius-md)'
  }
})
