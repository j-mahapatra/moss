import { describe, expect, it } from 'vitest'
import { shellWords } from './shell-words'

const SINGLE = 'Only a single curl command can be imported'
const UNTERMINATED = 'Unterminated quote in command'

describe('shellWords', () => {
  it.each<[string, string, string[]]>([
    ['plain words', 'curl  -X\tGET\nhttps://x', ['curl', '-X', 'GET', 'https://x']],
    ['single quotes are literal', `'a "b" \\n $c'`, ['a "b" \\n $c']],
    ['double quotes with \\"', `"say \\"hi\\""`, ['say "hi"']],
    ['double quotes keep other backslashes', `"a\\nb\\\\c\\$d"`, ['a\\nb\\c$d']],
    ["$'…' newline", `$'a\\nb'`, ['a\nb']],
    ["$'…' hex and unicode", `$'\\x41é\\u00e9'`, ['Aéé']],
    ["$'…' quote escapes", `$'it\\'s \\"q\\" \\t\\\\'`, ['it\'s "q" \t\\']],
    ['backslash continuation across \\r\\n', 'curl \\\r\n  https://x', ['curl', 'https://x']],
    ['backslash continuation across \\n', 'curl -s\\\n-L', ['curl', '-s-L']],
    ['adjacent quoting', `'a'"b"c`, ['abc']],
    ['an empty quoted word', `a '' b ""`, ['a', '', 'b', '']],
    ['bare backslash escape', 'a\\ b \\$x \\|', ['a b', '$x', '|']],
    [
      'operators inside quotes are literal',
      `'a|b' "c;d" 'e && f' "g>h"`,
      ['a|b', 'c;d', 'e && f', 'g>h']
    ],
    ['a single & is literal', 'https://x?a=1&b=2', ['https://x?a=1&b=2']],
    ['empty input', '   ', []]
  ])('%s', (_name, input, words) => {
    expect(shellWords(input)).toEqual({ ok: true, words })
  })

  it.each<[string, string, string]>([
    ['unterminated single quote', `curl 'https://x`, UNTERMINATED],
    ['unterminated double quote', `curl "https://x`, UNTERMINATED],
    ["unterminated $'…'", `curl $'abc`, UNTERMINATED],
    ['a pipe', 'curl a | sh', SINGLE],
    ['a semicolon', 'curl a; rm x', SINGLE],
    ['&&', 'curl a && curl b', SINGLE],
    ['a redirect', 'curl a >out', SINGLE]
  ])('%s → error', (_name, input, error) => {
    expect(shellWords(input)).toEqual({ ok: false, error })
  })
})
