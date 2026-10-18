export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  const rounded = Math.round(ms)
  if (rounded < 1000) return `${rounded} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
