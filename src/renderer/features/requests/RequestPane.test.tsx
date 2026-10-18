import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { newCollection } from '../../../shared/collection-tree'
import { RequestPane } from './RequestPane'
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
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
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
})
