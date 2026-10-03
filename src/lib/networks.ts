import { networkFromDeployment, type MoraNetwork, type NetworkId } from "mora-sdk";
import { deployments } from "../../deployments";

function urls(env: string | undefined, fallback: string[]): string[] {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

// RPC providers come from env so they can be switched without a redeploy of
// the contract (PRD §10.1, §20). Testnet defaults to the public SDF RPC.
const testnet = networkFromDeployment(
  deployments.testnet,
  urls(process.env.NEXT_PUBLIC_TESTNET_RPC_URLS, ["https://soroban-testnet.stellar.org"]),
);

const mainnetRpc = urls(process.env.NEXT_PUBLIC_MAINNET_RPC_URLS, []);
const mainnet = deployments.mainnet && mainnetRpc.length ? networkFromDeployment(deployments.mainnet, mainnetRpc) : null;

export const NETWORKS: Record<NetworkId, MoraNetwork | null> = { testnet, mainnet };

export function getNetwork(id: NetworkId): MoraNetwork | null {
  return NETWORKS[id];
}

export function isNetworkId(x: unknown): x is NetworkId {
  return x === "testnet" || x === "mainnet";
}

export const DEFAULT_NETWORK: NetworkId = mainnet ? "mainnet" : "testnet";

/** Mainnet beta caps per batch, enforced in the app (PRD §9). */
export const BETA_CAPS: Record<string, bigint> = {
  USDC: 100n * 10_000_000n,
  EURC: 100n * 10_000_000n,
  XLM: 500n * 10_000_000n,
};

export const NETWORK_LABEL: Record<NetworkId, string> = {
  mainnet: "Mainnet beta",
  testnet: "Testnet",
};
