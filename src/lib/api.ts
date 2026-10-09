// Browser calls to the sponsor service (/api/*). Errors carry the server's plain message.

async function post<T>(path: string, data: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `The sponsor service returned ${r.status}.`);
  return j;
}

export interface NaiveResult {
  simulate: string;
  send: { status: string; code: string | null; xdrCode: number | null };
  memo: { type: "id" | "text"; value: string };
  hash: string;
}

export const api = {
  setup: (account: string) => post<{ xdr: string | null; created: boolean }>("/api/setup", { account }),
  submit: (xdr: string, credentialId?: string) => post<{ hash: string; account: string }>("/api/submit", { xdr, credentialId }),
  relay: (func: string, auth: string[], purpose: "exit" | "naive" = "exit") => post<{ hash: string; from: string; to: string }>("/api/relay", { func, auth, purpose }),
  deploy: (xdr: string) => post<{ hash: string }>("/api/deploy", { xdr }),
  feebump: (xdr: string) => post<{ hash: string; kind: "payment" | "return" }>("/api/feebump", { xdr }),
  fund: (contractId: string) => post<{ hash: string; amount: string }>("/api/fund", { contractId }),
  before: (from: string, amount: string, memoType: "id" | "text", memo: string) => post<NaiveResult>("/api/before", { from, amount, memoType, memo }),
};
