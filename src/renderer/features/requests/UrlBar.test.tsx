import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UrlBar } from './UrlBar'
import { setDoc, viewOf } from './test-utils'

function paste(container: HTMLElement, text: string): Event {
  const content = container.querySelector('.cm-content') as HTMLElement
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') }
  })
  act(() => {
    content.dispatchEvent(ev)
  })
  return ev
}

const noop = (): void => undefined

describe('UrlBar', () => {
  it('marks {{base}} unresolved for an empty scope', () => {
    const { container } = render(
      <UrlBar value="{{base}}/x" onChange={noop} onSubmit={noop} scope={new Map()} />
    )
    expect(container.querySelector('.var-unresolved')?.textContent).toBe('{{base}}')
    expect(container.querySelector('.var-resolved')).toBeNull()
  })

  it('marks {{base}} resolved when the scope defines it, and reacts to scope changes', () => {
    const { container, rerender } = render(
      <UrlBar
        value="{{base}}/x"
        onChange={noop}
        onSubmit={noop}
        scope={new Map([['base', 'http://h']])}
      />
    )
    expect(container.querySelector('.var-resolved')?.textContent).toBe('{{base}}')
    expect(container.querySelector('.var-unresolved')).toBeNull()
    rerender(<UrlBar value="{{base}}/x" onChange={noop} onSubmit={noop} scope={new Map()} />)
    expect(container.querySelector('.var-unresolved')?.textContent).toBe('{{base}}')
  })

  it('puts data-url-input on the focusable content element', () => {
    const { container } = render(
      <UrlBar value="" onChange={noop} onSubmit={noop} scope={new Map()} />
    )
    const el = container.querySelector('[data-url-input]')
    expect(el).toHaveClass('cm-content')
    expect(el).toHaveAttribute('contenteditable', 'true')
  })

  it('emits user edits but not external value pushes, and keeps the cursor', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(
      <UrlBar value="a" onChange={onChange} onSubmit={noop} scope={new Map()} />
    )
    const view = viewOf(container, 'Request URL')
    setDoc(view, 'ab')
    expect(onChange).toHaveBeenCalledWith('ab')
    act(() => view.dispatch({ selection: { anchor: 1 } }))
    onChange.mockClear()
    rerender(<UrlBar value="ab" onChange={onChange} onSubmit={noop} scope={new Map()} />)
    expect(view.state.selection.main.head).toBe(1)
    rerender(<UrlBar value="zzz" onChange={onChange} onSubmit={noop} scope={new Map()} />)
    expect(view.state.doc.toString()).toBe('zzz')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('strips newlines from pasted text', () => {
    const onChange = vi.fn()
    const { container } = render(
      <UrlBar value="" onChange={onChange} onSubmit={noop} scope={new Map()} />
    )
    const view = viewOf(container, 'Request URL')
    setDoc(view, 'http://a\n.io\r\n/p')
    expect(view.state.doc.toString()).toBe('http://a.io/p')
    expect(onChange).toHaveBeenLastCalledWith('http://a.io/p')
  })

  it('submits on Enter without inserting a newline', () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <UrlBar value="x" onChange={noop} onSubmit={onSubmit} scope={new Map()} />
    )
    const content = container.querySelector('.cm-content') as HTMLElement
    act(() => {
      content.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })
      )
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('x')
  })

  it('hands a pasted curl command to onPasteCurl and leaves the doc unchanged', () => {
    const onPasteCurl = vi.fn(() => true)
    const onChange = vi.fn()
    const { container } = render(
      <UrlBar
        value="http://old"
        onChange={onChange}
        onSubmit={noop}
        onPasteCurl={onPasteCurl}
        scope={new Map()}
      />
    )
    const ev = paste(container, 'curl -X POST https://x -d a=1')
    expect(onPasteCurl).toHaveBeenCalledWith('curl -X POST https://x -d a=1')
    expect(ev.defaultPrevented).toBe(true)
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('http://old')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not call onPasteCurl for text that is not a curl command', () => {
    const onPasteCurl = vi.fn(() => true)
    const { container } = render(
      <UrlBar
        value=""
        onChange={noop}
        onSubmit={noop}
        onPasteCurl={onPasteCurl}
        scope={new Map()}
      />
    )
    paste(container, 'https://x/curl')
    expect(onPasteCurl).not.toHaveBeenCalled()
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('https://x/curl')
  })

  it('consumes a curl paste even when the handler rejects it, leaving the doc unchanged', () => {
    const onPasteCurl = vi.fn(() => false)
    const onChange = vi.fn()
    const { container } = render(
      <UrlBar
        value="http://old"
        onChange={onChange}
        onSubmit={noop}
        onPasteCurl={onPasteCurl}
        scope={new Map()}
      />
    )
    const ev = paste(container, "curl 'https://x")
    expect(onPasteCurl).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(true)
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('http://old')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pastes non-curl text as usual, newlines stripped', () => {
    const onPasteCurl = vi.fn(() => true)
    const onChange = vi.fn()
    const { container } = render(
      <UrlBar
        value=""
        onChange={onChange}
        onSubmit={noop}
        onPasteCurl={onPasteCurl}
        scope={new Map()}
      />
    )
    paste(container, 'https://x\n/y')
    expect(onPasteCurl).not.toHaveBeenCalled()
    expect(viewOf(container, 'Request URL').state.doc.toString()).toBe('https://x/y')
    expect(onChange).toHaveBeenLastCalledWith('https://x/y')
  })
})
