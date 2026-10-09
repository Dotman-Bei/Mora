"use client";

import { useEffect, useState } from "react";
import { Icons } from "./icons";
import { Button } from "./ui";

export function CopyButton({ text, label = "Copy link", size = "sm" }: { text: string; label?: string; size?: "sm" | "default" }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setDone(true));
      }}
    >
      {done ? <Icons.check className="h-3.5 w-3.5" /> : <Icons.copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function TxLink({ href, label = "Transaction" }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0">
      {label}
      <Icons.external className="h-3.5 w-3.5" />
    </a>
  );
}
