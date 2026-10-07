// Pilot report (PRD §16): what happened to every payment one sender made
// through Mora, with denominators and transaction links.
//
//   node scripts/pilot-report.mjs <sender G-address> [--since 2026-10-07] [--base https://mora-chi.vercel.app] [--network testnet]
//
// Reads the public API (index candidates) and Horizon for exact times. Prints
// Markdown you can paste into the README. Label it "builder-run pilot".
const args = process.argv.slice(2);
const sender = args.find((a) => /^[GC][A-Z2-7]{55}$/.test(a));
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
if (!sender) {
  console.error("usage: node scripts/pilot-report.mjs <sender G-address> [--since YYYY-MM-DD] [--base URL] [--network testnet]");
  process.exit(1);
}
const BASE = opt("base", "https://mora-chi.vercel.app").replace(/\/$/, "");
const NETWORK = opt("network", "testnet");
const SINCE = opt("since") ? new Date(opt("since")) : null;
const HORIZON = NETWORK === "mainnet" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const EXPLORER = NETWORK === "mainnet" ? "https://stellar.expert/explorer/public/tx/" : "https://stellar.expert/explorer/testnet/tx/";

// Make sure the index has everything first.
await fetch(`${BASE}/api/v1/sync?network=${NETWORK}`).catch(() => {});

const items = [];
let cursor = null;
do {
  const r = await fetch(`${BASE}/api/v1/parcels?network=${NETWORK}&from=${sender}${cursor ? `&cursor=${cursor}` : ""}`);
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const j = await r.json();
  items.push(...j.items);
  cursor = j.cursor;
} while (cursor);

const payments = items.filter((i) => !SINCE || new Date(i.at) >= SINCE);
const txTime = new Map();
async function timeOf(hash) {
  if (!txTime.has(hash)) {
    const r = await fetch(`${HORIZON}/transactions/${hash}`);
    txTime.set(hash, r.ok ? new Date((await r.json()).created_at) : null);
  }
  return txTime.get(hash);
}

const waited = payments.filter((p) => p.outcome === "waiting");
const claimed = waited.filter((p) => p.status === "claimed" || p.status === "moved");
const returned = waited.filter((p) => p.status === "returned");
const stillWaiting = waited.filter((p) => p.status === "waiting");
const delays = [];
for (const p of claimed) {
  const t = p.resolvedTx ? await timeOf(p.resolvedTx) : null;
  if (t) delays.push((t - new Date(p.at)) / 60000);
}
delays.sort((a, b) => a - b);
const median = delays.length ? (delays.length % 2 ? delays[(delays.length - 1) / 2] : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2) : null;
const fmt = (m) => (m === null ? "n/a" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

// Aborted batches: the sender's failed transactions in the window (target 0).
let failed = 0;
let page = `${HORIZON}/accounts/${sender}/transactions?include_failed=true&order=desc&limit=200`;
for (let i = 0; i < 10 && page; i++) {
  const r = await fetch(page);
  if (!r.ok) break;
  const j = await r.json();
  const recs = j._embedded.records;
  for (const t of recs) if (!t.successful && (!SINCE || new Date(t.created_at) >= SINCE)) failed++;
  page = recs.length === 200 ? j._links.next.href : null;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
const sends = [...new Set(payments.map((p) => p.txHash))];
console.log(`## Builder-run pilot (${NETWORK})

Sender \`${sender}\`${SINCE ? ` · since ${SINCE.toISOString().slice(0, 10)}` : ""} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC

| | Count | Share |
|---|---|---|
| Payments sent | ${payments.length} | |
| Delivered at once | ${payments.length - waited.length} | ${pct(payments.length - waited.length, payments.length)} of payments |
| Waited | ${waited.length} | ${pct(waited.length, payments.length)} of payments |
| Claimed | ${claimed.length} | ${pct(claimed.length, waited.length)} of those that waited |
| Returned | ${returned.length} | ${pct(returned.length, waited.length)} of those that waited |
| Still waiting | ${stillWaiting.length} | ${pct(stillWaiting.length, waited.length)} of those that waited |
| Median time to claim | ${fmt(median)} | over ${delays.length} claims |
| Failed sender transactions | ${failed} | target 0 |

Send transactions: ${sends.map((h) => `[${h.slice(0, 8)}](${EXPLORER}${h})`).join(", ") || "none"}
`);
