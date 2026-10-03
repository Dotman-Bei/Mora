import { rpc } from "@stellar/stellar-sdk";
import type { MoraNetwork } from "./network";

/**
 * The network couldn't be read. The UI shows `UNKNOWN` and a retry, never
 * "nothing here" or "0" (PRD §8, §22.4).
 */
export class NetworkUnreadableError extends Error {
  constructor(public readonly cause: unknown) {
    super(`Network unreadable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NetworkUnreadableError";
  }
}

const servers = new Map<string, rpc.Server>();
function serverFor(url: string): rpc.Server {
  let s = servers.get(url);
  if (!s) {
    s = new rpc.Server(url, { allowHttp: url.startsWith("http://") });
    servers.set(url, s);
  }
  return s;
}

/**
 * Every RPC call goes through here (PRD §10.3). Tries the primary provider,
 * then each fallback, and remembers which one last worked.
 */
export class RpcPool {
  private preferred = 0;
  constructor(private readonly urls: string[]) {
    if (urls.length === 0) throw new Error("RpcPool needs at least one URL");
  }

  static for(net: MoraNetwork): RpcPool {
    const key = net.rpcUrls.join("|");
    let p = pools.get(key);
    if (!p) {
      p = new RpcPool(net.rpcUrls);
      pools.set(key, p);
    }
    return p;
  }

  /** The URL of the provider that last answered; used where an SDK needs one URL. */
  get url(): string {
    return this.urls[this.preferred] as string;
  }

  async call<T>(fn: (server: rpc.Server, url: string) => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < this.urls.length; i++) {
      const idx = (this.preferred + i) % this.urls.length;
      const url = this.urls[idx] as string;
      try {
        const out = await fn(serverFor(url), url);
        this.preferred = idx;
        return out;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new NetworkUnreadableError(lastErr);
  }
}

const pools = new Map<string, RpcPool>();
