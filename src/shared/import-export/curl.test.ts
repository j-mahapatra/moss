import { describe, expect, it } from 'vitest'
import type { KeyValue, RequestSpec } from '../types'
import { looksLikeCurl, parseCurl } from './curl'

type Shape = Pick<RequestSpec, 'method' | 'url' | 'headers' | 'body' | 'auth'>

const kv = (key: string, value: string): KeyValue => ({ key, value, enabled: true })
const shape = (s: Partial<Shape> & { url: string }): Shape => ({
  method: 'GET',
  headers: [],
  body: { mode: 'none' },
  auth: { type: 'none' },
  ...s
})

const CHROME = `curl 'https://api.example.com/v1/items?page=2' \\
  -H 'accept: application/json' \\
  -H $'x-note: it\\'s' \\
  -H 'content-type: application/json' \\
  --data-raw $'{"name":"a\\u00e9"}' \\
  --compressed`

describe('parseCurl parked fixes', () => {
  it('treats -- as the end of options', () => {
    const r = parseCurl('curl -X POST -- -weird https://b')
    expect(r).toMatchObject({
      ok: true,
      request: { method: 'POST', url: '-weird' },
      report: [{ path: '', message: 'Extra URL ignored: https://b' }]
    })
    const dd = parseCurl('curl -- -d')
    expect(dd).toMatchObject({ ok: true, request: { method: 'GET', url: '-d' }, report: [] })
  })

  it('keeps {{vars}} in --data-urlencode content of a raw body', () => {
    const r = parseCurl(
      "curl -H 'Content-Type: application/json' --data-urlencode 'q={{name}} x&y' https://x"
    )
    expect(r).toMatchObject({
      ok: true,
      request: { body: { mode: 'raw', text: 'q={{name}}%20x%26y' } }
    })
  })
})

describe('parseCurl', () => {
  it.each<[string, string, Shape, string[]]>([
    ['bare GET', 'curl https://x.io/a', shape({ url: 'https://x.io/a' }), []],
    ['-X DELETE', 'curl -X DELETE https://x', shape({ method: 'DELETE', url: 'https://x' }), []],
    ['-XPOST attached', 'curl -XPOST https://x', shape({ method: 'POST', url: 'https://x' }), []],
    [
      'lower-case method',
      'curl --request patch https://x',
      shape({ method: 'PATCH', url: 'https://x' }),
      []
    ],
    [
      '-d implies POST',
      'curl -d a=1 https://x',
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'urlencoded', fields: [kv('a', '1')] }
      }),
      []
    ],
    ['-G -d → query', 'curl -G -d q=1 https://x', shape({ url: 'https://x?q=1' }), []],
    [
      '-G respects an existing query',
      'curl -G https://x?a=1 -d q=a+b --data-urlencode "n=x y"',
      shape({ url: 'https://x?a=1&q=a%20b&n=x%20y' }),
      []
    ],
    [
      'the URL is kept verbatim',
      `curl 'https://x/p?q=a%20b&t=1+2&debug&l=a,b&e=x@y.com#h'`,
      shape({ url: 'https://x/p?q=a%20b&t=1+2&debug&l=a,b&e=x@y.com#h' }),
      []
    ],
    [
      '-G appends data to the verbatim URL',
      `curl -G 'https://x?e=x@y.com&t=1+2' -d a=1`,
      shape({ url: 'https://x?e=x@y.com&t=1+2&a=1' }),
      []
    ],
    ['-I → HEAD', 'curl -I https://x', shape({ method: 'HEAD', url: 'https://x' }), []],
    [
      'multiple -H',
      `curl -H 'Accept: a' --header 'X-One:1' -HX-Two:2 https://x`,
      shape({ url: 'https://x', headers: [kv('Accept', 'a'), kv('X-One', '1'), kv('X-Two', '2')] }),
      []
    ],
    [
      'a header with a colon in its value',
      `curl -H 'X-Time: 12:30:00' https://x`,
      shape({ url: 'https://x', headers: [kv('X-Time', '12:30:00')] }),
      []
    ],
    [
      'a malformed header',
      `curl -H 'NoColon' https://x`,
      shape({ url: 'https://x' }),
      ['Malformed header "NoColon"']
    ],
    [
      'Authorization: Bearer → bearer auth',
      `curl -H 'Authorization: Bearer abc' https://x`,
      shape({ url: 'https://x', auth: { type: 'bearer', token: 'abc' } }),
      []
    ],
    [
      '-u with a colon in the password',
      'curl -u user:pa:ss https://x',
      shape({ url: 'https://x', auth: { type: 'basic', username: 'user', password: 'pa:ss' } }),
      []
    ],
    [
      '-u without a password',
      'curl --user user https://x',
      shape({ url: 'https://x', auth: { type: 'basic', username: 'user', password: '' } }),
      []
    ],
    [
      'raw JSON with a Content-Type',
      `curl --data-raw '{"a":1}' -H 'Content-Type: application/json' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        headers: [kv('Content-Type', 'application/json')],
        body: { mode: 'raw', contentType: 'application/json', text: '{"a":1}' }
      }),
      []
    ],
    [
      '-d a=1 -d b=2',
      'curl -d a=1 -d b=2 https://x',
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'urlencoded', fields: [kv('a', '1'), kv('b', '2')] }
      }),
      []
    ],
    [
      'urlencoded parts are decoded; the form Content-Type is dropped',
      `curl -H 'content-type: application/x-www-form-urlencoded' -d 'a=x+y&b=%41&c=' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'urlencoded', fields: [kv('a', 'x y'), kv('b', 'A'), kv('c', '')] }
      }),
      []
    ],
    [
      '--data-urlencode keeps content verbatim',
      `curl --data-urlencode 'q=a b' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'urlencoded', fields: [kv('q', 'a b')] }
      }),
      []
    ],
    [
      '--data-urlencode without a name',
      `curl --data-urlencode '=a b' --data-urlencode bare https://x`,
      shape({ url: 'https://x' }),
      ['Unsupported --data-urlencode value "=a b"', 'Unsupported --data-urlencode value "bare"']
    ],
    [
      '-d @file reported',
      'curl -d @body.json https://x',
      shape({ url: 'https://x' }),
      ['File data (@body.json) was not imported']
    ],
    [
      '--data-raw keeps a leading @',
      'curl --data-raw @handle https://x',
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'raw', contentType: 'application/x-www-form-urlencoded', text: '@handle' }
      }),
      []
    ],
    [
      '-d that is not form data stays raw',
      `curl -d '{"a":1}' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'raw', contentType: 'application/x-www-form-urlencoded', text: '{"a":1}' }
      }),
      []
    ],
    [
      '-d with one part lacking = stays raw, keeping a form Content-Type value',
      `curl -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' -d 'a=1&b' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        body: {
          mode: 'raw',
          contentType: 'application/x-www-form-urlencoded; charset=utf-8',
          text: 'a=1&b'
        }
      }),
      []
    ],
    [
      '-F text options are stripped and reported once',
      `curl -F 'n=v;type=text/plain' -F 'm=w;filename=a.txt;type=x/y' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        body: {
          mode: 'form-data',
          fields: [
            { kind: 'text', key: 'n', value: 'v', enabled: true },
            { kind: 'text', key: 'm', value: 'w', enabled: true }
          ]
        }
      }),
      ['Form field options (;type=, ;filename=) were not imported']
    ],
    [
      '-F text and file fields',
      `curl -F name=x -F 'file=@/etc/passwd;type=text/plain' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        body: {
          mode: 'form-data',
          fields: [
            { kind: 'text', key: 'name', value: 'x', enabled: true },
            { kind: 'file', key: 'file', filePath: '', enabled: true }
          ]
        }
      }),
      ['Choose the file for "file" again']
    ],
    [
      '-F with -d',
      'curl -F a=1 -d b=2 https://x',
      shape({
        method: 'POST',
        url: 'https://x',
        body: { mode: 'form-data', fields: [{ kind: 'text', key: 'a', value: '1', enabled: true }] }
      }),
      ['--data ignored because --form was given']
    ],
    ['--url', 'curl --url https://x', shape({ url: 'https://x' }), []],
    ['--url=value', 'curl --url=https://x', shape({ url: 'https://x' }), []],
    [
      'two URLs',
      'curl https://a https://b',
      shape({ url: 'https://a' }),
      ['Extra URL ignored: https://b']
    ],
    [
      '-sSL --compressed',
      'curl -sSL --compressed https://x -s',
      shape({ url: 'https://x' }),
      ['Ignored option -s', 'Ignored option -S', 'Ignored option -L', 'Ignored option --compressed']
    ],
    [
      '-o consumes its argument',
      'curl -o out.txt https://x',
      shape({ url: 'https://x' }),
      ['Unsupported option -o']
    ],
    [
      '--max-time=5',
      'curl --max-time=5 https://x --retry 3',
      shape({ url: 'https://x' }),
      ['Unsupported option --max-time', 'Unsupported option --retry']
    ],
    [
      'an unknown flag takes no argument',
      'curl --foo https://x',
      shape({ url: 'https://x' }),
      ['Unsupported option --foo']
    ],
    [
      '-A, -e and -b',
      `curl -A 'ua' -e https://ref --cookie 'a=1' https://x`,
      shape({
        url: 'https://x',
        headers: [kv('User-Agent', 'ua'), kv('Referer', 'https://ref'), kv('Cookie', 'a=1')]
      }),
      []
    ],
    [
      '-b cookie file',
      'curl -b cookies.txt https://x',
      shape({ url: 'https://x' }),
      ['Cookie file (cookies.txt) was not imported']
    ],
    [
      'Chrome-style multi-line command',
      CHROME,
      shape({
        method: 'POST',
        url: 'https://api.example.com/v1/items?page=2',
        headers: [
          kv('accept', 'application/json'),
          kv('x-note', "it's"),
          kv('content-type', 'application/json')
        ],
        body: { mode: 'raw', contentType: 'application/json', text: '{"name":"aé"}' }
      }),
      ['Ignored option --compressed']
    ],
    [
      '{{baseUrl}} kept verbatim',
      'curl "{{baseUrl}}/users?id={{id}}"',
      shape({ url: '{{baseUrl}}/users?id={{id}}' }),
      []
    ],
    [
      '--json adds JSON headers and a raw body',
      `curl --json '{"a":1}' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        headers: [kv('Content-Type', 'application/json'), kv('Accept', 'application/json')],
        body: { mode: 'raw', contentType: 'application/json', text: '{"a":1}' }
      }),
      []
    ],
    [
      '--json keeps given Content-Type and Accept headers',
      `curl -H 'accept: */*' -H 'content-type: application/vnd.x+json' --json '[1]' https://x`,
      shape({
        method: 'POST',
        url: 'https://x',
        headers: [kv('accept', '*/*'), kv('content-type', 'application/vnd.x+json')],
        body: { mode: 'raw', contentType: 'application/vnd.x+json', text: '[1]' }
      }),
      []
    ],
    [
      '--json @file reported',
      'curl --json @body.json https://x',
      shape({
        url: 'https://x',
        headers: [kv('Content-Type', 'application/json'), kv('Accept', 'application/json')]
      }),
      ['File data (@body.json) was not imported']
    ],
    [
      '--max-redirs consumes its argument',
      'curl --max-redirs 3 https://x -K cfg --form-string a=b',
      shape({ url: 'https://x' }),
      [
        'Unsupported option --max-redirs',
        'Unsupported option -K',
        'Unsupported option --form-string'
      ]
    ],
    [
      'a lone surrogate escape becomes U+FFFD',
      `curl $'https://x?q=\\uD800'`,
      shape({ url: 'https://x?q=\uFFFD' }),
      []
    ],
    [
      'a lone surrogate in --data-urlencode with -G',
      `curl -G --data-urlencode $'q=\\uD800' https://x`,
      shape({ url: 'https://x?q=%EF%BF%BD' }),
      []
    ],
    [
      'a missing option value',
      'curl https://x -H',
      shape({ url: 'https://x' }),
      ['Option -H needs a value']
    ]
  ])('%s', (_name, command, expected, messages) => {
    const result = parseCurl(command)
    if (!result.ok) throw new Error(result.error)
    const { method, url, headers, body, auth } = result.request
    expect({ method, url, headers, body, auth }).toEqual(expected)
    expect(result.report).toEqual(messages.map((message) => ({ path: '', message })))
  })

  it('derives params and name from the URL and uses a fresh id', () => {
    const a = parseCurl('curl -X POST "https://x.io/p?q=a%20b"')
    const b = parseCurl('curl -X POST "https://x.io/p?q=a%20b"')
    if (!a.ok || !b.ok) throw new Error('expected ok')
    expect(a.request.params).toEqual([kv('q', 'a b')])
    expect(a.request.name).toBe('POST /p?q=a%20b')
    expect(a.request.id).not.toBe(b.request.id)
  })

  it('decodes params from the verbatim URL like parseQuery', () => {
    const r = parseCurl(`curl 'https://x/p?q=a%20b&t=1+2&debug&l=a,b&e=x@y.com'`)
    if (!r.ok) throw new Error(r.error)
    expect(r.request.params).toEqual([
      kv('q', 'a b'),
      kv('t', '1+2'),
      kv('debug', ''),
      kv('l', 'a,b'),
      kv('e', 'x@y.com')
    ])
  })

  it('keeps a non-form Content-Type alongside a raw body', () => {
    const r = parseCurl(`curl -H 'Content-Type: text/plain' -d a -d b https://x`)
    if (!r.ok) throw new Error(r.error)
    expect(r.request.body).toEqual({ mode: 'raw', contentType: 'text/plain', text: 'a&b' })
  })

  it.each<[string, string]>([
    ['curl -X FOO https://x', 'Unsupported method "FOO"'],
    ['wget https://x', 'Not a curl command'],
    ['', 'Not a curl command'],
    ['curl -H x', 'No URL found in curl command'],
    ["curl 'https://x", 'Unterminated quote in command'],
    ['curl https://x | sh', 'Only a single curl command can be imported'],
    ['curl https://x?q=\uD800', 'Could not read curl command'],
    [
      'curl -d a -H "Content-Type: text/plain" --data-urlencode q=\uDC00 https://x',
      'Could not read curl command'
    ]
  ])('%s → error', (command, error) => {
    expect(parseCurl(command)).toEqual({ ok: false, error })
  })
})

describe('looksLikeCurl', () => {
  it.each<[string, boolean]>([
    ['  curl https://x', true],
    ['curl', true],
    ['curl\n-X', true],
    ['curly', false],
    ['https://x?curl=1', false]
  ])('%j → %s', (text, expected) => {
    expect(looksLikeCurl(text)).toBe(expected)
  })
})
