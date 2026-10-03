// Live testnet checks. Run with MORA_LIVE=1. Reads only; signs nothing.
import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import deployment from "../../../deployments/testnet.json";
import { getConfig, getParcel, networkFromDeployment, probeNetwork, readiness, type DeploymentFile } from "../src";

const live = process.env.MORA_LIVE === "1";
const net = networkFromDeployment(deployment as DeploymentFile, ["https://soroban-testnet.stellar.org"]);
const testusd = net.assets.find((a) => a.code === "TESTUSD")!;
const xlm = net.assets.find((a) => a.code === "XLM")!;

describe.skipIf(!live)("testnet", () => {
  it("probes the network", async () => {
    const p = await probeNetwork(net);
    expect(p.ledger).toBeGreaterThan(0);
    expect(p.baseReserve).toBeGreaterThan(0n);
    expect(p.maxEntryTtl).toBeGreaterThan(net.graceLedgers);
    expect(p.secondsPerLedger).toBeGreaterThan(1);
  }, 30_000);

  it("reads deployment parameters from the contract", async () => {
    expect(await getConfig(net)).toEqual({ grace_ledgers: net.graceLedgers, max_items: net.maxItems });
  }, 30_000);

  it("returns null for a parcel that doesn't exist", async () => {
    const r = await getParcel(net, { from: Keypair.random().publicKey(), to: Keypair.random().publicKey(), token: testusd.sac });
    expect(r).toBeNull();
  }, 30_000);

  it("previews readiness", async () => {
    const p = await probeNetwork(net);
    const faucet = (deployment as { faucet: { account: string } }).faucet.account;
    const fresh = Keypair.random().publicKey();
    const rows = await readiness(net, testusd, [{ address: faucet, amount: 1n }, { address: fresh, amount: 1n }, { address: "nope" }], p.baseReserve);
    expect(rows.map((r) => r.readiness)).toEqual(["ready", "wait-not-active", "invalid"]);
    const x = await readiness(net, xlm, [{ address: fresh, amount: 2n * p.baseReserve }, { address: fresh, amount: 1n }], p.baseReserve);
    expect(x.map((r) => r.readiness)).toEqual(["will-activate", "wait-not-active"]);
  }, 30_000);
});

describe.skipIf(!live)("resolution", () => {
  it("finds the M0 claim on testnet", async () => {
    const { findResolution } = await import("../src");
    // M0 F2 run: deployer sent 5 TESTUSD to mora-test-recipient, who claimed it.
    const r = await findResolution(net, {
      from: (deployment as { mora: { deployer: string } }).mora.deployer,
      to: process.env.MORA_TEST_RECIPIENT ?? "",
      token: testusd.sac,
    });
    if (!process.env.MORA_TEST_RECIPIENT) return;
    expect(r?.type).toBe("claimed");
    expect(r?.amount).toBe(50_000_000n);
    expect(r?.trustlineCreated).toBe(true);
  }, 60_000);
});

describe.skipIf(!live)("scan", () => {
  it("finds a waiting payment for a recipient from RPC history", async () => {
    const { waitingCandidatesFromRpc, confirmParcels } = await import("../src");
    const to = process.env.MORA_WAITING_TO;
    if (!to) return;
    const c = await waitingCandidatesFromRpc(net, to);
    const confirmed = await confirmParcels(net, to, c);
    expect(confirmed.length).toBeGreaterThan(0);
    expect(confirmed[0]?.token).toBe(testusd.sac);
  }, 120_000);
});

describe.skipIf(!live)("mainnet asset config", () => {
  it("each SAC's name() matches CODE:ISSUER (PRD §9)", async () => {
    const { Account, Contract, TransactionBuilder, BASE_FEE, rpc, scValToNative } = await import("@stellar/stellar-sdk");
    const main = (await import("../../../deployments/mainnet.json")).default as {
      networkPassphrase: string;
      assets: Array<{ code: string; issuer: string | null; sac: string }>;
    };
    const s = new rpc.Server(process.env.MAINNET_RPC_URL ?? "https://mainnet.sorobanrpc.com");
    const src = new Account("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "0");
    for (const a of main.assets) {
      const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: main.networkPassphrase })
        .addOperation(new Contract(a.sac).call("name"))
        .setTimeout(30)
        .build();
      const r = await s.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(r)) throw new Error(r.error);
      expect(scValToNative(r.result!.retval)).toBe(a.issuer ? `${a.code}:${a.issuer}` : "native");
    }
  }, 60_000);
});
