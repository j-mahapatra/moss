import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { newCollection } from '../../../shared/collection-tree'
import { newEnvironment } from '../../../shared/environments'
import { selectScope } from '../../state/selectors'
import { RequestPane } from './RequestPane'
import { tooltipTextFor } from './url-extensions'
import { setDoc, setup, viewOf } from './test-utils'

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
})

describe('RequestPane', () => {
  it('syncs the URL query into the Params grid and back', async () => {
    const user = userEvent.setup()
    const { container, store } = setup(<RequestPane />)
    setDoc(viewOf(container, 'Request URL'), 'https://a.io?x=1')
    expect(screen.getByLabelText('Key 1')).toHaveValue('x')
    expect(screen.getByLabelText('Value 1')).toHaveValue('1')

    const value = screen.getByLabelText('Value 1')
    await user.clear(value)
    await user.type(value, '2')
    expect(store.getState().draft.url).toBe('https://a.io?x=2')
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('https://a.io?x=2')
  })

  it('encodes a param typed to equal a later one, which keeps its raw text', async () => {
    const user = userEvent.setup()
    const { container, store } = setup(<RequestPane />)
    setDoc(viewOf(container, 'Request URL'), 'u?b=2&b=2+3')
    await user.type(screen.getByLabelText('Value 1'), '+3')
    expect(store.getState().draft.url).toBe('u?b=2%2B3&b=2+3')
  })

  it('keeps disabled params when the URL is edited', async () => {
    const user = userEvent.setup()
    const { container, store } = setup(<RequestPane />)
    setDoc(viewOf(container, 'Request URL'), 'u?a=1')
    await user.click(screen.getByLabelText('Enable row 1'))
    expect(store.getState().draft.url).toBe('u')
    setDoc(viewOf(container, 'Request URL'), 'u?b=2')
    expect(store.getState().draft.params).toEqual([
      { key: 'b', value: '2', enabled: true },
      { key: 'a', value: '1', enabled: false }
    ])
  })

  it('counts enabled headers in the tab label', async () => {
    const user = userEvent.setup()
    setup(<RequestPane />)
    await user.click(screen.getByRole('tab', { name: 'Headers (0)' }))
    await user.type(screen.getByLabelText('Key 1'), 'A')
    await user.type(screen.getByLabelText('Key 2'), 'B')
    expect(screen.getByRole('tab', { name: 'Headers (2)' })).toBeInTheDocument()
  })

  it('shows a masked password field for Basic auth', async () => {
    const user = userEvent.setup()
    setup(<RequestPane />)
    await user.click(screen.getByRole('tab', { name: 'Auth' }))
    await user.click(screen.getByRole('combobox', { name: 'Auth type' }))
    await user.click(await screen.findByRole('option', { name: 'Basic auth' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show Password' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('type', 'password')
  })

  it('masks the bearer token, with a reveal toggle', async () => {
    const user = userEvent.setup()
    const { store } = setup(<RequestPane />)
    await user.click(screen.getByRole('tab', { name: 'Auth' }))
    await user.click(screen.getByRole('combobox', { name: 'Auth type' }))
    await user.click(await screen.findByRole('option', { name: 'Bearer token' }))
    const token = screen.getByLabelText('Token')
    expect(token).toHaveAttribute('type', 'password')
    await user.type(token, 'tok-abc')
    expect(store.getState().draft.auth).toEqual({ type: 'bearer', token: 'tok-abc' })
    await user.click(screen.getByRole('button', { name: 'Show Token' }))
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Token')).toHaveValue('tok-abc')
  })

  it('the visible credential captions label and focus their fields', async () => {
    const user = userEvent.setup()
    const { store } = setup(<RequestPane />)
    act(() => store.getState().updateDraft({ auth: { type: 'bearer', token: '' } }))
    await user.click(screen.getByRole('tab', { name: 'Auth' }))
    await user.click(screen.getByText('Token', { selector: 'label' }))
    expect(screen.getByLabelText('Token')).toHaveFocus()
    act(() => store.getState().updateDraft({ auth: { type: 'basic', username: '', password: '' } }))
    await user.click(screen.getByText('Password', { selector: 'label' }))
    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('masks auth credentials again when the draft switches', async () => {
    const user = userEvent.setup()
    const { store } = setup(<RequestPane />)
    act(() => store.getState().updateDraft({ auth: { type: 'bearer', token: 't1' } }))
    await user.click(screen.getByRole('tab', { name: 'Auth' }))
    await user.click(screen.getByRole('button', { name: 'Show Token' }))
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'text')
    act(() =>
      store.setState((s) => ({
        draft: { ...s.draft, id: 'other-draft', auth: { type: 'bearer', token: 't2' } }
      }))
    )
    expect(screen.getByLabelText('Token')).toHaveValue('t2')
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password')
  })

  it('switches Send to Cancel while in flight and wires both buttons', async () => {
    const user = userEvent.setup()
    const { store, api } = setup(<RequestPane />)
    api['request:send'].mockImplementation(() => new Promise(() => undefined))
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(api['request:send']).toHaveBeenCalledTimes(1)
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    await user.click(cancel)
    expect(api['request:cancel']).toHaveBeenCalledWith({
      requestId: store.getState().inFlight?.requestId
    })
  })

  it('keeps per-mode body data when switching modes', async () => {
    const user = userEvent.setup()
    const { container, store } = setup(<RequestPane />)
    await user.click(screen.getByRole('tab', { name: 'Body' }))
    await user.click(screen.getByRole('radio', { name: 'Raw' }))
    expect(store.getState().draft.body).toEqual({
      mode: 'raw',
      contentType: 'application/json',
      text: ''
    })
    setDoc(viewOf(container, 'Body'), '{"a":1}')
    await user.click(screen.getByRole('radio', { name: 'URL-encoded' }))
    await user.click(screen.getByRole('radio', { name: 'Raw' }))
    expect(store.getState().draft.body).toMatchObject({ mode: 'raw', text: '{"a":1}' })
    expect(viewOf(container, 'Body').state.doc.toString()).toBe('{"a":1}')
  })

  it('picks a file for a form-data file row', async () => {
    const user = userEvent.setup()
    const pick = vi.fn(async () => '/tmp/a.png')
    ;(window as unknown as { api: unknown }).api = { 'dialog:pick-file': pick }
    const { store } = setup(<RequestPane />)
    await user.click(screen.getByRole('tab', { name: 'Body' }))
    await user.click(screen.getByRole('radio', { name: 'Form data' }))
    await user.type(screen.getByLabelText('Key 1'), 'f')
    const group = screen.getByRole('group', { name: 'Row 1 type' })
    await user.click(within(group).getByRole('button', { name: 'File' }))
    await user.click(screen.getByRole('button', { name: 'Choose file…' }))
    await act(async () => undefined)
    expect(store.getState().draft.body).toEqual({
      mode: 'form-data',
      fields: [{ kind: 'file', key: 'f', filePath: '/tmp/a.png', enabled: true }]
    })
    expect(screen.getByText('/tmp/a.png')).toBeInTheDocument()
  })

  it('highlights a variable of the active collection as resolved', async () => {
    const col = {
      ...newCollection('C'),
      variables: [{ key: 'base', value: 'http://h', enabled: true }]
    }
    const { container, store } = setup(<RequestPane />)
    setDoc(viewOf(container, 'Request URL'), '{{base}}/x')
    expect(container.querySelector('.var-unresolved')?.textContent).toBe('{{base}}')
    act(() => {
      store.setState({ collections: [col], active: { collectionId: col.id, requestId: 'r' } })
    })
    expect(container.querySelector('.var-resolved')?.textContent).toBe('{{base}}')
    expect(container.querySelector('.var-unresolved')).toBeNull()
  })

  describe('environment scope', () => {
    const env = {
      ...newEnvironment('Dev'),
      variables: [{ key: 'base', value: 'http://env', enabled: true }]
    }
    const col = {
      ...newCollection('C'),
      variables: [{ key: 'base', value: 'http://col', enabled: true }]
    }

    it('resolves a variable defined only in the active environment', () => {
      const { container, store } = setup(<RequestPane />)
      setDoc(viewOf(container, 'Request URL'), '{{base}}/x')
      act(() => {
        store.setState({ environments: [env], activeEnvironmentId: env.id })
      })
      expect(container.querySelector('.var-resolved')?.textContent).toBe('{{base}}')
      expect(container.querySelector('.var-unresolved')).toBeNull()
    })

    it('shows the environment value when the collection also defines it', () => {
      const { container, store } = setup(<RequestPane />)
      setDoc(viewOf(container, 'Request URL'), '{{base}}/x')
      act(() => {
        store.setState({
          environments: [env],
          activeEnvironmentId: env.id,
          collections: [col],
          active: { collectionId: col.id, requestId: 'r' }
        })
      })
      expect(container.querySelector('.var-resolved')?.textContent).toBe('{{base}}')
      expect(tooltipTextFor('base', selectScope(store.getState()))).toBe('http://env')
    })

    it('hovering a secret variable shows a mask, never the value', () => {
      const secretEnv = {
        ...env,
        variables: [{ key: 'base', value: 'http://secret-env', enabled: true, secret: true }]
      }
      const { container, store } = setup(<RequestPane />)
      setDoc(viewOf(container, 'Request URL'), '{{base}}/x')
      act(() => {
        store.setState({
          environments: [secretEnv],
          activeEnvironmentId: secretEnv.id,
          collections: [col],
          active: { collectionId: col.id, requestId: 'r' }
        })
      })
      const text = tooltipTextFor('base', selectScope(store.getState()))
      expect(text).toBe('•••• (secret)')
      expect(text).not.toContain('secret-env')
      expect(text).not.toContain('http://col')
      expect(container.innerHTML).not.toContain('secret-env')
    })

    it('a secret in a lower-precedence scope does not mask the value that resolves', () => {
      const secretCol = {
        ...col,
        variables: [{ key: 'base', value: 'http://secret-col', enabled: true, secret: true }]
      }
      const { store } = setup(<RequestPane />)
      act(() => {
        store.setState({
          environments: [env],
          activeEnvironmentId: env.id,
          collections: [secretCol],
          active: { collectionId: secretCol.id, requestId: 'r' }
        })
      })
      expect(tooltipTextFor('base', selectScope(store.getState()))).toBe('http://env')
      act(() => {
        store.setState({ activeEnvironmentId: null })
      })
      expect(tooltipTextFor('base', selectScope(store.getState()))).toBe('•••• (secret)')
    })

    it('marks an environment-only variable unresolved after switching to No environment', () => {
      const { container, store } = setup(<RequestPane />)
      setDoc(viewOf(container, 'Request URL'), '{{base}}/x')
      act(() => {
        store.setState({ environments: [env], activeEnvironmentId: env.id })
      })
      expect(container.querySelector('.var-resolved')).not.toBeNull()
      act(() => {
        store.setState({ activeEnvironmentId: null })
      })
      expect(container.querySelector('.var-unresolved')?.textContent).toBe('{{base}}')
      expect(container.querySelector('.var-resolved')).toBeNull()
    })
  })

  it('a curl paste that fails to parse leaves the URL alone and raises a danger notice', () => {
    const { container, store } = setup(<RequestPane />)
    setDoc(viewOf(container, 'Request URL'), 'http://old')
    const content = container.querySelector('[data-url-input]') as HTMLElement
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'clipboardData', {
      value: { getData: (t: string) => (t === 'text/plain' ? "curl 'https://x" : '') }
    })
    act(() => {
      content.dispatchEvent(ev)
    })
    expect(store.getState().draft.url).toBe('http://old')
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('http://old')
    expect(store.getState().notices.map((n) => n.tone)).toEqual(['danger'])
  })

  it('a curl paste in the URL bar replaces the draft method, url and body', () => {
    const { container, store } = setup(<RequestPane />)
    const content = container.querySelector('[data-url-input]') as HTMLElement
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'clipboardData', {
      value: { getData: (t: string) => (t === 'text/plain' ? 'curl -X POST https://x -d a=1' : '') }
    })
    act(() => {
      content.dispatchEvent(ev)
    })
    const { draft } = store.getState()
    expect(draft.method).toBe('POST')
    expect(draft.url).toBe('https://x')
    expect(draft.body).toEqual({
      mode: 'urlencoded',
      fields: [{ key: 'a', value: '1', enabled: true }]
    })
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('https://x')
  })

  it('uses one stable Send button that becomes Cancel in flight, keeping focus and width', async () => {
    const user = userEvent.setup()
    const { api } = setup(<RequestPane />)
    api['request:send'].mockImplementation(() => new Promise(() => undefined))
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send.className).toContain('request-pane__send')
    send.focus()
    await user.keyboard('{Enter}')
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    expect(cancel).toBe(send)
    expect(cancel).toHaveFocus()
    expect(cancel.className).toContain('moss-button--danger')
    expect(cancel.className).toContain('request-pane__send')
  })

  it('ignores key repeat on the Send/Cancel button so holding Enter cannot cancel', async () => {
    const user = userEvent.setup()
    const { api } = setup(<RequestPane />)
    api['request:send'].mockImplementation(() => new Promise(() => undefined))
    screen.getByRole('button', { name: 'Send' }).focus()
    await user.keyboard('{Enter>3}')
    await screen.findByRole('button', { name: 'Cancel' })
    expect(api['request:send']).toHaveBeenCalledTimes(1)
    expect(api['request:cancel']).not.toHaveBeenCalled()
    await user.keyboard('{/Enter}')
  })
})
