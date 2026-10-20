/* eslint-disable @typescript-eslint/explicit-function-return-type -- test helpers */
import userEvent from '@testing-library/user-event'
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from '../../../shared/import-export/report'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore } from '../../state/workspace'
import { WorkspaceProvider } from '../../state/workspace-context'
import { DiscardDialog } from '../shell/DiscardDialog'
import { useShortcuts } from '../shell/useShortcuts'
import { ImportPanel } from './ImportPanel'
import V21 from '../../../shared/import-export/__fixtures__/v21-basic.json?raw'
import UNSUPPORTED from '../../../shared/import-export/__fixtures__/v21-unsupported.json?raw'

function Shortcuts(): null {
  useShortcuts()
  return null
}

async function setup() {
  const api = {
    'request:send': vi.fn(async () => new Promise<never>(() => undefined)),
    'request:cancel': vi.fn(async () => undefined),
    ...noopExtras(),
    'import:open-file': vi.fn(
      async (): Promise<
        { ok: true; name: string; text: string } | { ok: false; error: string } | null
      > => null
    )
  }
  const store = createWorkspaceStore(api as never)
  render(
    <WorkspaceProvider store={store}>
      <Shortcuts />
      <ImportPanel />
      <DiscardDialog />
    </WorkspaceProvider>
  )
  await act(async () => {
    await store.getState().init()
  })
  return { api, store, user: userEvent.setup() }
}

const textarea = () => screen.getByRole('textbox', { name: 'Paste a collection or curl command' })
const importButton = () => screen.getByRole('button', { name: 'Import' })
const status = () => screen.getByRole('status')
const zone = () => screen.getByRole('region', { name: 'Drop a collection file here' })

/** userEvent.type treats `{` and `[` as key descriptors; paste the text instead. */
async function pasteInto(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(textarea())
  await user.paste(text)
}

function fileOf(text: string, name = 'c.json'): File {
  return new File([text], name, { type: 'application/json' })
}

describe('ImportPanel', () => {
  it('has the heading, drop zone, Open file… and paste controls', async () => {
    await setup()
    expect(screen.getByRole('complementary', { name: 'Import' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Import' })).toBeInTheDocument()
    expect(zone()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open file…' })).toBeInTheDocument()
    expect(textarea()).toBeInTheDocument()
    expect(status()).toBeEmptyDOMElement()
  })

  it('pasting v2.1 JSON and clicking Import saves the collection and says so', async () => {
    const { store, user } = await setup()
    await pasteInto(user, V21)
    await user.click(importButton())
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(store.getState().collections.map((c) => c.name)).toEqual(['Basic API'])
    expect(textarea()).toHaveValue('')
    await user.click(within(status()).getByRole('button', { name: 'Show in Collections' }))
    expect(store.getState().ui.navigatorView).toBe('collections')
  })

  it('lists the report with its count; empty paths show just the message', async () => {
    const { user } = await setup()
    await pasteInto(user, UNSUPPORTED)
    await user.click(importButton())
    const heading = await within(status()).findByRole('heading', { name: /^Not carried over \(/ })
    const items = within(status()).getAllByRole('listitem')
    expect(heading).toHaveTextContent(`Not carried over (${items.length})`)
    expect(items.length).toBeGreaterThan(1)
    const texts = items.map((i) => i.textContent ?? '')
    expect(texts.some((t) => t.startsWith('Secured — '))).toBe(true)
    expect(texts.some((t) => !t.includes(' — '))).toBe(true)
  })

  it('shows a parse error as danger and keeps the text', async () => {
    const { store, user } = await setup()
    await pasteInto(user, 'not a collection')
    await user.click(importButton())
    const p = await within(status()).findByText(/./)
    expect(p).toHaveClass('import-panel__message--danger')
    expect(textarea()).toHaveValue('not a collection')
    expect(store.getState().collections).toEqual([])
  })

  it('a pasted curl command opens as a new request', async () => {
    const { store, user } = await setup()
    await pasteInto(user, 'curl -X POST https://x.test -d a=1')
    await user.click(importButton())
    expect(await within(status()).findByText('Opened as a new request')).toBeInTheDocument()
    expect(store.getState().draft.method).toBe('POST')
    expect(textarea()).toHaveValue('')
  })

  it('curl over a dirty draft defers to the discard dialog: no status, text kept', async () => {
    const { store, user } = await setup()
    act(() => store.getState().updateDraft({ url: 'http://edited' }))
    await pasteInto(user, 'curl https://x.test')
    await user.click(importButton())
    expect(await screen.findByText('Discard unsaved request?')).toBeInTheDocument()
    // The modal dialog hides the panel from the accessibility tree.
    expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement()
    expect(screen.getByRole('textbox', { hidden: true, name: /^Paste/ })).toHaveValue(
      'curl https://x.test'
    )
  })

  it('a failed save shows no extra status and keeps the text', async () => {
    const { api, store, user } = await setup()
    vi.mocked(api['collections:save']).mockRejectedValueOnce(new Error('disk full'))
    await pasteInto(user, V21)
    await user.click(importButton())
    await waitFor(() => expect(store.getState().notices).toHaveLength(1))
    expect(status()).toBeEmptyDOMElement()
    expect(textarea()).toHaveValue(V21)
  })

  it('disables Import while the textarea is empty or blank', async () => {
    const { user } = await setup()
    expect(importButton()).toBeDisabled()
    await pasteInto(user, '   ')
    expect(importButton()).toBeDisabled()
    await user.clear(textarea())
    await pasteInto(user, 'x')
    expect(importButton()).toBeEnabled()
  })

  it('Cmd+Enter in the textarea imports and does not send the request', async () => {
    const { api, store, user } = await setup()
    // A sendable draft, so a leaked shortcut would really call request:send.
    act(() => store.getState().updateDraft({ url: 'https://send.test' }))
    await pasteInto(user, V21)
    fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true })
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(store.getState().collections).toHaveLength(1)
    fireEvent.keyDown(textarea(), { key: 'Enter', ctrlKey: true })
    expect(api['request:send']).not.toHaveBeenCalled()
  })

  it('dropping a file imports its text', async () => {
    const { store } = await setup()
    fireEvent.dragOver(zone(), { dataTransfer: { files: [], types: ['Files'] } })
    expect(zone()).toHaveClass('import-panel__drop--over')
    fireEvent.drop(zone(), { dataTransfer: { files: [fileOf(V21)] } })
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(store.getState().collections.map((c) => c.name)).toEqual(['Basic API'])
    expect(zone()).not.toHaveClass('import-panel__drop--over')
  })

  it('ignores drags that are not carrying files', async () => {
    await setup()
    fireEvent.dragOver(zone(), { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(zone()).not.toHaveClass('import-panel__drop--over')
    fireEvent.drop(zone(), { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(status()).toBeEmptyDOMElement()
  })

  it('keeps the highlight while the drag moves between children of the zone', async () => {
    await setup()
    // jsdom's drag events carry no relatedTarget, so set it on the event.
    const leave = (relatedTarget: EventTarget | null) => {
      const ev = createEvent.dragLeave(zone())
      Object.defineProperty(ev, 'relatedTarget', { value: relatedTarget })
      fireEvent(zone(), ev)
    }
    fireEvent.dragOver(zone(), { dataTransfer: { files: [], types: ['Files'] } })
    leave(screen.getByRole('button', { name: 'Open file…' }))
    expect(zone()).toHaveClass('import-panel__drop--over')
    leave(document.body)
    expect(zone()).not.toHaveClass('import-panel__drop--over')
    fireEvent.dragOver(zone(), { dataTransfer: { files: [], types: ['Files'] } })
    leave(null)
    expect(zone()).not.toHaveClass('import-panel__drop--over')
  })

  it('imports the first of several dropped files and says so', async () => {
    const { store } = await setup()
    fireEvent.drop(zone(), {
      dataTransfer: { files: [fileOf(V21), fileOf('{}', 'second.json')], types: ['Files'] }
    })
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(within(status()).getByText('Only the first file was imported')).toBeInTheDocument()
    expect(store.getState().collections).toHaveLength(1)
  })

  it('refuses a dropped file over 10 MB without importing it', async () => {
    const { store } = await setup()
    const importText = vi.spyOn(store.getState(), 'importText')
    const big = fileOf('{}')
    Object.defineProperty(big, 'size', { value: IMPORT_MAX_BYTES + 1 })
    const read = vi.spyOn(big, 'text')
    fireEvent.drop(zone(), { dataTransfer: { files: [big] } })
    expect(await within(status()).findByText(IMPORT_TOO_LARGE)).toHaveClass(
      'import-panel__message--danger'
    )
    expect(read).not.toHaveBeenCalled()
    expect(importText).not.toHaveBeenCalled()
    expect(store.getState().collections).toEqual([])
  })

  it('says only the first file was used when the first of several is too large', async () => {
    const { store } = await setup()
    const importText = vi.spyOn(store.getState(), 'importText')
    const big = fileOf('{}')
    Object.defineProperty(big, 'size', { value: IMPORT_MAX_BYTES + 1 })
    fireEvent.drop(zone(), { dataTransfer: { files: [big, fileOf(V21, 'second.json')] } })
    expect(await within(status()).findByText(IMPORT_TOO_LARGE)).toBeInTheDocument()
    expect(within(status()).getByText('Only the first file was imported')).toBeInTheDocument()
    expect(importText).not.toHaveBeenCalled()
  })

  it('Open file… imports the picked file; cancelling changes nothing', async () => {
    const { api, store, user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Open file…' }))
    expect(api['import:open-file']).toHaveBeenCalledTimes(1)
    expect(status()).toBeEmptyDOMElement()
    api['import:open-file'].mockResolvedValueOnce({ ok: true, name: 'c.json', text: V21 })
    await user.click(screen.getByRole('button', { name: 'Open file…' }))
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(store.getState().collections).toHaveLength(1)
  })

  it('returns focus to the textarea after a keyboard-activated Import', async () => {
    const { user } = await setup()
    await pasteInto(user, V21)
    importButton().focus()
    await user.keyboard('{Enter}')
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(importButton()).toBeDisabled()
    expect(textarea()).toHaveFocus()
  })

  it('returns focus to the textarea after Open file…, cancelled or not', async () => {
    const { api, user } = await setup()
    const open = () => screen.getByRole('button', { name: 'Open file…' })
    open().focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(textarea()).toHaveFocus())
    expect(api['import:open-file']).toHaveBeenCalledTimes(1)
    api['import:open-file'].mockResolvedValueOnce({ ok: true, name: 'c.json', text: V21 })
    await user.click(open())
    expect(await within(status()).findByText('Imported "Basic API"')).toBeInTheDocument()
    expect(textarea()).toHaveFocus()
  })
})
