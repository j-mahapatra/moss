import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('has a dialog role named by its title while open', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="Discard changes?" description="Unsaved work">
        <p>Body</p>
      </Dialog>
    )
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(screen.getByText('Unsaved work')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="Hidden">
        <p>Body</p>
      </Dialog>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders the footer', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="T" footer={<button>Confirm</button>}>
        <p>Body</p>
      </Dialog>
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('calls onOpenChange(false) on Escape', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange} title="T">
        <p>Body</p>
      </Dialog>
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('traps focus inside the dialog', async () => {
    render(
      <>
        <button>Outside</button>
        <Dialog open onOpenChange={() => {}} title="T" footer={<button>Inside</button>}>
          <p>Body</p>
        </Dialog>
      </>
    )
    for (let i = 0; i < 4; i++) await userEvent.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })
})
