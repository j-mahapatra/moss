import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Popover } from './Popover'

describe('Popover', () => {
  it('opens from the trigger as a named dialog', async () => {
    render(
      <Popover trigger={<button>Env</button>} aria-label="Environments">
        <p>Content</p>
      </Popover>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Env' }))
    expect(screen.getByRole('dialog', { name: 'Environments' })).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('moves focus in on open; Escape closes and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <Popover trigger={<button>Env</button>} aria-label="Environments">
        <button>Inside</button>
      </Popover>
    )
    const trigger = screen.getByRole('button', { name: 'Env' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Environments' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button>Outside</button>
        <Popover trigger={<button>Env</button>} aria-label="Environments">
          <p>Content</p>
        </Popover>
      </div>
    )
    await user.click(screen.getByRole('button', { name: 'Env' }))
    await user.click(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('works controlled', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    function Host(): React.JSX.Element {
      const [open, setOpen] = useState(false)
      return (
        <Popover
          open={open}
          onOpenChange={(o) => {
            spy(o)
            setOpen(o)
          }}
          trigger={<button>Env</button>}
          aria-label="Environments"
        >
          <p>Content</p>
        </Popover>
      )
    }
    render(<Host />)
    await user.click(screen.getByRole('button', { name: 'Env' }))
    expect(spy).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(spy).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays closed when controlled closed and the parent ignores the request', async () => {
    render(
      <Popover open={false} trigger={<button>Env</button>} aria-label="Environments">
        <p>Content</p>
      </Popover>
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Env' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
