import { xdr } from "@stellar/stellar-sdk";
import type { MoraNetwork } from "./network";
import { RpcPool } from "./rpc";

export interface NetworkProbe {
  /** Latest closed ledger. */
  ledger: number;
  /** Unix seconds when it closed. */
  closeTime: number;
  /** Average seconds per ledger over the sampled window (PRD §11.7: Protocol 28 changed timing). */
  secondsPerLedger: number;
  /** Stroops. */
  baseReserve: bigint;
  /** Longest a contract entry can live, in ledgers. */
  maxEntryTtl: number;
  protocolVersion: number;
}

const SAMPLE = 50;

/** Current ledger, recent close time, base reserve, max storage life (PRD §13). */
export async function probeNetwork(net: MoraNetwork): Promise<NetworkProbe> {
  const pool = RpcPool.for(net);
  return pool.call(async (s) => {
    const latest = await s.getLatestLedger();
    const start = Math.max(1, latest.sequence - SAMPLE);
    const [ledgers, archival] = await Promise.all([
      s.getLedgers({ startLedger: start, pagination: { limit: SAMPLE + 1 } }),
      s.getLedgerEntries(
        xdr.LedgerKey.configSetting(
          new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingStateArchival }),
        ),
      ),
    ]);
    const ls = ledgers.ledgers;
    const first = ls[0];
    const last = ls[ls.length - 1];
    if (!first || !last) throw new Error("no ledgers returned");
    const span = Number(last.ledgerCloseTime) - Number(first.ledgerCloseTime);
    const count = last.sequence - first.sequence;
    const header = last.headerXdr as unknown as { header: { baseReserve: number } };

    const cs = archival.entries[0]?.val as unknown as {
      configSetting: { stateArchivalSettings: { maxEntryTtl: number } };
    };
    const maxEntryTtl = cs?.configSetting?.stateArchivalSettings?.maxEntryTtl;
    if (!maxEntryTtl) throw new Error("state archival settings missing");

    return {
      ledger: last.sequence,
      closeTime: Number(last.ledgerCloseTime),
      secondsPerLedger: count > 0 ? span / count : 5,
      baseReserve: BigInt(header.header.baseReserve),
      maxEntryTtl,
      protocolVersion: Number(latest.protocolVersion),
    };
  });
}

/** Rough wall-clock time of a future (or past) ledger. Shown as an estimate. */
export function ledgerToDate(p: NetworkProbe, ledger: number): Date {
  return new Date((p.closeTime + (ledger - p.ledger) * p.secondsPerLedger) * 1000);
}

/** The ledger expected around `seconds` from now. */
export function ledgerAfter(p: NetworkProbe, seconds: number): number {
  return p.ledger + Math.ceil(seconds / p.secondsPerLedger);
}

/**
 * Longest return window the contract will accept: the parcel must live until
 * return ledger + grace without passing the network's max TTL. A small margin
 * covers ledgers that close between preview and submission.
 */
export function maxReturnWindowSeconds(p: NetworkProbe, graceLedgers: number, marginLedgers = 720): number {
  const ledgers = p.maxEntryTtl - 1 - graceLedgers - marginLedgers;
  return Math.max(0, ledgers * p.secondsPerLedger);
}
