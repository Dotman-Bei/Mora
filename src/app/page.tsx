import { Walls, FeatureTile, Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Audiences, BuiltOnRow, Guarantees, PainsBento } from "@/components/landing/sections";
import { ButtonLink, Rule, Section, SectionHeader } from "@/components/ui";
import { site } from "@/lib/site.config";

// Landing page in frontend.md §6 order, filled from site.config (§7) with the
// content PRD §15 asks for.
export default function Home() {
  return (
    <>
      <Hero />

      <Section id="why">
        <SectionHeader
          title="Three walls between a smart wallet and an exchange"
          subtitle="Each one is a network rule, not a bug. Portaj routes around all three with features Stellar already has."
        />
        <Walls />
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <ButtonLink href={site.hero.secondary.href} variant="outline" size="lg">
            {site.hero.secondary.label}
          </ButtonLink>
          <p className="text-xs text-muted-foreground">{site.hero.micro.join(" · ")}</p>
        </div>
      </Section>

      <Rule />
      <HowItWorks />

      <Rule />
      <Section>
        <SectionHeader title="Everything for getting out" />
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
      <Section id="security">
        <Guarantees />
      </Section>

      <Rule />
      <Section>
        <BuiltOnRow />
      </Section>
    </>
  );
}
