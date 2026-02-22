'use client'

import './globals.css'
import React, { type PropsWithChildren } from 'react'
import { MeshProvider } from '@meshsdk/react'
import { Navbar } from '@/ui/Navbar'

export default function Layout({ children }: PropsWithChildren) {
  return (
    <html lang='en'>
      <head>
        <link rel='icon' href='/assets/cardano.svg' type='image/svg+xml' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <meta name='description' content='The smoothest airdrop tool in the Cardano pond 🐸' />
        <title>Frogs Parachute 🐸</title>
      </head>
      <body suppressHydrationWarning>
        <MeshProvider>
          <Navbar />
          <main>{children}</main>
          <footer className='border-t border-g-950 mt-24 py-8 text-center text-g-800 text-xs font-body'>
            🐸 Frogs Parachute &nbsp;·&nbsp; Built on{' '}
            <span className='text-g-600'>Cardano</span>
            &nbsp;·&nbsp; Powered by{' '}
            <a
              href='https://github.com/BenElferink/ada-drop'
              target='_blank'
              rel='noopener noreferrer'
              className='text-g-700 hover:text-g-500 underline'
            >
              ada-drop
            </a>
          </footer>
        </MeshProvider>
      </body>
    </html>
  )
}
