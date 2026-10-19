import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Variable } from '../../shared/types'
import { KeyValueGrid } from './KeyValueGrid'

function Stateful({
  initial,
  onChange,
  secretColumn
}: {
  initial: Variable[]
  onChange: (rows: Variable[]) => void
  secretColumn?: boolean
}): React.JSX.Element {
  const [rows, setRows] = useState(initial)
  return (
    <KeyValueGrid
      rows={rows}
      secretColumn={secretColumn}
      onChange={(next) => {
        setRows(next)
        onChange(next)
      }}
    />
  )
}

describe('KeyValueGrid', () => {
  it('always renders one trailing empty row without a delete button', () => {
    render(<KeyValueGrid rows={[{ key: 'a', value: '1', enabled: true }]} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Key 2')).toHaveValue('')
    expect(screen.getByLabelText('Value 2')).toHaveValue('')
    expect(screen.getAllByRole('button', { name: 'Remove row' })).toHaveLength(1)
  })

  it('typing a key in the trailing row appends a new enabled row', async () => {
    const onChange = vi.fn()
    render(<KeyValueGrid rows={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Key 1'), 'x')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'x', value: '', enabled: true }])
  })

  it('typing a value in the trailing row also appends a row', async () => {
    const onChange = vi.fn()
    render(<KeyValueGrid rows={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Value 1'), 'v')
    expect(onChange).toHaveBeenLastCalledWith([{ key: '', value: 'v', enabled: true }])
  })

  it('keeps editing the appended row and offers a fresh trailing row', async () => {
    const onChange = vi.fn()
    render(<Stateful initial={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Key 1'), 'Accept')
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'Accept', value: '', enabled: true }])
    expect(screen.getByLabelText('Key 2')).toHaveValue('')
  })

  it('edits an existing value', async () => {
    const onChange = vi.fn()
    render(<KeyValueGrid rows={[{ key: 'a', value: '', enabled: true }]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Value 1'), 'z')
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'a', value: 'z', enabled: true }])
  })

  it('the checkbox toggles enabled', async () => {
    const onChange = vi.fn()
    const rows = [
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: false }
    ]
    render(<KeyValueGrid rows={rows} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Enable row 1'))
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'a', value: '1', enabled: false },
      { key: 'b', value: '2', enabled: false }
    ])
    await userEvent.click(screen.getByLabelText('Enable row 2'))
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true }
    ])
  })

  it('the delete button removes the row', async () => {
    const onChange = vi.fn()
    const rows = [
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true }
    ]
    render(<KeyValueGrid rows={rows} onChange={onChange} />)
    const [first] = screen.getAllByRole('button', { name: 'Remove row' })
    await userEvent.click(first!)
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'b', value: '2', enabled: true }])
  })

  it('uses the given placeholders', () => {
    render(
      <KeyValueGrid rows={[]} onChange={vi.fn()} keyPlaceholder="Header" valuePlaceholder="Value" />
    )
    expect(screen.getByLabelText('Key 1')).toHaveAttribute('placeholder', 'Header')
    expect(screen.getByLabelText('Value 1')).toHaveAttribute('placeholder', 'Value')
  })

  describe('secretColumn', () => {
    const rows: Variable[] = [
      { key: 'token', value: 'tok-123', enabled: true, secret: true },
      { key: '', value: 'plain', enabled: true }
    ]

    it('is off by default: no lock toggles', () => {
      render(<KeyValueGrid rows={rows} onChange={vi.fn()} />)
      expect(screen.queryByRole('button', { name: /^Mark .* secret$/ })).toBeNull()
    })

    it('adds a lock toggle per row, named by key or "row"; the trailing row has none', () => {
      render(<KeyValueGrid rows={rows} onChange={vi.fn()} secretColumn />)
      const toggles = screen.getAllByRole('button', { name: /^Mark .* secret$/ })
      expect(toggles).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Mark token secret' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      expect(screen.getByRole('button', { name: 'Mark row secret' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    it('masks the value of a secret row only', () => {
      render(<KeyValueGrid rows={rows} onChange={vi.fn()} secretColumn />)
      expect(screen.getByLabelText('Value 1')).toHaveAttribute('type', 'password')
      expect(screen.getByLabelText('Value 1')).toHaveValue('tok-123')
      expect(screen.getByLabelText('Value 2')).not.toHaveAttribute('type', 'password')
      expect(screen.getByRole('button', { name: 'Show Value 1' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Show Value 2' })).toBeNull()
    })

    it('toggling marks the row secret and unmarking drops the flag', async () => {
      const onChange = vi.fn()
      render(<Stateful initial={rows} onChange={onChange} secretColumn />)
      await userEvent.click(screen.getByRole('button', { name: 'Mark row secret' }))
      expect(onChange).toHaveBeenLastCalledWith([
        rows[0],
        { key: '', value: 'plain', enabled: true, secret: true }
      ])
      expect(screen.getByLabelText('Value 2')).toHaveAttribute('type', 'password')
      await userEvent.click(screen.getByRole('button', { name: 'Mark token secret' }))
      expect(onChange).toHaveBeenLastCalledWith([
        { key: 'token', value: 'tok-123', enabled: true },
        { key: '', value: 'plain', enabled: true, secret: true }
      ])
    })

    it('editing a secret row keeps the flag and the mask', async () => {
      const onChange = vi.fn()
      render(<Stateful initial={rows} onChange={onChange} secretColumn />)
      await userEvent.type(screen.getByLabelText('Value 1'), '4')
      expect(onChange).toHaveBeenLastCalledWith([
        { key: 'token', value: 'tok-1234', enabled: true, secret: true },
        rows[1]
      ])
      expect(screen.getByLabelText('Value 1')).toHaveAttribute('type', 'password')
    })

    it('reveal is per row, and removing a row masks the rows that move up', async () => {
      const two: Variable[] = [
        { key: 'a', value: 'sa', enabled: true, secret: true },
        { key: 'b', value: 'sb', enabled: true, secret: true }
      ]
      render(<Stateful initial={two} onChange={vi.fn()} secretColumn />)
      await userEvent.click(screen.getByRole('button', { name: 'Show Value 2' }))
      expect(screen.getByLabelText('Value 1')).toHaveAttribute('type', 'password')
      expect(screen.getByLabelText('Value 2')).toHaveAttribute('type', 'text')
      const [first] = screen.getAllByRole('button', { name: 'Remove row' })
      await userEvent.click(first!)
      expect(screen.getByLabelText('Value 1')).toHaveValue('sb')
      expect(screen.getByLabelText('Value 1')).toHaveAttribute('type', 'password')
    })
  })
})
