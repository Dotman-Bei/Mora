// Every string the marketing surfaces use, in one place (frontend.md §7).
// Copy voice per frontend.md §11: sentence case, short plain heads, separate
// mobile copy, middots in microcopy. Product words per PRD §8.

export const site = {
  name: "Mora",
  wordmark: "mora",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://mora.vercel.app",
  title: "Mora · Payments that wait",
  description:
    "Send money to anyone on Stellar. If they can't receive it yet, it waits for them, and it comes back to you if they never take it.",

  hero: {
    pill: { label: "Built on Protocol 26 trustlines for contracts", href: "/integrate" },
    // One word greyed back (frontend.md §3, "the muted word").
    h1: { before: "Payments that ", muted: "wait", after: "." },
    subline:
      "Send money to anyone on Stellar. If they can't receive it yet, it waits for them, and it comes back to you if they never take it.",
    cta: { label: "Send a payment", href: "/send" },
    micro: ["No sign-up", "One signature to send", "One to claim"],
    secondary: { label: "Check for payments", href: "/inbox" },
  },

  outcomes: [
    { status: "delivered", title: "Delivered", body: "They could receive it. It's in their wallet. Nothing for them to do." },
    { status: "waiting", title: "Waiting", body: "They couldn't yet. They open the link and sign once; the asset and the money arrive together." },
    { status: "returned", title: "Returned", body: "Nobody claimed it by the return date. It goes back to the sender." },
  ],

  steps: [
    {
      title: "Paste a list, sign once",
      subtitle: "Every row is checked against the network before you sign: who can receive now, and who will wait.",
      mobileSubtitle: "Each row is checked before you sign.",
    },
    {
      title: "Whoever isn't ready, waits",
      subtitle: "A missing trustline no longer fails the run. That payment waits under a link you can share.",
      mobileSubtitle: "Unready recipients wait under a link.",
    },
    {
      title: "They claim, or it comes back",
      subtitle: "One signature adds the asset and hands over the money. Unclaimed payments return after the date you set.",
      mobileSubtitle: "One signature to claim. Or it returns.",
    },
  ],

  features: [
    { href: "/send", icon: "send", name: "Send", descriptor: "One person or a list" },
    { href: "/claim", icon: "link", name: "Claim links", descriptor: "Works on any phone" },
    { href: "/inbox", icon: "inbox", name: "Inbox", descriptor: "Everything waiting for you" },
    { href: "/activity", icon: "activity", name: "Activity", descriptor: "What you've sent" },
    { href: "/send#return", icon: "undo", name: "Returns", descriptor: "Unclaimed comes back" },
    { href: "/integrate", icon: "code", name: "Integrate", descriptor: "One-line change" },
    { href: "/try", icon: "play", name: "Try it", descriptor: "No wallet needed" },
    { href: "/integrate#api", icon: "api", name: "Public API", descriptor: "Read what's waiting" },
  ],

  pains: {
    title: "No more failed payout runs",
    subtitle: "On Stellar, a wallet has to add an asset before it can hold it. Until now, one wallet that hadn't failed everyone's payment.",
    cards: [
      { eyebrow: "Payout operators", title: "One unready wallet fails the batch", body: "Five people, one missing USDC trustline, zero paid. Mora delivers four and holds the fifth." },
      { eyebrow: "Payout operators", title: "Manual retries", body: "No more dropping a name, paying by hand later and reconciling twice." },
      { eyebrow: "Recipients", title: "“Add USDC, then tell me”", body: "Recipients claim with one signature. Mora adds the asset in the same transaction." },
      { eyebrow: "Senders", title: "Deposits lost to exchanges", body: "Addresses that need a memo are blocked before you sign, not after the money is gone." },
      { eyebrow: "Partner apps", title: "Everyone writes their own fallback", body: "One shared contract. Swap a transfer for a send and your users get Mora's guarantee." },
    ],
    wide: {
      before: { eyebrow: "What disappears", title: "Failed runs caused by one unready wallet", body: "No aborted batches, no stranded payments, no money stuck in a contract with nobody to claim it." },
      after: { eyebrow: "Every payment lands somewhere", title: "Delivered, waiting, or returned", body: "Three outcomes, and each one has a transaction link. Nothing in between." },
    },
  },

  guarantees: {
    title: "Three exits, nothing else",
    subtitle: "The contract has no admin, no upgrade path and no fee. These hold for every payment.",
    rows: [
      { title: "Only to the recipient or back to the sender", body: "Both come from the payment's own key, never from whoever calls." },
      { title: "No early return", body: "A sender can't pull a payment back before the return date." },
      { title: "One recipient never affects another", body: "Inside a list, each payment's outcome is its own." },
      { title: "Always covered", body: "For every asset, Mora holds at least the sum of everything waiting." },
      { title: "Nobody can pause, drain or redirect", body: "Not the builders, not anyone. The contract is immutable." },
    ],
    link: { label: "Read the contract", href: "/integrate" },
  },

  wallets: {
    title: "Works with the wallets people already use",
    list: [
      { name: "Freighter", href: "https://www.freighter.app" },
      { name: "LOBSTR", href: "https://lobstr.co" },
      { name: "xBull", href: "https://xbull.app" },
      { name: "WalletConnect", href: "https://walletconnect.network" },
      { name: "Albedo", href: "https://albedo.link" },
      { name: "Hana", href: "https://www.hana.network" },
      { name: "Rabet", href: "https://rabet.io" },
    ],
  },

  audiences: [
    { eyebrow: "For payout operators", title: "Pay the whole list, every time", body: "Paste addresses and amounts, sign once. See who has been paid and who hasn't, in one place." },
    { eyebrow: "For recipients", title: "Open the link, sign once", body: "No sign-up, no email, no new wallet. The asset and the money arrive in your own wallet together." },
    { eyebrow: "For partner apps", title: "One shared contract", body: "Change a transfer to a send. Your users' failed payments become waiting payments that claim in Mora." },
  ],

  footer: {
    tagline: "Pay everyone. Even the ones who aren't ready.",
    columns: [
      { title: "Product", links: [{ label: "Send", href: "/send" }, { label: "Inbox", href: "/inbox" }, { label: "Activity", href: "/activity" }, { label: "Try it", href: "/try" }] },
      { title: "Build", links: [{ label: "Integrate", href: "/integrate" }, { label: "Public API", href: "/integrate#api" }, { label: "Claim links", href: "/integrate#links" }] },
      { title: "Network", links: [{ label: "Stellar", href: "https://stellar.org" }, { label: "Soroban docs", href: "https://developers.stellar.org" }, { label: "Stellar Expert", href: "https://stellar.expert" }] },
    ],
    badges: [
      { label: "Contract", value: "Unaudited" },
      { label: "Fees", value: "None" },
    ],
    copyright: "Mora",
  },
} as const;

export type FeatureIcon = (typeof site.features)[number]["icon"];
