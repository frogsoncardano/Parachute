// Midnight helpers. Everything here is pure (no React, no window) so it can be unit tested.
//
// Facts (docs.midnight.network, DApp connector API v4):
// - NIGHT is the unshielded native token, its raw token type is 32 zero bytes
// - NIGHT has 6 decimals (10_000_000 = 10 NIGHT)
// - addresses are Bech32m, unshielded payment addresses use the prefix "mn_addr" + network suffix
// - makeTransfer() builds + signs + proves a transaction and, by default, pays the fee with DUST
//   (some wallets, like 1AM, sponsor the fee instead)

export type MidnightNetworkId = 'mainnet' | 'preprod' | 'preview'

export const NIGHT_TOKEN_TYPE = '0'.repeat(64)
export const NIGHT_DECIMALS = 6

export const MIDNIGHT_NETWORKS: { id: MidnightNetworkId; label: string; hrp: string }[] = [
  { id: 'mainnet', label: 'Mainnet', hrp: 'mn_addr' },
  { id: 'preprod', label: 'Preprod (test)', hrp: 'mn_addr_preprod' },
  { id: 'preview', label: 'Preview (test)', hrp: 'mn_addr_preview' },
]

// ─── Wallet detection ─────────────────────────────────────────────────────────

/**
 * Wallets that sponsor the network fee themselves, so the user doesn't need any DUST.
 * 1AM (1am.xyz/developers) injects itself at the fixed key window.midnight['1am'] and its ProofStation
 * server adds the DUST. The key is only a UX hint (it decides whether we pre-check the DUST balance);
 * it is not a trust decision, any wallet can use any key.
 */
const FEE_SPONSORING_WALLET_KEYS = ['1am']

export const isFeeSponsoringWallet = (injectedKey: string): boolean => FEE_SPONSORING_WALLET_KEYS.includes(injectedKey.trim().toLowerCase())

/**
 * The connector spec asks DApps to warn the user when several injected wallets share the same
 * name or rdns, because that is how a malicious extension impersonates a real wallet.
 */
export const hasLookalikeWallets = (wallets: { name: string; rdns: string }[]): boolean => {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const names = wallets.map((w) => norm(w.name)).filter(Boolean)
  const rdns = wallets.map((w) => norm(w.rdns)).filter(Boolean)
  return new Set(names).size < names.length || new Set(rdns).size < rdns.length
}

// ─── Bech32m ──────────────────────────────────────────────────────────────────

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32M_CONST = 0x2bc830a3
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

const polymod = (values: number[]): number => {
  let chk = 1
  for (const v of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GENERATOR[i]
  }
  return chk >>> 0
}

const hrpExpand = (hrp: string): number[] => {
  const codes = [...hrp].map((c) => c.charCodeAt(0))
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)]
}

/** Returns the decoded payload bytes when `value` is a valid Bech32m string with the given prefix, else null. */
export const decodeBech32m = (value: string, hrp: string): number[] | null => {
  const v = value.trim()
  // Bech32 forbids mixed case
  if (v !== v.toLowerCase() && v !== v.toUpperCase()) return null

  const lower = v.toLowerCase()
  const sep = lower.lastIndexOf('1')
  if (sep < 1 || lower.slice(0, sep) !== hrp) return null

  const data = [...lower.slice(sep + 1)].map((c) => CHARSET.indexOf(c))
  if (data.length < 7 || data.includes(-1)) return null
  if (polymod([...hrpExpand(hrp), ...data]) !== BECH32M_CONST) return null

  // 5-bit groups -> bytes (drop the 6 checksum groups)
  const groups = data.slice(0, -6)
  const bytes: number[] = []
  let acc = 0
  let bits = 0
  for (const g of groups) {
    acc = (acc << 5) | g
    bits += 5
    while (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 255)
    }
  }
  // leftover padding bits must be zero and shorter than a group
  if (bits >= 5 || ((acc << (8 - bits)) & 255) !== 0) return null
  return bytes
}

/** Unshielded Midnight address for the given network: right prefix, valid checksum, 32 byte payload. */
export const isValidMidnightAddress = (address: string, network: MidnightNetworkId): boolean => {
  const hrp = MIDNIGHT_NETWORKS.find((n) => n.id === network)?.hrp
  if (!hrp) return false
  return decodeBech32m(address, hrp)?.length === 32
}

// ─── NIGHT amounts ────────────────────────────────────────────────────────────

/**
 * "1250.5" -> 1_250_500_000n. Pure string math (no floats).
 * Returns null for anything that is not a positive number with at most 6 decimals,
 * and for ambiguous thousands/decimal separators like "1,000".
 */
export const parseNightAmount = (raw: string): bigint | null => {
  const s = raw.trim().replace(/\s/g, '')
  // "1,000" could mean 1 or 1000 depending on locale: refuse to guess with other people's money
  if (/^\d{1,3},\d{3}$/.test(s)) return null
  const normalized = s.includes(',') && !s.includes('.') && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  const m = /^(\d+)(?:\.(\d+))?$/.exec(normalized)
  if (!m) return null
  const [, whole, frac = ''] = m
  if (frac.length > NIGHT_DECIMALS) return null
  const value = BigInt(whole) * 10n ** BigInt(NIGHT_DECIMALS) + BigInt(frac.padEnd(NIGHT_DECIMALS, '0') || '0')
  return value > 0n ? value : null
}

export const formatNight = (value: bigint): string => {
  const base = 10n ** BigInt(NIGHT_DECIMALS)
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % base).toString().padStart(NIGHT_DECIMALS, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

// ─── Errors ───────────────────────────────────────────────────────────────────

type ConnectorError = { type?: string; code?: string; reason?: string; message?: string }

export const getMidnightErrorMessage = (e: unknown): string => {
  if (typeof e === 'string') return e || 'Unknown error'
  const err = e as ConnectorError | null
  const code = err?.code
  const text = err?.reason || err?.message
  if (code && text) return `${code}: ${text}`
  return code || text || 'Unknown error'
}

/** Errors where retrying makes no sense: the user said no, or the wallet is gone. */
export const isFatalConnectorError = (e: unknown): boolean => {
  const code = (e as ConnectorError | null)?.code
  return code === 'Rejected' || code === 'PermissionRejected' || code === 'Disconnected'
}

// ─── Sending ──────────────────────────────────────────────────────────────────

export interface MidnightRecipient {
  address: string
  amount: bigint // in the smallest NIGHT unit (6 decimals)
}

/** The part of the wallet's ConnectedAPI we use (matches @midnight-ntwrk/dapp-connector-api 4.0.1). */
export interface MidnightTransferApi {
  makeTransfer(
    outputs: { kind: 'unshielded'; type: string; value: bigint; recipient: string }[],
    options?: { payFees?: boolean }
  ): Promise<{ tx: string }>
  submitTransaction(tx: string): Promise<void>
}

export interface SendBatchResult {
  ok: boolean
  error?: string
  /** the user rejected the request or the wallet disconnected: sending more batches makes no sense */
  fatal?: boolean
  /** true when the failure happened AFTER the wallet handed us a transaction, so it may still have reached the network */
  maybeSent?: boolean
}

interface SendBatchOptions {
  retries?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  onRetry?: (attempt: number, error: string) => void
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Sends one batch as a single transaction. The wallet pays the fee with DUST (payFees defaults to true).
 *
 * Retry rules, chosen to never pay anyone twice:
 * - makeTransfer fails -> nothing was submitted, safe to retry (the previous batch may still be settling,
 *   so "not enough funds" is expected for a short while)
 * - submitTransaction fails -> we can't know if it reached the network, so we do NOT retry, we report maybeSent
 */
export const sendBatch = async (api: MidnightTransferApi, batch: MidnightRecipient[], opts: SendBatchOptions = {}): Promise<SendBatchResult> => {
  const { retries = 4, retryDelayMs = 8000, sleep = defaultSleep, onRetry } = opts
  const outputs = batch.map((r) => ({ kind: 'unshielded' as const, type: NIGHT_TOKEN_TYPE, value: r.amount, recipient: r.address }))

  let tx: string | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      tx = (await api.makeTransfer(outputs)).tx
      break
    } catch (e) {
      const msg = getMidnightErrorMessage(e)
      const fatal = isFatalConnectorError(e)
      if (fatal || attempt === retries) return { ok: false, error: msg, ...(fatal ? { fatal } : {}) }
      onRetry?.(attempt + 1, msg)
      await sleep(retryDelayMs * (attempt + 1))
    }
  }
  if (!tx) return { ok: false, error: 'Wallet returned no transaction' }

  try {
    await api.submitTransaction(tx)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getMidnightErrorMessage(e), maybeSent: true }
  }
}
