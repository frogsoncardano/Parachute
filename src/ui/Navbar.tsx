'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WalletButton } from './WalletButton'
import clsx from 'clsx'

const links = [
  { href: '/', label: 'Home' },
  { href: '/airdrop', label: 'Airdrop' },
  { href: '/history', label: 'History' },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <nav className='sticky top-0 z-50 border-b border-g-950/80 bg-ink-950/85 backdrop-blur-xl'>
      <div className='max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4'>
        {/* Logo */}
        <Link href='/' className='flex items-center gap-2.5 group shrink-0'>
          <span className='text-2xl animate-hop inline-block'>🐸</span>
          <span className='font-display text-xl text-g-400 tracking-wide group-hover:text-g-300 transition-colors'>
            Frogs Parachute
          </span>
        </Link>

        {/* Nav links */}
        <div className='hidden sm:flex items-center gap-0.5'>
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm transition-all duration-150 font-body',
                pathname === href
                  ? 'text-g-300 bg-g-950/70 border border-g-800/50'
                  : 'text-g-800 hover:text-g-500'
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Wallet */}
        <WalletButton />
      </div>
    </nav>
  )
}
