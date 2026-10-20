import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Variable } from '../../shared/types'
import { KeyValueDialog } from './KeyValueDialog'

function deferred(): { promise: Promise<boolean>; settle(ok: boolean | Error): void } {
  let settle: (ok: boolean | Error) => void = () => undefined
  const promise = new Promise<boolean>((resolve, reject) => {
    settle = (ok) => (ok instanceof Error ? reject(ok) : resolve(ok))
  })
  return { promise, settle }
}

function mount(onSave: (rows: Variable[]) => Promise<boolean>): { onOpenChange: () => void } {
  const onOpenChange = vi.fn()
  render(
    <KeyValueDialog
      title="Variables"
      open
      rows={[{ key: 'a', value: '1', enabled: true }]}
      onSave={onSave}
      onOpenChange={onOpenChange}
      keyPlaceholder="Variable"
    />
  )
  return { onOpenChange }
}

describe('KeyValueDialog', () => {
  it.each([
    ['resolves false', false],
    ['rejects', new Error('disk full')]
  ] as const)('stays open with Save re-enabled when saving %s', async (_, outcome) => {
    const pending = deferred()
    const { onOpenChange } = mount(() => pending.promise)
    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(save)
    expect(save).toBeDisabled()
    await act(async () => {
      pending.settle(outcome)
      await pending.promise.catch(() => undefined)
    })
    expect(screen.getByRole('dialog', { name: 'Variables' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('closes once saving resolves true', async () => {
    const { onOpenChange } = mount(async () => true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
