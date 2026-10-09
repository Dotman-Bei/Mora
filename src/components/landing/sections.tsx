import Link from "next/link";
import { site } from "@/lib/site.config";
import { Icons } from "../icons";
import { Eyebrow, SectionHeader } from "../ui";

function Card({ eyebrow, title, body, className = "" }: { eyebrow: string; title: string; body: string; className?: string }) {
  return (
    <div className={`space-y-2 border border-border bg-background p-6 transition-colors hover:border-muted-foreground ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <p className="text-base text-foreground sm:text-lg">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** Pain → relief bento with one emphasised hover-swap card (frontend.md §6.5). */
export function PainsBento() {
  const p = site.pains;
  const [a, b, c, d, e] = p.cards;
  return (
    <>
      <SectionHeader title={p.title} subtitle={p.subtitle} />
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[a, b, c].map((x) => x && <Card key={x.title} {...x} />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-10">
          {d ? <Card {...d} className="xl:col-span-3" /> : null}
          {e ? <Card {...e} className="xl:col-span-3" /> : null}
          <div className="group relative border border-border bg-secondary p-6 transition-colors hover:border-muted-foreground md:col-span-2 xl:col-span-4" tabIndex={0}>
            <div className="space-y-2 group-hover:hidden group-focus:hidden">
              <Eyebrow>{p.wide.before.eyebrow}</Eyebrow>
              <p className="text-base text-foreground sm:text-lg">{p.wide.before.title}</p>
              <p className="text-sm text-muted-foreground">{p.wide.before.body}</p>
            </div>
            <div className="hidden space-y-2 group-hover:block group-focus:block">
              <Eyebrow>{p.wide.after.eyebrow}</Eyebrow>
              <p className="text-base text-foreground sm:text-lg">{p.wide.after.title}</p>
              <p className="text-sm text-muted-foreground">{p.wide.after.body}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function Audiences() {
  return (
    <>
      <SectionHeader title="Who it's for" subtitle="Anyone holding USDC in a Stellar smart wallet who wants it on an exchange." />
      <div className="grid gap-4 md:grid-cols-3">
        {site.audiences.map((x) => (
          <Card key={x.title} {...x} />
        ))}
      </div>
    </>
  );
}

/** Single checklist card (frontend.md §6.6), here what the sponsor service can and can't do (PRD §13). */
export function Guarantees() {
  const g = site.guarantees;
  return (
    <>
      <SectionHeader title={g.title} subtitle={g.subtitle} />
      <div className="mx-auto max-w-2xl border border-border bg-secondary p-6">
        <ul className="space-y-5">
          {g.rows.map((r) => (
            <li key={r.title} className="flex gap-4">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-foreground/60 text-foreground">
                <Icons.check className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-sm text-foreground">{r.title}</p>
                <p className="text-sm text-muted-foreground">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <Link href={g.link.href} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm text-foreground underline-offset-4 hover:underline sm:mt-6 sm:min-h-0">
          {g.link.label} <span aria-hidden>→</span>
        </Link>
      </div>
    </>
  );
}

/** Fewer than ten items, so one static row of round pills, not a marquee (frontend.md §6.8). */
export function BuiltOnRow() {
  const b = site.builtOn;
  return (
    <>
      <SectionHeader title={b.title} subtitle={b.subtitle} />
      <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3">
        {b.list.map((w) => (
          <li key={w.name}>
            <a
              href={w.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center rounded-full border border-border px-3.5 py-1.5 text-sm sm:min-h-0 sm:px-3 text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
            >
              {w.name}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
