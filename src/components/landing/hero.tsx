import Link from "next/link";
import { site } from "@/lib/site.config";
import { Icons } from "../icons";
import { ButtonLink } from "../ui";
import { ProductScreen } from "./product-screen";

export function Hero() {
  const h = site.hero;
  return (
    <section className="flex min-h-screen flex-col items-center pt-32 sm:pt-36 lg:pt-40">
      <div className="mx-auto max-w-3xl space-y-5 text-center lg:space-y-6">
        <Link
          href={h.pill.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
        >
          {h.pill.label} <span aria-hidden>→</span>
        </Link>
        <h1 className="font-serif text-4xl leading-[1.1] tracking-tight md:text-5xl lg:text-6xl xl:text-7xl 3xl:text-8xl">
          {h.h1.before}
          <em className="not-italic text-muted-foreground">{h.h1.muted}</em>
          {h.h1.after}
        </h1>
        <p className="mx-auto max-w-xl text-base text-muted-foreground lg:text-lg">{h.subline}</p>
        <div className="flex flex-col items-center gap-4 pt-1">
          <ButtonLink href={h.cta.href} size="lg">
            {h.cta.label}
          </ButtonLink>
          <p className="text-xs text-muted-foreground">
            {h.micro.join(" · ")} ·{" "}
            <Link href={h.secondary.href} className="text-foreground underline-offset-4 hover:underline">
              {h.secondary.label}
            </Link>
          </p>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs text-muted-foreground" aria-label="Supported wallets">
          {site.wallets.list.slice(0, 4).map((w) => (
            <li key={w.name} className="opacity-70">
              {w.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Visual: grid ground, product screen tilted on desktop, fading into the page. */}
      <div className="relative mt-14 w-full max-w-[1400px] sm:mt-16">
        <div className="grid-pattern absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black)] dark:opacity-25" aria-hidden />
        <div className="relative flex h-[440px] items-start justify-center overflow-hidden px-2 pt-10 sm:h-[520px] lg:h-[600px] lg:pt-16 3xl:h-[760px]">
          <div className="w-full max-w-[85%] animate-blur-in sm:max-w-2xl lg:[transform:rotate(-2deg)_skewY(1deg)] lg:[filter:drop-shadow(0_30px_60px_rgba(0,0,0,.18))] dark:lg:[filter:drop-shadow(0_30px_60px_rgba(0,0,0,.6))] 2xl:max-w-3xl">
            <ProductScreen />
          </div>
          <div className="fade-bottom absolute inset-x-0 bottom-0 h-1/5" aria-hidden />
        </div>
      </div>
    </section>
  );
}

export function Outcomes() {
  return (
    <div className="grid border border-border md:grid-cols-3">
      {site.outcomes.map((o) => (
        <div key={o.status} className="space-y-2 border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <p className="flex items-center gap-2 text-base text-foreground sm:text-lg">
            <span
              className={`inline-block h-2 w-2 rounded-full ${o.status === "delivered" ? "bg-delivered" : o.status === "waiting" ? "bg-waiting" : "bg-returned"}`}
              aria-hidden
            />
            {o.title}
          </p>
          <p className="text-sm text-muted-foreground">{o.body}</p>
        </div>
      ))}
    </div>
  );
}

export function FeatureTile({ href, icon, name, descriptor }: { href: string; icon: keyof typeof Icons; name: string; descriptor: string }) {
  const Icon = Icons[icon];
  return (
    <Link href={href} className="group flex flex-col items-center gap-3 text-center">
      <span className="flex h-[60px] w-[60px] items-center justify-center border border-border bg-secondary text-muted-foreground transition-colors group-hover:border-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm">
        <span className="block text-foreground">{name}</span>
        <span className="block text-muted-foreground">{descriptor}</span>
      </span>
    </Link>
  );
}
