'use client'

import Link from 'next/link'
import { ArrowRight, Shield, Zap, FileSpreadsheet, Layers } from 'lucide-react'

const features = [
  {
    icon: <Zap size={20} />,
    title: 'Auto-Batching',
    desc: 'Transactions are automatically sized and batched. If a TX is too big, the batch size shrinks and retries — just like the original ada-drop.',
  },
  {
    icon: <Layers size={20} />,
    title: 'ADA & Tokens',
    desc: 'Drop native ADA (lovelace) or any fungible Cardano token. Pick from your connected wallet balance.',
  },
  {
    icon: <FileSpreadsheet size={20} />,
    title: 'Excel Upload',
    desc: 'Upload an .xlsx file with "Wallet" and "Amount" columns. Handles addr1, stake1, and $handles.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Non-Custodial',
    desc: 'You sign every transaction in your wallet. The app never touches your keys or holds your funds.',
  },
]

export default function HomePage() {
  return (
    <div className='max-w-5xl mx-auto px-4'>
      {/* Hero */}
      <section className='pt-20 pb-16 text-center'>
        <div className='relative inline-block mb-6'>
          <span className='text-8xl animate-hop block drop-shadow-[0_0_40px_rgba(34,197,94,0.25)]'>
            🐸
          </span>
          <span className='absolute -top-4 left-1/2 -translate-x-1/2 text-4xl animate-sway block'>
            🪂
          </span>
        </div>

        <h1 className='font-display text-6xl md:text-7xl text-g-400 tracking-wide mb-4'>
          Adachute
        </h1>
        <p className='text-g-600 text-lg mb-2 max-w-lg mx-auto'>
          The smoothest airdrop experience on {' '}
          <span className='text-g-400'>Cardano.</span>
        </p>
        <p className='font-mono text-xs text-g-800 mb-10'>
          Battle-tested tx engine · Supports addr1, stake1, $handles · Auto-retry on TX size errors
        </p>

        <div className='flex flex-col sm:flex-row gap-3 justify-center'>
          <Link href='/airdrop' className='btn-primary text-base py-3 px-8'>
            Launch Airdrop
            <ArrowRight size={17} />
          </Link>
          <Link href='/history' className='btn-ghost py-3 px-6'>
            Past Airdrops
          </Link>
        </div>

        {/* Stat pills */}
        <div className='mt-14 flex flex-wrap gap-3 justify-center'>
          {[
            { label: 'TX auto-resize', val: '✓' },
            { label: 'Min ADA checks', val: '✓' },
            { label: 'Receipt download', val: '✓' },
            { label: 'Cardano mainnet', val: '✓' },
          ].map(({ label, val }) => (
            <div key={label} className='badge text-sm py-1.5 px-3'>
              <span className='text-g-500'>{val}</span>
              <span className='text-g-700'>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className='flex justify-center mb-16'>
        <div className='w-48 h-px bg-gradient-to-r from-transparent via-g-900 to-transparent' />
      </div>

      {/* Features */}
      <section className='pb-20'>
        <h2 className='font-display text-3xl text-g-600 text-center mb-10'>
          Why Adachute?
        </h2>
        <div className='grid sm:grid-cols-2 gap-4'>
          {features.map(({ icon, title, desc }) => (
            <div key={title} className='card card-hover p-6 flex gap-4'>
              <div className='text-g-500 mt-0.5 shrink-0'>{icon}</div>
              <div>
                <h3 className='font-display text-lg text-g-300 mb-1'>{title}</h3>
                <p className='text-sm text-g-700 leading-relaxed'>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className='pb-24 max-w-2xl mx-auto'>
        <h2 className='font-display text-3xl text-g-600 text-center mb-10'>How it works</h2>
        <div className='space-y-5'>
          {[
            {
              n: '01',
              title: 'Connect your wallet',
              desc: 'Connect Nami, Eternl, or Lace. Your token balances load automatically.',
            },
            {
              n: '02',
              title: 'Pick a token to drop',
              desc: 'Choose ADA or any fungible token you hold. Set the total pool size.',
            },
            {
              n: '03',
              title: 'Upload your list',
              desc: 'Upload an Excel file (.xlsx) with Wallet and Amount columns.',
            },
            {
              n: '04',
              title: 'Sign & broadcast',
              desc: 'Review the preflight checks, hit "Build TXs", sign each batch in your wallet. Download your receipt when done.',
            },
          ].map(({ n, title, desc }) => (
            <div key={n} className='card p-5 flex gap-4 items-start'>
              <span className='font-display text-2xl text-g-800 shrink-0 w-10'>{n}</span>
              <div>
                <h3 className='font-display text-lg text-g-400 mb-0.5'>{title}</h3>
                <p className='text-sm text-g-700'>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className='pb-24 text-center'>
        <div className='card p-10 rounded-3xl max-w-lg mx-auto'>
          <span className='text-5xl block mb-4 animate-hop-delay'>🪂</span>
          <h2 className='font-display text-3xl text-g-300 mb-2'>Ready to drop?</h2>
          <p className='text-g-700 text-sm mb-6'>Connect your wallet and airdrop in minutes.</p>
          <Link href='/airdrop' className='btn-primary text-base py-3 px-8'>
            Start Airdrop <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
