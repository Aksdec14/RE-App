import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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

type Database = DatabaseSync;

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

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "cloud.db");

const globalForDb = globalThis as unknown as {
  __cloudDb?: Database;
};

const DEMO_CLIENTS = [
  {
    id: "client_sample_restaurant",
    name: "Sample Restaurant",
    phone: "+91 98765 43210",
    plan: "standard",
    dueInDays: 12,
    lastPaidDaysAgo: 18,
    status: "active",
    note: "",
    clientKey: "ck_demo_sample_restaurant",
  },
  {
    id: "client_cafe_alchemy",
    name: "Cafe Alchemy",
    phone: "+91 99887 76655",
    plan: "basic",
    dueInDays: 4,
    lastPaidDaysAgo: 26,
    status: "active",
    note: "",
    clientKey: "ck_demo_cafe_alchemy",
  },
  {
    id: "client_tandoor_house",
    name: "Tandoor House",
    phone: "+91 91234 56789",
    plan: "premium",
    dueInDays: -3,
    lastPaidDaysAgo: 33,
    status: "suspended",
    note: "Payment overdue — access paused.",
    clientKey: "ck_demo_tandoor_house",
  },
] as const;

function dbPath(): string {
  const configured = process.env.CLOUD_DB_PATH ?? DEFAULT_DB_PATH;
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

function getDb(): Database {
  if (globalForDb.__cloudDb) return globalForDb.__cloudDb;

  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  createSchema(db);

  // The vendor console starts empty. Demo clients are opt-in for development.
  if (process.env.SEED_DEMO === "1") seedIfEmpty(db);

  globalForDb.__cloudDb = db;
  return db;
}

function createSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'standard',
      monthly_fee_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      due_date TEXT NOT NULL,
      last_paid_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      client_key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_clients_key
      ON clients(client_key_hash);
    CREATE INDEX IF NOT EXISTS idx_cloud_clients_status
      ON clients(status, name);
  `);
}

function seedIfEmpty(db: Database) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM clients")
    .get() as { count: number };
  if (row.count > 0) return;

  const insert = db.prepare(`
    INSERT INTO clients (
      id, name, phone, plan, monthly_fee_paise, status, due_date,
      last_paid_at, note, client_key_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  for (const demo of DEMO_CLIENTS) {
    const createdAt = addDays(-180, now);
    insert.run(
      demo.id,
      demo.name,
      demo.phone,
      demo.plan,
      feeForPlan(normalizePlan(demo.plan)),
      demo.status,
      addDays(demo.dueInDays, now),
      addDays(-demo.lastPaidDaysAgo, now),
      demo.note,
      hashClientKey(demo.clientKey),
      createdAt,
      createdAt,
    );
  }
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

function getRow(id: string): ClientRow | null {
  const row = getDb()
    .prepare("SELECT * FROM clients WHERE id = ?")
    .get(id) as ClientRow | undefined;
  return row ?? null;
}

function requireRow(id: string): ClientRow {
  const row = getRow(id);
  if (!row) throw new AppError("Client not found", 404);
  return row;
}

export function getLocalStore(): import("./store").CloudStore {
  return {
    mode: "local",

    async listClients() {
      const rows = getDb()
        .prepare(
          "SELECT * FROM clients ORDER BY status ASC, name COLLATE NOCASE ASC",
        )
        .all() as unknown as ClientRow[];
      return rows.map(mapRow);
    },

    async createClient(input: ClientInput) {
      const db = getDb();
      const id = crypto.randomUUID();
      const clientKey = generateClientKey();
      const now = nowIso();
      const plan = normalizePlan(input.plan);
      db.prepare(
        `INSERT INTO clients (
          id, name, phone, plan, monthly_fee_paise, status, due_date,
          last_paid_at, note, client_key_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?, ?, ?)`,
      ).run(
        id,
        input.name.trim(),
        input.phone?.trim() ?? "",
        plan,
        feeForPlan(plan),
        addDays(30),
        input.note?.trim() ?? "",
        hashClientKey(clientKey),
        now,
        now,
      );
      return { client: mapRow(requireRow(id)), clientKey };
    },

    async updateClient(id: string, input: ClientUpdate) {
      const row = requireRow(id);
      const plan = input.plan ? normalizePlan(input.plan) : normalizePlan(row.plan);
      const name = input.name !== undefined ? input.name.trim() : row.name;
      if (!name) throw new AppError("Client name cannot be empty");
      const phone = input.phone !== undefined ? input.phone.trim() : row.phone;
      const note = input.note !== undefined ? input.note.trim() : row.note;

      getDb()
        .prepare(
          `UPDATE clients
           SET name = ?, phone = ?, plan = ?, monthly_fee_paise = ?,
               note = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(name, phone, plan, feeForPlan(plan), note, nowIso(), id);

      return mapRow(requireRow(id));
    },

    async markPaid(id: string) {
      requireRow(id);
      const now = nowIso();
      getDb()
        .prepare(
          `UPDATE clients
           SET status = 'active', due_date = ?, last_paid_at = ?,
               note = '', updated_at = ?
           WHERE id = ?`,
        )
        .run(addDays(30), now, now, id);
      return mapRow(requireRow(id));
    },

    async setStatus(id: string, status: ClientStatus) {
      const row = requireRow(id);
      getDb()
        .prepare(
          `UPDATE clients
           SET status = ?, note = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          status,
          status === "active" ? "" : row.note,
          nowIso(),
          id,
        );
      return mapRow(requireRow(id));
    },

    async rotateKey(id: string) {
      requireRow(id);
      const clientKey = generateClientKey();
      getDb()
        .prepare(
          `UPDATE clients
           SET client_key_hash = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(hashClientKey(clientKey), nowIso(), id);
      return { client: mapRow(requireRow(id)), clientKey };
    },

    async deleteClient(id: string) {
      requireRow(id);
      getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
    },

    async findLicense(clientId: string, clientKey: string) {
      const row = getRow(clientId);
      if (!row || !clientKeyMatches(clientKey, row.client_key_hash)) {
        return null;
      }
      return mapRow(row);
    },
  };
}
