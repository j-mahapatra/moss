/** Inline icons, drawn for Moss; they inherit color via currentColor. */
const base = {
  viewBox: '0 0 16 16',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

/** Three stacked layers. */
export function CollectionsIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M8 2.5l5.5 2.5L8 7.5 2.5 5z" />
      <path d="M2.5 8L8 10.5 13.5 8" />
      <path d="M2.5 11L8 13.5 13.5 11" />
    </svg>
  )
}

export function PlusIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

export function MoreIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <circle cx="3.5" cy="8" r="0.6" />
      <circle cx="8" cy="8" r="0.6" />
      <circle cx="12.5" cy="8" r="0.6" />
    </svg>
  )
}

export function ChevronIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  )
}
