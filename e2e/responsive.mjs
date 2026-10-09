// Responsive audit: every page at every width, checked in a real browser.
//   node e2e/responsive.mjs [base-url]
// Fails on horizontal overflow; reports tap targets under 40px on touch widths.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("./artifacts/resp/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920, 2560];
const SHOTS = new Set([320, 768, 1024, 2560]);
const PAGES = {
  landing: "/",
  exit: "/exit",
  exitB: "/exit?mode=b",
  try: "/try",
  exchange: "/exchange",
  recover: "/recover",
  receipt: "/receipt",
  how: "/how",
  notfound: "/nope",
};

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
let problems = 0;
for (const [name, path] of Object.entries(PAGES)) {
  for (const w of WIDTHS) {
    const p = await b.newPage({ viewport: { width: w, height: w < 768 ? 800 : 1000 }, isMobile: w < 768, hasTouch: w < 768 });
    await p.goto(BASE + path, { waitUntil: "load" });
    await p.waitForTimeout(name === "claim" ? 6000 : 1500);
    const r = await p.evaluate((touch) => {
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - vw;
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (getComputedStyle(el).position === "fixed") continue;
        // Only flag elements whose overflow isn't clipped by an ancestor.
        if (rect.right > vw + 1) {
          let clipped = false;
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const o = getComputedStyle(a);
            if (/(hidden|auto|scroll|clip)/.test(o.overflowX) && a.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
          }
          if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(rect.right - vw)}px`);
        }
      }
      const small = [];
      if (touch) {
        for (const el of document.querySelectorAll("main a, main button, header button, header a, main input")) {
          const rect = el.getBoundingClientRect();
          if (rect.width && rect.height && rect.height < 40 && getComputedStyle(el).display !== "inline")
            small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(rect.height)}px`);
        }
      }
      return { overflow, offenders: offenders.slice(0, 5), small: [...new Set(small)].slice(0, 8) };
    }, w < 768);
    const bad = r.overflow > 0 || r.offenders.length;
    if (bad) problems++;
    console.log(`${bad ? "OVERFLOW" : "ok      "} ${name.padEnd(9)} ${String(w).padStart(4)}px${r.overflow > 0 ? ` +${r.overflow}px` : ""}${r.offenders.length ? `  ${r.offenders.join(" | ")}` : ""}${r.small.length ? `\n         small taps: ${r.small.join(", ")}` : ""}`);
    if (SHOTS.has(w)) await p.screenshot({ path: `${OUT}${name}-${w}.png`, fullPage: true });
    await p.close();
  }
}
await b.close();
console.log(`\n${problems} page/width combinations overflow`);
process.exit(problems ? 1 : 0);
