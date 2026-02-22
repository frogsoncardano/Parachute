'use client'

import { useState, useEffect } from 'react'
import { useWallet, useWalletList, useAddress } from '@meshsdk/react'
import { extractError, truncateStringInMiddle } from '@/functions'
import { Wallet, ChevronDown, LogOut, Copy, Check, ExternalLink } from 'lucide-react'
import clsx from 'clsx'

const SUPPORTED = ['eternl', 'nami', 'lace']

export function WalletButton() {
  const { connected, connecting, connect, disconnect, name, error } = useWallet()
  const installedWallets = useWalletList()
  const address = useAddress()

  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [connectErr, setConnectErr] = useState('')

  const supportedInstalled = installedWallets.filter((w) => SUPPORTED.includes(w.id))

  const handleConnect = async (id: string) => {
    try {
      setConnectErr('')
      await connect(id)
      setOpen(false)
    } catch (e) {
      setConnectErr(extractError(e).message)
    }
  }

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  // close on outside click
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  if (connected && address) {
    return (
      <div className='relative' onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setOpen((v) => !v)}
          className='card flex items-center gap-2 px-3 py-1.5 text-sm hover:border-g-700/50 transition-all'
        >
          <span className='dot dot-ok' />
          <span className='font-mono text-xs text-g-500 hidden sm:inline'>
            {truncateStringInMiddle(address, 7)}
          </span>
          <ChevronDown
            size={13}
            className={clsx('text-g-700 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className='absolute right-0 top-full mt-2 w-60 card p-2 shadow-2xl animate-fall-in'>
            <div className='px-3 py-2'>
              <p className='section-label'>Connected via {name}</p>
              <div className='flex items-center gap-2'>
                <p className='font-mono text-xs text-g-500 truncate flex-1'>
                  {truncateStringInMiddle(address, 9)}
                </p>
                <button
                  onClick={handleCopy}
                  className='text-g-700 hover:text-g-400 transition-colors'
                >
                  {copied ? <Check size={12} className='text-g-500' /> : <Copy size={12} />}
                </button>
                <a
                  href={`https://cardanoscan.io/address/${address}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-g-700 hover:text-g-400 transition-colors'
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
            <div className='h-px bg-g-950 mx-2 my-1' />
            <button
              onClick={() => { disconnect(); setOpen(false) }}
              className='w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-950/30 rounded-xl transition-colors'
            >
              <LogOut size={13} />
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className='relative' onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={connecting}
        className='btn-primary text-sm py-2 px-4'
      >
        <Wallet size={14} />
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {open && (
        <div className='absolute right-0 top-full mt-2 w-56 card p-2 shadow-2xl animate-fall-in'>
          <p className='section-label px-3 pt-2'>Select wallet</p>
          {connectErr && (
            <p className='text-xs text-red-400 px-3 pb-2'>{connectErr}</p>
          )}
          {supportedInstalled.length === 0 ? (
            <div className='px-3 py-3 text-sm text-g-700'>
              No supported wallets found.
              <br />
              <span className='text-xs'>Install Nami, Eternl, or Lace.</span>
            </div>
          ) : (
            supportedInstalled.map((w) => (
              <button
                key={w.id}
                onClick={() => handleConnect(w.id)}
                className='w-full flex items-center gap-3 px-3 py-2.5 text-sm text-g-400 hover:bg-g-950/50 rounded-xl transition-colors'
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt={w.name} className='w-5 h-5 rounded' />
                <span className='capitalize'>{w.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
