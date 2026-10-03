import { FeatureTile, Hero, Outcomes } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveNumbers } from "@/components/landing/live-numbers";
import { Audiences, Guarantees, PainsBento, WalletsRow } from "@/components/landing/sections";
import { Rule, Section, SectionHeader } from "@/components/ui";
import { site } from "@/lib/site.config";

// Landing page in frontend.md §6 order, filled from site.config (§7) with the
// content PRD §6.1 asks for.
export default function Home() {
  return (
    <>
      <Hero />

      <Section>
        <SectionHeader title="Every payment ends in one of three places" subtitle="Mora decides at the moment of payment. Nothing is ever stuck in between." />
        <Outcomes />
        <LiveNumbers />
      </Section>

      <Rule />
      <HowItWorks />

      <Rule />
      <Section>
        <SectionHeader title="Everything for paying people" />
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 sm:gap-y-12">
          {site.features.map((f) => (
            <FeatureTile key={f.href + f.name} {...f} />
          ))}
        </div>
      </Section>

      <Rule />
      <Section>
        <PainsBento />
      </Section>

      <Rule />
      <Section>
        <Audiences />
      </Section>

      <Rule />
      <Section>
        <Guarantees />
      </Section>

      <Rule />
      <Section>
        <WalletsRow />
      </Section>
    </>
  );
}
