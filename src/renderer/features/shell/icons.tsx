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

/** Two sliders on a track: values that switch between sets. */
export function EnvironmentsIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M2.5 5h11M2.5 11h11" />
      <circle cx="10" cy="5" r="1.75" />
      <circle cx="6" cy="11" r="1.75" />
    </svg>
  )
}

/** A clock face: what was sent, and when. */
export function HistoryIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4.75V8l2.25 1.5" />
    </svg>
  )
}

export function TrashIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" />
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
