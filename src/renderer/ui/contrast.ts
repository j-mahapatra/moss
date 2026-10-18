/** Parses `#rgb` or `#rrggbb` into 0–255 channels. */
function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace(/^#/, '')
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex color: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio, from 1 to 21. Order of arguments does not matter. */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const a = luminance(fgHex)
  const b = luminance(bgHex)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
