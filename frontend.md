# Frontend Style & Structure Guide — "Midday" system

Extracted from [`midday-ai/midday`](https://github.com/midday-ai/midday) (© Midday Labs AB, **AGPL-3.0**). The marketing site is `apps/website`; the shared tokens and components are `packages/ui`; the product app is `apps/dashboard`.

**The one-line description:** monochrome editorial SaaS. A white (or near-black) ground, warm off-white tiles, **no brand colour at all**, Hedvig Letters Serif headlines over Hedvig Letters Sans body, both at a single weight, square corners and 1px hairlines everywhere, full-width rules between sections, and the product's own UI (SVG screens and scripted animations) doing all the visual work. The page is quiet so the product can be loud.

**Written for building agents.** §6 is a section-by-section blueprint of the landing page, and §7 is a replace map: every Midday-specific string, URL, asset and claim, and what to put in its place.

---

## 0. Read this first

1. **Licence.** The repo is AGPL-3.0. Copying its *code* into another product brings AGPL obligations with it, including offering source to users who interact with the product over a network. Reusing the *design language* (a palette, a type pairing, a layout pattern, rebuilt in your own code) is a different matter. If you're building something closed-source, rebuild from this spec rather than forking files. I'm not a lawyer; check before shipping.
2. **Brand and claims.** "Midday", the logo, the giant footer wordmark, customer testimonials, "25,000+ banks", the GDPR and SOC 2 badges and the "joining Ramp" notices all belong to Midday. None of them transfer. §7 lists where each one lives.
3. **The current state of the site.** At the time of extraction the site carries a fixed top banner and a hero pill announcing that Midday is joining Ramp. The layout is offset to make room for that banner (header at `top-9`, main at `pt-9`). Remove both and reset the offsets (§6.0).
4. **Two apps, one token set.** The website and the dashboard share `packages/ui` tokens. This guide is mostly the website; §10 notes where the dashboard differs.

---

## 1. Stack and file map

| Concern | Choice |
|---|---|
| Monorepo | Bun workspaces + Turborepo; Biome for lint/format |
| Website | Next.js 16 App Router (Turbopack), React 19 |
| Styling | **Tailwind v3** with a shared preset: `apps/website/tailwind.config.ts` extends `@midday/ui/tailwind.config` |
| Tokens | HSL CSS variables in `packages/ui/src/globals.css`, shadcn-style naming |
| Components | `packages/ui` (shadcn/Radix-based): `Button` (cva), `Icons`, `PlanCards`, and 17 scripted product animations |
| Fonts | `next/font/google`: **Hedvig Letters Serif** + **Hedvig Letters Sans**, weight 400 only |
| Motion | `motion` / `framer-motion` for scripted demos; Tailwind keyframes for marquees, dropdowns, fades |
| Theme | `next-themes`, `attribute="class"`, default `system` |
| Content | MDX for docs (`app/docs/content/*.mdx`) and the changelog (`app/updates/posts/*.mdx`) |
| SEO | `createPageMetadata()` helper per page; generated OG images at `/api/og?title=…`; Organization JSON-LD in the root layout |
| Analytics | `@midday/events` `track()` on every CTA, with `label` and `position` |

### Where things live

```
apps/website/src/
  app/layout.tsx                 fonts, metadata, JSON-LD, ThemeProvider, SunsetBanner, Header, Footer
  app/page.tsx                   → components/startpage.tsx (the landing page)
  app/{invoicing,transactions,inbox,time-tracking,customers,file-storage,
       pre-accounting,assistant}/page.tsx      feature pages (one template, §6.10)
  app/pricing, integrations/[slug], compare/[slug], mcp/*, chat/*, docs/[slug],
       updates/[slug], story, download, support, policy, terms
  components/header.tsx          fixed glass header, mega-menus with preview cards
  components/footer.tsx          link columns, compliance, theme toggle, giant wordmark
  components/startpage.tsx       hero + how-it-works + section stack
  components/sections/*.tsx      reusable sections (features grid, time savings,
                                 pre-accounting, testimonials, integrations, pricing, FAQ)
  components/hero-image.tsx      light/dark image pair
  data/apps.ts                   integrations list (drives marquee + /integrations)
  lib/metadata.ts                createPageMetadata()
  styles/globals.css             site-only keyframes, blog styles, reduced motion
packages/ui/src/
  globals.css                    THE TOKENS (light + dark + chart colours)
  tailwind.config.ts             colour mapping, font mapping, radius, keyframes
  components/button.tsx          cva Button
  components/plan-cards.tsx      pricing tiers
  components/animations/*.tsx    scripted product demos (transaction flow, invoice
                                 payment, inbox match, dashboard, …)
```

---

## 2. Colour tokens

Shadcn-style HSL triplets, consumed as `hsl(var(--token))`.

```css
:root {
  --background: 0, 0%, 100%;          /* #ffffff */
  --foreground: 0, 0%, 7%;            /* #121212 */
  --card: 45 18% 96%;                 /* #f7f6f3  warm off-white */
  --popover: 45 18% 96%;
  --primary: 240 5.9% 10%;            /* near-black */
  --primary-foreground: 0 0% 98%;
  --secondary: 40, 11%, 89%;          /* #e6e4e0  warm grey tile */
  --muted: 40, 11%, 89%;
  --accent: 40, 10%, 94%;
  --muted-foreground: 0, 0%, 38%;     /* #616161 */
  --border: 45, 5%, 85%;              /* #dbdad7  warm hairline */
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --radius: 0.5rem;
}
.dark {
  --background: 0, 0%, 5%;            /* #0d0d0d */
  --foreground: 0 0% 98%;
  --card: 0, 0%, 7%;                  /* #121212 */
  --primary: 0 0% 98%;                /* inverts: light buttons on dark */
  --primary-foreground: 240 5.9% 10%;
  --secondary: 0, 0%, 7%;
  --muted: 0, 0%, 11%;
  --accent: 0, 0%, 11%;
  --muted-foreground: 0, 0%, 38%;     /* same #616161 as light (see §9) */
  --border: 0, 0%, 11%;               /* #1c1c1c */
}
```

Plus a full set of **chart tokens** (`--chart-grid-stroke`, `--chart-actual-line`, `--chart-forecast-line`, `--chart-bar-fill`, …), monochrome in both themes: black lines on white, white lines on black, greys for forecasts.

### How the palette is spent

- **There is no brand colour.** Primary is near-black in light mode and near-white in dark. CTAs, active states and progress bars are all `primary`.
- **Warmth lives in the greys.** Light-mode tiles and hairlines carry a 40–45° hue at low saturation (`#f7f6f3`, `#e6e4e0`, `#dbdad7`), so the page reads as paper rather than screen. Dark mode drops the warmth entirely and goes pure neutral.
- **The only colour on the page is borrowed.** Product screenshots and animations carry category colours; partner logos carry their own; the AI-client icons show their brand colour only on hover; the footer status dot is green.
- **Two surface tones.** `bg-background` for most cards, `bg-secondary` for icon tiles, the pre-accounting card and the one emphasised bento card.

### One syntax detail worth keeping

Some tokens are written with commas (`0, 0%, 100%`) and some with spaces (`240 5.9% 10%`). The comma form is what makes `hsla(var(--background), 0.8)` work, and the site uses exactly that in every edge-fade gradient. If you normalise the tokens to space syntax, those fades break silently. Either keep `--background` in comma form or rewrite the fades as `hsl(var(--background) / 0.8)`.

---

## 3. Typography

```tsx
const hedvigSans  = Hedvig_Letters_Sans({  weight: "400", display: "optional", variable: "--font-hedvig-sans",  fallback: ["system-ui", "arial"] });
const hedvigSerif = Hedvig_Letters_Serif({ weight: "400", display: "optional", variable: "--font-hedvig-serif", fallback: ["Georgia", "Times New Roman", "serif"] });
```

```ts
fontFamily: { sans: "var(--font-hedvig-sans)", mono: "var(--font-hedvig-sans)", serif: "var(--font-hedvig-serif)" }
```

### Rules

- **Serif for headlines only.** Every `h1` and every section `h2` is `font-serif`. Everything else (subheads, body, nav, buttons, labels, card titles) is sans.
- **One weight.** Both faces load only weight 400. Hierarchy comes from size, the serif/sans switch, and foreground vs `muted-foreground`. There is no bold.
- **No monospace exists.** `font-mono` is mapped to the sans face. Numbers, code and labels all render in Hedvig Sans.
- **`display: "optional"`.** If the font isn't ready within roughly 100ms, the fallback is used for the whole visit rather than swapping in later. Zero layout shift, at the cost of some first visits seeing Georgia/system-ui. Choose this deliberately.

### Scale in use

| Role | Classes |
|---|---|
| Landing h1 | `font-serif text-3xl md:text-4xl lg:text-6xl xl:text-7xl 3xl:text-8xl leading-[1.1] tracking-tight` |
| Feature-page h1 | `font-serif text-8xl xl:text-9xl 2xl:text-[11rem] leading-tight` (desktop) |
| Section h2 | `font-serif text-2xl` — deliberately small; the sections are quiet |
| Feature step title | `font-sans text-lg lg:text-xl` |
| Section subline | `font-sans text-base text-muted-foreground leading-normal max-w-2xl`, **hidden below `sm`** |
| Card title | `text-base sm:text-lg text-foreground` |
| Body / card copy | `text-sm text-muted-foreground` |
| Eyebrow | `text-xs tracking-wide text-muted-foreground` (feature pages: `uppercase tracking-wider`) |
| Microcopy | `text-xs text-muted-foreground` |

Note how small the section `h2` is: 24px serif at every breakpoint. The landing's drama is concentrated in the hero `h1`, the full-bleed product video and the 508px footer wordmark. Everything between is set at reading size.

### The muted word

```tsx
<h1>The business stack for <em className="not-italic text-muted-foreground/80">modern</em> founders</h1>
```

One word in the hero headline is greyed back rather than highlighted. It's the system's only typographic emphasis device, and it de-emphasises.

---

## 4. Surface grammar

- **Square corners.** The `Button` cva has no radius class, tiles use `rounded-none`, the feature-step dots are square. The `--radius` token exists (0.5rem) for shadcn components in the dashboard, but the website doesn't use it.
- **The exceptions are round on purpose:** the announcement pill, integration pills, avatar images, the pro-plan badge and the status dot. Round means "chip" or "person"; square means everything else.
- **1px hairlines, no shadows.** Cards are `bg-background border border-border`. Hover darkens the border to `muted-foreground` (`hover:border-muted-foreground`). The only shadows on the site are the hero dashboard's drop shadow and `shadow-lg` under the mega-menus.
- **Full-width section rules.** Between every landing section:
  ```tsx
  <div className="max-w-[1400px] mx-auto"><div className="h-px w-full border-t border-border" /></div>
  ```
- **Edge fades.** Horizontal scrollers and marquees fade into the page with a stepped gradient built from the background token, so they work in both themes:
  ```ts
  background: "linear-gradient(to left, hsl(var(--background)) 0%, hsl(var(--background)) 30%, hsla(var(--background), 0.8) 50%, hsla(var(--background), 0.4) 70%, transparent 100%)"
  ```
  The same device, vertically, fades the bottom 20% of hero product images into the page.
- **Light/dark asset pairs.** Every product image ships twice (`*-light.svg`, `*-dark.svg`), toggled with `dark:hidden` / `hidden dark:block`.

---

## 5. Layout

```tsx
<body className="bg-background overflow-x-hidden font-sans antialiased">
  <SunsetBanner />                                         {/* fixed, h-9, z-60 */}
  <Header />                                               {/* fixed, top-9, z-50 */}
  <main className="container mx-auto px-4 pt-9 overflow-hidden md:overflow-visible">…</main>
  <Footer />
</body>
```

- **Content column:** `max-w-[1400px] mx-auto` inside every section.
- **Section rhythm:** `py-12 sm:py-16 lg:py-24`.
- **Section header pattern** (used by every section):
  ```tsx
  <div className="text-center space-y-4 mb-10 sm:mb-12">
    <h2 className="font-serif text-2xl text-foreground">{title}</h2>
    <p className="hidden sm:block font-sans text-base text-muted-foreground leading-normal max-w-2xl mx-auto">{subtitle}</p>
  </div>
  ```
  The subline disappears on phones. Mobile gets a headline and the content, nothing else.
- **Breakpoints:** Tailwind defaults plus `3xl: 1800px`. The header switches from hamburger to full nav at `xl` (1280px), late, so the nav never crowds.
- **Below-the-fold sections are `dynamic()` imports** (still SSR for SEO), and the scripted animations (5,500+ lines) load after the hero.

---

## 6. Landing page blueprint

The landing page is `components/startpage.tsx`. In order:

```
0  Sunset banner (fixed, remove)
1  Header (fixed glass bar + mega-menus)
2  Hero: pill → serif h1 → subline → one CTA → microcopy → AI-client icon row
   → full-bleed looping video with a tilted dashboard image on top → video modal
3  How it works: 3-step timeline ↔ scripted animation canvas (auto-advancing)
   ── rule ──
4  Features grid: 8 square icon tiles linking to feature pages
   ── rule ──
5  Time savings: problem bento grid with one hover-swap card
   ── rule ──
6  Pre-accounting: single checklist card
   ── rule ──
7  Testimonials: drag-scroll cards, star row, morphing dialog
   ── rule ──
8  Integrations: two opposing marquee rows of logo pills
9  Footer: link columns, tagline, compliance, theme toggle, status, giant wordmark
```

Pricing and FAQ sections exist (`sections/pricing-section.tsx`, `faq-section.tsx`) but are not on the landing page; they're used on `/pricing` and feature pages.

### 6.0 Sunset banner — remove

`components/sunset-banner.tsx`: a fixed `h-9` strip, `bg-secondary border-b`, "Midday is joining Ramp. Read the announcement". It's mounted in the root layout, and two other things are offset for it:

- Header: `fixed top-9` → change to `top-0`.
- Main: `pt-9` → remove.

If your product needs an announcement strip, keep the component and the offsets and replace the copy.

### 6.1 Header

- `fixed left-0 right-0 z-50`, padding `py-3 xl:py-4`, horizontal padding stepping `px-4 → xl:px-6 → 2xl:px-8`.
- **Glass:** `backdrop-blur-md bg-background-semi-transparent`. That utility paints an 80%-opacity background on a `::before` pseudo-element, so the blur reads through it. When a mega-menu opens it goes solid (`xl:bg-background`).
- **Left:** a 24px logo mark plus the lowercase wordmark text, which shows only below `xl`.
- **Desktop nav (`xl`+):** Features ▾ · Resources ▾ · Story · Download, then a hairline `border-l` and "Sign in" as a text link. There is no primary button in the header; the hero owns the CTA.
- **Mega-menus:** full-width panels under the bar (`bg-background border-y shadow-lg`, `animate-dropdown-fade`). Features lists the eight feature pages beside **preview cards** (a 277px bordered card with a light/dark illustration and a caption), plus a customer-stories card that rotates to the next testimonial each time the menu opens. Resources lists Integrations, Documentation, CLI, AI integrations, Developer & API, SDKs, Chat, Computer. Hover-open with a 200ms close delay and an invisible bridge so the cursor can travel into the panel.
- **Mobile (`< xl`):** a 44px hamburger drawn as three 1.5px bars, opening a full-screen `bg-background` panel with accordion sections.

**Replace:** logo, wordmark, menu items, preview illustrations, the testimonial rotation, the Sign in URL.

### 6.2 Hero

The section is `min-h-screen`, centred, with the copy stacked above a full-bleed product visual.

**Copy stack** (`max-w-3xl` centred, `space-y-5 lg:space-y-6`):

1. **Announcement pill**: `rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground`, trailing →, hover darkens text and border. Currently "Midday is joining Ramp". Use it for a launch, a release or a funding note, or delete it.
2. **H1**: serif, sized per §3, one word in `text-muted-foreground/80`. Currently "The business stack for *modern* founders".
3. **Subline**: `text-base lg:text-lg text-muted-foreground max-w-xl`. One sentence listing what the product does.
4. **One CTA**: `Button` (default variant: `bg-primary`, square), `h-11 px-6 text-sm`, "Start your trial", tracked with `position: "hero"`.
5. **Microcopy**: `text-xs text-muted-foreground`, "14-day free trial · Cancel anytime".
6. **AI-client icon row**: eight 18px monochrome SVG logos at `opacity-40`, each linking to an `/mcp/<client>` page and showing the client's brand colour on hover (`hover:text-[#D97757]` for Claude, and so on). This is product-specific; replace it with your own integrations row or delete it.

**Visual:**

- A **looping background video** (`autoPlay loop muted playsInline preload="none"`), `h-[420px]` rising to `3xl:h-[1000px]`, `object-cover`.
- A **poster image** over it that starts at `blur(12px) scale(1.05)`, sharpens on load, then fades out once the video can play.
- A **dashboard illustration** centred on top (separate light and dark SVGs), `max-w-[85%]` (`2xl:75%`), tilted on desktop with `rotate(-2deg) skewY(1deg)` and `drop-shadow(0 30px 60px rgba(0,0,0,.6))`, blurring in from `blur(20px)` on load.
- A **square play button** (`bg-muted`, 48–64px) that opens a **video modal**: a bordered `max-w-4xl` panel over a `backdrop-blur-sm` scrim, the video on top, and a horizontally scrolling row of seven tabs below (Overview, Transactions, Inbox, Time tracking, Invoicing, Customers, Files). The active tab shows a 2px `bg-primary` progress bar tracking playback; the row scrolls to keep neighbours visible and fades out at the right edge.

**Note:** in the source, all seven tabs point at the same video file, each with a "Replace with actual video URL" comment. The tabbed modal is a template, not finished content.

**Replace:** video and poster URLs (currently `cdn.midday.ai`), both dashboard SVGs, the seven tab titles, subtitles and video URLs, the CTA label, destination and microcopy.

### 6.3 How it works

Desktop (`lg`+) is a two-column grid at a fixed `lg:h-[740px]`:

- **Left:** a vertical timeline of 8px **square** dots joined by a 1px hairline, beside "How it works" (serif) and three step titles. The active step is full opacity and expands to show its subtitle with a `fadeInBlur` (0.35s); inactive steps sit at `opacity-60`. Dots and titles are both clickable.
- **Right:** a bordered canvas that plays a **scripted product animation** for the active step (`TransactionFlowAnimation`, `InvoicePaymentAnimation`, `InboxMatchAnimation`), remounted with `key={activeFeature}` and a `fadeInScale` entrance. Each animation calls `onComplete` when it finishes, which advances to the next step, so the section cycles through the product by itself.

Mobile stacks the three steps, each with its title, a short `mobileSubtitle` and its animation in a bordered frame.

**Replace:** the `features` array (title, subtitle, mobileSubtitle) and the three animation components. If you can't build scripted animations, a short looping video or a static screen per step fits the same frame; keep the auto-advance on a timer.

### 6.4 Features grid

"Everything you need to run your business". Eight links in two rows of four (`grid-cols-2` on phones, a centred `flex gap-20` row from `sm`), each a **60px square tile** (`bg-secondary border border-border`, Material outlined icon in `muted-foreground`, border darkens on hover) above a two-line label: name in `text-foreground`, descriptor in `text-muted-foreground`, both `text-sm`.

**Replace:** eight items of `{ href, icon, name, descriptor }`. The grid assumes eight; with six, use one row of three or two rows of three.

### 6.5 Time savings bento

"Less admin. More focus." Two grids of bordered cards, each with a small eyebrow, a `text-base sm:text-lg` title and a `text-sm` muted body, every card naming a chore the product removes. The second row is a 10-column grid at `xl` holding a 3-column card and a **7-column emphasised card** (`bg-secondary`) whose eyebrow, title and body **swap on hover**: "What disappears over time / Manual work caused by disconnected tools" becomes "Get your time back / Midday handles the busywork so you can focus on running the business."

**Replace:** five problem cards and the before/after copy on the wide card. The pattern works for any "pain → relief" story.

### 6.6 Pre-accounting checklist

"Ready for accounting, without extra work". A single `max-w-2xl` `bg-secondary border p-6` card with five rows, each a 20px square check box, a title and a muted line ("Transactions from 25,000+ banks…", "Receipts pulled from email and uploads…", "Taxes tracked per transaction…"), and a "Learn more" link underneath.

**Replace:** five capability rows and the link. Don't carry over the "25,000+ banks" figure.

### 6.7 Testimonials

"Built alongside our users". A star row, then a horizontally drag-scrollable strip of `w-64` bordered cards (avatar, name, quote excerpt), centred on mount. Each card expands into a `MorphingDialog` with the full quote. The section is client-only (`ssr: false`) because the dialog generates IDs that mismatch on hydration.

**Replace:** the testimonial data. Use real quotes from real users, or remove the section. The star row implies a rating, so drop `showStars` unless you have one.

### 6.8 Integrations marquee

"Works with the tools you already use". Two rows of **round** logo pills (`rounded-full border px-3 py-1.5`, 16px logo plus name) scrolling in opposite directions (`marquee-left` 30s, `marquee-right` 28s), paused while hovered, with stepped edge fades. Each pill links to `/integrations/<slug>`. Data comes from `data/apps.ts`.

**Replace:** the apps list (`{ id, name, slug, logoUrl }`). With fewer than about ten items, use one row; a sparse marquee looks emptier than a static row.

### 6.9 Footer

- `max-w-[1400px] px-4 sm:px-8 py-16 sm:pb-80`. The big bottom padding makes room for the wordmark.
- **Left:** link columns (Features, Product, Company, Resources), `text-sm text-muted-foreground`, hover to foreground.
- **Right:** a one-line tagline in `text-base sm:text-xl` ("Run your company. Not the admin."), compliance badges (GDPR "Compliant", SOC 2 "In progress"), and a bordered theme toggle that names the mode it switches to.
- A hairline, then a **system status** link with a pulsing green dot, and the copyright line.
- **The giant wordmark:** "midday" at `text-[200px] sm:text-[508px]` in `text-secondary` with a 1px `muted-foreground` text-stroke, absolutely positioned and pushed 25–40% below the footer's bottom edge so it's cropped.

**Replace:** columns and links, the tagline, the compliance badges (**only claim what you hold**), the status URL, the copyright holder and the wordmark text. See §9 on the wordmark's markup and the status label.

### 6.10 Feature-page template

Each feature page (`components/invoicing.tsx` and its siblings) reuses one shape:

1. **Hero:** a full-viewport grid-pattern SVG behind (light and dark variants, the dark one at 12% opacity), an uppercase `text-xs` eyebrow naming the feature, a **giant serif h1** (`text-8xl → 2xl:text-[11rem]`, e.g. "Get paid faster"), a muted subline, and a light/dark product image in `max-w-6xl` fading into the page at the bottom. Mobile gets a smaller `text-4xl` h1.
2. **Two highlight rows**, each a short title and copy beside a scripted animation.
3. **The shared section stack:** rule → Features grid → rule → Time savings → rule → Pre-accounting → rule → Testimonials → rule → Integrations.

**Replace:** eyebrow, h1, subline, the image pair and the two highlight rows. The shared stack can stay as it is, which is the point of the sections taking props.

---

## 7. Replace map

Every Midday-specific value an agent needs to swap.

| What | Where | Midday value | Replace with |
|---|---|---|---|
| Product name | `layout.tsx` metadata and JSON-LD, page metadata, copy throughout | "Midday" | your name |
| Title template | `layout.tsx` | `"%s \| Midday"` | yours |
| Default title and description | `layout.tsx`, `app/page.tsx` | "The business stack for modern founders" | your positioning line |
| Base URL | `app/sitemap.ts` (`baseUrl`) | midday.ai | your domain |
| App and sign-in URL | hero CTA, header, pricing | `https://app.midday.ai/` | your app URL |
| CDN | `<link rel="preconnect">`, video, poster, OG image | `cdn.midday.ai` | your CDN or `/public` |
| OG images | `app/api/og/route.tsx` | default title "Midday"; fetches the serif font from `cdn.midday.ai` | your default title; host the font yourself |
| JSON-LD Organization | `layout.tsx` | name, logo, X, GitHub, LinkedIn | yours |
| Logo | `Icons.LogoSmall` in `packages/ui` | Midday mark | your mark (24px, `currentColor`) |
| Footer wordmark | `footer.tsx` | "midday" | your wordmark, lowercase reads best at this size |
| Announcement | `sunset-banner.tsx`, hero pill | "Midday is joining Ramp" | remove, or your news |
| Hero h1 + muted word | `startpage.tsx` | "The business stack for *modern* founders" | your line; grey back one word or none |
| Hero subline | `startpage.tsx` | invoicing, reconciliation, hours, insights, exports | one sentence |
| CTA + microcopy | `startpage.tsx`, `pricing-section.tsx` | "Start your trial" / "14-day free trial · Cancel anytime" | your offer, only if true |
| AI-client icon row | `startpage.tsx` | Claude, ChatGPT, Perplexity, Raycast, Cursor, Manus… → `/mcp/*` | your integrations, or delete |
| Hero video + poster | `startpage.tsx` | `login-video.mp4`, `video-poster-v2.jpg` | your loop |
| Dashboard images | `public/images/dashboard-{light,dark}.svg` | Midday dashboard | your product, both themes |
| Video modal tabs | `videos` array | 7 tabs, one placeholder URL | your clips, or remove the modal |
| How-it-works steps | `features` array + 3 animation components | transactions, invoices, reconciliation | 3 steps of your flow |
| Feature tiles | `features-grid-section.tsx` | 8 Midday features | your features and routes |
| Time-savings cards | `time-savings-section.tsx` | admin chores | your users' pains |
| Checklist | `pre-accounting-section.tsx` | accounting readiness, "25,000+ banks" | your capabilities |
| Testimonials | `testimonials-section.tsx`, `header.tsx` (`headerTestimonials`) | Midday customers | real quotes, or remove |
| Integrations | `data/apps.ts` (from `@midday/app-store`, `@midday/connectors`) | banks, Gmail, Xero, Slack… | your list |
| Pricing | `PlanCards` in `packages/ui` | Starter / Pro | your tiers |
| Footer tagline | `footer.tsx` | "Run your company. Not the admin." | yours |
| Compliance badges | `footer.tsx`, `public/images/{gdpr,soc2}.png` | GDPR, SOC 2 in progress | only what you hold |
| Status link | `footer.tsx` | `midday.openstatus.dev`, hard-coded "Operational" | your status page, read live |
| Copyright | `footer.tsx` | "Midday Labs AB" | your entity |
| Analytics | `track()` calls, `<Analytics />` | `@midday/events` | your analytics, or strip |
| Feature pages | `app/<feature>/page.tsx` + `components/<feature>.tsx` | 8 Midday features | your features, same template |
| Docs and changelog | `app/docs/content`, `app/updates/posts` | Midday MDX | your content, or remove routes |
| Compare pages | `data/competitors.ts` | Midday vs competitors | yours, or remove |

A sensible first move for an agent: pull the scattered constants into one `site.config.ts` (name, urls, cta, hero, steps, features, testimonials, integrations, footer) and have the components read from it. The source hard-codes them per file.

---

## 8. Motion

| Motion | Where | Detail |
|---|---|---|
| Poster and image blur-in | hero | `blur(12–20px) scale(1.02–1.05)` → sharp over 1s on load |
| Background video | hero | autoplay, muted, loop |
| `fadeInBlur` | active how-it-works step | opacity + 6px blur, 0.35s |
| `fadeInScale` | animation canvas on step change | 0.9 → 1, 0.4s |
| Scripted demos | how-it-works, feature pages | framer-motion sequences, auto-advance via `onComplete` |
| `marquee-left` / `-right` | integrations | 30s / 28s linear, pause on hover |
| `dropdown-fade`, `dropdown-slide` | mega-menus | 0.15s / 0.2s |
| Hover-swap copy | time-savings wide card | instant text swap |
| `pulse-glow` | footer status dot | 2s |
| Hover | links, tiles, cards | colour and border changes only; nothing moves |

`styles/globals.css` clamps CSS animations and transitions under `prefers-reduced-motion`. See §9 for what that doesn't cover.

---

## 9. Accessibility and known issues

Light mode is solid: `foreground` on white is 18.76:1 and `muted-foreground` is 6.20:1 (5.73 on cards). Dark mode and focus handling are where this falls down.

| Issue | Detail | Fix |
|---|---|---|
| **Dark-mode body text fails** | `--muted-foreground` is `#616161` in both themes. On the dark background it's **3.14:1**, and it carries every subline and card body | raise the dark value to roughly 0 0% 60% |
| Dark-mode muted hero word | `muted-foreground/80` on `#0d0d0d`: **2.42:1** | lighter muted value, or drop the device |
| **No button focus style** | `Button` sets `focus-visible:outline-none` and adds no ring | add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| Dashboard removes all focus | `apps/dashboard` globals: `*:focus { outline: none; }` | delete; style `:focus-visible` instead |
| Scripted demos ignore reduced motion | framer-motion animations run on JS, so the CSS clamp doesn't touch them; the background video autoplays regardless. A `usePlayOnceOnVisible` hook that respects reduced motion exists but isn't used | gate demos and autoplay on `useReducedMotion()` |
| Icon-only links without names | the hero's AI-client icon links contain only an SVG: no `aria-label`, no title | add `aria-label` per link |
| Faint icons | those icons rest at `opacity-40`: 1.82:1 in light mode | rest at 60–70% |
| Two `h1`s per page | the footer wordmark is an `<h1>` | make it a `div` with `aria-hidden` |
| Hard-coded status | the footer always says "Operational" | read the status provider live, or say "System status" without a state |
| Dead classes | `btn-inverse`, `hover-bg`, `hover-border` are used but defined nowhere; the hero CTA falls back to the default button variant | delete, or define them |
| Placeholder videos | all seven modal tabs load the same file | supply real clips or remove the tabs |

Good things to keep: `aria-label` on the timeline dots, the hamburger and the theme toggle; the theme toggle naming the mode it switches to; 44px hit areas on the mobile menu button; the stated respect for reduced motion in CSS.

---

## 10. The dashboard (`apps/dashboard`)

Same tokens and fonts through `@midday/ui`, set denser: shadcn components that do use `--radius` (8px), skeleton loaders (`.skeleton-box`, `.skeleton-circle`) in the border colour, a PIN-field component, and charts styled entirely by the `--chart-*` tokens. If you clone the landing for another product, the dashboard is optional; if you clone the dashboard, fix its global focus removal first.

---

## 11. Copy voice

- **Category line over feature list:** "The business stack for modern founders."
- **Section heads are short and plain:** "How it works", "Less admin. More focus.", "Works with the tools you already use", "Built alongside our users".
- **Benefit-first step titles:** "Invoices get paid", "All your transactions, unified", "Automatic reconciliation".
- **Mobile gets shorter copy, written separately** (`mobileSubtitle`), not truncated.
- **Hover reveals the payoff:** "What disappears over time" turns into "Get your time back".
- **Sign-off with attitude:** "Run your company. Not the admin."
- **Middots join microcopy:** "14-day free trial · Cancel anytime".
- Sentence case everywhere except feature-page eyebrows; lowercase wordmark.

---

## 12. Build checklist for an agent

1. Decide licence posture first (§0): fork under AGPL, or rebuild from this spec.
2. Tokens: copy the variable *structure* (background, foreground, card, secondary, muted, border, primary, chart-*) and pick your own greys. Keep `--background` in comma syntax or rewrite the fades. Set dark `--muted-foreground` to pass 4.5:1.
3. Fonts: one serif and one sans of the same family or era, a single weight each, serif for h1/h2 only.
4. Button: square, `bg-primary`, `h-11 px-6` for the hero, **with a focus ring**.
5. Layout shell: fixed glass header, `max-w-[1400px]` sections at `py-12 sm:py-16 lg:py-24`, a hairline rule between sections, footer with oversized outlined wordmark. Drop the banner offsets unless you keep a banner.
6. Build the landing in the order of §6, filling slots from one `site.config.ts` (§7).
7. Produce light and dark versions of every product image. The design depends on them.
8. For how-it-works, wire auto-advance (`onComplete` or a timer) and gate it on reduced motion.
9. Remove or replace every claim in §7 you can't back: banks count, compliance, testimonials, trial terms, status.
10. Check contrast in **both** themes.

---

## 13. What to keep, what to change

| Keep | Change |
|---|---|
| No brand colour; the product UI supplies all the colour | Only if your product UI is itself colourless; then you need an accent |
| Serif headlines over a sans body, single weight | The family |
| Square corners for structure, round only for chips and people | — |
| Hairlines and section rules instead of shadows | — |
| Small, quiet section heads; drama only in hero and footer | — |
| Light/dark asset pairs for every product image | — |
| Self-advancing how-it-works driven by real product animation | The animations themselves |
| Section components that take props and stack on every feature page | The sections in the stack |
| Separate mobile copy instead of truncation | — |
| Dark mode `muted-foreground` | **Fix it** (§9) |

**The idea to think hardest about:** this design is mostly negative space and grey type around product imagery. It works because Midday has a lot of polished product to show: a full dashboard in two themes, a looping video, three bespoke scripted animations, eight feature illustrations, a mega-menu with preview cards. Strip those out and what's left is a white page of small serif headings, which reads as unfinished rather than restrained. Before adopting the system, check that you can supply the imagery it's built to frame: at minimum a light and dark hero screen and one real interaction per how-it-works step. If you can't yet, borrow the structure and add one accent colour until you can.
