import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SecretInput } from './SecretInput'

const SECRET = 'hunter2-value'

function Controlled({ label, initial }: { label: string; initial: string }): React.JSX.Element {
  const [value, setValue] = useState(initial)
  return <SecretInput label={label} value={value} onChange={setValue} />
}

/** Every attribute value in the subtree (the value lives only in the input's `value` property). */
function attributeText(root: HTMLElement): string {
  const out: string[] = []
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of el.attributes) out.push(a.value)
  }
  return out.join('\n')
}

describe('SecretInput', () => {
  it('is masked by default with a Show toggle that is not pressed', () => {
    render(<SecretInput label="Token" value={SECRET} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Token')).toHaveValue(SECRET)
    const toggle = screen.getByRole('button', { name: 'Show Token' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals and hides on toggle', async () => {
    const user = userEvent.setup()
    render(<SecretInput label="Token" value={SECRET} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Show Token' }))
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'Hide Token' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    await user.click(hide)
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password')
  })

  it('reveals only the toggled field', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SecretInput label="A" value="1" onChange={vi.fn()} />
        <SecretInput label="B" value="2" onChange={vi.fn()} />
      </>
    )
    await user.click(screen.getByRole('button', { name: 'Show A' }))
    expect(screen.getByLabelText('A')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('B')).toHaveAttribute('type', 'password')
  })

  it('stays revealed while typing and reports the new value', async () => {
    const user = userEvent.setup()
    render(<Controlled label="Token" initial="" />)
    await user.click(screen.getByRole('button', { name: 'Show Token' }))
    await user.type(screen.getByLabelText('Token'), 'abc')
    expect(screen.getByLabelText('Token')).toHaveValue('abc')
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'text')
  })

  it('follows value changes from outside', () => {
    const { rerender } = render(<SecretInput label="Token" value="a" onChange={vi.fn()} />)
    rerender(<SecretInput label="Token" value="b" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Token')).toHaveValue('b')
  })

  it('masks again when the label changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SecretInput label="Value 1" value="x" onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Show Value 1' }))
    rerender(<SecretInput label="Value 2" value="x" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Value 2')).toHaveAttribute('type', 'password')
  })

  it('never puts the value in an attribute, masked or revealed', async () => {
    const user = userEvent.setup()
    const { container } = render(<SecretInput label="Token" value={SECRET} onChange={vi.fn()} />)
    expect(attributeText(container)).not.toContain(SECRET)
    expect(container.innerHTML).not.toContain(SECRET)
    await user.click(screen.getByRole('button', { name: 'Show Token' }))
    expect(attributeText(container)).not.toContain(SECRET)
    expect(container.innerHTML).not.toContain(SECRET)
  })
})
