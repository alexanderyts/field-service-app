// Tip / support links, shown in the More tab. To add a service, add an entry below and set
// `oneTime` and/or `monthly` to its checkout URL — the UI figures out the rest (a service
// with only `oneTime` appears under "One-Time Tip"; one with `monthly` appears under
// "Monthly Support"; a service with both appears under each). When more than one service
// offers a given kind, the button opens a dropdown to choose between them.

// Kept separate from legal.ts's DEVELOPER_EMAIL (the public contact address) — tips stay on
// the developer's personal PayPal regardless of what the app's public contact email is.
const PAYPAL_EMAIL = 'alexander.yts@gmail.com'

export interface TipService {
  id: string
  label: string
  emoji: string
  /** Link for a single one-off tip, if this service supports it. */
  oneTime?: string
  /** Link for recurring / monthly support, if this service supports it. */
  monthly?: string
}

// NOTE: the non-PayPal links below point at each service's main page for now — replace them with
// the developer's specific handles when ready (e.g. https://ko-fi.com/<username>,
// https://buymeacoffee.com/<username>, https://cash.app/$<cashtag>, https://venmo.com/u/<username>).
export const TIP_SERVICES: TipService[] = [
  {
    id: 'paypal',
    label: 'PayPal',
    emoji: '🅿️',
    oneTime: `https://www.paypal.com/send?recipient=${encodeURIComponent(PAYPAL_EMAIL)}`,
  },
  {
    id: 'kofi',
    label: 'Ko-fi',
    emoji: '☕',
    oneTime: 'https://ko-fi.com/',
    monthly: 'https://ko-fi.com/',
  },
  {
    id: 'bmac',
    label: 'Buy Me a Coffee',
    emoji: '🧋',
    monthly: 'https://www.buymeacoffee.com/',
  },
  {
    id: 'cashapp',
    label: 'Cash App',
    emoji: '💵',
    oneTime: 'https://cash.app/',
  },
  {
    id: 'venmo',
    label: 'Venmo',
    emoji: '💸',
    oneTime: 'https://venmo.com/',
  },
]

export type TipKind = 'oneTime' | 'monthly'

export function tipServices(kind: TipKind): TipService[] {
  return TIP_SERVICES.filter((s) => s[kind])
}
