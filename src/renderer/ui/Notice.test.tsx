import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Notice } from './Notice'

describe('Notice', () => {
  it('uses the status role for warnings', () => {
    render(
      <Notice tone="warning" onDismiss={() => {}}>
        Careful
      </Notice>
    )
    expect(screen.getByRole('status')).toHaveTextContent('Careful')
  })

  it('uses the alert role for danger', () => {
    render(
      <Notice tone="danger" onDismiss={() => {}}>
        Broke
      </Notice>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Broke')
  })

  it('calls onDismiss from the Dismiss button', async () => {
    const onDismiss = vi.fn()
    render(
      <Notice tone="warning" onDismiss={onDismiss}>
        x
      </Notice>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
