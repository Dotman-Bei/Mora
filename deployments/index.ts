// Deployment records, one per network. Contract IDs live here and nowhere
// else (PRD §22.3). Mainnet stays unlisted until mainnet.json says it is
// deployed; the app never shows a network it can't use (PRD §22.6).
import type { DeploymentFile } from "mora-sdk";
import mainnet from "./mainnet.json";
import testnet from "./testnet.json";

const main = mainnet as unknown as DeploymentFile & { deployed: boolean };

export const deployments: { testnet: DeploymentFile; mainnet: DeploymentFile | null } = {
  testnet: testnet as DeploymentFile,
  mainnet: main.deployed && main.mora.contractId ? main : null,
};

export const testnetExtras = testnet as unknown as {
  baselinePayout: { contractId: string };
  faucet: { account: string; amount: string };
};
