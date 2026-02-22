# 🐸 Frogs Parachute

> The smoothest airdrop tool in the Cardano pond.

A fun, polished UI built on top of the battle-tested [ada-drop](https://github.com/BenElferink/ada-drop) engine by Ben Elferink. All core transaction logic — auto-batching, preflight checks, TX size retry, txConfirmation polling — is taken directly from ada-drop. This project just replaces the UI layer with a fresh Tailwind-based design.

---

## What's kept from ada-drop (unchanged)

- `src/functions/` — chunk, eachLimit, txConfirmation, extractError, formatTokenAmount, sleep, retryAsync, etc.
- `src/containers/new-airdrop/helpers/` — verifyMinRequiredAda, verifyMinRequiredBalance
- `src/hooks/useConnectedWallet.ts` — wallet balance/token fetching
- `src/store/useWalletStore.ts` — Zustand token store
- `src/pages/api/` — all API routes (wallet resolver, Blockfrost, token, pool, etc.)
- `src/utils/` — api.ts, blockfrost.ts, firebase.ts, etc.
- `src/constants/` — ADA constants, min lovelace values, dev wallet address

## What's new (this repo)

- `src/app/layout.tsx` — MeshProvider + Navbar, no odigos/styled-components
- `src/app/page.tsx` — Landing page
- `src/app/airdrop/page.tsx` — Airdrop builder (token select → file upload → payout)
- `src/app/history/page.tsx` — Local airdrop history
- `src/ui/` — Navbar, WalletButton (Eternl, Nami, Lace)
- `src/app/globals.css` — Tailwind + Google Fonts + design tokens
- Dependencies: dropped `@odigos/ui-kit`, `styled-components`, `@xyflow/react`; added `tailwindcss`, `lucide-react`, `clsx`

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/frogs-parachute.git
cd frogs-parachute
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in your keys in `.env.local`:

```
BLOCKFROST_API_KEY=mainnetXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
# Optional:
SLACK_WEBHOOK_URL=...
```

**Blockfrost** is required for wallet address resolution (addr1, stake1, $handles).
**Firebase** is used by ada-drop for storing airdrop history server-side (optional — the app still works without it, history falls back to localStorage).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

1. Push to GitHub
2. Import repo in [vercel.com](https://vercel.com)
3. Add all env vars in Vercel → Project Settings → Environment Variables
4. Deploy — Vercel auto-detects Next.js

---

## Excel file format

Upload `.xlsx` files with columns named `Wallet` and `Amount`:

| Wallet | Amount |
|---|---|
| addr1q9ew... | 10 |
| stake1ux... | 420.69 |
| $yourhandle | 5 |

Supports `addr1...`, `stake1...`, and `$ada-handle` identifiers.

---

## Credits

Core transaction engine: [BenElferink/ada-drop](https://github.com/BenElferink/ada-drop) (MIT)  
UI: Frogs Parachute 🐸
