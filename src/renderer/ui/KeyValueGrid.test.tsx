import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { KeyValue } from '../../shared/types'
import { KeyValueGrid } from './KeyValueGrid'

function Stateful({
  initial,
  onChange
}: {
  initial: KeyValue[]
  onChange: (rows: KeyValue[]) => void
}): React.JSX.Element {
  const [rows, setRows] = useState(initial)
  return (
    <KeyValueGrid
      rows={rows}
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
})
