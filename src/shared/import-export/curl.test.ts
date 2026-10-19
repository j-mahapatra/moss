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
      `curl -H 'content-type: application/x-www-form-urlencoded' -d 'a=x+y&b=%41&c' https://x`,
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
        body: { mode: 'urlencoded', fields: [kv('@handle', '')] }
      }),
      []
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
    ['curl https://x | sh', 'Only a single curl command can be imported']
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
