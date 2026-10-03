import { CopyButton } from "@/components/share";

/** Code in the system's single sans face (frontend.md §3: no monospace exists). */
export function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <figure className="border border-border bg-card">
      <figcaption className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton text={code.replace(/\n\s+&/g, "&")} label="Copy" />
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
