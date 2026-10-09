// End-to-end test of Portaj on Stellar testnet, through the UI.
//
//   node e2e/live.mjs [base-url]          (default http://localhost:3000)
//
// Real Chrome (playwright-core), real testnet transactions, and a CDP virtual
// passkey authenticator with PRF, so the passkey-kit wallet, the PRF-derived
// exit account and every sponsor call run exactly as they do for a person.
// The sponsor secret in .env.local stands in for "your own wallet" where a
// test needs USDC to arrive in an exit account from outside (Mode B, Recover).
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { chromium } from "playwright-core";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const cfg = JSON.parse(readFileSync(new URL("../src/lib/testnet.json", import.meta.url), "utf8"));
const OUT = fileURLToPath(new URL("./artifacts/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const USDC = new Asset("USDC", cfg.usdcIssuer);
const sponsorSecret = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^SPONSOR_SECRET=(.+)$/m)?.[1]?.trim();

const results = [];
const t0 = Date.now();
const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;

async function check(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}${note ? ` · ${note}` : ""} (${secs()})`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name} · ${String(e.message ?? e).split("\n")[0]} (${secs()})`);
    await page.screenshot({ path: `${OUT}${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
  }
}

/** Stand-in for the user's own wallet: send USDC to an address from the sponsor's stash. */
async function payFromOutside(to, amount) {
  const kp = Keypair.fromSecret(sponsorSecret);
  const src = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(src, { fee: "1000", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: to, asset: USDC, amount }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// Count passkey prompts.
await page.addInitScript(() => {
  const c = navigator.credentials;
  const get = c.get.bind(c);
  const create = c.create.bind(c);
  window.__prompts = 0;
  c.get = (o) => (window.__prompts++, get(o));
  c.create = (o) => (window.__prompts++, create(o));
});
const prompts = () => page.evaluate(() => window.__prompts);

const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    ctap2Version: "ctap2_1",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
    hasPrf: true,
  },
});

const ready = () => page.getByText(/RPC (healthy|unreachable)/).waitFor({ timeout: 30_000 });
let wallet = "";
let memo = "";
let exitAccount = "";

// 1 ------------------------------------------------------------------------
await check("landing renders every section", async () => {
  await page.goto(BASE, { waitUntil: "load" });
  for (const t of ["How it works", "Everything for getting out", "Your USDC, stuck in a smart wallet", "What Portaj never does", "Built on Stellar's own rules"]) {
    await page.getByRole("heading", { name: t }).first().waitFor({ timeout: 15_000 });
  }
  await page.getByRole("link", { name: "Try it on testnet" }).first().waitFor();
  await page.getByText(/RPC healthy/).waitFor({ timeout: 20_000 });
});

// 2 ------------------------------------------------------------------------
await check("try: create a test smart wallet with a passkey", async () => {
  await page.goto(`${BASE}/try`, { waitUntil: "load" });
  await ready();
  await page.getByRole("button", { name: "Create a test smart wallet" }).click();
  const link = page.locator("a", { hasText: /^C[A-Z2-7]{55}$/ }).first();
  await link.waitFor({ timeout: 90_000 });
  wallet = (await link.textContent()).trim();
  return `${wallet} · ${await prompts()} prompts`;
});

await check("try: get test USDC", async () => {
  await page.getByRole("button", { name: "Get test USDC" }).click();
  await page.getByTestId("try-balance").filter({ hasText: /25\.0000000/ }).waitFor({ timeout: 90_000 });
});

await check("try: the normal way is rejected by the network", async () => {
  memo = await page.getByLabel("Memo (ID) from the simulator").inputValue();
  await page.getByTestId("try-normal").click();
  const r = page.getByTestId("before-result");
  await r.waitFor({ timeout: 60_000 });
  const text = await r.textContent();
  if (!/txMalformed/.test(text) || !/do not support memos/.test(text)) throw new Error(text.slice(0, 200));
  return "simulate: memo refused · send: txMalformed (-16)";
});

await check("try: without the memo it lands but isn't credited", async () => {
  await page.getByLabel("Amount (USDC)").fill("1");
  await page.getByRole("button", { name: "Send without the memo" }).click();
  await page.getByRole("link", { name: "It landed on chain" }).waitFor({ timeout: 90_000 });
});

// 3 ------------------------------------------------------------------------
await check("exit: first exit sets up the account and pays with the memo", async () => {
  await page.goto(`${BASE}/exit?to=${cfg.simulatorDeposit}&memoType=id&memo=${memo}&amount=5`, { waitUntil: "load" });
  await ready();
  await page.getByTestId("wallet-balance").filter({ hasText: /USDC/ }).waitFor({ timeout: 30_000 });
  await page.getByText("Memo required (SEP-29)").waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue with passkey" }).click();
  exitAccount = (await page.getByTestId("exit-account").textContent({ timeout: 60_000 })).trim();
  await page.getByRole("button", { name: "Set up (paid by Portaj)" }).click();
  await page.getByTestId("send").waitFor({ timeout: 90_000 });
  const before = await prompts();
  await page.getByTestId("send").click();
  await page.getByTestId("receipt").waitFor({ timeout: 120_000 });
  const xlm = await page.getByTestId("exit-xlm").filter({ hasText: /XLM/ }).textContent({ timeout: 30_000 });
  if (!/^0\.0000000 XLM$/.test(xlm.trim())) throw new Error(`exit account holds ${xlm}`);
  return `${exitAccount} · ${(await prompts()) - before} prompt to send · 0 XLM`;
});

await check("exit: the exit account holds 0 XLM, 0 USDC, reserves sponsored", async () => {
  const a = await horizon.loadAccount(exitAccount);
  const native = a.balances.find((b) => b.asset_type === "native");
  const usdc = a.balances.find((b) => b.asset_code === "USDC");
  if (a.sponsor !== cfg.sponsor) throw new Error(`sponsor ${a.sponsor}`);
  if (Number(native.balance) !== 0 || Number(usdc.balance) !== 0) throw new Error(`native ${native.balance}, usdc ${usdc.balance}`);
  if (usdc.sponsor !== cfg.sponsor) throw new Error("trustline not sponsored");
});

await check("simulator credits the memo, not the contract transfer", async () => {
  await page.goto(`${BASE}/exchange?memo=${memo}`, { waitUntil: "load" });
  await page.getByTestId("credited").getByText(`ID ${memo}`).waitFor({ timeout: 30_000 });
  await page.getByTestId("uncredited").getByText(/Contract transfer/).first().waitFor({ timeout: 30_000 });
});

await check("exit: a returning exit takes one passkey prompt", async () => {
  await page.goto(`${BASE}/exit?to=${cfg.simulatorDeposit}&memoType=id&memo=${memo}&amount=2`, { waitUntil: "load" });
  await ready();
  await page.getByTestId("wallet-balance").filter({ hasText: /USDC/ }).waitFor({ timeout: 30_000 });
  const before = await prompts();
  await page.getByRole("button", { name: "Continue with passkey" }).click();
  await page.getByTestId("send").click({ timeout: 30_000 });
  await page.getByTestId("receipt").waitFor({ timeout: 120_000 });
  const n = (await prompts()) - before;
  if (n !== 1) throw new Error(`${n} prompts`);
  return "1 prompt, 2 transactions";
});

// 4 ------------------------------------------------------------------------
await check("exit: another wallet (Mode B) pays out when USDC arrives", async () => {
  await page.goto(`${BASE}/exit?to=${cfg.simulatorDeposit}&memoType=id&memo=${memo}&amount=1.5&mode=b`, { waitUntil: "load" });
  await ready();
  await page.getByRole("button", { name: "Continue with passkey" }).click();
  const g = (await page.getByTestId("exit-account").textContent({ timeout: 60_000 })).trim();
  if (g !== exitAccount) throw new Error(`derived ${g}, expected ${exitAccount}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText(/Send exactly 1\.5000000 USDC/).waitFor();
  await payFromOutside(g, "1.5");
  await page.getByTestId("receipt").waitFor({ timeout: 120_000 });
  return "same passkey, same exit account";
});

await check("recover: return USDC left in the exit account", async () => {
  await payFromOutside(exitAccount, "0.75");
  await page.goto(`${BASE}/recover`, { waitUntil: "load" });
  await ready();
  // The exit account is still unlocked in this tab's session after Mode B? A reload clears it: sign in.
  const signIn = page.getByRole("button", { name: "Sign in with passkey" }).last();
  if (await signIn.isVisible().catch(() => false)) await signIn.click();
  await page.getByRole("heading", { name: "Return to my wallet" }).waitFor({ timeout: 60_000 });
  await page.getByLabel("Wallet address").fill(wallet);
  await page.getByRole("button", { name: "Return to my wallet" }).click();
  await page.getByText("Returned to your wallet").waitFor({ timeout: 120_000 });
});

await check("recover: resume an interrupted exit", async () => {
  await payFromOutside(exitAccount, "0.5");
  await page.reload({ waitUntil: "load" });
  await ready();
  await page.getByRole("button", { name: "Sign in with passkey" }).last().click();
  await page.getByRole("heading", { name: "Resume exit" }).waitFor({ timeout: 60_000 });
  await page.getByLabel("Exchange deposit address").fill(cfg.simulatorDeposit);
  await page.getByLabel("Memo", { exact: true }).fill(memo);
  await page.getByRole("button", { name: "Resume exit" }).click();
  await page.getByText("Exit finished").waitFor({ timeout: 120_000 });
});

await check("exit: blocks a missing memo for a memo-required address", async () => {
  await page.goto(`${BASE}/exit?to=${cfg.simulatorDeposit}&memoType=none&amount=1`, { waitUntil: "load" });
  await page.getByText(/This exchange requires a memo/).waitFor({ timeout: 30_000 });
  if (await page.getByRole("button", { name: "Continue with passkey" }).isEnabled()) throw new Error("not blocked");
});

await check("exit: refuses a contract address as destination", async () => {
  await page.getByLabel(/Exchange deposit address/).fill(wallet);
  await page.getByText(/That is a contract/).waitFor({ timeout: 10_000 });
});

await check("receipt and how pages", async () => {
  await page.goto(`${BASE}/receipt`, { waitUntil: "load" });
  await page.getByText(/USDC/).first().waitFor({ timeout: 15_000 });
  await page.goto(`${BASE}/how`, { waitUntil: "load" });
  await page.getByText(cfg.sponsor).first().waitFor();
});

await check("404 page", async () => {
  const r = await page.goto(`${BASE}/nope`, { waitUntil: "load" });
  if (r.status() !== 404) throw new Error(`status ${r.status()}`);
});

if (errors.length) console.log(`page errors:\n  ${errors.slice(0, 5).join("\n  ")}`);
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed in ${secs()}`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
