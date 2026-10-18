import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
import { cx } from './cx'
import './SplitPane.css'

export const SPLIT_MIN = 0.2
export const SPLIT_MAX = 0.8
const STEP = 0.02

export type SplitPaneProps = {
  /** `'horizontal'` places the panes side by side; `'vertical'` stacks them. */
  orientation: 'horizontal' | 'vertical'
  ratio: number
  onRatioChange(r: number): void
  children: [ReactNode, ReactNode]
}

function clamp(r: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(r * 1000) / 1000))
}

export function SplitPane({
  orientation,
  ratio,
  onRatioChange,
  children
}: SplitPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const stopDrag = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState(false)
  const r = clamp(ratio)
  const sideBySide = orientation === 'horizontal'

  useEffect(() => () => stopDrag.current?.(), [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const [dec, inc] = sideBySide ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    if (e.key !== dec && e.key !== inc) return
    e.preventDefault()
    onRatioChange(clamp(r + (e.key === inc ? STEP : -STEP)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const move = (ev: globalThis.PointerEvent): void => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const size = sideBySide ? rect.width : rect.height
      if (size <= 0) return
      const offset = sideBySide ? ev.clientX - rect.left : ev.clientY - rect.top
      onRatioChange(clamp(offset / size))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      stopDrag.current = null
      setDragging(false)
    }
    stopDrag.current?.()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    stopDrag.current = up
    setDragging(true)
  }

  return (
    <div
      ref={containerRef}
      className={cx('moss-split', `moss-split--${orientation}`, dragging && 'moss-split--dragging')}
    >
      <div className="moss-split__pane" style={{ flexGrow: r }}>
        {children[0]}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize panes"
        aria-orientation={sideBySide ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(r * 100)}
        aria-valuemin={SPLIT_MIN * 100}
        aria-valuemax={SPLIT_MAX * 100}
        className="moss-split__separator"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
      />
      <div className="moss-split__pane" style={{ flexGrow: 1 - r }}>
        {children[1]}
      </div>
    </div>
  )
}
