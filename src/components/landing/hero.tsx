import Link from "next/link";
import { site } from "@/lib/site.config";
import { Icons } from "../icons";
import { HalideTopoHero } from "../ui/halide-topo-hero";

/**
 * The landing hero: the Halide design as given (owner's choice, DECISIONS
 * D-017), with Mora's copy in its slots. Full-bleed: it breaks out of the
 * page's side padding.
 */
export function Hero() {
  return (
    <div className="-mx-4">
      <HalideTopoHero
        brand="MORA"
        readouts={["NETWORK: STELLAR TESTNET", "RETURN WINDOW: 7–30 DAYS"]}
        title={["PAYMENTS", "THAT WAIT"]}
        footnote={["[ DELIVERED · WAITING · RETURNED ]", "SEND MONEY TO ANYONE ON STELLAR. IF THEY CAN'T RECEIVE IT YET, IT WAITS FOR THEM."]}
        cta={{ label: "SEND A PAYMENT", href: site.hero.cta.href }}
      />
    </div>
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

