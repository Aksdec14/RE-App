import crypto from "node:crypto";
import { planFee } from "./plans";
import type {
  AdminSummary,
  Client,
  ClientPlan,
  ClientStatus,
} from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function generateClientKey(): string {
  return `ck_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashClientKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function clientKeyMatches(key: string, storedHash: string): boolean {
  const actual = Buffer.from(hashClientKey(key), "hex");
  const expected = Buffer.from(storedHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function summarize(clients: Client[]): AdminSummary {
  const active = clients.filter((client) => client.status === "active");
  return {
    totalClients: clients.length,
    activeClients: active.length,
    suspendedClients: clients.length - active.length,
    mrrPaise: active.reduce(
      (total, client) => total + client.monthlyFeePaise,
      0,
    ),
  };
}

export function feeForPlan(plan: ClientPlan): number {
  return planFee(plan);
}

export function normalizePlan(value: string | null | undefined): ClientPlan {
  return value === "basic" || value === "premium" || value === "standard"
    ? value
    : "standard";
}

export function normalizeStatus(
  value: string | null | undefined,
): ClientStatus {
  return value === "suspended" ? "suspended" : "active";
}
