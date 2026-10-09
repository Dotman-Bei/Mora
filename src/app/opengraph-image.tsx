import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Social card in the site's own system: warm off-white ground, serif
// headline with one greyed word, hairline, lowercase wordmark. Fonts are
// self-hosted (frontend.md §7).

export const alt = "Portaj: send USDC from your passkey wallet to any exchange.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [serif, sans] = await Promise.all([
    readFile(join(process.cwd(), "src/app/fonts/HedvigLettersSerif-Regular.ttf")),
    readFile(join(process.cwd(), "src/app/fonts/HedvigLettersSans-Regular.ttf")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f7f6f3", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* The mark (src/app/icon.svg) at 4px per unit. */}
          <div style={{ display: "flex", position: "relative", width: 56, height: 48 }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 36, height: 8, background: "#121212" }} />
            <div style={{ position: "absolute", left: 16, top: 12, width: 24, height: 24, background: "#884c07" }} />
            <div style={{ position: "absolute", left: 20, top: 40, width: 36, height: 8, background: "#121212" }} />
          </div>
          <div style={{ fontFamily: "Sans", fontSize: 34, color: "#121212" }}>portaj</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: 112, color: "#121212", letterSpacing: -2 }}>
          Wallet to&nbsp;<span style={{ color: "#8a8a8a" }}>exchange</span>.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ height: 1, background: "#dbdad7" }} />
          <div style={{ fontFamily: "Sans", fontSize: 28, color: "#616161" }}>
            Send USDC from your passkey wallet to any exchange. No XLM. No seed phrase.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Serif", data: serif, weight: 400, style: "normal" },
        { name: "Sans", data: sans, weight: 400, style: "normal" },
      ],
    },
  );
}
