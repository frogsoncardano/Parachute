// Small, dependency-free helpers for validating the IDs users paste into the airdrop form.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

const polymod = (values: number[]): number => {
  let chk = 1
  for (const v of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GENERATOR[i]
  }
  return chk
}

const hrpExpand = (hrp: string): number[] => {
  const codes = [...hrp].map((c) => c.charCodeAt(0))
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)]
}

const toFiveBitGroups = (bytes: number[]): number[] => {
  const out: number[] = []
  let acc = 0
  let bits = 0
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out.push((acc >> bits) & 31)
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31)
  return out
}

const hexToBytes = (hex: string): number[] => (hex.match(/.{2}/g) || []).map((h) => parseInt(h, 16))

const bech32Encode = (hrp: string, data: number[]): string => {
  const checksumInput = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]
  const mod = polymod(checksumInput) ^ 1
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31)
  return `${hrp}1${[...data, ...checksum].map((d) => CHARSET[d]).join('')}`
}

const isValidBech32 = (value: string, hrp: string): boolean => {
  if (!value.startsWith(`${hrp}1`)) return false
  const data = [...value.slice(hrp.length + 1)].map((c) => CHARSET.indexOf(c))
  if (data.length < 6 || data.includes(-1)) return false
  return polymod([...hrpExpand(hrp), ...data]) === 1
}

const HEX_56 = /^[0-9a-f]{56}$/

/** Policy ID = 56 hex characters. Returns the normalized (lowercase) id, or null when invalid. */
export const normalizePolicyId = (input: string): string | null => {
  const v = input.trim().toLowerCase()
  return HEX_56.test(v) ? v : null
}

/**
 * Pool ID can be pasted as bech32 ("pool1...") or as 56 hex characters.
 * The backend only accepts bech32, so hex ids are converted here.
 * Returns the bech32 pool id, or null when invalid.
 */
export const normalizePoolId = (input: string): string | null => {
  const v = input.trim().toLowerCase()
  if (v.startsWith('pool1')) return isValidBech32(v, 'pool') ? v : null
  if (HEX_56.test(v)) return bech32Encode('pool', toFiveBitGroups(hexToBytes(v)))
  return null
}
