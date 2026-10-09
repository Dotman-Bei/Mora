import testnet from "./testnet.json";

// Portaj runs on Stellar testnet only (PRD §2, §17). Public addresses come from
// scripts/setup-testnet.mjs; the sponsor secret lives in the server env only.

export const NETWORK = {
  id: "testnet" as "testnet" | "mainnet",
  label: "Testnet",
  passphrase: "Test SDF Network ; September 2015",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  explorer: "https://stellar.expert/explorer/testnet",
};

/** The exchange simulator and the test wallet tools exist on testnet only. */
export const IS_TESTNET = NETWORK.id === "testnet";

/** Circle USDC only (FR-1.6). Never a look-alike issuer. */
export const USDC = {
  code: "USDC",
  issuer: testnet.usdcIssuer,
  sac: testnet.usdcSac,
  decimals: 7,
};

export const SPONSOR = testnet.sponsor;
export const SIMULATOR_DEPOSIT = testnet.simulatorDeposit;

/** passkey-kit smart wallet (PRD §14). */
export const WALLET_WASM_HASH = "97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e";

/** Test USDC handed to a new judge wallet (FR-9.2). */
export const TEST_USDC_GRANT = "25";

export const txUrl = (hash: string) => `${NETWORK.explorer}/tx/${hash}`;
export const accountUrl = (id: string) => `${NETWORK.explorer}/${id.startsWith("C") ? "contract" : "account"}/${id}`;
