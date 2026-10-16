// CIP-20 transaction message: metadata label 674 with { msg: string[] }.
// Every string in `msg` may be at most 64 BYTES of UTF-8 (so "ğ" counts 2 and an emoji counts 4),
// longer lines make the transaction invalid.

export const CIP20_LABEL = 674
export const CIP20_MAX_LINE_BYTES = 64
/** Total message size we allow. Every transaction carries it, so a long message means fewer recipients per transaction. */
export const CIP20_MAX_MESSAGE_BYTES = 256

const encoder = new TextEncoder()
const byteLength = (s: string) => encoder.encode(s).length

export const messageBytes = (message: string): number => byteLength(message.trim())

/**
 * Splits a message into CIP-20 lines of at most 64 bytes.
 * Breaks at line breaks first, then at spaces, and only cuts inside a word when one word alone is too long.
 * Never cuts inside a multi-byte character.
 */
export const splitCip20Message = (message: string): string[] => {
  const lines: string[] = []

  for (const paragraph of message.trim().split(/\r?\n/)) {
    let current = ''

    const flush = () => {
      if (current) lines.push(current)
      current = ''
    }

    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word
      if (byteLength(candidate) <= CIP20_MAX_LINE_BYTES) {
        current = candidate
        continue
      }

      flush()

      if (byteLength(word) <= CIP20_MAX_LINE_BYTES) {
        current = word
        continue
      }

      // a single word longer than one line: cut it by code points
      for (const char of word) {
        if (byteLength(current + char) > CIP20_MAX_LINE_BYTES) flush()
        current += char
      }
    }

    flush()
  }

  return lines
}
