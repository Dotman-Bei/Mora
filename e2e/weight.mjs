// Page weight: compressed JS/CSS/font bytes each page downloads on first load.
//   node e2e/weight.mjs [base-url]
import { chromium } from "playwright-core";
const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const PAGES = { landing: "/", claim: "/claim?network=testnet&from=GBXUOWMDH7JDRVG6RLX6XR7GZ3SBDQ5QD3VJ7CVTW76T3EWJWFI3HEQB&to=GDWHSY5D4NQ72JR6DULVB2MM2OTAYGYJCTWACJOKJLFKWNVZY3XX43SN&asset=CABKO7FTLFX6LT3UXIWDBKVPE64RQYLQAHYYP6RBLW2OMBA7THKZXA74", send: "/send", inbox: "/inbox", integrate: "/integrate", try: "/try" };
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const [name, path] of Object.entries(PAGES)) {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  const sizes = {};
  const types = {};
  cdp.on("Network.responseReceived", (e) => (types[e.requestId] = e.type));
  cdp.on("Network.loadingFinished", (e) => (sizes[e.requestId] = e.encodedDataLength));
  const t = Date.now();
  await p.goto(BASE + path, { waitUntil: "load" });
  const loadMs = Date.now() - t;
  await p.waitForTimeout(2500);
  const by = {};
  for (const [id, n] of Object.entries(sizes)) { const k = types[id] ?? "Other"; by[k] = (by[k] ?? 0) + n; }
  const kb = (n) => `${((n ?? 0) / 1024).toFixed(0)}KB`;
  console.log(`${name.padEnd(10)} JS ${kb(by.Script).padStart(6)}  CSS ${kb(by.Stylesheet).padStart(4)}  font ${kb(by.Font).padStart(4)}  doc ${kb(by.Document).padStart(4)}  fetch/xhr ${kb((by.Fetch ?? 0) + (by.XHR ?? 0)).padStart(5)}  load ${loadMs}ms`);
  await ctx.close();
}
await b.close();
