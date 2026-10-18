import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { palette, renderTokensCss } from '../src/renderer/ui/tokens'

const out = resolve(import.meta.dirname, '../src/renderer/ui/tokens.css')
writeFileSync(out, renderTokensCss(palette))
console.log(`Wrote ${out}`)
