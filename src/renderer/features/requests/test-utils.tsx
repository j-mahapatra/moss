import { EditorView } from '@codemirror/view'
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore, WorkspaceProvider } from '../../state/workspace'

export function setup(ui: React.ReactElement): {
  store: ReturnType<typeof createWorkspaceStore>
  api: { 'request:send': ReturnType<typeof vi.fn>; 'request:cancel': ReturnType<typeof vi.fn> }
} & ReturnType<typeof render> {
  const api = {
    'request:send': vi.fn(),
    'request:cancel': vi.fn(async () => undefined),
    ...noopExtras()
  }
  const store = createWorkspaceStore(api as never)
  const utils = render(<WorkspaceProvider store={store}>{ui}</WorkspaceProvider>)
  return { store, api, ...utils }
}

export function viewOf(container: HTMLElement, label: string): EditorView {
  const content = container.querySelector(`.cm-content[aria-label="${label}"]`)
  if (!content) throw new Error(`no editor ${label}`)
  const view = EditorView.findFromDOM(content as HTMLElement)
  if (!view) throw new Error('no view')
  return view
}

/** Replace the whole document the way a user edit would (jsdom cannot type into contenteditable). */
export function setDoc(view: EditorView, text: string): void {
  act(() => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      userEvent: 'input.type'
    })
  })
}
