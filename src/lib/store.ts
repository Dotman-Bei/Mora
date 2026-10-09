"use client";

// Browser storage for conveniences only: which wallet this browser created,
// the exit account's public key per passkey, an exit that was interrupted, and
// past receipts. No secret is ever written here (FR-2.2, §13).

export interface WalletRef {
  contractId: string;
  keyId: string;
}

export interface PendingExit {
  account: string;
  destination: string;
  memoType: "none" | "id" | "text";
  memo: string;
  amount: string;
  returnTo?: string;
  setupHash?: string;
  inHash?: string;
  startedAt: number;
}

export interface Receipt {
  account: string;
  destination: string;
  memoLabel: string;
  amount: string;
  setupHash?: string;
  inHash?: string;
  outHash: string;
  at: number;
}

function read<T>(k: string): T | null {
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, v: unknown) {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export const store = {
  wallet: () => read<WalletRef>("portaj:wallet"),
  setWallet: (w: WalletRef | null) => write("portaj:wallet", w),

  exitFor: (credentialId: string) => read<string>(`portaj:exit:${credentialId}`),
  rememberExit: (credentialId: string, g: string) => write(`portaj:exit:${credentialId}`, g),

  pending: (g: string) => read<PendingExit>(`portaj:pending:${g}`),
  setPending: (p: PendingExit) => write(`portaj:pending:${p.account}`, p),
  clearPending: (g: string) => write(`portaj:pending:${g}`, null),
  /** Every interrupted carry this browser knows of, newest first. */
  pendings: (): PendingExit[] => {
    try {
      return Object.keys(window.localStorage)
        .filter((k) => k.startsWith("portaj:pending:"))
        .map((k) => read<PendingExit>(k))
        .filter((p): p is PendingExit => !!p)
        .sort((a, b) => b.startedAt - a.startedAt);
    } catch {
      return [];
    }
  },

  receipts: () => read<Receipt[]>("portaj:receipts") ?? [],
  addReceipt: (r: Receipt) => write("portaj:receipts", [r, ...(read<Receipt[]>("portaj:receipts") ?? [])].slice(0, 20)),
};
