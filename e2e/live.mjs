// End-to-end test of the deployed site on Stellar testnet, through the UI.
//
//   node e2e/live.mjs [base-url]          (default https://mora-chi.vercel.app)
//
// Real browser (installed Chrome via playwright-core), real testnet
// transactions, fresh throwaway keys, and a fake Freighter extension that
// answers the extension's message protocol. Takes about 7 minutes because one
// payment must pass its 5-minute return window. Uses the site's faucet once
// per run, which allows 5 requests per hour per IP.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { freshKeys, installFakeFreighter } from "./fake-freighter.mjs";

const BASE = (process.argv[2] ?? "https://mora-chi.vercel.app").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TESTUSD = "CABKO7FTLFX6LT3UXIWDBKVPE64RQYLQAHYYP6RBLW2OMBA7THKZXA74";
const FAUCET = "GDCFE6RCOSSAGVDSQOPSJ5TTLNFNDY5K2BLLW32HRXZO2JSQXOTYMZMD";
const MUXED = "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ";
const OUT = fileURLToPath(new URL("./artifacts/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const results = [];
const t0 = Date.now();
const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;
const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const claimUrl = (from, to) => `${BASE}/claim?network=testnet&from=${from}&to=${to}&asset=${TESTUSD}`;

async function check(name, fn, page) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? ` · ${note}` : ""} (${secs()})`);
  } catch (e) {
    results.push({ name, ok: false, note: String(e.message ?? e).split("\n")[0] });
    console.log(`FAIL ${name} · ${String(e.message ?? e).split("\n")[0]} (${secs()})`);
    if (page) await page.screenshot({ path: `${OUT}${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
  }
}

async function fund(...addresses) {
  await Promise.all(addresses.map((a) => fetch(`https://friendbot.stellar.org/?addr=${a}`).then((r) => r.text())));
}

const keys = freshKeys(["A", "B", "C", "D"]);
const A = keys.A.publicKey(); // sender
const B = keys.B.publicKey(); // funded, no TESTUSD
const C = keys.C.publicKey(); // never funded: account not active
const D = keys.D.publicKey(); // funded, no TESTUSD, two payments for Claim all
console.log(`Base ${BASE}\nA ${A}\nB ${B}\nC ${C}\nD ${D}`);
await fund(A, B, D);

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
const page = await ctx.newPage();
const wallet = await installFakeFreighter(page, keys);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/** Connect (or switch to) the fake wallet's current account through the kit's modal. */
async function connectAs(name) {
  wallet.use(name);
  await page.goto(`${BASE}/send`, { waitUntil: "load" });
  // Wait for hydration: the header restores a remembered address after mount,
  // and the footer's live RPC status only appears once effects have run.
  await page.getByText(/RPC (healthy|unreachable)/).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  // Disconnect whoever is connected, then connect fresh: the most direct path.
  const menu = page.locator("header").getByRole("button", { name: /…/ }).first();
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.getByRole("button", { name: "Disconnect" }).click();
  }
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await page.getByText("Freighter", { exact: true }).first().click({ timeout: 30_000 });
  await page.locator("header").getByText(short(wallet.publicKey)).first().waitFor({ timeout: 30_000 });
}

// 1. Landing --------------------------------------------------------------
await check("landing renders every section", async () => {
  await page.goto(BASE, { waitUntil: "load" });
  for (const t of ["How it works", "Everything for paying people", "No more failed payout runs", "Three exits, nothing else", "Works with the wallets people already use"]) {
    await page.getByRole("heading", { name: t }).first().waitFor({ timeout: 15_000 });
  }
  const h1 = await page.locator("h1").first().textContent();
  if (!/Payments that\s*wait/.test(h1 ?? "")) throw new Error(`h1 was "${h1}"`);
  await page.locator("header").getByText("Testnet").first().waitFor();
  await page.getByText(/RPC healthy/).waitFor({ timeout: 20_000 });
  const numbers = await page.getByText(/so far/).textContent({ timeout: 20_000 });
  return numbers?.trim();
}, page);

await check("theme toggle switches to dark and back", async () => {
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  if (!(await page.evaluate(() => document.documentElement.classList.contains("dark")))) throw new Error("no dark class");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
}, page);

await check("mobile menu opens with navigation", async () => {
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(BASE, { waitUntil: "load" });
  await m.getByRole("button", { name: "Open menu" }).click();
  await m.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Send" }).waitFor();
  await m.close();
}, page);

// 2. Connect, faucet through Mora, claim ------------------------------------
await check("connect wallet through the kit modal", async () => {
  await connectAs("A");
  return short(A);
}, page);

await check("faucet pays through Mora, then claim adds TESTUSD", async () => {
  await page.goto(BASE, { waitUntil: "load" });
  await page.getByRole("button", { name: "Get 100 TESTUSD" }).click();
  const outcome = await Promise.race([
    page.getByText("100 TESTUSD is waiting for you.").waitFor({ timeout: 60_000 }).then(() => "ok"),
    page.getByText(/faucet is resting|had enough TESTUSD/).waitFor({ timeout: 60_000 }).then(() => "limited"),
  ]);
  if (outcome === "limited") {
    // Every later step needs this TESTUSD. Stop clearly instead of cascading.
    console.log("The faucet's per-IP limit (5 per hour) is reached. That is the rate limiter working; run again in an hour.");
    await browser.close();
    process.exit(2);
  }
  await page.getByRole("link", { name: "Claim it" }).click();
  await page.getByRole("button", { name: "Claim", exact: true }).click({ timeout: 60_000 });
  await page.getByText("It's yours.").waitFor({ timeout: 90_000 });
  await page.getByText(/TESTUSD was added to your wallet/).waitFor();
}, page);

// 3. Send a list -------------------------------------------------------------
let sentAt = 0;
await check("send: readiness preview for every kind of row", async () => {
  await page.goto(`${BASE}/send`, { waitUntil: "load" });
  await page.getByRole("radio", { name: /TESTUSD/ }).click();
  await page.getByRole("tab", { name: "A list" }).click();
  await page.getByLabel("Recipients, one per line").fill([`${B}, 5`, `${C}, 3`, `${D}, 2`, `${FAUCET}, 1`, `${MUXED}, 1`, "nope, 1"].join("\n"));
  const want = ["Will wait: no TESTUSD trustline", "Will wait: account not active", "Ready", "Invalid: M-address", "Invalid"];
  for (const w of want) await page.getByText(w, { exact: true }).first().waitFor({ timeout: 30_000 });
});

await check("send: review simulates 1 delivered, 3 waiting", async () => {
  await page.getByRole("button", { name: /5 minutes/ }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByText("1 delivered · 3 waiting").waitFor({ timeout: 60_000 });
  await page.getByText(/2 rows won.t be sent/).waitFor();
}, page);

await check("send: one signature, results with share links", async () => {
  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByText("1 delivered, 3 waiting, 0 failed.").waitFor({ timeout: 90_000 });
  sentAt = Date.now();
  const copies = await page.getByRole("button", { name: "Copy link" }).count();
  if (copies !== 3) throw new Error(`${copies} Copy link buttons, expected 3`);
  await page.getByText("account not active").first().waitFor();
}, page);

// 4. Claim pages ---------------------------------------------------------------
await check("claim page: wrong account is told to switch", async () => {
  await page.goto(claimUrl(A, B), { waitUntil: "load" });
  await page.getByText(/This payment is for/).waitFor({ timeout: 60_000 });
}, page);

await check("claim page: recipient claims with one signature", async () => {
  await connectAs("B");
  await page.goto(claimUrl(A, B), { waitUntil: "load" });
  await page.getByText(/Claiming adds TESTUSD to your wallet/).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Claim", exact: true }).click();
  await page.getByText("It's yours.").waitFor({ timeout: 90_000 });
}, page);

await check("claim page: claimed link shows the outcome", async () => {
  await page.goto(claimUrl(A, B), { waitUntil: "load" });
  await page.getByText("Claimed by the recipient").waitFor({ timeout: 90_000 });
}, page);

await check("claim page: shows the live reason a payment waits", async () => {
  // C's payment, viewed while connected as B.
  await page.goto(claimUrl(A, C), { waitUntil: "load" });
  await page.getByText("account not active").first().waitFor({ timeout: 60_000 });
}, page);

await check("claim page: bad and empty links", async () => {
  await page.goto(`${BASE}/claim?network=testnet&from=${A}&asset=${TESTUSD}`, { waitUntil: "load" });
  await page.getByText("This link doesn't work").waitFor({ timeout: 30_000 });
  // A paid the faucet account directly (delivered), so nothing waits here.
  await page.goto(claimUrl(A, FAUCET), { waitUntil: "load" });
  await page.getByText("Nothing is waiting under this link.").waitFor({ timeout: 90_000 });
}, page);

// 5. Inbox ---------------------------------------------------------------------
await check("inbox: read-only view of another address", async () => {
  await page.goto(`${BASE}/inbox`, { waitUntil: "load" });
  await page.getByLabel("Address to check").fill(C);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("1 waiting payment").waitFor({ timeout: 90_000 });
  await page.getByText(/read-only/).waitFor();
  return await page.getByText(/Checked at ledger/).textContent();
}, page);

await check("inbox: Claim all takes two payments in one signature", async () => {
  // A second sender for D: B sends 1 TESTUSD through the normal send flow.
  // (Not the faucet, whose per-IP hourly limit repeated runs would hit.)
  await connectAs("B");
  await page.getByRole("radio", { name: /TESTUSD/ }).click();
  await page.getByPlaceholder("G…").fill(D);
  await page.getByPlaceholder("0.00").fill("1");
  await page.getByText("Will wait: no TESTUSD trustline").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Sign and send" }).click({ timeout: 60_000 });
  await page.getByText("0 delivered, 1 waiting, 0 failed.").waitFor({ timeout: 90_000 });
  await connectAs("D");
  await page.goto(`${BASE}/inbox`, { waitUntil: "load" });
  await page.getByText("2 waiting payments").waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Claim all" }).click();
  await page.getByText(/^2 claimed/).waitFor({ timeout: 120_000 });
}, page);

// 6. Integrate, 404 ---------------------------------------------------------------
await check("integrate: contract config confirmed on chain", async () => {
  await page.goto(`${BASE}/integrate`, { waitUntil: "load" });
  await page.getByText("Confirmed on chain").waitFor({ timeout: 30_000 });
}, page);

await check("404 page", async () => {
  const r = await page.goto(`${BASE}/definitely-not-here`, { waitUntil: "load" });
  if (r?.status() !== 404) throw new Error(`status ${r?.status()}`);
  await page.getByText("Check for payments").first().waitFor();
}, page);

// 7. Activity and return after the 5-minute window ----------------------------------
await check("activity: sender sees every payment and filters", async () => {
  await connectAs("A");
  await page.goto(`${BASE}/activity`, { waitUntil: "load" });
  await page.getByText(/Checked at ledger/).waitFor({ timeout: 120_000 });
  const rows = await page.locator("main ul.border > li").count();
  await page.getByRole("tab", { name: "waiting" }).click();
  const waiting = await page.locator("main ul.border > li").count();
  return `${rows} rows, ${waiting} waiting`;
}, page);

await check("activity: return the unclaimed payment after the window", async () => {
  const wait = sentAt + 6 * 60_000 - Date.now();
  if (wait > 0) {
    console.log(`  waiting ${Math.round(wait / 1000)}s for the return window…`);
    await new Promise((r) => setTimeout(r, wait));
  }
  await page.goto(`${BASE}/activity`, { waitUntil: "load" });
  await page.getByText(/Checked at ledger/).waitFor({ timeout: 120_000 });
  // C's own row: other payments may be returnable too.
  const row = page.locator("main ul.border > li").filter({ hasText: `${C.slice(0, 6)}…${C.slice(-6)}` });
  await row.getByRole("button", { name: "Return", exact: true }).click({ timeout: 30_000 });
  // Wait for the row to say Returned; the button only relabels while
  // signing, and leaving the page early would cancel the transaction.
  await page
    .locator("main ul.border > li")
    .filter({ hasText: `${C.slice(0, 6)}…${C.slice(-6)}` })
    .getByText("Returned", { exact: true })
    .first()
    .waitFor({ timeout: 120_000 });
  await page.goto(claimUrl(A, C), { waitUntil: "load" });
  await page.getByText("Returned to the sender").waitFor({ timeout: 120_000 });
}, page);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${secs()}`);
if (errors.length) console.log(`Page errors:\n${[...new Set(errors)].join("\n")}`);
process.exit(failed.length ? 1 : 0);
