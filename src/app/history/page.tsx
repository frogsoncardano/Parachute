'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Trash2, Clock, Users } from 'lucide-react'
import { getTokenName, truncateStringInMiddle } from '@/functions'
import type { TokenName } from '@/@types'

interface HistoryEntry {
  id: number
  timestamp: string
  tokenId: string
  tokenName: TokenName
  recipientCount: number
  txHash: string
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('fp_history')
      setHistory(raw ? JSON.parse(raw) : [])
    } catch {
      setHistory([])
    }
    setLoaded(true)
  }, [])

  const remove = (id: number) => {
    const updated = history.filter((h) => h.id !== id)
    setHistory(updated)
    localStorage.setItem('fp_history', JSON.stringify(updated))
  }

  const clearAll = () => {
    localStorage.removeItem('fp_history')
    setHistory([])
  }

  if (!loaded) {
    return (
      <div className='max-w-4xl mx-auto px-4 py-20 text-center'>
        <span className='text-4xl animate-hop inline-block'>🐸</span>
        <p className='text-g-700 mt-4 text-sm'>Loading…</p>
      </div>
    )
  }

  // Group by airdrop session (same id)
  const sessions = history.reduce<Record<number, HistoryEntry[]>>((acc, e) => {
    acc[e.id] = acc[e.id] || []
    acc[e.id].push(e)
    return acc
  }, {})

  // De-dup by id, keeping one entry per session (first tx)
  const uniqueSessions = Object.values(sessions).map((entries) => ({
    ...entries[0],
    txHashes: entries.map((e) => e.txHash),
  }))

  return (
    <div className='max-w-4xl mx-auto px-4 py-12'>
      <div className='flex items-start justify-between mb-10'>
        <div>
          <h1 className='font-display text-5xl text-g-400 mb-1'>📋 History</h1>
          <p className='text-g-700 text-sm'>Past airdrops, stored locally in your browser.</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearAll}
            className='text-xs text-red-500/50 hover:text-red-400 transition-colors flex items-center gap-1 mt-2'
          >
            <Trash2 size={11} /> Clear all
          </button>
        )}
      </div>

      {uniqueSessions.length === 0 ? (
        <div className='card rounded-3xl p-16 text-center'>
          <span className='text-6xl block mb-4 animate-hop'>🪂</span>
          <h2 className='font-display text-3xl text-g-700 mb-2'>No airdrops yet</h2>
          <p className='text-g-800 text-sm mb-6'>
            Your airdrop history will appear here after your first drop.
          </p>
          <Link href='/airdrop' className='btn-primary'>
            Start your first airdrop
          </Link>
        </div>
      ) : (
        <div className='space-y-3'>
          {uniqueSessions.map((session) => {
            const name = getTokenName(session.tokenName)
            const isAda = session.tokenId === 'lovelace'

            return (
              <div key={session.id} className='card card-hover p-5 transition-all'>
                <div className='flex items-start justify-between gap-4'>
                  <div className='flex items-start gap-3'>
                    <span className='text-2xl mt-0.5'>{isAda ? '₳' : '🪙'}</span>
                    <div>
                      <div className='flex items-center gap-2 flex-wrap mb-1.5'>
                        <span className='badge'>{name}</span>
                        <span className='flex items-center gap-1 text-xs text-g-700'>
                          <Users size={11} /> {session.recipientCount} recipients
                        </span>
                        <span className='text-xs text-g-800'>
                          {session.txHashes.length} tx{session.txHashes.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {!isAda && session.tokenId && (
                        <p className='font-mono text-xs text-g-900 mb-2 truncate max-w-xs'>
                          {truncateStringInMiddle(session.tokenId, 12)}
                        </p>
                      )}

                      <div className='space-y-1'>
                        {session.txHashes.map((hash: string, i: number) => (
                          <a
                            key={hash}
                            href={`https://cardanoscan.io/transaction/${hash}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='flex items-center gap-1.5 text-xs text-g-600 hover:text-g-400 font-mono transition-colors'
                          >
                            <ExternalLink size={10} />
                            TX {i + 1}: {hash.slice(0, 20)}…{hash.slice(-8)}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className='flex flex-col items-end gap-2 shrink-0'>
                    <span className='flex items-center gap-1 text-xs text-g-800'>
                      <Clock size={10} />
                      {new Date(session.timestamp).toLocaleDateString()}{' '}
                      {new Date(session.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      onClick={() => remove(session.id)}
                      className='text-g-900 hover:text-red-400 transition-colors'
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
