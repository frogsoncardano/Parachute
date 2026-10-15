'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRewardAddress } from '@meshsdk/react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import clsx from 'clsx'

import { MIN_LOVELACES_PER_WALLET } from '@/constants'
import { normalizePolicyId, normalizePoolId } from '@/functions/cardanoIds'
import { formatTokenAmountFromChain, formatTokenAmountToChain, getTokenName, prettyNumber } from '@/functions'
import { runSnapshot } from '@/containers/new-airdrop/helpers/run-snapshot'
import { AirdropMethodType } from '@/@types'
import type { AirdropSettings, PayoutRecipient, SnapshotProgressCounts } from '@/@types'

export type SnapshotMode = 'holders' | 'delegators'

interface StatusMsg {
  type: 'info' | 'warn' | 'error' | 'success'
  msg: string
}

interface SnapshotSourceProps {
  mode: SnapshotMode
  settings: AirdropSettings
  balanceOnChain: number
  onRecipients: (recipients: PayoutRecipient[]) => void
}

// Accepts "1000.5" and "1000,5" (single comma = decimal separator), strips thousands separators.
const parseAmount = (raw: string): number => {
  const s = raw.trim()
  const normalized = s.includes(',') && !s.includes('.') && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export default function SnapshotSource({ mode, settings, balanceOnChain, onRecipients }: SnapshotSourceProps) {
  const stakeKey = useRewardAddress() || ''
  const isHolders = mode === 'holders'
  const isLovelace = settings.tokenId === 'lovelace'
  const decimals = settings.tokenAmount.decimals
  const ticker = getTokenName(settings.tokenName)

  const [idInput, setIdInput] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [status, setStatus] = useState<StatusMsg | null>(null)
  const [progress, setProgress] = useState<SnapshotProgressCounts>({})

  // The snapshot can't be cancelled, so ignore its result if the user left (changed tab / token) meanwhile.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const id = useMemo(() => (isHolders ? normalizePolicyId(idInput) : normalizePoolId(idInput)), [idInput, isHolders])
  const amount = useMemo(() => parseAmount(amountInput), [amountInput])
  const amountOnChain = useMemo(() => Math.round(formatTokenAmountToChain(amount, decimals, false)), [amount, decimals])

  const idError = idInput.trim() && !id ? (isHolders ? 'Policy ID must be 56 hex characters' : 'Pool ID must be "pool1…" or 56 hex characters') : ''
  const amountError = amountInput.trim() && !amount ? 'Enter an amount greater than 0' : amountOnChain > balanceOnChain ? 'Amount is higher than your balance' : ''

  const canRun = !!id && amountOnChain > 0 && amountOnChain <= balanceOnChain && !loading

  // Editing the form after a finished snapshot invalidates it.
  const invalidate = () => {
    if (done) {
      setDone(false)
      setStatus(null)
      onRecipients([])
    }
  }

  const run = async () => {
    if (!id || !amountOnChain) return

    setLoading(true)
    setDone(false)
    setProgress({})
    onRecipients([])
    setStatus({ type: 'info', msg: isHolders ? 'Collecting NFT holders…' : 'Collecting delegators…' })

    const snapshotSettings: AirdropSettings = {
      ...settings,
      airdropMethod: isHolders ? AirdropMethodType.HolderSnapshot : AirdropMethodType.DelegatorSnapshot,
      tokenAmount: { onChain: amountOnChain, display: amount, decimals },
      policies: isHolders
        ? [
            {
              policyId: id,
              weight: 1,
              withTraits: false,
              traitOptions: [],
              withRanks: false,
              rankOptions: [],
              withWhales: false,
              whaleOptions: [],
            },
          ]
        : [],
      stakePools: isHolders ? [] : [id],
      blacklistWallets: [],
      blacklistTokens: [],
    }

    try {
      const result = await runSnapshot(stakeKey, snapshotSettings, setProgress)
      if (!alive.current) return

      // Cardano needs >= 1 ADA per output, the payout step would silently skip anything smaller.
      const eligible = result.filter((r) => !!r.address && !!r.stakeKey && r.payout > 0 && (!isLovelace || r.payout >= MIN_LOVELACES_PER_WALLET))
      const skipped = result.length - eligible.length

      if (!eligible.length) {
        setStatus({
          type: 'warn',
          msg: isHolders
            ? 'No eligible holders found for this policy (script wallets and wallets without a stake key are excluded).'
            : 'No eligible delegators found for this pool and amount.',
        })
        return
      }

      onRecipients(eligible)
      setDone(true)
      setStatus({
        type: 'success',
        msg:
          `${prettyNumber(eligible.length)} recipients ready` +
          (skipped ? ` · ${prettyNumber(skipped)} skipped (share below 1 ADA)` : '') +
          `. Total: ${prettyNumber(formatTokenAmountFromChain(eligible.reduce((p, c) => p + c.payout, 0), decimals))} ${ticker}`,
      })
    } catch (e: unknown) {
      if (!alive.current) return
      // our API client rejects with plain strings (see retryAsync), not Error objects
      const msg = typeof e === 'string' ? e : (e as Error)?.message || 'Unknown error'
      setStatus({ type: 'error', msg })
    } finally {
      if (alive.current) setLoading(false)
    }
  }

  const progressCounts = isHolders ? progress.token : progress.delegator
  const progressLabel = isHolders ? 'Scanning NFTs' : 'Resolving delegators'
  const progressPct = progressCounts?.max ? Math.min(100, (progressCounts.current / progressCounts.max) * 100) : 0

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label className='text-xs text-g-600' htmlFor='snapshot-id'>
          {isHolders ? 'Collection policy ID' : 'Stake pool ID'}
        </label>
        <input
          id='snapshot-id'
          className={clsx('field font-mono', idError && 'border-red-900/60')}
          placeholder={isHolders ? '3cf8489b12ded9346708bed263307b362ce813636f92bddfd46e02ec' : 'pool1… or a54db65c3594c5e0ddd8ff5e5e30409c…'}
          value={idInput}
          disabled={loading}
          spellCheck={false}
          autoComplete='off'
          onChange={(e) => {
            setIdInput(e.target.value)
            invalidate()
          }}
        />
        {idError && <p className='text-xs text-red-400'>{idError}</p>}
      </div>

      <div className='space-y-1.5'>
        <label className='text-xs text-g-600' htmlFor='snapshot-amount'>
          Total amount to airdrop
        </label>
        <div className='relative'>
          <input
            id='snapshot-amount'
            className={clsx('field pr-20', amountError && 'border-red-900/60')}
            placeholder='0'
            inputMode='decimal'
            value={amountInput}
            disabled={loading}
            autoComplete='off'
            onChange={(e) => {
              setAmountInput(e.target.value)
              invalidate()
            }}
          />
          <span className='absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-g-700 pointer-events-none max-w-[4.5rem] truncate'>{ticker}</span>
        </div>
        <p className='text-xs text-g-800'>
          Balance: {prettyNumber(formatTokenAmountFromChain(balanceOnChain, decimals))} {ticker}
          {' · '}
          {isHolders ? 'split proportionally by the number of NFTs each wallet holds' : 'split proportionally by the ADA each wallet has delegated'}
        </p>
        {amountError && <p className='text-xs text-red-400'>{amountError}</p>}
      </div>

      <p className='text-xs text-g-800'>
        {isHolders
          ? 'Script wallets (marketplaces, etc.) and wallets without a stake key are excluded. '
          : 'Large pools and collections can take a few minutes, keep this tab open. '}
        {isLovelace && 'Shares below 1 ADA are skipped.'}
      </p>

      <button onClick={run} disabled={!canRun} className='btn-primary text-sm py-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed'>
        {loading ? (
          <>
            <Loader2 size={14} className='animate-spin' /> Running snapshot…
          </>
        ) : done ? (
          'Re-run snapshot'
        ) : (
          'Run snapshot 📸'
        )}
      </button>

      {loading && (
        <div>
          <div className='flex justify-between text-xs text-g-800 mb-1.5'>
            <span>{progressCounts?.max ? progressLabel : 'Fetching data…'}</span>
            {!!progressCounts?.max && (
              <span>
                {prettyNumber(progressCounts.current)}/{prettyNumber(progressCounts.max)}
              </span>
            )}
          </div>
          <div className='h-1.5 bg-g-950 rounded-full overflow-hidden'>
            <div
              className='h-full rounded-full transition-all duration-300'
              style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #15803d, #22c55e)' }}
            />
          </div>
        </div>
      )}

      {status && !loading && (
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
    </div>
  )
}
