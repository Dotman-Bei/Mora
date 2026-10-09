import "server-only";
import { NextResponse } from "next/server";
import { Refusal } from "./sponsor";
import { allow, clientIp } from "./rate-limit";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function fail(e: unknown) {
  if (e instanceof Refusal) return json({ error: e.message }, e.status);
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  return json({ error: `Something went wrong: ${msg.slice(0, 200)}` }, 502);
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Refusal("Send a JSON body.");
  }
}

/** Per-IP limit for a route; throws a 429 Refusal. */
export async function limitIp(req: Request, route: string, limit: number, windowSeconds: number) {
  if (!(await allow(`${route}:ip:${clientIp(req)}`, limit, windowSeconds))) {
    throw new Refusal("Too many requests from this network. Wait a little and try again.", 429);
  }
}

export async function limitKey(key: string, limit: number, windowSeconds: number, message: string) {
  if (!(await allow(key, limit, windowSeconds))) throw new Refusal(message, 429);
}
