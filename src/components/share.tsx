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

/**
 * Share a claim link: the Web Share sheet on phones, WhatsApp / X / email
 * intents on desktop (PRD §6.2). The only message Mora sends is a link the
 * sender chooses to share (PRD §4.5).
 */
export function ShareActions({ url, message }: { url: string; message: string }) {
  const [canNative, setCanNative] = useState(false);
  useEffect(() => {
    setCanNative(typeof navigator !== "undefined" && "share" in navigator && window.matchMedia("(pointer: coarse)").matches);
  }, []);
  const text = `${message} ${url}`;
  const intents = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(text)}` },
    { label: "X", href: `https://x.com/intent/post?text=${encodeURIComponent(text)}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent("A payment is waiting for you")}&body=${encodeURIComponent(text)}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton text={url} />
      {canNative ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void navigator.share({ title: "A payment is waiting for you", text: message, url }).catch(() => {})}
        >
          <Icons.share className="h-3.5 w-3.5" /> Share
        </Button>
      ) : (
        intents.map((i) => (
          <a
            key={i.label}
            href={i.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center border border-border px-3 text-xs sm:h-8 text-foreground transition-colors hover:border-muted-foreground"
          >
            {i.label}
          </a>
        ))
      )}
    </div>
  );
}

export function TxLink({ href, label = "Transaction" }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      {label}
      <Icons.external className="h-3.5 w-3.5" />
    </a>
  );
}
