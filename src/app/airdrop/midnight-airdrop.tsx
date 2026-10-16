'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { read, utils, writeFileXLSX } from 'xlsx'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, Loader2, UploadCloud } from 'lucide-react'
import clsx from 'clsx'

import { chunk, truncateStringInMiddle } from '@/functions'
import {
  MIDNIGHT_NETWORKS,
  NIGHT_TOKEN_TYPE,
  formatNight,
  getMidnightErrorMessage,
  hasLookalikeWallets,
  isFeeSponsoringWallet,
  isValidMidnightAddress,
  parseNightAmount,
  sendBatch,
  type MidnightNetworkId,
  type MidnightRecipient,
  type MidnightTransferApi,
} from '@/functions/midnight'

// ─── Wallet API (subset of @midnight-ntwrk/dapp-connector-api 4.0.1) ──────────

interface MidnightConnectedApi extends MidnightTransferApi {
  getConnectionStatus(): Promise<{ status: 'connected'; networkId: unknown } | { status: 'disconnected' }>
  getUnshieldedBalances(): Promise<Record<string, bigint>>
  getDustBalance(): Promise<bigint | { balance: bigint; cap: bigint }>
  getUnshieldedAddress(): Promise<{ unshieldedAddress: string } | string>
}

interface MidnightWallet {
  rdns: string
  name: string
  icon: string
  apiVersion: string
  connect(networkId: string): Promise<MidnightConnectedApi>
}

interface WalletEntry {
  key: string
  wallet: MidnightWallet
}

const readInjectedWallets = (): WalletEntry[] => {
  const injected = (window as unknown as { midnight?: Record<string, MidnightWallet> }).midnight
  return Object.entries(injected ?? {}).map(([key, wallet]) => ({ key, wallet }))
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusMsg {
  type: 'info' | 'warn' | 'error' | 'success'
  msg: string
}

interface RowError {
  row: number
  msg: string
  src: string
}

interface BatchRun {
  status: 'pending' | 'sending' | 'done' | 'failed'
  error?: string
  maybeSent?: boolean
  verified?: boolean // confirmed by the NIGHT balance dropping (the wallet sent it itself)
  note?: string
}

interface WalletInfo {
  address: string
  night: bigint
  dustReady: boolean | null // null = wallet didn't tell us
  feesSponsored: boolean // the wallet (e.g. 1AM) pays the network fee, so no DUST is needed
}

const BATCH_SIZES = [10, 25, 50]
const SETTLE_DELAY_MS = 3000
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const WALLET_KEYS = ['wallet', 'address', 'unshielded', 'unshielded address', 'midnight address']

const statusClass = (type: StatusMsg['type']) =>
  clsx(
    'rounded-xl px-4 py-3 text-sm flex items-start gap-2',
    type === 'success' && 'bg-g-950/60 border border-g-900/60 text-g-400',
    type === 'warn' && 'bg-yellow-950/40 border border-yellow-900/40 text-yellow-400',
    type === 'error' && 'bg-red-950/40 border border-red-900/40 text-red-400',
    type === 'info' && 'bg-ink-950/60 border border-g-950 text-g-600'
  )

// ─── Component ────────────────────────────────────────────────────────────────

interface MidnightAirdropProps {
  /** how long to watch the balance when a wallet completes a transfer itself (tests shorten this) */
  confirmTiming?: { attempts: number; intervalMs: number }
}

export default function MidnightAirdrop({ confirmTiming }: MidnightAirdropProps = {}) {
  const [network, setNetwork] = useState<MidnightNetworkId>('mainnet')
  const [wallets, setWallets] = useState<WalletEntry[]>([])
  const [connecting, setConnecting] = useState('')
  const [connectedName, setConnectedName] = useState('')
  const [connectError, setConnectError] = useState('')
  const [api, setApi] = useState<MidnightConnectedApi | null>(null)
  const [info, setInfo] = useState<WalletInfo | null>(null)

  const [recipients, setRecipients] = useState<MidnightRecipient[]>([])
  const [fileStatus, setFileStatus] = useState<StatusMsg | null>(null)
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [batchSize, setBatchSize] = useState(25)
  const [runs, setRuns] = useState<BatchRun[]>([])
  const runsRef = useRef<BatchRun[]>([])
  const [running, setRunning] = useState(false)
  const stopRef = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopRef.current = true
    }
  }, [])

  // Wallet extensions can inject window.midnight a moment after the page loads, so poll briefly.
  useEffect(() => {
    const update = () => {
      const next = readInjectedWallets()
      setWallets((prev) => (prev.length === next.length && prev.every((p, i) => p.key === next[i].key) ? prev : next))
    }
    update()
    const interval = setInterval(update, 250)
    const stop = setTimeout(() => clearInterval(interval), 10000)
    return () => {
      clearInterval(interval)
      clearTimeout(stop)
    }
  }, [])

  const total = useMemo(() => recipients.reduce((p, c) => p + c.amount, 0n), [recipients])
  const batches = useMemo(() => (recipients.length ? chunk(recipients, batchSize) : []), [recipients, batchSize])

  const resetAirdrop = () => {
    setRecipients([])
    setRowErrors([])
    setFileStatus(null)
    runsRef.current = []
    setRuns([])
  }

  const refreshInfo = useCallback(async (a: MidnightConnectedApi, feesSponsored: boolean) => {
    const balances = await a.getUnshieldedBalances()
    const night = balances[NIGHT_TOKEN_TYPE] ?? 0n

    let address = ''
    try {
      const addr = await a.getUnshieldedAddress()
      address = typeof addr === 'string' ? addr : addr.unshieldedAddress
    } catch {}

    let dustReady: boolean | null = null
    try {
      const dust = await a.getDustBalance()
      dustReady = (typeof dust === 'bigint' ? dust : dust.balance) > 0n
    } catch {}

    if (alive.current) setInfo({ address, night, dustReady, feesSponsored })
  }, [])

  const connect = async (entry: WalletEntry) => {
    setConnecting(entry.key)
    setConnectError('')
    try {
      const connected = await entry.wallet.connect(network)
      const status = await connected.getConnectionStatus()
      if (status.status !== 'connected' || String(status.networkId) !== network) {
        throw new Error(`The wallet is not connected to ${network}. Switch network in the wallet and try again.`)
      }
      await refreshInfo(connected, isFeeSponsoringWallet(entry.key))
      if (alive.current) {
        setConnectedName(String(entry.wallet.name))
        setApi(connected)
      }
    } catch (e) {
      if (alive.current) setConnectError(getMidnightErrorMessage(e))
    } finally {
      if (alive.current) setConnecting('')
    }
  }

  const disconnect = () => {
    setApi(null)
    setInfo(null)
    setConnectedName('')
    resetAirdrop()
  }

  const changeNetwork = (n: MidnightNetworkId) => {
    if (n === network || running) return
    setNetwork(n)
    setConnectError('')
    disconnect()
  }

  // ─── File ───────────────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      resetAirdrop()
      setFileStatus({ type: 'info', msg: 'Reading file…' })

      try {
        const buffer = await file.arrayBuffer()
        const wb = read(new Uint8Array(buffer), { type: 'array' })
        const rows: Record<string, unknown>[] = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

        const merged = new Map<string, MidnightRecipient>()
        const errors: RowError[] = []
        let duplicates = 0

        rows.forEach((row, i) => {
          let address = ''
          let amountRaw = ''
          for (const [k, v] of Object.entries(row)) {
            const key = k.trim().toLowerCase()
            const val = String(v ?? '').trim()
            if (WALLET_KEYS.includes(key) && !address) address = val
            if (key === 'amount' && !amountRaw) amountRaw = val
          }

          if (!address || !amountRaw) {
            errors.push({ row: i + 1, msg: 'Missing required columns', src: [!address && 'wallet', !amountRaw && 'amount'].filter(Boolean).join(' & ') })
            return
          }
          if (!isValidMidnightAddress(address, network)) {
            const hint = address.startsWith('mn_') ? `Not a valid ${network} unshielded address (mn_addr…)` : 'Not a Midnight address'
            errors.push({ row: i + 1, msg: hint, src: address })
            return
          }
          const amount = parseNightAmount(amountRaw)
          if (amount === null) {
            errors.push({ row: i + 1, msg: 'Invalid amount (positive, max 6 decimals, use "." for decimals)', src: amountRaw })
            return
          }

          const id = address.toLowerCase()
          const existing = merged.get(id)
          if (existing) {
            existing.amount += amount
            duplicates++
          } else {
            merged.set(id, { address: address.toLowerCase(), amount })
          }
        })

        const valid = [...merged.values()].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))
        setRowErrors(errors)
        setRecipients(valid)

        const parts = [`Loaded ${valid.length} recipient${valid.length === 1 ? '' : 's'}`]
        if (errors.length) parts.push(`${errors.length} row error${errors.length === 1 ? '' : 's'}`)
        if (duplicates) parts.push(`${duplicates} duplicate address row${duplicates === 1 ? '' : 's'} merged`)
        setFileStatus({ type: errors.length || !valid.length ? 'warn' : 'success', msg: parts.join(' · ') })
      } catch (e) {
        setFileStatus({ type: 'error', msg: getMidnightErrorMessage(e) })
      } finally {
        setParsing(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network]
  )

  // ─── Send ───────────────────────────────────────────────────────────────────

  const patchRun = (i: number, patch: Partial<BatchRun>) => {
    runsRef.current = runsRef.current.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    if (alive.current) setRuns(runsRef.current)
  }

  const send = async () => {
    if (!api || running || !batches.length) return

    if (runsRef.current.length !== batches.length) {
      runsRef.current = batches.map(() => ({ status: 'pending' as const }))
      setRuns(runsRef.current)
    }

    stopRef.current = false
    setRunning(true)

    try {
      for (let i = 0; i < batches.length; i++) {
        if (runsRef.current[i].status === 'done') continue
        if (stopRef.current) break

        patchRun(i, { status: 'sending', error: undefined, maybeSent: false, note: undefined })

        const result = await sendBatch(api, batches[i], {
          onRetry: (attempt, err) => patchRun(i, { note: `Waiting for funds to settle (retry ${attempt}): ${err}` }),
          onWalletResponse: (response) => console.debug('[midnight] makeTransfer response', response),
          ...(confirmTiming ? { verifyAttempts: confirmTiming.attempts, verifyIntervalMs: confirmTiming.intervalMs } : {}),
        })

        if (result.ok) {
          patchRun(i, { status: 'done', note: undefined, verified: result.verified })
        } else {
          patchRun(i, { status: 'failed', error: result.error, maybeSent: result.maybeSent, note: undefined })
          break // stop on the first failure, the user decides how to continue
        }

        if (i < batches.length - 1) await sleep(SETTLE_DELAY_MS)
      }
    } finally {
      if (alive.current) {
        setRunning(false)
        refreshInfo(api, info?.feesSponsored ?? false).catch(() => {})
      }
    }
  }

  // The user checked their wallet history and saw the transaction: stop treating it as unsent.
  const markSent = (i: number) => patchRun(i, { status: 'done', error: undefined, maybeSent: false, verified: false, note: 'Marked as sent by you' })

  const doneCount = runs.filter((r) => r.status === 'done').length
  const failedRun = runs.find((r) => r.status === 'failed')
  const started = runs.some((r) => r.status !== 'pending')
  const allDone = batches.length > 0 && doneCount === batches.length

  const insufficientNight = !!info && total > info.night
  const noDust = info?.dustReady === false && !info.feesSponsored
  const canSend = !!api && recipients.length > 0 && !insufficientNight && !noDust && !running && !allDone

  const downloadReceipt = () => {
    const rows = recipients.map((r, idx) => {
      const run = runs[Math.floor(idx / batchSize)]
      const status = !run || run.status === 'pending' ? 'not sent' : run.status === 'done' ? 'sent' : run.status === 'failed' ? (run.maybeSent ? 'FAILED (may have been sent, check wallet history)' : 'failed') : 'sending'
      return { Address: r.address, 'Amount (NIGHT)': formatNight(r.amount), Batch: Math.floor(idx / batchSize) + 1, Status: status }
    })
    const wb = utils.book_new()
    utils.book_append_sheet(wb, utils.json_to_sheet(rows), 'Midnight airdrop')
    writeFileXLSX(wb, `Frogs Parachute Midnight receipt (${new Date().toLocaleDateString()}).xlsx`)
  }

  const midnightWallets = wallets
  const lookalikeWallets = useMemo(() => hasLookalikeWallets(wallets.map((w) => w.wallet)), [wallets])

  return (
    <div className='max-w-5xl mx-auto px-4 py-12'>
      <div className='mb-10'>
        <h1 className='font-display text-5xl text-g-400 mb-1'>🌙 Midnight Airdrop</h1>
        <p className='text-g-700 text-sm'>Send NIGHT to Midnight wallets. Network fees are paid in DUST by your wallet, or sponsored by it (1AM).</p>
      </div>

      <div className='grid lg:grid-cols-5 gap-6'>
        <div className='lg:col-span-3 space-y-6'>
          {/* Step 1: wallet */}
          <div className='card p-6 space-y-4'>
            <p className='section-label'>Step 1 — Connect Midnight Wallet</p>

            <div className='grid grid-cols-3 gap-2' role='tablist'>
              {MIDNIGHT_NETWORKS.map((n) => (
                <button
                  key={n.id}
                  role='tab'
                  aria-selected={network === n.id}
                  disabled={running}
                  onClick={() => changeNetwork(n.id)}
                  className={clsx(
                    'px-3 py-2 rounded-xl border text-sm transition-all duration-150 disabled:opacity-50',
                    network === n.id ? 'border-g-600/60 bg-g-950/60 text-g-300' : 'border-g-950 hover:border-g-900 text-g-700'
                  )}
                >
                  {n.label}
                </button>
              ))}
            </div>

            {!api ? (
              <div className='space-y-2'>
                {midnightWallets.length === 0 && (
                  <p className='text-sm text-g-700'>
                    No Midnight wallet detected. Install{' '}
                    <a
                      href='https://chromewebstore.google.com/detail/1am/bphnkdkcnfhompoegfpgnkidcjfbojjp'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='underline text-g-500 hover:text-g-300'
                    >
                      1AM
                    </a>{' '}
                    or{' '}
                    <a href='https://www.lace.io/midnight' target='_blank' rel='noopener noreferrer' className='underline text-g-500 hover:text-g-300'>
                      Lace
                    </a>
                    , then reload this page.
                  </p>
                )}
                {lookalikeWallets && (
                  <div className={statusClass('warn')}>
                    <AlertTriangle size={15} className='shrink-0 mt-0.5' />
                    Several installed wallets use the same name. One of them may be an imitation, only connect the one you installed yourself.
                  </div>
                )}
                {midnightWallets.map(({ key, wallet }) => {
                  const major = Number(String(wallet.apiVersion).split('.')[0])
                  return (
                    <button
                      key={key}
                      onClick={() => connect({ key, wallet })}
                      disabled={!!connecting}
                      className='w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-g-950 hover:border-g-800 hover:bg-g-950/30 transition-all text-left disabled:opacity-60'
                    >
                      {/* wallet-provided icon: render only through <img>, never inline (XSS, per the connector spec) */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={wallet.icon} alt='' width={24} height={24} className='rounded' />
                      <span className='flex-1 text-sm text-g-300 truncate'>{String(wallet.name)}</span>
                      {isFeeSponsoringWallet(key) && <span className='text-xs text-g-500'>fees sponsored</span>}
                      {major !== 4 && <span className='text-xs text-yellow-500'>API v{String(wallet.apiVersion)} (tested with v4)</span>}
                      {connecting === key ? <Loader2 size={16} className='animate-spin text-g-600' /> : <span className='text-xs text-g-700'>Connect</span>}
                    </button>
                  )
                })}
                {connectError && <div className={statusClass('error')}>{connectError}</div>}
              </div>
            ) : (
              <div className='space-y-3'>
                <div className='rounded-xl border border-g-900/60 bg-g-950/40 px-4 py-3 text-sm space-y-1.5'>
                  {connectedName && (
                    <div className='flex justify-between gap-3'>
                      <span className='text-g-700'>Wallet</span>
                      <span className='text-g-400 truncate'>{connectedName}</span>
                    </div>
                  )}
                  {info?.address && (
                    <div className='flex justify-between gap-3'>
                      <span className='text-g-700'>Address</span>
                      <span className='font-mono text-g-400'>{truncateStringInMiddle(info.address, 12)}</span>
                    </div>
                  )}
                  <div className='flex justify-between gap-3'>
                    <span className='text-g-700'>NIGHT balance</span>
                    <span className='text-g-400'>{formatNight(info?.night ?? 0n)} NIGHT</span>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <span className='text-g-700'>{info?.feesSponsored ? 'Network fee' : 'DUST (fees)'}</span>
                    <span className={clsx(noDust ? 'text-yellow-400' : 'text-g-400')}>
                      {info?.feesSponsored
                        ? 'not needed, fees sponsored ✓'
                        : info?.dustReady === null
                          ? 'unknown'
                          : info?.dustReady
                            ? 'available ✓'
                            : 'none yet'}
                    </span>
                  </div>
                </div>
                {noDust && (
                  <div className={statusClass('warn')}>
                    <AlertTriangle size={15} className='shrink-0 mt-0.5' />
                    Your wallet has no DUST, so it can&apos;t pay transaction fees. Register your NIGHT for DUST generation in your wallet and wait until DUST shows up.
                  </div>
                )}
                <div className='flex gap-2'>
                  <button className='btn-ghost text-xs px-3 py-1.5' disabled={running} onClick={() => api && refreshInfo(api, info?.feesSponsored ?? false)}>
                    Refresh balances
                  </button>
                  <button className='btn-ghost text-xs px-3 py-1.5' disabled={running} onClick={disconnect}>
                    Disconnect
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: list */}
          <div className={clsx('card p-6 space-y-4', !api && 'opacity-50 pointer-events-none')}>
            <p className='section-label'>Step 2 — Upload Recipient List</p>

            <div
              className={clsx(
                'border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 border-g-900',
                parsing || running ? 'cursor-default' : 'cursor-pointer hover:border-g-700 hover:bg-g-950/20'
              )}
              onClick={() => !parsing && !running && fileRef.current?.click()}
            >
              {parsing ? (
                <Loader2 size={24} className='animate-spin text-g-600 mx-auto' />
              ) : (
                <>
                  <UploadCloud size={26} className='mx-auto mb-2 text-g-800' />
                  <p className='text-sm text-g-700 mb-1'>{recipients.length ? 'Upload a different file' : 'Click to choose an Excel file (.xlsx)'}</p>
                  <p className='text-xs text-g-900 font-mono'>Columns: &quot;Wallet&quot; and &quot;Amount&quot;</p>
                </>
              )}
              <input
                ref={fileRef}
                type='file'
                accept='.xlsx,.xls'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </div>

            {fileStatus && (
              <div className={statusClass(fileStatus.type)}>
                {fileStatus.type === 'warn' && <AlertTriangle size={15} className='shrink-0 mt-0.5' />}
                {fileStatus.type === 'success' && <CheckCircle2 size={15} className='shrink-0 mt-0.5' />}
                {fileStatus.msg}
              </div>
            )}

            {rowErrors.length > 0 && (
              <div className='card overflow-hidden'>
                <button className='w-full flex items-center justify-between px-4 py-3 text-sm text-g-600 hover:text-g-400' onClick={() => setShowErrors((v) => !v)}>
                  <span>
                    {rowErrors.length} row error{rowErrors.length !== 1 ? 's' : ''}
                  </span>
                  {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showErrors && (
                  <div className='border-t border-g-950/60 divide-y divide-g-950/40 max-h-48 overflow-y-auto'>
                    {rowErrors.map((e, i) => (
                      <div key={i} className='px-4 py-2 text-xs flex gap-3'>
                        <span className='text-g-800 w-12 shrink-0'>Row {e.row}</span>
                        <span className='text-red-500 flex-1'>{e.msg}</span>
                        <span className='font-mono text-g-800 truncate max-w-xs'>{e.src}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: summary */}
        <div className='lg:col-span-2 space-y-6'>
          <div className='card p-5 space-y-4'>
            <p className='section-label'>Airdrop Summary</p>

            <div>
              <p className='font-display text-3xl text-g-400'>{formatNight(total)} NIGHT</p>
              <p className='text-xs text-g-700'>
                to {recipients.length} recipient{recipients.length === 1 ? '' : 's'} · {batches.length} transaction{batches.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className='space-y-1'>
              <label className='text-xs text-g-600' htmlFor='batch-size'>
                Recipients per transaction
              </label>
              <select
                id='batch-size'
                className='field'
                value={batchSize}
                disabled={running || started}
                onChange={(e) => {
                  setBatchSize(Number(e.target.value))
                  runsRef.current = []
                  setRuns([])
                }}
              >
                {BATCH_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className='text-xs text-g-800'>Each transaction needs one approval in your wallet.</p>
            </div>

            {insufficientNight && (
              <div className={statusClass('error')}>Total is higher than your NIGHT balance ({formatNight(info?.night ?? 0n)}).</div>
            )}

            <div className='flex gap-2'>
              <button onClick={send} disabled={!canSend} className='btn-primary text-sm py-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed'>
                {running ? (
                  <>
                    <Loader2 size={14} className='animate-spin' /> Sending…
                  </>
                ) : allDone ? (
                  'All sent ✓'
                ) : started ? (
                  'Resume'
                ) : (
                  'Send airdrop 🌙'
                )}
              </button>
              {running && (
                <button className='btn-ghost text-sm px-4 py-2' onClick={() => (stopRef.current = true)}>
                  Stop after this one
                </button>
              )}
            </div>

            <p className='text-xs text-g-800'>
              No service fee on Midnight.{' '}
              {info?.feesSponsored ? 'Your wallet sponsors the network fee.' : 'The only cost is the network fee, paid in DUST by your wallet.'}
            </p>
          </div>

          {runs.length > 0 && (
            <div className='card p-5 space-y-3'>
              <div className='flex items-center justify-between'>
                <p className='section-label'>
                  Transactions {doneCount}/{runs.length}
                </p>
                <button className='text-xs text-g-600 hover:text-g-400 flex items-center gap-1' onClick={downloadReceipt}>
                  <Download size={12} /> Receipt
                </button>
              </div>

              <div className='divide-y divide-g-950/40 max-h-72 overflow-y-auto'>
                {runs.map((r, i) => (
                  <div key={i} className='py-2 text-xs space-y-1'>
                    <div className='flex items-center gap-2'>
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full shrink-0',
                          r.status === 'done' && 'bg-g-500',
                          r.status === 'sending' && 'bg-yellow-400 animate-pulse',
                          r.status === 'failed' && 'bg-red-500',
                          r.status === 'pending' && 'bg-g-900'
                        )}
                      />
                      <span className='text-g-600 flex-1'>
                        #{i + 1} · {batches[i]?.length ?? 0} recipients
                      </span>
                      <span className='text-g-800'>{r.status}</span>
                    </div>
                    {r.note && <p className='text-yellow-500 pl-4'>{r.note}</p>}
                    {r.status === 'done' && r.verified && <p className='text-g-700 pl-4'>Confirmed: your NIGHT balance dropped by this amount.</p>}
                    {r.error && <p className='text-red-400 pl-4 break-words'>{r.error}</p>}
                    {r.maybeSent && r.status === 'failed' && (
                      <div className='pl-4 space-y-1.5'>
                        <p className='text-yellow-500'>This transaction may have reached the network. Check your wallet history first, or recipients could be paid twice.</p>
                        {!running && (
                          <button className='btn-ghost text-xs px-3 py-1' onClick={() => markSent(i)}>
                            I checked: it was sent
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {failedRun && !running && <div className={statusClass('warn')}>Sending stopped at the first failure. Fix the cause, then press Resume to continue with the remaining transactions.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
