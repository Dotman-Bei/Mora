import "server-only";
import { NextResponse } from "next/server";
import type { MoraNetwork } from "mora-sdk";
import { getNetwork, isNetworkId } from "../networks";
import { IndexUnavailableError } from "./db";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store", ...headers },
  });
}

export function networkParam(v: unknown): MoraNetwork | null {
  return isNetworkId(v) ? getNetwork(v) : null;
}

export function fail(e: unknown) {
  if (e instanceof IndexUnavailableError) return json({ error: e.message }, 503);
  const msg = e instanceof Error ? e.message : String(e);
  return json({ error: msg.slice(0, 300) }, 502);
}
