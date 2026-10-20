import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { PaletteItem } from '../../shared/fuzzy'
import { CommandPalette } from './CommandPalette'

function makeItems(): (PaletteItem & { run: Mock<() => void> })[] {
  return [
    { id: 'r1', label: 'GET user', detail: 'Users', group: 'Requests', run: vi.fn<() => void>() },
    {
      id: 'r2',
      label: 'debug user',
      detail: 'Tools/Debug',
      group: 'Requests',
      run: vi.fn<() => void>()
    },
    { id: 'e1', label: 'Staging', group: 'Environments', badge: 'env', run: vi.fn<() => void>() },
    { id: 'c1', label: 'New request', group: 'Commands', hint: 'Ctrl+N', run: vi.fn<() => void>() }
  ]
}

function Harness({
  items,
  onOpenChange
}: {
  items: PaletteItem[]
  onOpenChange?: (open: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open palette</button>
      <CommandPalette
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next)
          setOpen(next)
        }}
        items={items}
        placeholder="Search requests and commands"
      />
    </>
  )
}

function optionLabels(): string[] {
  return screen.getAllByRole('option').map((o) => o.getAttribute('data-label') ?? '')
}

function activeOption(): HTMLElement {
  const input = screen.getByRole('combobox')
  const id = input.getAttribute('aria-activedescendant')
  expect(id).toBeTruthy()
  const el = document.getElementById(id ?? '')
  expect(el).not.toBeNull()
  return el as HTMLElement
}

describe('CommandPalette', () => {
  it('is a dialog named Command palette with combobox and listbox wiring', () => {
    render(<Harness items={makeItems()} />)
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const input = within(dialog).getByRole('combobox')
    const listbox = within(dialog).getByRole('listbox')
    expect(input).toHaveAttribute('placeholder', 'Search requests and commands')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', listbox.id)
    expect(input).toHaveFocus()
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(4)
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('groups items under their headings in the given order when the query is empty', () => {
    render(<Harness items={makeItems()} />)
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(3)
    expect(groups[0]).toBe(screen.getByRole('group', { name: 'Requests' }))
    expect(groups[1]).toBe(screen.getByRole('group', { name: 'Environments' }))
    expect(groups[2]).toBe(screen.getByRole('group', { name: 'Commands' }))
    expect(within(groups[0] as HTMLElement).getAllByRole('option')).toHaveLength(2)
    expect(optionLabels()).toEqual(['GET user', 'debug user', 'Staging', 'New request'])
    expect(screen.getByText('Ctrl+N')).toBeInTheDocument()
    expect(screen.getByText('env')).toBeInTheDocument()
  })

  it('shows a flat ranked list with group detail and marked ranges when typing', async () => {
    render(<Harness items={makeItems()} />)
    await userEvent.keyboard('gu')
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(optionLabels()).toEqual(['GET user', 'debug user'])
    const first = screen.getAllByRole('option')[0] as HTMLElement
    expect(within(first).getByText('Requests')).toBeInTheDocument()
    expect(Array.from(first.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['G', 'u'])
    expect(first).toHaveAttribute('aria-selected', 'true')
  })

  it('moves with arrow keys and wraps around', async () => {
    render(<Harness items={makeItems()} />)
    expect(activeOption()).toHaveAttribute('data-label', 'GET user')
    await userEvent.keyboard('{ArrowUp}')
    expect(activeOption()).toHaveAttribute('data-label', 'New request')
    await userEvent.keyboard('{ArrowDown}')
    expect(activeOption()).toHaveAttribute('data-label', 'GET user')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(activeOption()).toHaveAttribute('data-label', 'Staging')
    expect(activeOption()).toHaveAttribute('aria-selected', 'true')
  })

  it('runs the active item on Enter and closes', async () => {
    const items = makeItems()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<Harness items={items} onOpenChange={onOpenChange} />)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(items[1]?.run).toHaveBeenCalledTimes(1)
    expect(items[0]?.run).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape without running anything', async () => {
    const items = makeItems()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<Harness items={items} onOpenChange={onOpenChange} />)
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const i of items) expect(i.run).not.toHaveBeenCalled()
  })

  it('shows No matches and ignores Enter when nothing matches', async () => {
    const items = makeItems()
    render(<Harness items={items} />)
    await userEvent.keyboard('zzzz')
    expect(screen.getByText('No matches')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    await userEvent.keyboard('{Enter}')
    for (const i of items) expect(i.run).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sets the active item on hover and runs it on click', async () => {
    const items = makeItems()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<Harness items={items} onOpenChange={onOpenChange} />)
    const staging = screen.getAllByRole('option')[2] as HTMLElement
    await userEvent.hover(staging)
    expect(activeOption()).toBe(staging)
    await userEvent.click(staging)
    expect(items[2]?.run).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('scrolls the active row into view only on keyboard moves, and to the top on a new query', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      const user = userEvent.setup()
      render(<Harness items={makeItems()} />)
      expect(scrollIntoView).not.toHaveBeenCalled()
      fireEvent.mouseMove(screen.getAllByRole('option')[2] as HTMLElement)
      expect(activeOption()).toHaveAttribute('data-index', '2')
      expect(scrollIntoView).not.toHaveBeenCalled()
      await user.keyboard('{ArrowDown}')
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      expect(scrollIntoView.mock.contexts[0]).toBe(activeOption())
      const list = screen.getByRole('listbox')
      list.scrollTop = 120
      await user.keyboard('u')
      expect(list.scrollTop).toBe(0)
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('resets the query and active row when reopened', async () => {
    render(<Harness items={makeItems()} />)
    // 'user' scores the same in both requests, so the label tie-break puts 'debug user' first.
    await userEvent.keyboard('user{ArrowDown}')
    expect(optionLabels()).toEqual(['debug user', 'GET user'])
    expect(activeOption()).toHaveAttribute('data-label', 'GET user')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Open palette' }))
    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(4)
    expect(activeOption()).toBe(screen.getAllByRole('option')[0])
  })

  it('ignores Enter while an IME composition is in progress', () => {
    const items = makeItems()
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<Harness items={items} onOpenChange={onOpenChange} />)
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    for (const i of items) expect(i.run).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('ignores arrow keys while an IME composition is in progress', () => {
    render(<Harness items={makeItems()} />)
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 229 })
    expect(activeOption()).toHaveAttribute('data-label', 'GET user')
  })

  it('does not close on Escape while an IME composition is in progress', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<Harness items={makeItems()} onOpenChange={onOpenChange} />)
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
