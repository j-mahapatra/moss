import { formatBytes, formatDuration } from '../../../shared/format'
import type { HttpResponse } from '../../../shared/types'
import { Badge, type BadgeTone } from '../../ui'

function toneFor(status: number): BadgeTone {
  const family = Math.floor(status / 100)
  return family >= 2 && family <= 5 ? (`${family}xx` as BadgeTone) : 'neutral'
}

function CheckGlyph(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path
        d="M2 5.2 4.2 7.4 8 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StatusBar({ response }: { response: HttpResponse }): React.JSX.Element {
  const tone = toneFor(response.status)
  return (
    <div className="response-status">
      <Badge tone={tone} data-response-status>
        {tone === '2xx' ? <CheckGlyph /> : null}
        {`${response.status} ${response.statusText}`.trim()}
      </Badge>
      <span className="response-status__meta">{formatDuration(response.timings.totalMs)}</span>
      <span className="response-status__meta">{formatBytes(response.size)}</span>
      {response.truncated ? <Badge tone="4xx">Truncated at 50 MB</Badge> : null}
    </div>
  )
}
