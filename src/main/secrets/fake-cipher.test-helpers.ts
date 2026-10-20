// Test helper only; production code never imports this.
import type { Cipher } from './secret-codec'

/** Reversible stand-in for safeStorage: XOR + a header, so plaintext never shows in the output. */
export function fakeCipher(opts: { available?: boolean } = {}): Cipher & {
  calls: { encrypt: number; decrypt: number }
} {
  const calls = { encrypt: 0, decrypt: 0 }
  const HEADER = Buffer.from('FAKE')
  const xor = (b: Buffer): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))
  return {
    calls,
    available: () => opts.available ?? true,
    encrypt: (plain) => {
      calls.encrypt++
      return Buffer.concat([HEADER, xor(Buffer.from(plain, 'utf8'))])
    },
    decrypt: (buf) => {
      calls.decrypt++
      if (!buf.subarray(0, HEADER.length).equals(HEADER)) throw new Error('bad ciphertext')
      return xor(buf.subarray(HEADER.length)).toString('utf8')
    }
  }
}
