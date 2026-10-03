// Deployment records, one per network. Contract IDs live here and nowhere
// else (PRD §22.3). Mainnet stays null until it is actually deployed; the app
// never shows a network it can't use (PRD §22.6).
import type { DeploymentFile } from "mora-sdk";
import testnet from "./testnet.json";

export const deployments: { testnet: DeploymentFile; mainnet: DeploymentFile | null } = {
  testnet: testnet as DeploymentFile,
  mainnet: null,
};

export const testnetExtras = testnet as unknown as {
  baselinePayout: { contractId: string };
  faucet: { account: string; amount: string };
};
