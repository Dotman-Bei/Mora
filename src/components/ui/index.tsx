import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Square buttons, primary is near-black (light) / near-white (dark), with a
// visible focus ring (frontend.md §4, §9, §12.4). One weight, no radius.

type Variant = "default" | "outline" | "ghost" | "link";
type Size = "default" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-border bg-background text-foreground hover:border-muted-foreground",
  ghost: "text-foreground hover:bg-accent",
  link: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
};
const sizes: Record<Size, string> = {
  default: "h-10 px-4",
  lg: "h-11 px-6",
  // 40px on touch screens, compact from sm up.
  sm: "h-10 px-3 text-xs sm:h-8",
};

export function buttonClass(variant: Variant = "default", size: Size = "default", extra = "") {
  return `${base} ${variants[variant]} ${variant === "link" ? "" : sizes[size]} ${extra}`.trim();
}

export function Button({
  variant = "default",
  size = "default",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "default",
  size = "default",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Full-width hairline between landing sections (frontend.md §4). */
export function Rule() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="h-px w-full border-t border-border" />
    </div>
  );
}

/** Section header used by every section (frontend.md §5). The subline hides on phones. */
export function SectionHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-10 space-y-4 text-center sm:mb-12">
      <h2 className="font-serif text-2xl text-foreground">{title}</h2>
      {subtitle ? (
        <p className="mx-auto hidden max-w-2xl font-sans text-base leading-normal text-muted-foreground sm:block">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-[1400px] py-12 sm:py-16 lg:py-24 ${className}`}>
      {children}
    </section>
  );
}

/** Round means chip or person; everything else is square (frontend.md §4). */
export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground ${className}`}>
      {children}
    </span>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs tracking-wide text-muted-foreground ${className}`}>{children}</p>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted ${className}`} aria-hidden />;
}
