/** The message of a thrown value, for notices: an Error's `message`, else the value as text. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
