export type ShellWordsResult = { ok: true; words: string[] } | { ok: false; error: string }

const UNTERMINATED = 'Unterminated quote in command'
const OPERATOR = 'Only a single curl command can be imported'
const DOUBLE_ESCAPES = new Set(['"', '\\', '$', '`'])
const ANSI_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  "'": "'",
  '"': '"'
}

/** Length of a `\`-newline continuation starting at `i` (0 if there is none). */
function continuationAt(text: string, i: number): number {
  if (text[i] !== '\\') return 0
  if (text[i + 1] === '\n') return 2
  if (text[i + 1] === '\r' && text[i + 2] === '\n') return 3
  return 0
}

/** Reads up to `max` hex digits at `i`; returns the code point and how many digits were used. */
function hexAt(text: string, i: number, max: number): { code: number; used: number } | null {
  let used = 0
  while (used < max && /[0-9a-f]/i.test(text[i + used] ?? '')) used++
  if (used === 0) return null
  return { code: parseInt(text.slice(i, i + used), 16), used }
}

/** Splits a POSIX-shell-like command line into words (quotes, escapes, `$'…'`). */
export function shellWords(text: string): ShellWordsResult {
  const words: string[] = []
  let word = ''
  let inWord = false
  let i = 0
  const end = (): void => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }

  while (i < text.length) {
    const ch = text[i] as string
    const cont = continuationAt(text, i)
    if (cont) {
      i += cont
    } else if (/\s/.test(ch)) {
      end()
      i++
    } else if (ch === '|' || ch === ';' || ch === '>' || (ch === '&' && text[i + 1] === '&')) {
      return { ok: false, error: OPERATOR }
    } else if (ch === '\\') {
      inWord = true
      word += text[i + 1] ?? ''
      i += 2
    } else if (ch === "'") {
      const close = text.indexOf("'", i + 1)
      if (close === -1) return { ok: false, error: UNTERMINATED }
      inWord = true
      word += text.slice(i + 1, close)
      i = close + 1
    } else if (ch === '"') {
      inWord = true
      i++
      for (;;) {
        if (i >= text.length) return { ok: false, error: UNTERMINATED }
        const c = text[i] as string
        const dcont = continuationAt(text, i)
        if (c === '"') break
        if (dcont) {
          i += dcont
        } else if (c === '\\' && DOUBLE_ESCAPES.has(text[i + 1] ?? '')) {
          word += text[i + 1]
          i += 2
        } else {
          word += c
          i++
        }
      }
      i++
    } else if (ch === '$' && text[i + 1] === "'") {
      inWord = true
      i += 2
      for (;;) {
        if (i >= text.length) return { ok: false, error: UNTERMINATED }
        const c = text[i] as string
        if (c === "'") break
        if (c !== '\\' || i + 1 >= text.length) {
          word += c
          i++
          continue
        }
        const e = text[i + 1] as string
        const simple = ANSI_ESCAPES[e]
        const hex = e === 'x' ? hexAt(text, i + 2, 2) : e === 'u' ? hexAt(text, i + 2, 4) : null
        if (simple !== undefined) {
          word += simple
          i += 2
        } else if (hex) {
          // Lone surrogates from `\u` escapes would make later URI encoding throw.
          const lone = hex.code >= 0xd800 && hex.code <= 0xdfff
          word += String.fromCodePoint(lone ? 0xfffd : hex.code)
          i += 2 + hex.used
        } else {
          word += c + e
          i += 2
        }
      }
      i++
    } else {
      inWord = true
      word += ch
      i++
    }
  }
  end()
  return { ok: true, words }
}
