"use client";

import { useEffect, useState } from "react";
import { NETWORK_LABEL } from "@/lib/networks";
import { FaucetButton } from "../faucet";
import { useNetwork } from "../providers";

interface Stats {
  delivered: number;
  waited: number;
  claimed: number;
  returned: number;
}

/**
 * One line of live numbers from the index, per network (PRD §6.1, P1). If the
 * index can't answer, the line isn't shown at all: no placeholder figures.
 */
export function LiveNumbers() {
  const { id } = useNetwork();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    setStats(null);
    fetch(`/api/v1/stats?network=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { stats?: Stats } | null) => alive && setStats(j?.stats ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="mt-6 flex flex-col items-center gap-4 text-center">
      {stats ? (
        <p className="text-xs text-muted-foreground">
          {NETWORK_LABEL[id]} so far ·{" "}
          {(
            [
              ["delivered", stats.delivered],
              ["waited", stats.waited],
              ["claimed", stats.claimed],
              ["returned", stats.returned],
            ] as const
          ).map(([label, n], i) => (
            <span key={label}>
              {i > 0 ? " · " : ""}
              <span className="font-mono tabular text-foreground">{n}</span> {label}
            </span>
          ))}
        </p>
      ) : null}
      {id === "testnet" ? <FaucetButton /> : null}
    </div>
  );
}
