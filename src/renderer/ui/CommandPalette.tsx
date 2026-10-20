import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { fuzzyMatch, rankItems, type PaletteItem } from '../../shared/fuzzy'
import { Badge } from './Badge'
import { Dialog } from './Dialog'
import { keepOpenWhileComposing } from './ime'
import './CommandPalette.css'

export type CommandPaletteProps = {
  open: boolean
  onOpenChange(open: boolean): void
  items: PaletteItem[]
  placeholder: string
  /** Runs as the palette closes, before focus returns; `preventDefault` to place it yourself. */
  onCloseAutoFocus?(event: Event): void
}

/** Searchable list of items in a dialog: type to filter, arrows to move, Enter to run. */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder,
  onCloseAutoFocus
}: CommandPaletteProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      titleHidden
      className="moss-palette"
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={keepOpenWhileComposing}
    >
      {/* Mounted only while open, so each opening starts from an empty query. */}
      <PaletteBody items={items} placeholder={placeholder} onClose={() => onOpenChange(false)} />
    </Dialog>
  )
}

type Section = { group: string | null; items: PaletteItem[] }

function sectionsFor(query: string, items: PaletteItem[]): Section[] {
  if (query !== '') return [{ group: null, items: rankItems(query, items) }]
  const byGroup = new Map<string, PaletteItem[]>()
  for (const item of items) {
    const list = byGroup.get(item.group)
    if (list === undefined) byGroup.set(item.group, [item])
    else list.push(item)
  }
  return Array.from(byGroup, ([group, list]) => ({ group, items: list }))
}

function PaletteBody({
  items,
  placeholder,
  onClose
}: {
  items: PaletteItem[]
  placeholder: string
  onClose(): void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const optionId = (index: number): string => `${baseId}-option-${index}`
  const listRef = useRef<HTMLDivElement>(null)
  // Set by an arrow key, so a hover or a new query never scrolls the list under the pointer.
  const scrollToActive = useRef(false)

  const sections = useMemo(() => sectionsFor(query, items), [query, items])
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1)

  useEffect(() => {
    if (!scrollToActive.current || activeIndex < 0) return
    scrollToActive.current = false
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  function runItem(item: PaletteItem): void {
    onClose()
    item.run()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Keys that pick or commit an IME candidate belong to the composition, not the palette.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (flat.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = (activeIndex + step + flat.length) % flat.length
      scrollToActive.current = next !== activeIndex
      setActive(next)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      // A held Enter must not run a second item after the first one closes the palette.
      if (event.repeat) return
      const item = flat[activeIndex]
      if (item !== undefined) runItem(item)
    }
  }

  let index = 0
  const renderOption = (item: PaletteItem): ReactNode => {
    const i = index++
    const selected = i === activeIndex
    // Ranked rows lose their heading, so the group joins the detail line.
    const details = (query === '' ? [item.detail] : [item.group, item.detail]).filter(
      (d): d is string => d !== undefined && d !== ''
    )
    return (
      <div
        key={item.id}
        id={optionId(i)}
        role="option"
        aria-selected={selected}
        data-index={i}
        data-label={item.label}
        className="moss-palette__option"
        onMouseMove={() => {
          if (!selected) setActive(i)
        }}
        // Keep focus in the input so typing continues after a hover or click.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runItem(item)}
      >
        {item.badge !== undefined && <Badge tone="neutral">{item.badge}</Badge>}
        <span className="moss-palette__text">
          <span className="moss-palette__label">{highlight(query, item.label)}</span>
          {details.length > 0 && (
            <span className="moss-palette__detail">
              {details.map((d, k) => (
                <span key={k}>{d}</span>
              ))}
            </span>
          )}
        </span>
        {item.hint !== undefined && <kbd className="moss-palette__hint">{item.hint}</kbd>}
      </div>
    )
  }

  return (
    <div className="moss-palette__body">
      <input
        className="moss-palette__input"
        role="combobox"
        aria-label="Search"
        aria-autocomplete="list"
        aria-expanded={flat.length > 0}
        aria-controls={listboxId}
        {...(activeIndex >= 0 ? { 'aria-activedescendant': optionId(activeIndex) } : {})}
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          if (listRef.current) listRef.current.scrollTop = 0
        }}
        onKeyDown={onKeyDown}
      />
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Results"
        className="moss-palette__list"
      >
        {sections.map((section, s) =>
          section.group === null ? (
            section.items.map(renderOption)
          ) : (
            <div
              key={section.group}
              role="group"
              aria-labelledby={`${baseId}-group-${s}`}
              className="moss-palette__group"
            >
              <div
                id={`${baseId}-group-${s}`}
                role="presentation"
                className="moss-palette__heading"
              >
                {section.group}
              </div>
              {section.items.map(renderOption)}
            </div>
          )
        )}
      </div>
      {flat.length === 0 && <p className="moss-palette__empty">No matches</p>}
    </div>
  )
}

function highlight(query: string, label: string): ReactNode {
  if (query === '') return label
  const match = fuzzyMatch(query, label)
  if (match === null || match.ranges.length === 0) return label
  const parts: ReactNode[] = []
  let at = 0
  for (const [start, end] of match.ranges) {
    if (start > at) parts.push(label.slice(at, start))
    parts.push(<mark key={start}>{label.slice(start, end)}</mark>)
    at = end
  }
  if (at < label.length) parts.push(label.slice(at))
  return parts
}
