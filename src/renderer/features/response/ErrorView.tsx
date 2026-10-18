import type { RequestError } from '../../../shared/types'
import { Badge } from '../../ui'

export function ErrorView({ error }: { error: RequestError }): React.JSX.Element {
  return (
    <div className="response-error" data-response-error>
      <Badge tone="danger">{error.kind}</Badge>
      <h2 className="response-error__message">{error.message}</h2>
      {error.detail ? (
        <details className="response-error__detail">
          <summary>Details</summary>
          <pre>{error.detail}</pre>
        </details>
      ) : null}
    </div>
  )
}
