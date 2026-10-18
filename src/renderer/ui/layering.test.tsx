import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'
import { Menu } from './Menu'
import { staticTokens } from './tokens'

const css = (name: string): string => readFileSync(resolve(__dirname, name), 'utf8')

describe('layering', () => {
  it('defines dialog and popover z tokens with popovers above dialogs', () => {
    expect(Number(staticTokens['z-popover'])).toBeGreaterThan(Number(staticTokens['z-dialog']) + 1)
  })

  it('uses the layer tokens in CSS', () => {
    expect(css('Dialog.css')).toContain('z-index: var(--moss-z-dialog)')
    expect(css('Dialog.css')).toContain('z-index: calc(var(--moss-z-dialog) + 1)')
    expect(css('Menu.css')).toContain('z-index: var(--moss-z-popover)')
    expect(css('Select.css')).toContain('z-index: var(--moss-z-popover)')
    expect(css('Dialog.css')).not.toMatch(/z-index:\s*\d/)
    expect(css('Menu.css')).not.toMatch(/z-index:\s*\d/)
    expect(css('Select.css')).not.toMatch(/z-index:\s*\d/)
  })

  it('renders a Menu opened inside a Dialog as a body-level portal', async () => {
    render(
      <Dialog open onOpenChange={() => {}} title="T">
        <Menu
          trigger={<button>Open</button>}
          items={[{ label: 'Go', onSelect: () => {} }]}
          aria-label="A"
        />
      </Dialog>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('moss-menu')
    // The open menu makes outside content aria-hidden, hence `hidden: true`.
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog).toHaveClass('moss-dialog')
    expect(dialog).not.toContainElement(menu)
  })
})
