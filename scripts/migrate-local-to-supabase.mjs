#!/usr/bin/env node
/**
 * Migrate the local SQLite development store (cloud/data/cloud.db) into
 * Supabase, preserving client IDs and license-key hashes.
 *
 * Why: the local development cloud holds real rows (e.g. the first client the
 * installer was tested with). Running this script copies those rows into the
 * production Supabase project EXACTLY as they are — same id, same hashed key,
 * same plan/status/due date — so existing restaurant installs keep validating
 * against the new cloud without re-keying.
 *
 * Usage (run inside the cloud folder, with .env.local filled in):
 *
 *   node scripts/migrate-local-to-supabase.mjs               # dry run by default
 *   node scripts/migrate-local-to-supabase.mjs --write       # actually upsert
 *
 * Requires SUPABASE_URL and SUPABASE_SECRET_KEY. The local DB path defaults to
 * ./data/cloud.db (override with CLOUD_DB_PATH).
 *
 * The script is idempotent: re-running upserts the same rows and changes
 * nothing else in the project.
 */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DatabaseSync } from "node:sqlite";

const write = process.argv.includes("--write");

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY?.trim();
if (!SUPABASE_URL || !SECRET) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env.example).");
  process.exit(1);
}

const dbPath = path.resolve(process.env.CLOUD_DB_PATH ?? "data/cloud.db");
if (!fs.existsSync(dbPath)) {
  console.error(`Local database not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const localRows = db
  .prepare("SELECT * FROM clients ORDER BY name")
  .all();

if (!localRows.length) {
  console.log("The local database has no clients — nothing to migrate.");
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

console.log(`Local rows: ${localRows.length}`);
for (const row of localRows) {
  console.log(
    `  ${row.id}  ${row.name.padEnd(30)} plan=${row.plan.padEnd(8)} status=${row.status}`,
  );
}

if (!write) {
  console.log("");
  console.log("Dry run — nothing written. Re-run with --write to upsert into Supabase.");
  process.exit(0);
}

console.log("");
let upserted = 0;
for (const row of localRows) {
  const { error } = await supabase.from("clients").upsert(
    {
      id: row.id,
      name: row.name,
      phone: row.phone ?? "",
      plan: row.plan,
      monthly_fee_paise: row.monthly_fee_paise,
      status: row.status,
      due_date: row.due_date,
      last_paid_at: row.last_paid_at,
      note: row.note ?? "",
      // Preseved verbatim: existing restaurant licenses keep working.
      client_key_hash: row.client_key_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.error(`Failed to upsert ${row.name} (${row.id}): ${error.message}`);
    process.exitCode = 1;
  } else {
    upserted += 1;
    console.log(`  upserted ${row.name} (${row.id})`);
  }
}

// Simple fingerprint so the user can verify the round-trip later.
const fingerprint = crypto
  .createHash("sha256")
  .update(localRows.map((r) => `${r.id}:${r.client_key_hash}`).join("|"))
  .digest("hex");
console.log("");
console.log(`Done. Upserted ${upserted} row(s).`);
console.log(`Migration fingerprint: ${fingerprint}`);
console.log("Verify in the admin console that the rows list matches and each license key still works.");
