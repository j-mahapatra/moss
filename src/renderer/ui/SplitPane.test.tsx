import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SplitPane } from './SplitPane'

function renderPane(
  ratio: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): { onRatioChange: ReturnType<typeof vi.fn>; separator: HTMLElement } {
  const onRatioChange = vi.fn()
  render(
    <SplitPane orientation={orientation} ratio={ratio} onRatioChange={onRatioChange}>
      <div>Request</div>
      <div>Response</div>
    </SplitPane>
  )
  return { onRatioChange, separator: screen.getByRole('separator') }
}

describe('SplitPane', () => {
  it('renders both panes and a focusable separator', () => {
    const { separator } = renderPane(0.5)
    expect(screen.getByText('Request')).toBeInTheDocument()
    expect(screen.getByText('Response')).toBeInTheDocument()
    expect(separator).toHaveAttribute('tabindex', '0')
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    expect(separator).toHaveAttribute('aria-valuemin', '20')
    expect(separator).toHaveAttribute('aria-valuemax', '80')
  })

  it('side-by-side panes get a vertical separator, stacked panes a horizontal one', () => {
    const { separator } = renderPane(0.5, 'horizontal')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('stacked panes get a horizontal separator', () => {
    const { separator } = renderPane(0.5, 'vertical')
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('ArrowRight moves the ratio by +0.02', async () => {
    const { onRatioChange, separator } = renderPane(0.5)
    separator.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onRatioChange).toHaveBeenCalledTimes(1)
    expect(onRatioChange.mock.calls[0]![0]).toBeCloseTo(0.52, 10)
  })

  it('ArrowRight clamps at 0.8', async () => {
    const { onRatioChange, separator } = renderPane(0.79)
    separator.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onRatioChange.mock.calls[0]![0]).toBeCloseTo(0.8, 10)
  })

  it('ArrowLeft moves by -0.02 and clamps at 0.2', async () => {
    const { onRatioChange, separator } = renderPane(0.21)
    separator.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(onRatioChange.mock.calls[0]![0]).toBeCloseTo(0.2, 10)
  })

  it('vertical orientation uses Up/Down and ignores Left/Right', async () => {
    const { onRatioChange, separator } = renderPane(0.5, 'vertical')
    separator.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}')
    expect(onRatioChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{ArrowDown}')
    expect(onRatioChange.mock.calls[0]![0]).toBeCloseTo(0.52, 10)
    await userEvent.keyboard('{ArrowUp}')
    expect(onRatioChange.mock.calls[1]![0]).toBeCloseTo(0.48, 10)
  })

  it('horizontal orientation ignores Up/Down', async () => {
    const { onRatioChange, separator } = renderPane(0.5)
    separator.focus()
    await userEvent.keyboard('{ArrowUp}{ArrowDown}')
    expect(onRatioChange).not.toHaveBeenCalled()
  })

  it('pointer drag sets the ratio from the pointer position, clamped', () => {
    const { onRatioChange, separator } = renderPane(0.5)
    const container = separator.parentElement!
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 1000,
      height: 600,
      right: 1100,
      bottom: 600,
      x: 100,
      y: 0,
      toJSON: () => ({})
    })
    fireEvent.pointerDown(separator, { clientX: 600, button: 0 })
    fireEvent.pointerMove(window, { clientX: 400 })
    expect(onRatioChange).toHaveBeenLastCalledWith(0.3)
    fireEvent.pointerMove(window, { clientX: 1090 })
    expect(onRatioChange).toHaveBeenLastCalledWith(0.8)
    fireEvent.pointerMove(window, { clientX: 0 })
    expect(onRatioChange).toHaveBeenLastCalledWith(0.2)
    fireEvent.pointerUp(window)
    onRatioChange.mockClear()
    fireEvent.pointerMove(window, { clientX: 500 })
    expect(onRatioChange).not.toHaveBeenCalled()
  })
})
