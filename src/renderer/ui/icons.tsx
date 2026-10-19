/** Inline icons owned by the ui layer; they inherit color via currentColor. */
const base = {
  viewBox: '0 0 16 16',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

/** A closed padlock: a value kept secret. */
export function LockIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  )
}

/** An open eye: show the value. */
export function EyeIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="1.75" />
    </svg>
  )
}

/** A struck-through eye: hide the value again. */
export function EyeOffIcon(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="1.75" />
      <path d="M2.5 2.5l11 11" />
    </svg>
  )
}
