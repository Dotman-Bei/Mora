// Network and asset descriptions. Contract IDs and parameters come from
// deployment files, never from constants in code (PRD §22.3).

export type NetworkId = "testnet" | "mainnet";

export interface MoraAsset {
  /** "XLM" for the native asset. */
  code: string;
  /** Classic issuer, null for XLM. */
  issuer: string | null;
  /** The asset's Stellar Asset Contract ID. */
  sac: string;
  decimals: number;
  /** Issuer's home domain, shown on the claim card for known assets. */
  domain?: string;
  /** Test assets are labelled as such everywhere (PRD §9). */
  test?: boolean;
}

export interface MoraNetwork {
  id: NetworkId;
  passphrase: string;
  /** Primary first; the rest are fallbacks (PRD §10.3). */
  rpcUrls: string[];
  moraContractId: string;
  maxItems: number;
  graceLedgers: number;
  assets: MoraAsset[];
  explorer: { tx: (hash: string) => string; contract: (id: string) => string; account: (id: string) => string };
}

/** Shape of deployments/<network>.json. */
export interface DeploymentFile {
  network: NetworkId;
  networkPassphrase: string;
  mora: { contractId: string; constructor: { grace_ledgers: number; max_items: number } };
  assets: Array<{ code: string; issuer: string | null; sac: string; decimals: number; domain?: string; test?: boolean }>;
}

export function networkFromDeployment(d: DeploymentFile, rpcUrls: string[]): MoraNetwork {
  if (rpcUrls.length === 0) throw new Error(`No RPC URL configured for ${d.network}`);
  const base = d.network === "mainnet" ? "https://stellar.expert/explorer/public" : "https://stellar.expert/explorer/testnet";
  return {
    id: d.network,
    passphrase: d.networkPassphrase,
    rpcUrls,
    moraContractId: d.mora.contractId,
    maxItems: d.mora.constructor.max_items,
    graceLedgers: d.mora.constructor.grace_ledgers,
    assets: d.assets.map((a) => ({ ...a })),
    explorer: {
      tx: (h) => `${base}/tx/${h}`,
      contract: (id) => `${base}/contract/${id}`,
      account: (id) => `${base}/account/${id}`,
    },
  };
}

/** Find a supported asset by SAC ID, "CODE:ISSUER", or "XLM". */
export function findAsset(net: MoraNetwork, ref: string): MoraAsset | undefined {
  const r = ref.trim();
  return net.assets.find(
    (a) =>
      a.sac === r ||
      (a.issuer === null && (r === "XLM" || r === "native")) ||
      (a.issuer !== null && `${a.code}:${a.issuer}` === r),
  );
}
