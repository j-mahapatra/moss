import { EditorView } from '@codemirror/view'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpResponse, SendResult } from '../../../shared/types'
import { noopExtras } from '../../state/test-api'
import { createWorkspaceStore, WorkspaceProvider } from '../../state/workspace'
import { ResponsePane } from './ResponsePane'

const b64 = (s: string): string => {
  let bin = ''
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte)
  return btoa(bin)
}

function response(over: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: [['content-type', 'application/json']],
    bodyBase64: b64('{"a":1}'),
    size: 7,
    truncated: false,
    timings: { ttfbMs: 10, totalMs: 142 },
    ...over
  }
}

const save = vi.fn(async () => true)
const cancelApi = vi.fn(async () => undefined)

function mount(
  result: SendResult | null,
  inFlight: { requestId: string; startedAt: number } | null = null
): ReturnType<typeof render> & { store: ReturnType<typeof createWorkspaceStore> } {
  const store = createWorkspaceStore({
    'request:send': vi.fn(),
    'request:cancel': cancelApi,
    ...noopExtras()
  } as never)
  store.setState({ result, inFlight })
  const utils = render(
    <WorkspaceProvider store={store}>
      <ResponsePane />
    </WorkspaceProvider>
  )
  return { store, ...utils }
}

function bodyDoc(container: HTMLElement): string {
  const content = container.querySelector('.cm-content[aria-label="Response body"]')
  if (!content) throw new Error('no body editor')
  return (EditorView.findFromDOM(content as HTMLElement) as EditorView).state.doc.toString()
}

beforeEach(() => {
  save.mockClear()
  ;(window as unknown as { api: unknown }).api = { 'response:save': save }
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ResponsePane', () => {
  it('shows the empty state', () => {
    mount(null)
    expect(screen.getByText('Send a request to see the response here.')).toBeInTheDocument()
  })

  it('shows a 404 with the amber tone', () => {
    const { container } = mount({
      ok: true,
      response: response({ status: 404, statusText: 'Not Found' })
    })
    const badge = container.querySelector('[data-response-status]') as HTMLElement
    expect(badge).toHaveTextContent('404 Not Found')
    expect(badge.className).toContain('moss-badge--4xx')
    expect(screen.getByText('142 ms')).toBeInTheDocument()
    expect(screen.getByText('7 B')).toBeInTheDocument()
  })

  it('marks 2xx with a decorative check glyph', () => {
    const { container } = mount({ ok: true, response: response() })
    const badge = container.querySelector('[data-response-status]') as HTMLElement
    expect(badge.className).toContain('moss-badge--2xx')
    expect(badge.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('pretty-prints JSON by default and shows the original under Raw', async () => {
    const user = userEvent.setup()
    const { container } = mount({ ok: true, response: response() })
    expect(bodyDoc(container)).toBe('{\n  "a": 1\n}')
    await user.click(screen.getByRole('button', { name: 'Raw' }))
    expect(bodyDoc(container)).toBe('{"a":1}')
    expect(screen.getByRole('button', { name: 'Raw' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens a 3 MB JSON body in Raw', () => {
    const text = JSON.stringify({ a: 'x'.repeat(3_000_000) })
    const { container } = mount({
      ok: true,
      response: response({ bodyBase64: b64(text), size: text.length })
    })
    expect(screen.getByRole('button', { name: 'Raw' })).toHaveAttribute('aria-pressed', 'true')
    expect(bodyDoc(container)).toBe(text)
  })

  it('does not parse a large body in Raw until Pretty is clicked', async () => {
    const user = userEvent.setup()
    const text = JSON.stringify({ a: 'x'.repeat(3_000_000) })
    const spy = vi.spyOn(JSON, 'parse')
    try {
      mount({ ok: true, response: response({ bodyBase64: b64(text), size: text.length }) })
      expect(spy.mock.calls.filter(([arg]) => arg === text)).toHaveLength(0)
      await user.click(screen.getByRole('button', { name: 'Pretty' }))
      expect(spy.mock.calls.filter(([arg]) => arg === text)).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Pretty' })).toHaveAttribute('aria-pressed', 'true')
    } finally {
      spy.mockRestore()
    }
  })

  it('returns to Raw with a note when Pretty fails on a large invalid body', async () => {
    const user = userEvent.setup()
    const text = '{' + 'x'.repeat(3_000_000)
    mount({ ok: true, response: response({ bodyBase64: b64(text), size: text.length }) })
    expect(screen.queryByText('Not valid JSON — showing raw')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Pretty' }))
    expect(screen.getByText('Not valid JSON — showing raw')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raw' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to raw with a note for invalid JSON', () => {
    const { container } = mount({ ok: true, response: response({ bodyBase64: b64('{oops') }) })
    expect(screen.getByText('Not valid JSON — showing raw')).toBeInTheDocument()
    expect(bodyDoc(container)).toBe('{oops')
  })

  it('shows text bodies without a Pretty/Raw toggle', () => {
    const { container } = mount({
      ok: true,
      response: response({
        headers: [['Content-Type', 'text/plain']],
        bodyBase64: b64('hi there')
      })
    })
    expect(bodyDoc(container)).toBe('hi there')
    expect(screen.queryByRole('button', { name: 'Pretty' })).toBeNull()
  })

  it('renders images from a data URL', () => {
    const { container } = mount({
      ok: true,
      response: response({
        headers: [['content-type', 'image/png; foo=bar']],
        bodyBase64: 'AAAA'
      })
    })
    expect(container.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA')
  })

  it('binary shows size and Save, with no Copy; Save passes the bytes and name', async () => {
    const user = userEvent.setup()
    mount({
      ok: true,
      response: response({
        headers: [['content-type', 'application/octet-stream']],
        bodyBase64: 'AAEC',
        size: 3
      })
    })
    expect(screen.getByText('Binary response · 3 B')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0] as HTMLElement)
    expect(save).toHaveBeenCalledWith({ bodyBase64: 'AAEC', suggestedName: 'response.bin' })
  })

  it('copies the shown text and confirms', async () => {
    const user = userEvent.setup()
    mount({ ok: true, response: response() })
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('{\n  "a": 1\n}')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('raises a danger notice when copying fails', async () => {
    const user = userEvent.setup()
    const { store } = mount({ ok: true, response: response() })
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.waitFor(() =>
      expect(store.getState().notices).toContainEqual(
        expect.objectContaining({ tone: 'danger', message: "Couldn't copy the response" })
      )
    )
  })

  it('raises a danger notice when saving is rejected', async () => {
    const user = userEvent.setup()
    save.mockRejectedValueOnce(new Error('disk full'))
    const { store } = mount({ ok: true, response: response() })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(store.getState().notices).toContainEqual(
        expect.objectContaining({
          tone: 'danger',
          message: "Couldn't save the response: disk full"
        })
      )
    )
  })

  it('shows Saved for 1.5 s after a successful save', async () => {
    vi.useFakeTimers()
    save.mockResolvedValueOnce(true)
    mount({ ok: true, response: response() })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1499)
    })
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('clears the flash timer on unmount', async () => {
    vi.useFakeTimers()
    save.mockResolvedValueOnce(true)
    const set = vi.spyOn(globalThis, 'setTimeout')
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = mount({ ok: true, response: response() })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    const call = set.mock.calls.findIndex(([, ms]) => ms === 1500)
    expect(call).toBeGreaterThanOrEqual(0)
    const timer = set.mock.results[call]?.value as unknown
    unmount()
    expect(clear).toHaveBeenCalledWith(timer)
    set.mockRestore()
    clear.mockRestore()
  })

  it('a failed copy clears the Saved flash', async () => {
    save.mockResolvedValueOnce(true)
    mount({ ok: true, response: response() })
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull()
  })

  it('a failed save clears the Copied flash', async () => {
    save.mockRejectedValueOnce(new Error('disk full'))
    mount({ ok: true, response: response() })
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  })

  it('catches a synchronous clipboard throw and raises the notice', async () => {
    const { store } = mount({ ok: true, response: response() })
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => {
      throw new Error('no clipboard')
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    expect(store.getState().notices).toContainEqual(
      expect.objectContaining({ tone: 'danger', message: "Couldn't copy the response" })
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    writeText.mockRestore()
  })

  it('saves JSON as response.json', async () => {
    const user = userEvent.setup()
    mount({ ok: true, response: response() })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledWith({
      bodyBase64: b64('{"a":1}'),
      suggestedName: 'response.json'
    })
  })

  it('lists duplicate headers and counts them in the tab label', async () => {
    const user = userEvent.setup()
    mount({
      ok: true,
      response: response({
        headers: [
          ['set-cookie', 'a=1'],
          ['set-cookie', 'b=2'],
          ['content-type', 'application/json']
        ]
      })
    })
    await user.click(screen.getByRole('tab', { name: 'Headers (3)' }))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(screen.getByText('a=1')).toBeInTheDocument()
    expect(screen.getByText('b=2')).toBeInTheDocument()
  })

  it('shows an error with its kind and collapsible detail', () => {
    const { container } = mount({
      ok: false,
      error: {
        kind: 'dns',
        message: "Couldn't resolve host api.exmple.com",
        detail: 'ENOTFOUND api.exmple.com'
      }
    })
    expect(
      screen.getByRole('heading', { name: "Couldn't resolve host api.exmple.com" })
    ).toBeInTheDocument()
    expect(container.querySelector('[data-response-error]')).not.toBeNull()
    expect(screen.getByText('dns').className).toContain('moss-badge--danger')
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText('ENOTFOUND api.exmple.com')).toBeInTheDocument()
  })

  it('omits Details when there is no detail', () => {
    mount({ ok: false, error: { kind: 'timeout', message: 'Timed out' } })
    expect(screen.queryByText('Details')).toBeNull()
  })

  it('flags truncated bodies', () => {
    mount({ ok: true, response: response({ truncated: true }) })
    expect(screen.getByText('Truncated at 50 MB').className).toContain('moss-badge--4xx')
  })

  it('shows elapsed time in flight, ticks, cancels, and stops ticking when done', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const { store } = mount(null, { requestId: 'r1', startedAt: 10_000 - 1300 })
    expect(screen.getByText('Waiting… 1.3 s')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText('Waiting… 1.8 s')).toBeInTheDocument()
    act(() => {
      screen.getByRole('button', { name: 'Cancel' }).click()
    })
    expect(cancelApi).toHaveBeenCalledWith({ requestId: 'r1' })
    act(() => {
      store.setState({ inFlight: null, result: { ok: true, response: response() } })
    })
    expect(clear).toHaveBeenCalled()
  })
})
