import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center space-y-5 pt-28 text-center">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">404</p>
      <h1 className="font-serif text-4xl">
        Nothing <em className="not-italic text-muted-foreground">here</em>.
      </h1>
      <p className="text-sm text-muted-foreground">If you followed a receipt link, check it was copied in full.</p>
      <div className="flex gap-3">
        <ButtonLink href="/">Home</ButtonLink>
        <ButtonLink href="/app" variant="outline">
          Open app
        </ButtonLink>
      </div>
    </div>
  );
}
