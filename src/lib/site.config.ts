// Every string the marketing surfaces use, in one place (frontend.md §7).
// Copy voice per frontend.md §11: sentence case, short plain heads, separate
// mobile copy, middots in microcopy. Product words per PRD §15.

export const site = {
  name: "Portaj",
  wordmark: "portaj",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://mora-chi.vercel.app",
  title: "Portaj · Smart wallet to exchange",
  description: "Send USDC from your passkey wallet to any exchange. No XLM. No seed phrase.",

  hero: {
    brand: "PORTAJ",
    readouts: ["NETWORK: STELLAR TESTNET", "XLM HELD BY YOU: 0"] as [string, string],
    title: ["The exit route for", "Stellar smart wallets."],
    footnote: ["[ PASSKEY · MEMO · NO XLM ]", "SEND USDC FROM YOUR PASSKEY WALLET TO ANY EXCHANGE. NO XLM. NO SEED PHRASE."] as [string, string],
    cta: { label: "Carry to an exchange", href: "/app/carry" },
    secondary: { label: "Try it on testnet", href: "/app" },
    micro: ["One passkey prompt", "Memo included", "Fees paid by Portaj"],
  },

  // The three things that stop a smart-wallet user today (PRD §3), each with
  // what Portaj does about it.
  walls: [
    { status: "returned", title: "No memo on a contract call", body: "A transfer out of a smart wallet is a contract call, and the network rejects any memo on it. Portaj sends the last leg as a classic payment, memo attached." },
    { status: "waiting", title: "Exchanges don't credit contract transfers", body: "SDF's docs say it plainly. Portaj's final payment is the kind exchanges already credit: a classic USDC payment with the memo." },
    { status: "delivered", title: "No XLM for a classic account", body: "Your exit account is created with sponsored reserves and every fee is a fee bump. It holds 0 XLM, before and after." },
  ],

  steps: [
    {
      title: "Paste the exchange address and memo",
      subtitle: "The address and memo your exchange shows for a Stellar USDC deposit. If the exchange requires a memo, Portaj won't let you send without one.",
      mobileSubtitle: "The deposit address and memo.",
    },
    {
      title: "Sign once with your passkey",
      subtitle: "The same passkey derives your own exit account in the browser. First time, Portaj sets it up for you: 0 XLM, USDC trustline, reserves paid by Portaj.",
      mobileSubtitle: "One prompt. Your exit account, set up for you.",
    },
    {
      title: "Your USDC arrives with its memo",
      subtitle: "Your wallet sends to your exit account, and your exit account pays the exchange in the next ledger. Three explorer links prove each step.",
      mobileSubtitle: "Credited by memo. Three links to check.",
    },
  ],

  features: [
    { href: "/app/carry", icon: "send", name: "Carry", descriptor: "Wallet to exchange" },
    { href: "/app", icon: "wallet", name: "Wallet", descriptor: "Test wallet and USDC" },
    { href: "/app/exchange", icon: "inbox", name: "Exchange simulator", descriptor: "Credits by memo" },
    { href: "/app/receipts#recover", icon: "undo", name: "Recover", descriptor: "Resume or return" },
    { href: "/app/carry?mode=b", icon: "link", name: "Any smart wallet", descriptor: "Bring your own" },
    { href: "/app/receipts", icon: "activity", name: "Receipts", descriptor: "Three links per carry" },
    { href: "/app/carry#normal-way", icon: "close", name: "The normal way", descriptor: "See the network refuse" },
    { href: "/how", icon: "code", name: "How it works", descriptor: "Transactions and keys" },
  ],

  pains: {
    title: "Your USDC, stuck in a smart wallet",
    subtitle: "Passkey wallets are the easiest way onto Stellar. Getting money back out to an exchange is where they stop.",
    cards: [
      { eyebrow: "Smart-wallet holders", title: "The memo field is greyed out", body: "Soroban transactions can't carry a memo. Without it, the exchange can't tell whose deposit it is." },
      { eyebrow: "Smart-wallet holders", title: "“Transfers from contracts are not supported”", body: "That's SDF's own wording about exchanges. Even with the right address, the deposit isn't credited." },
      { eyebrow: "New users", title: "Buy XLM first. From where?", body: "A classic wallet needs XLM for its reserve and the USDC trustline. The place to buy XLM is the exchange you can't reach." },
      { eyebrow: "Passkey users", title: "A seed phrase for one withdrawal", body: "Switching to a classic wallet means writing down 24 words to move money once." },
      { eyebrow: "Bounty and prize winners", title: "Paid into a smart wallet", body: "First time on Stellar, money in hand, and no way to sell it for naira." },
    ],
    wide: {
      before: { eyebrow: "What disappears", title: "Deposits the exchange can't match to you", body: "No memo-less sends, no support tickets, no money parked in a contract the exchange won't read." },
      after: { eyebrow: "What you get", title: "Credited by memo, like any deposit", body: "A classic payment with your memo, from an account that's yours. The exchange treats it like every other deposit." },
    },
  },

  guarantees: {
    title: "What Portaj never does",
    subtitle: "The only key on the server is the sponsor's. It pays reserves and fees; it can't move your money.",
    rows: [
      { title: "Never holds your keys", body: "Your exit account's key is derived from your passkey in the browser and never stored or sent." },
      { title: "Never holds your funds", body: "USDC sits in your own exit account for one ledger, then leaves with the memo." },
      { title: "Never asks for XLM", body: "Sponsored reserves create the account; fee bumps pay every transaction. It holds 0 XLM." },
      { title: "Never signs anything else", body: "The sponsor only signs setup, relays transfers into accounts it sponsored, and fee-bumps their payments." },
      { title: "Never leaves you stuck", body: "If a step fails after your USDC moved, resume the exit or send it back to your wallet." },
    ],
    link: { label: "Read how it works", href: "/how" },
  },

  builtOn: {
    title: "Built on Stellar's own rules",
    subtitle: "No Portaj contract. Every piece is a network feature or a standard.",
    list: [
      { name: "passkey-kit smart wallets", href: "https://github.com/stellar/passkey-kit" },
      { name: "Circle USDC", href: "https://developers.circle.com/stablecoins/quickstart-transfer-usdc-stellar" },
      { name: "Sponsored reserves · CAP-33", href: "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0033.md" },
      { name: "Fee bumps · CAP-15", href: "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0015.md" },
      { name: "Memo required · SEP-29", href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md" },
      { name: "Token interface · SEP-41", href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md" },
      { name: "WebAuthn PRF", href: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions" },
    ],
  },

  audiences: [
    { eyebrow: "For smart-wallet holders", title: "Sell your USDC like anyone else", body: "Paste the exchange's address and memo, sign once. Your deposit is credited the normal way." },
    { eyebrow: "For any wallet", title: "Bring your own smart wallet", body: "Your wallet lives on another site? Send to your exit account from there; Portaj pays it out with the memo." },
    { eyebrow: "For judges and builders", title: "Check every step yourself", body: "Create a test wallet, get test USDC, exit to the simulator, and open three explorer links." },
  ],

  footer: {
    tagline: "From smart wallet to exchange. Memo included.",
    columns: [
      { title: "App", links: [{ label: "Wallet", href: "/app" }, { label: "Carry", href: "/app/carry" }, { label: "Receipts", href: "/app/receipts" }] },
      { title: "Testnet", links: [{ label: "Exchange simulator", href: "/app/exchange" }, { label: "How it works", href: "/how" }, { label: "Recover a carry", href: "/app/receipts#recover" }] },
      { title: "Network", links: [{ label: "Stellar", href: "https://stellar.org" }, { label: "Smart wallets", href: "https://developers.stellar.org/docs/build/apps/smart-wallets" }, { label: "Stellar Expert", href: "https://stellar.expert/explorer/testnet" }] },
    ],
    badges: [
      { label: "Network", value: "Testnet" },
      { label: "Your XLM", value: "0" },
    ],
    copyright: "Portaj",
    note: "No trackers. No custody.",
  },
} as const;

export type FeatureIcon = (typeof site.features)[number]["icon"];
