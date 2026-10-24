import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors";
import {
  addDays,
  clientKeyMatches,
  feeForPlan,
  generateClientKey,
  hashClientKey,
  normalizePlan,
  normalizeStatus,
  nowIso,
} from "./clientUtils";
import type { Client, ClientInput, ClientStatus, ClientUpdate } from "./types";
import type { CloudStore } from "./store";

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  plan: string;
  monthly_fee_paise: number;
  status: string;
  due_date: string;
  last_paid_at: string | null;
  note: string;
  client_key_hash: string;
  created_at: string;
  updated_at: string;
}

let cached: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (cached) return cached;

  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw new AppError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the cloud environment.",
      503,
    );
  }

  cached = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

function mapRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    plan: normalizePlan(row.plan),
    monthlyFeePaise: row.monthly_fee_paise,
    status: normalizeStatus(row.status),
    dueDate: row.due_date,
    lastPaidAt: row.last_paid_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRow(id: string): Promise<ClientRow | null> {
  const { data, error } = await supabase()
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new AppError(`Supabase: ${error.message}`, 502);
  }
  return (data as ClientRow | null) ?? null;
}

async function requireRow(id: string): Promise<ClientRow> {
  const row = await getRow(id);
  if (!row) throw new AppError("Client not found", 404);
  return row;
}

export function getSupabaseStore(): CloudStore {
  return {
    mode: "supabase",

    async listClients() {
      const { data, error } = await supabase()
        .from("clients")
        .select("*")
        .order("status", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        throw new AppError(`Supabase: ${error.message}`, 502);
      }
      return ((data ?? []) as ClientRow[]).map(mapRow);
    },

    async createClient(input: ClientInput) {
      const id = crypto.randomUUID();
      const clientKey = generateClientKey();
      const now = nowIso();
      const plan = normalizePlan(input.plan);
      const { data, error } = await supabase()
        .from("clients")
        .insert({
          id,
          name: input.name.trim(),
          phone: input.phone?.trim() ?? "",
          plan,
          monthly_fee_paise: feeForPlan(plan),
          status: "active",
          due_date: addDays(30),
          last_paid_at: null,
          note: input.note?.trim() ?? "",
          client_key_hash: hashClientKey(clientKey),
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new AppError(
          `Supabase: ${error?.message ?? "Client was not created"}`,
          502,
        );
      }
      return { client: mapRow(data as ClientRow), clientKey };
    },

    async updateClient(id: string, input: ClientUpdate) {
      const row = await requireRow(id);
      const plan = input.plan ? normalizePlan(input.plan) : normalizePlan(row.plan);
      const name = input.name !== undefined ? input.name.trim() : row.name;
      if (!name) throw new AppError("Client name cannot be empty");
      const phone = input.phone !== undefined ? input.phone.trim() : row.phone;
      const note = input.note !== undefined ? input.note.trim() : row.note;

      const { data, error } = await supabase()
        .from("clients")
        .update({
          name,
          phone,
          plan,
          monthly_fee_paise: feeForPlan(plan),
          note,
          updated_at: nowIso(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error || !data) {
        throw new AppError(
          `Supabase: ${error?.message ?? "Client was not updated"}`,
          502,
        );
      }
      return mapRow(data as ClientRow);
    },

    async markPaid(id: string) {
      await requireRow(id);
      const now = nowIso();
      const { data, error } = await supabase()
        .from("clients")
        .update({
          status: "active",
          due_date: addDays(30),
          last_paid_at: now,
          note: "",
          updated_at: now,
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error || !data) {
        throw new AppError(
          `Supabase: ${error?.message ?? "Payment was not recorded"}`,
          502,
        );
      }
      return mapRow(data as ClientRow);
    },

    async setStatus(id: string, status: ClientStatus) {
      const row = await requireRow(id);
      const { data, error } = await supabase()
        .from("clients")
        .update({
          status,
          note: status === "active" ? "" : row.note,
          updated_at: nowIso(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error || !data) {
        throw new AppError(
          `Supabase: ${error?.message ?? "Client status was not updated"}`,
          502,
        );
      }
      return mapRow(data as ClientRow);
    },

    async rotateKey(id: string) {
      await requireRow(id);
      const clientKey = generateClientKey();
      const { data, error } = await supabase()
        .from("clients")
        .update({
          client_key_hash: hashClientKey(clientKey),
          updated_at: nowIso(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error || !data) {
        throw new AppError(
          `Supabase: ${error?.message ?? "Client key was not rotated"}`,
          502,
        );
      }
      return { client: mapRow(data as ClientRow), clientKey };
    },

    async deleteClient(id: string) {
      await requireRow(id);
      const { error } = await supabase()
        .from("clients")
        .delete()
        .eq("id", id);
      if (error) {
        throw new AppError(`Supabase: ${error.message}`, 502);
      }
    },

    async findLicense(clientId: string, clientKey: string) {
      const row = await getRow(clientId);
      if (!row || !clientKeyMatches(clientKey, row.client_key_hash)) {
        return null;
      }
      return mapRow(row);
    },
  };
}
