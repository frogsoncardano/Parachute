'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useWallet, useRewardAddress, useLovelace } from '@meshsdk/react'
import { Transaction } from '@meshsdk/core'
import { read, utils, writeFileXLSX } from 'xlsx'
import { ExternalLink, Download, UploadCloud, AlertTriangle, CheckCircle2, Loader2, ChevronDown, ChevronUp, Images, Users } from 'lucide-react'
import clsx from 'clsx'

import api from '@/utils/api'
import { useWalletStore } from '@/store'
import { useConnectedWallet } from '@/hooks'
import { verifyMinRequiredAda } from '@/containers/new-airdrop/helpers/verify-min-required-ada'
import { verifyMinRequiredBalance } from '@/containers/new-airdrop/helpers/verify-min-required-balance'
import {
  chunk,
  eachLimit,
  extractError,
  formatTokenAmountFromChain,
  formatTokenAmountToChain,
  getTokenName,
  prettyNumber,
  truncateStringInMiddle,
  txConfirmation,
} from '@/functions'
import {
  ADA,
  MIN_ADA_PER_WALLET,
  MIN_LOVELACES_PER_WALLET,
  WALLETS,
} from '@/constants'
import type { PayoutRecipient, AirdropSettings, PopulatedToken } from '@/@types'
import SnapshotSource from './snapshot-source'
import { INIT_AIRDROP_SETTINGS } from '@/constants'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FileRow {
  wallet?: string
  address?: string
  stakekey?: string
  amount?: string | number
  [key: string]: unknown
}

interface StatusMsg {
  type: 'info' | 'warn' | 'error' | 'success'
  msg: string
}

// ─── Token Selector ──────────────────────────────────────────────────────────

function TokenSelector({
  tokens,
  isFetching,
  selected,
  onSelect,
}: {
  tokens: PopulatedToken[]
  isFetching: boolean
  selected: AirdropSettings
  onSelect: (t: PopulatedToken) => void
}) {
  if (isFetching) {
    return (
      <div className='flex items-center gap-2 text-g-600 text-sm py-4'>
        <Loader2 size={16} className='animate-spin' /> Loading your balances…
      </div>
    )
  }
  if (!tokens.length) {
    return (
      <p className='text-sm text-g-700 py-4'>
        No tokens found. Send some ADA or tokens to your wallet first.
      </p>
    )
  }

  return (
    <div className='space-y-1.5'>
      {tokens.map((t) => {
        const isSelected = selected.tokenId === t.tokenId
        const name = getTokenName(t.tokenName)
        const balance = prettyNumber(t.tokenAmount.display)

        return (
          <button
            key={t.tokenId}
            onClick={() => onSelect(t)}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-150',
              isSelected
                ? 'border-g-600/60 bg-g-950/60 text-g-300'
                : 'border-transparent hover:border-g-900 hover:bg-g-950/30 text-g-600'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.image?.url ? (
              <img src={t.image.url} alt={name} className='w-8 h-8 rounded-full object-cover' />
            ) : (
              <div className='w-8 h-8 rounded-full bg-g-900 flex items-center justify-center text-sm'>
                {t.tokenId === 'lovelace' ? '₳' : '🪙'}
              </div>
            )}
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-medium truncate'>{name}</p>
              <p className='text-xs text-g-700'>{balance}</p>
            </div>
            {isSelected && <CheckCircle2 size={16} className='text-g-500 shrink-0' />}
          </button>
        )
      })}
    </div>
  )
}

// ─── File Upload ─────────────────────────────────────────────────────────────

function FileUpload({
  settings,
  onRecipients,
}: {
  settings: AirdropSettings
  onRecipients: (r: PayoutRecipient[]) => void
}) {
  const { stakeKey } = useConnectedWallet()
  const [status, setStatus] = useState<StatusMsg | null>(null)
  const [progress, setProgress] = useState({ current: 0, max: 0 })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<{ row: number; msg: string; src: string }[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true)
      setDone(false)
      setErrors([])
      setStatus({ type: 'info', msg: 'Reading file…' })
      setProgress({ current: 0, max: 0 })
      onRecipients([])

      try {
        const buffer = await file.arrayBuffer()
        const wb = read(buffer, { type: 'buffer' })
        const rows: FileRow[] = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

        const walletKeys = ['wallet', 'address', 'stakekey', 'stake-key', 'stake key', 'handle', 'adahandle', 'ada-handle', 'ada handle']
        const amountKeys = ['amount']
        const payload: PayoutRecipient[] = []
        const rowErrors: { row: number; msg: string; src: string }[] = []

        setProgress({ current: 0, max: rows.length })

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const detected = { wallet: false, amount: false }
          const payout: PayoutRecipient = { stakeKey: '', address: '', txHash: '', payout: 0 }

          for (const [objKey, keyVal] of Object.entries(row)) {
            const key = objKey?.toString().trim().toLowerCase()
            const val = String(keyVal ?? '').trim()

            if (amountKeys.includes(key) && !detected.amount) {
              detected.amount = true
              const n = Number(val.replace(/[^\d.]/g, '').replace(/\.{2,}/g, '.').replace(/(\..*)\./g, '$1'))
              if (isNaN(n) || n <= 0) {
                rowErrors.push({ row: i + 1, msg: 'Invalid amount', src: val })
              } else {
                payout.payout = formatTokenAmountToChain(n, settings.tokenAmount.decimals)
              }
            }

            if (walletKeys.includes(key) && !detected.wallet) {
              detected.wallet = true
              try {
                const { stakeKey: sk, addresses } = await api.wallet.getData(val)
                if (addresses[0]?.address.indexOf('addr1') !== 0) {
                  rowErrors.push({ row: i + 1, msg: 'Not a Cardano address', src: addresses[0]?.address })
                } else if (addresses[0]?.isScript) {
                  // skip script wallets silently
                } else if (!sk) {
                  rowErrors.push({ row: i + 1, msg: 'No registered stake key', src: addresses[0]?.address })
                } else {
                  payout.address = addresses[0].address
                  payout.stakeKey = sk
                }
              } catch (e: unknown) {
                const msg = typeof e === 'string' ? e : (e as Error)?.message || 'Unknown error'
                rowErrors.push({
                  row: i + 1,
                  msg: msg.includes('provide a valid wallet') ? 'Invalid wallet identifier' : msg,
                  src: val,
                })
              }
            }
          }

          if (!detected.wallet || !detected.amount) {
            rowErrors.push({
              row: i + 1,
              msg: 'Missing required columns',
              src: [!detected.wallet && 'wallet', !detected.amount && 'amount'].filter(Boolean).join(' & '),
            })
          }

          if (payout.address && payout.stakeKey && payout.payout) payload.push(payout)
          setProgress((p) => ({ current: p.current + 1, max: rows.length }))
        }

        setErrors(rowErrors)
        const valid = payload.filter(({ payout: p }) => !!p).sort((a, b) => b.payout - a.payout)
        onRecipients(valid)
        setDone(true)
        setLoading(false)

        if (rowErrors.length) {
          setStatus({ type: 'warn', msg: `Loaded ${valid.length} recipients with ${rowErrors.length} row errors` })
        } else {
          setStatus({ type: 'success', msg: `${valid.length} recipients loaded successfully` })
        }

        api.notify('✅ File scan ended', `${stakeKey}\n${prettyNumber(settings.tokenAmount.display)} ${getTokenName(settings.tokenName)}`).catch(() => {})
      } catch (e: unknown) {
        const msg = extractError(e).message
        setStatus({ type: 'error', msg })
        setLoading(false)
      }
    },
    [settings, stakeKey, onRecipients]
  )

  return (
    <div className='space-y-4'>
      {/* Drop zone */}
      <div
        className={clsx(
          'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200',
          loading || done
            ? 'border-g-900 cursor-default'
            : 'border-g-900 hover:border-g-700 hover:bg-g-950/20'
        )}
        onClick={() => !loading && !done && fileRef.current?.click()}
      >
        {loading ? (
          <div className='space-y-3'>
            <Loader2 size={24} className='animate-spin text-g-600 mx-auto' />
            <p className='text-sm text-g-600'>
              Scanning rows… {progress.current}/{progress.max}
            </p>
            {progress.max > 0 && (
              <div className='h-1.5 bg-g-950 rounded-full overflow-hidden max-w-xs mx-auto'>
                <div
                  className='h-full bg-g-600 rounded-full transition-all duration-300'
                  style={{ width: `${(progress.current / progress.max) * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <UploadCloud size={26} className='mx-auto mb-2 text-g-800' />
            <p className='text-sm text-g-700 mb-1'>
              {done ? 'Upload a different file' : 'Click or drop an Excel file (.xlsx)'}
            </p>
            <p className='text-xs text-g-900 font-mono'>Columns: "Wallet" and "Amount"</p>
          </>
        )}
        <input
          ref={fileRef}
          type='file'
          accept='.xlsx,.xls'
          className='hidden'
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Status */}
      {status && (
        <div
          className={clsx(
            'rounded-xl px-4 py-3 text-sm flex items-start gap-2',
            status.type === 'success' && 'bg-g-950/60 border border-g-900/60 text-g-400',
            status.type === 'warn' && 'bg-yellow-950/40 border border-yellow-900/40 text-yellow-400',
            status.type === 'error' && 'bg-red-950/40 border border-red-900/40 text-red-400',
            status.type === 'info' && 'bg-ink-950/60 border border-g-950 text-g-600'
          )}
        >
          {status.type === 'warn' && <AlertTriangle size={15} className='shrink-0 mt-0.5' />}
          {status.type === 'success' && <CheckCircle2 size={15} className='shrink-0 mt-0.5' />}
          {status.msg}
        </div>
      )}

      {/* Errors table */}
      {errors.length > 0 && (
        <div className='card overflow-hidden'>
          <button
            className='w-full flex items-center justify-between px-4 py-3 text-sm text-g-600 hover:text-g-400'
            onClick={() => setShowErrors((v) => !v)}
          >
            <span>{errors.length} row error{errors.length !== 1 ? 's' : ''}</span>
            {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showErrors && (
            <div className='border-t border-g-950/60 divide-y divide-g-950/40 max-h-48 overflow-y-auto'>
              {errors.map((e, i) => (
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
  )
}

// ─── Payout Panel ─────────────────────────────────────────────────────────────

function PayoutPanel({
  settings,
  recipients,
  lovelaces,
}: {
  settings: AirdropSettings
  recipients: PayoutRecipient[]
  lovelaces: number
}) {
  const { wallet } = useWallet()
  const stakeKey = useRewardAddress()
  const { tokens } = useWalletStore()

  const [started, setStarted] = useState(false)
  const [ended, setEnded] = useState(false)
  const [status, setStatus] = useState<StatusMsg | null>(null)
  const [progress, setProgress] = useState({ current: 0, max: 0 })
  const [processed, setProcessed] = useState<PayoutRecipient[]>([])
  const devPayed = useRef(false)

  const isLovelace = settings.tokenId === 'lovelace'
  const ticker = settings.tokenName.ticker || settings.tokenName.display || settings.tokenName.onChain

  const devFee = useMemo(
    () => formatTokenAmountToChain(Math.max(MIN_ADA_PER_WALLET, recipients.length * 0.25), ADA.DECIMALS),
    [recipients]
  )

  // Pre-flight checks
  const preflightStatus = useMemo<StatusMsg | null>(() => {
    if (!lovelaces || !recipients.length) return null

    const { isError: balanceErr, missingBalance } = verifyMinRequiredBalance(recipients, tokens, settings.tokenId)
    if (balanceErr) {
      return {
        type: 'error',
        msg: `Insufficient token balance — need ${prettyNumber(formatTokenAmountFromChain(missingBalance, settings.tokenAmount.decimals))} more ${getTokenName(settings.tokenName)}`,
      }
    }

    const { isError: adaErr, missingAda } = verifyMinRequiredAda(recipients, lovelaces, isLovelace)
    const devFeeAda = formatTokenAmountFromChain(devFee, ADA.DECIMALS)

    if (adaErr) {
      return {
        type: 'error',
        msg: `Insufficient ADA — need ₳${prettyNumber(missingAda + devFeeAda)} more`,
      }
    }

    return { type: 'success', msg: `Preflight OK — ready to airdrop` }
  }, [lovelaces, recipients, tokens, settings, isLovelace, devFee])

  const runPayout = useCallback(
    async (batchSize: number = 0, prevDifference?: number): Promise<void> => {
      if (!wallet) return
      setStarted(true)
      setStatus({ type: 'info', msg: 'Building transactions…' })

      const unpayed = (processed.length ? processed : recipients).filter(({ txHash }) => !txHash)
      if (!batchSize) batchSize = Math.min(unpayed.length, isLovelace ? 200 : 50)

      const batches: PayoutRecipient[][] = chunk(unpayed, batchSize)

      if (!devPayed.current && batches.length) {
        batches[0].unshift({
          stakeKey: WALLETS.STAKE_KEYS.DEV,
          address: WALLETS.ADDRESSES.DEV,
          payout: devFee,
          isDev: true,
        } as PayoutRecipient & { isDev: boolean })
      }

      setProgress({ current: 0, max: batches.length })
      setStatus({ type: 'info', msg: `Batching ${batches.length} transaction${batches.length !== 1 ? 's' : ''}…` })

      try {
        let localProcessed = processed.length ? [...processed] : [...recipients]

        for (const batch of batches) {
          const tx = new Transaction({ initiator: wallet })

          for (const { address, payout, isDev } of batch as (PayoutRecipient & { isDev?: boolean })[]) {
            if (isLovelace || isDev) {
              if (payout >= MIN_LOVELACES_PER_WALLET) {
                tx.sendLovelace({ address }, String(payout))
              }
            } else {
              tx.sendAssets({ address }, [{ unit: settings.tokenId, quantity: String(payout) }])
            }
          }

          const unsigned = await tx.build()
          const signed = await wallet.signTx(unsigned)
          const txHash = await wallet.submitTx(signed)

          if (!devPayed.current) devPayed.current = true
          setStatus({ type: 'info', msg: `Awaiting confirmation: ${txHash}` })
          await txConfirmation(txHash)

          localProcessed = localProcessed.map((item) =>
            batch.some(({ stakeKey: sk }) => sk === item.stakeKey) ? { ...item, txHash } : item
          )
          setProcessed([...localProcessed])
          setProgress((p) => ({ current: p.current + 1, max: batches.length }))

          // Save history
          const hist = JSON.parse(localStorage.getItem('fp_history') || '[]')
          hist.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            tokenId: settings.tokenId,
            tokenName: settings.tokenName,
            recipientCount: recipients.length,
            txHash,
          })
          localStorage.setItem('fp_history', JSON.stringify(hist.slice(0, 100)))
        }

        setStatus({ type: 'success', msg: 'Airdrop complete! 🐸' })
        setStarted(false)
        setEnded(true)

        api.notify('✅ Payout ended', `${stakeKey}\n${prettyNumber(settings.tokenAmount.display)} ${getTokenName(settings.tokenName)}`).catch(() => {})
      } catch (error: unknown) {
        const errMsg = extractError(error).message

        if (errMsg.indexOf('Maximum transaction size of') !== -1) {
          const nums = errMsg.split(' ').map((s: string) => Number(s.replace(/[^\d]/g, ''))).filter((n: number) => n && !isNaN(n))
          const [max, curr] = nums
          const newDiff = (prevDifference || 1) * (max / curr)
          return await runPayout(Math.floor(newDiff * unpayed.length), newDiff)
        } else if (batchSize > 1) {
          return await runPayout(batchSize - 1)
        } else {
          setStatus({ type: 'error', msg: errMsg })
          setProgress({ current: 0, max: 0 })
          setStarted(false)
        }
      }
    },
    [wallet, processed, recipients, isLovelace, devFee, settings, stakeKey]
  )

  const downloadReceipt = useCallback(() => {
    const wb = utils.book_new()
    const ws = utils.json_to_sheet(
      processed.map((item) => ({
        amount: formatTokenAmountFromChain(item.payout, settings.tokenAmount.decimals),
        token: ticker,
        address: item.address,
        stakeKey: item.stakeKey,
        txHash: item.txHash,
      })),
      { header: ['amount', 'token', 'address', 'stakeKey', 'txHash'] }
    )
    ws['!cols'] = [{ width: 18 }, { width: 12 }, { width: 100 }, { width: 70 }, { width: 70 }]
    utils.book_append_sheet(wb, ws, 'receipt')
    writeFileXLSX(wb, `Frogs Parachute receipt (${new Date().toLocaleDateString()}).xlsx`)
  }, [processed, settings, ticker])

  const displayRecipients = processed.length ? processed : recipients

  const totalAmount = useMemo(() => {
    const sum = displayRecipients.reduce((p, c) => p + c.payout, 0)
    const display = prettyNumber(formatTokenAmountFromChain(sum, settings.tokenAmount.decimals))
    return ticker === 'ADA' ? `₳${display}` : `${display} ${ticker}`
  }, [displayRecipients, settings, ticker])

  if (!recipients.length) return null

  return (
    <div className='card p-6 space-y-5 animate-slide-up'>
      {/* Header summary */}
      <div className='flex items-start justify-between gap-4'>
        <div>
          <p className='section-label'>Airdrop Summary</p>
          <p className='font-display text-2xl text-g-300'>{totalAmount}</p>
          <p className='text-xs text-g-700 mt-0.5'>
            to {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
            {' · '}
            <span className='text-g-800'>
              ₳{prettyNumber(formatTokenAmountFromChain(devFee, ADA.DECIMALS))} service fee
            </span>
          </p>
        </div>

        {ended ? (
          <button onClick={downloadReceipt} className='btn-ghost flex items-center gap-1.5 text-xs'>
            <Download size={13} />
            Receipt
          </button>
        ) : (
          <button
            onClick={() => runPayout(0)}
            disabled={started || !preflightStatus || preflightStatus.type === 'error'}
            className='btn-primary text-sm py-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed'
          >
            {started ? (
              <><Loader2 size={14} className='animate-spin' /> Sending…</>
            ) : (
              'Build TXs 🪂'
            )}
          </button>
        )}
      </div>

      {/* Preflight */}
      {preflightStatus && (
        <div
          className={clsx(
            'rounded-xl px-4 py-3 text-xs flex items-center gap-2',
            preflightStatus.type === 'success' && 'bg-g-950/50 border border-g-900/50 text-g-500',
            preflightStatus.type === 'error' && 'bg-red-950/40 border border-red-900/40 text-red-400'
          )}
        >
          {preflightStatus.type === 'success' && <CheckCircle2 size={13} />}
          {preflightStatus.type === 'error' && <AlertTriangle size={13} />}
          {preflightStatus.msg}
        </div>
      )}

      {/* Current status */}
      {status && (
        <div
          className={clsx(
            'rounded-xl px-4 py-3 text-xs',
            status.type === 'success' && 'bg-g-950/50 border border-g-900/50 text-g-400',
            status.type === 'error' && 'bg-red-950/40 border border-red-900/40 text-red-400',
            status.type === 'info' && 'bg-ink-950/60 border border-g-950 text-g-600 font-mono',
            status.type === 'warn' && 'bg-yellow-950/30 border border-yellow-900/30 text-yellow-500'
          )}
        >
          {status.msg}
        </div>
      )}

      {/* Progress bar */}
      {progress.max > 0 && (
        <div>
          <div className='flex justify-between text-xs text-g-800 mb-1.5'>
            <span>TX Batches</span>
            <span>{progress.current}/{progress.max}</span>
          </div>
          <div className='h-1.5 bg-g-950 rounded-full overflow-hidden'>
            <div
              className='h-full rounded-full transition-all duration-500'
              style={{
                width: `${progress.max ? (progress.current / progress.max) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #15803d, #22c55e)',
              }}
            />
          </div>
        </div>
      )}

      {/* Recipients table */}
      <div className='card overflow-hidden'>
        <div className='px-4 py-2.5 border-b border-g-950/60 flex gap-3 text-xs text-g-800 uppercase tracking-wider'>
          <span className='w-5' />
          <span className='flex-1'>Amount</span>
          <span className='flex-1'>Stake Key</span>
          <span className='flex-1 hidden sm:block'>TX Hash</span>
        </div>
        <div className='max-h-72 overflow-y-auto divide-y divide-g-950/40'>
          {displayRecipients
            .sort((a, b) => (!!a.txHash ? 1 : -1) - (!!b.txHash ? 1 : -1) || b.payout - a.payout)
            .map((r, i) => {
              const paid = !!r.txHash
              const underMin = isLovelace && r.payout < MIN_LOVELACES_PER_WALLET
              return (
                <div key={i} className='trow text-xs'>
                  <span className={clsx('dot', paid ? 'dot-ok' : underMin ? 'dot-err' : 'dot-idle')} />
                  <span className='flex-1 font-mono text-g-500'>
                    {prettyNumber(formatTokenAmountFromChain(r.payout, settings.tokenAmount.decimals))} {ticker}
                  </span>
                  <span className='flex-1 font-mono text-g-700'>{truncateStringInMiddle(r.stakeKey, 6)}</span>
                  <span className='flex-1 hidden sm:block'>
                    {r.txHash ? (
                      <a
                        href={`https://cardanoscan.io/transaction/${r.txHash}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='flex items-center gap-1 text-g-500 hover:text-g-300 font-mono'
                      >
                        {truncateStringInMiddle(r.txHash, 5)}
                        <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span className='text-g-900'>—</span>
                    )}
                  </span>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}

// ─── Recipient source tabs ───────────────────────────────────────────────────

type AirdropMode = 'list' | 'holders' | 'delegators'

const MODES: { id: AirdropMode; label: string; icon: typeof UploadCloud }[] = [
  { id: 'list', label: 'Upload Recipient List', icon: UploadCloud },
  { id: 'holders', label: 'Airdrop to NFT holders', icon: Images },
  { id: 'delegators', label: 'Airdrop to delegators', icon: Users },
]

function ModeTabs({ mode, onChange }: { mode: AirdropMode; onChange: (m: AirdropMode) => void }) {
  return (
    <div className='grid sm:grid-cols-3 gap-2 mb-5' role='tablist'>
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role='tab'
          aria-selected={mode === id}
          onClick={() => onChange(id)}
          className={clsx(
            'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all duration-150',
            mode === id
              ? 'border-g-600/60 bg-g-950/60 text-g-300'
              : 'border-g-950 hover:border-g-900 hover:bg-g-950/30 text-g-700'
          )}
        >
          <Icon size={15} className='shrink-0' />
          <span className='truncate'>{label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AirdropPage() {
  const { connected } = useWallet()
  const lovelaceStr = useLovelace()
  const lovelaces = Number(lovelaceStr || '0')
  const { tokens, isFetching } = useConnectedWallet()

  const [settings, setSettings] = useState<AirdropSettings>({ ...INIT_AIRDROP_SETTINGS })
  const [recipients, setRecipients] = useState<PayoutRecipient[]>([])
  const [mode, setMode] = useState<AirdropMode>('list')

  const tokenSelected = !!settings.tokenId
  const balanceOnChain = tokens.find((t) => t.tokenId === settings.tokenId)?.tokenAmount.onChain ?? 0

  const handleModeChange = (m: AirdropMode) => {
    if (m === mode) return
    setMode(m)
    setRecipients([])
  }

  const handleSelectToken = (t: PopulatedToken) => {
    setSettings((prev) => ({
      ...prev,
      tokenId: prev.tokenId === t.tokenId ? '' : t.tokenId,
      tokenName: t.tokenName,
      tokenAmount: { onChain: 0, display: 0, decimals: t.tokenAmount.decimals },
      thumb: t.image?.ipfs || t.image?.url || '',
    }))
    setRecipients([])
  }

  if (!connected) {
    return (
      <div className='max-w-lg mx-auto px-4 py-24 text-center'>
        <span className='text-6xl block mb-6 animate-hop'>🐸</span>
        <h1 className='font-display text-4xl text-g-400 mb-3'>Connect to start</h1>
        <p className='text-g-700 text-sm'>
          Connect your Nami, Eternl, or Lace wallet using the button in the top-right corner.
        </p>
      </div>
    )
  }

  return (
    <div className='max-w-5xl mx-auto px-4 py-12'>
      <div className='mb-10'>
        <h1 className='font-display text-5xl text-g-400 mb-1'>🪂 New Airdrop</h1>
        <p className='text-g-700 text-sm'>Select a token, upload your list, sign and broadcast.</p>
      </div>

      <div className='grid lg:grid-cols-5 gap-6'>
        {/* Left: token + file */}
        <div className='lg:col-span-3 space-y-6'>
          {/* Step 1: Token */}
          <div className='card p-6'>
            <p className='section-label'>Step 1 — Choose Token</p>
            <TokenSelector
              tokens={tokens}
              isFetching={isFetching}
              selected={settings}
              onSelect={handleSelectToken}
            />
          </div>

          {/* Step 2: File */}
          {tokenSelected && (
            <div className='card p-6 animate-slide-up'>
              <p className='section-label'>Step 2 — Choose Recipients</p>
              <ModeTabs mode={mode} onChange={handleModeChange} />
              {/* key = reset the step whenever the mode or token changes */}
              {mode === 'list' ? (
                <FileUpload key={`list-${settings.tokenId}`} settings={settings} onRecipients={setRecipients} />
              ) : (
                <SnapshotSource
                  key={`${mode}-${settings.tokenId}`}
                  mode={mode}
                  settings={settings}
                  balanceOnChain={balanceOnChain}
                  onRecipients={setRecipients}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: payout */}
        <div className='lg:col-span-2 space-y-4'>
          {tokenSelected && recipients.length > 0 && (
            <PayoutPanel settings={settings} recipients={recipients} lovelaces={lovelaces} />
          )}

          {/* Help card */}
          {(!tokenSelected || recipients.length === 0) && (
            <div className='card p-5 text-sm text-g-800 space-y-3'>
              {mode === 'list' || !tokenSelected ? (
                <>
                  <p className='section-label'>Excel file format</p>
                  <div className='font-mono text-xs bg-ink-950 rounded-xl p-3 space-y-1 text-g-700'>
                    <p className='text-g-500'>Wallet, Amount</p>
                    <p>addr1q9ew..., 10</p>
                    <p>stake1ux..., 420.69</p>
                    <p>$yourhandle, 5</p>
                  </div>
                  <p className='text-xs text-g-900'>
                    Supports addr1…, stake1…, and $ada-handles as wallet identifiers.
                  </p>
                </>
              ) : (
                <>
                  <p className='section-label'>{mode === 'holders' ? 'NFT holder snapshot' : 'Delegator snapshot'}</p>
                  <p className='text-xs text-g-700'>
                    {mode === 'holders'
                      ? 'We read every holder of the collection from the chain and split your amount by how many NFTs each wallet holds.'
                      : 'We read every delegator of the pool from the chain and split your amount by how much ADA each wallet has delegated.'}
                  </p>
                  <p className='text-xs text-g-900'>Run the snapshot to see the recipients here.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
