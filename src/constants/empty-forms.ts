import { ADA } from './common'
import { AirdropMethodType } from '@/@types'
import type { AirdropSettings, PopulatedToken } from '@/@types'

export const POPULATED_LOVELACE: PopulatedToken = {
  tokenId: 'lovelace',
  fingerprint: 'lovelace',
  policyId: 'lovelace',
  isFungible: true,
  mintTransactionId: '',
  tokenName: {
    onChain: 'lovelace',
    ticker: 'ADA',
    display: 'ADA',
  },
  tokenAmount: {
    onChain: 0,
    display: 0,
    decimals: ADA['DECIMALS'],
  },
  image: {
    ipfs: '',
    url: ADA['THUMB'],
  },
  files: [],
  attributes: {},
}

export const INIT_AIRDROP_SETTINGS: AirdropSettings = {
  airdropMethod: AirdropMethodType.EMPTY,
  tokenId: '',
  tokenName: { onChain: '', display: '', ticker: '' },
  tokenAmount: { onChain: 0, display: 0, decimals: 0 },
  thumb: '',
  policies: [],
  stakePools: [],
  blacklistWallets: [],
  blacklistTokens: [],
}
