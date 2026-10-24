# Restaurant Cloud · vendor admin

A small, standalone cloud service for managing restaurant clients, their monthly
subscription and whether their local POS can take orders.

It deliberately does **not** contain payment history, invoices, activation codes,
plans tables or a payment gateway. Billing is manual:

- Add a restaurant and choose a plan.
- Copy the one-time license key into the restaurant installer.
- **Mark paid** extends access by 30 days and clears the billing note.
- **Suspend** turns the billing popup on at the restaurant.
- **Restore** turns access back on without extending the due date.
- **Delete** permanently removes a client and its license key, with a confirmation
  step, so duplicate or test rows can be cleaned up.

The local POS will cache the last known license so it keeps working if the cloud
is unreachable.

## Run locally

Requirements: Node.js 24+.

```bash
cd cloud
npm install
npm run dev
```

Open <http://localhost:4000/admin>. The default dev password is `admin123`.

The project currently uses a local SQLite development store because
`SUPABASE_SECRET_KEY` is intentionally empty. The database is created at
`cloud/data/cloud.db` with **no clients**. Add the first restaurant from the
console and copy its one-time key into the local POS setup screen.

For developer sample data only, start with `SEED_DEMO=1 npm run dev`. Do not use
that flag for a client handover. To reset a development database, stop the
server, take a backup, and delete `cloud/data/cloud.db`.

`cloud/.env.local` is git-ignored. Keep `CLOUD_LOCAL_STORE=1` there while
developing without Supabase.

## Connect Supabase

1. Open the Supabase project SQL editor and run
   [`supabase/schema.sql`](./supabase/schema.sql). This creates `public.clients`,
   enables RLS, and creates **no public policies**.
2. In Supabase, open **Project Settings → API Keys** and copy the service role
   key (or create a secret key with server access).
3. Put it in `cloud/.env.local`:

   ```bash
   SUPABASE_URL=https://msxsdcneuxvcxmygquvr.supabase.co
   SUPABASE_SECRET_KEY=...
   # Remove or set CLOUD_LOCAL_STORE=0 once Supabase is configured.
   ```

4. Restart the cloud app. The header should show **Supabase**, and the local
   demo rows should be gone.

Never put `SUPABASE_SECRET_KEY` in a `NEXT_PUBLIC_*` variable, in git, or in a
customer installer. The restaurant app only needs the license URL, client ID and
client key.

### Why RLS with no policies?

The table is only accessed by the cloud server using the service role key. The
service role bypasses RLS. The publishable key cannot read or write client rows,
so exposing it in a browser is harmless.

## Admin authentication

The console uses a password plus an HMAC-signed, HTTP-only cookie
(`sg_cloud_admin`). Set both values in production:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | `admin123` | Vendor console password |
| `ADMIN_SECRET` | dev secret | HMAC key for the session cookie |

Use a long random `ADMIN_SECRET`; changing it invalidates all admin sessions.
In production the login route refuses to start a session if either variable is
missing, so a deployed console cannot silently fall back to the dev password.

## License API

The restaurant app calls this endpoint from its own server, with the client
credentials in headers.

```bash
curl -s http://localhost:4000/api/license \
  -H 'x-client-id: <client-id-from-the-console>' \
  -H 'x-client-key: <one-time-license-key>'
```

Successful response:

```json
{
  "active": true,
  "status": "active",
  "clientId": "<client-id>",
  "clientName": "<restaurant-name>",
  "plan": "standard",
  "monthlyFeePaise": 149900,
  "dueDate": "2026-11-19T...",
  "lastPaidAt": null,
  "note": "",
  "support": {
    "phone": "+91 90000 00000",
    "email": "support@restaurantos.local"
  }
}
```

A suspended client still gets `200` with `active: false`, so the local POS can show
the billing screen and keep the cached details. Missing or invalid credentials
return `401`. Responses use `Cache-Control: no-store`.

`SUPPORT_PHONE` and `SUPPORT_EMAIL` control the contact details returned to the
restaurant.

## Deploy

The app is a normal Next.js app and can be deployed to Vercel (or any Node host):

- Set the project root directory to `cloud`.
- Add `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD`, `ADMIN_SECRET`,
  `SUPPORT_PHONE` and `SUPPORT_EMAIL`.
- Do **not** set `CLOUD_LOCAL_STORE=1` in production.
- Run the SQL schema once in the Supabase project.

### Move existing local data into Supabase

If the local development store already has real clients, copy them into
Supabase preserving IDs and key hashes, so restaurant installs keep working
without new keys:

```bash
cd cloud
node scripts/migrate-local-to-supabase.mjs          # dry run, prints what will move
node scripts/migrate-local-to-supabase.mjs --write  # upsert into Supabase
```

`.env.local` must hold `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The script is
idempotent — re-running it changes nothing else in the project.

The cloud app uses port `4000` locally; the restaurant POS keeps using `3000`.

## Data model

`public.clients` has one row per restaurant:

| Column | Notes |
| --- | --- |
| `id` | UUID used as the installer's client ID |
| `name`, `phone` | Display/contact details |
| `plan` | `basic`, `standard` or `premium` |
| `monthly_fee_paise` | Fee copied from the plan; stored in paise |
| `status` | `active` or `suspended` |
| `due_date` | Next renewal date |
| `last_paid_at` | Last manual payment |
| `note` | Optional message shown in the billing popup |
| `client_key_hash` | SHA-256 hash; plaintext key is never stored |
| `created_at`, `updated_at` | Timestamps |

Plans: Basic ₹799, Standard ₹1,499, Premium ₹1,999 per month.

## Current scope

Built:

- Cloud admin login and signed session cookie.
- Empty clients list, add, edit, delete, mark paid, suspend, restore.
- One-time license key display and rotation.
- Public license endpoint with hashed key verification.
- Supabase schema and server-side Supabase store.
- Local SQLite fallback for development.
- The local POS setup wizard proxies this endpoint and caches the last known
  status for offline use.
- The old local `/admin` console is disabled in client builds.

The Supabase path is wired but has not been live-tested here because
`SUPABASE_SECRET_KEY` is intentionally empty. Run the schema and add the secret
to exercise it; the local SQLite path is fully tested.

Not built yet:

- Packaging the cloud URL and client credentials into a Windows installer.
- Automatic renewal reminders, invoices and a payment gateway.
- Staff auth/roles in the local POS.
