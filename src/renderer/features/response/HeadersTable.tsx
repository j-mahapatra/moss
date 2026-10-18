import type { HeaderList } from '../../../shared/types'

export function HeadersTable({ headers }: { headers: HeaderList }): React.JSX.Element {
  return (
    <table className="response-headers">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {headers.map(([name, value], i) => (
          <tr key={i}>
            <td>{name}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
