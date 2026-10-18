import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu, type MenuItem } from './Menu'

function setup(items: MenuItem[], extra: Partial<Parameters<typeof Menu>[0]> = {}): void {
  render(<Menu trigger={<button>Open</button>} items={items} aria-label="Actions" {...extra} />)
}

describe('Menu', () => {
  it('shows items after clicking the trigger', async () => {
    setup([{ label: 'Rename', onSelect: () => {} }])
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
  })

  it('calls onSelect for the chosen item', async () => {
    const onSelect = vi.fn()
    setup([
      { label: 'Rename', onSelect },
      { separator: true },
      { label: 'Other', onSelect: vi.fn() }
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('does not select a disabled item', async () => {
    const onSelect = vi.fn()
    setup([{ label: 'Rename', onSelect, disabled: true }])
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('applies the danger class', async () => {
    setup([{ label: 'Delete', onSelect: () => {}, tone: 'danger' }])
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('moss-menu__item--danger')
  })

  it('supports a controlled open prop', () => {
    setup([{ label: 'Rename', onSelect: () => {} }], { open: true, onOpenChange: () => {} })
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
  })

  it('reports close requests through onOpenChange', async () => {
    const onOpenChange = vi.fn()
    setup([{ label: 'Rename', onSelect: () => {} }], { open: true, onOpenChange })
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
