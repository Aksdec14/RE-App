"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  CreditCard,
  Database,
  IndianRupee,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ApiError, api } from "@/lib/apiClient";
import { PLANS, getPlan } from "@/lib/plans";
import type {
  AdminSummary,
  Client,
  ClientPlan,
  StorageMode,
} from "@/lib/types";

type ClientsResponse = {
  clients: Client[];
  summary: AdminSummary;
  storage: StorageMode;
};

type ClientResponse = ClientsResponse & {
  client: Client;
  clientKey?: string;
};

type Draft = {
  name: string;
  phone: string;
  plan: ClientPlan;
  note: string;
};

type PendingAction = {
  kind: "mark_paid" | "suspend" | "restore" | "delete";
  client: Client;
};

type KeyInfo = {
  client: Client;
  clientKey: string;
};

type Toast = {
  kind: "success" | "error";
  message: string;
};

const EMPTY_SUMMARY: AdminSummary = {
  totalClients: 0,
  activeClients: 0,
  suspendedClients: 0,
  mrrPaise: 0,
};

function emptyDraft(): Draft {
  return { name: "", phone: "", plan: "standard", note: "" };
}

function formatMoney(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function daysUntil(iso: string): number {
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/45 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost -mr-1 h-8 w-8 !px-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export default function CloudAdminPage() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [summary, setSummary] = useState<AdminSummary>(EMPTY_SUMMARY);
  const [storage, setStorage] = useState<StorageMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  const draftPlan = useMemo(() => getPlan(draft.plan), [draft.plan]);
  const editPlan = useMemo(
    () => getPlan(editDraft.plan),
    [editDraft.plan],
  );

  const licenseConfig = keyInfo
    ? JSON.stringify(
        {
          licenseUrl:
            typeof window === "undefined" ? "" : window.location.origin,
          clientId: keyInfo.client.id,
          clientKey: keyInfo.clientKey,
        },
        null,
        2,
      )
    : "";

  const showToast = useCallback((next: Toast) => {
    setToast(next);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    api<{ authenticated: boolean }>("/api/admin/session")
      .then((data) => {
        if (!cancelled) setAuthenticated(data.authenticated);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoginError(
            error instanceof Error
              ? error.message
              : "Could not reach the cloud server",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setSetupError(null);
    try {
      const data = await api<ClientsResponse>("/api/admin/clients");
      setClients(data.clients);
      setSummary(data.summary);
      setStorage(data.storage);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthenticated(false);
        setLoginError("Session expired. Sign in again.");
        return;
      }
      if (error instanceof ApiError && error.status === 503) {
        setSetupError(error.message);
        return;
      }
      setPageError(
        error instanceof Error ? error.message : "Could not load clients",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) void load();
  }, [authenticated, load]);

  function handleError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      setAuthenticated(false);
      setLoginError("Session expired. Sign in again.");
      return;
    }
    showToast({
      kind: "error",
      message: error instanceof Error ? error.message : fallback,
    });
  }

  function applySnapshot(data: ClientsResponse) {
    setClients(data.clients);
    setSummary(data.summary);
    setStorage(data.storage);
    setPageError(null);
    setSetupError(null);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      await api<{ ok: boolean }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: loginPassword }),
      });
      setLoginPassword("");
      setAddOpen(false);
      setEditTarget(null);
      setPending(null);
      setKeyInfo(null);
      setToast(null);
      setAuthenticated(true);
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Could not sign in",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOut() {
    try {
      await api<{ ok: boolean }>("/api/admin/logout", { method: "POST" });
    } catch {
      // The local session state still needs to reset.
    }
    setAuthenticated(false);
    setClients([]);
    setSummary(EMPTY_SUMMARY);
    setStorage(null);
    setPageError(null);
    setSetupError(null);
    setAddOpen(false);
    setEditTarget(null);
    setPending(null);
    setKeyInfo(null);
    setToast(null);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ kind: "success", message: `${label} copied` });
    } catch {
      showToast({
        kind: "error",
        message: "Could not copy. Select the text and copy it manually.",
      });
    }
  }

  async function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const data = await api<ClientResponse>("/api/admin/clients", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      applySnapshot(data);
      setAddOpen(false);
      setDraft(emptyDraft());
      if (data.clientKey) {
        setKeyInfo({ client: data.client, clientKey: data.clientKey });
      }
      showToast({
        kind: "success",
        message: `${data.client.name} added`,
      });
    } catch (error) {
      handleError(error, "Could not add client");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(client: Client) {
    setEditTarget(client);
    setEditDraft({
      name: client.name,
      phone: client.phone,
      plan: client.plan,
      note: client.note,
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || !editDraft.name.trim()) return;
    setBusy(true);
    try {
      const data = await api<ClientResponse>(
        `/api/admin/clients/${editTarget.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "update", ...editDraft }),
        },
      );
      applySnapshot(data);
      setEditTarget(null);
      showToast({
        kind: "success",
        message: `${data.client.name} updated`,
      });
    } catch (error) {
      handleError(error, "Could not update client");
    } finally {
      setBusy(false);
    }
  }

  async function applyPending() {
    if (!pending) return;
    const target = pending;
    setBusy(true);
    try {
      if (target.kind === "delete") {
        const data = await api<ClientsResponse>(
          `/api/admin/clients/${target.client.id}`,
          { method: "DELETE" },
        );
        applySnapshot(data);
        setPending(null);
        showToast({
          kind: "success",
          message: `${target.client.name} deleted`,
        });
        return;
      }

      const data = await api<ClientResponse>(
        `/api/admin/clients/${target.client.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: target.kind }),
        },
      );
      applySnapshot(data);
      const message =
        target.kind === "mark_paid"
          ? `Payment recorded for ${data.client.name}`
          : target.kind === "suspend"
            ? `${data.client.name} suspended`
            : `${data.client.name} restored`;
      setPending(null);
      showToast({ kind: "success", message });
    } catch (error) {
      handleError(
        error,
        target.kind === "delete"
          ? "Could not delete client"
          : "Could not update access",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rotateKey(client: Client) {
    const confirmed = window.confirm(
      `Generate a new license key for ${client.name}? The current key will stop working immediately.`,
    );
    if (!confirmed) return;

    setRotatingId(client.id);
    try {
      const data = await api<ClientResponse>(
        `/api/admin/clients/${client.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "rotate_key" }),
        },
      );
      applySnapshot(data);
      if (data.clientKey) {
        setKeyInfo({ client: data.client, clientKey: data.clientKey });
      }
      showToast({ kind: "success", message: "New license key generated" });
    } catch (error) {
      handleError(error, "Could not generate a new key");
    } finally {
      setRotatingId(null);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-500">
          <Loader2 className="size-4 animate-spin" />
          Loading cloud console…
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
        <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-brand-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-amber-100/70 blur-3xl" />

        <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl shadow-stone-900/10 lg:grid-cols-[1.05fr_1fr]">
          <div className="hidden flex-col justify-between bg-brand-900 p-10 text-white lg:flex">
            <div>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <Cloud className="size-6" />
              </div>
              <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-200">
                Restaurant Cloud
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Vendor console
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-brand-100/80">
                Manage client subscriptions and access from one place. The
                restaurant keeps serving through its last known license if the
                network drops.
              </p>
            </div>

            <ul className="mt-10 space-y-3 text-sm text-brand-50/90">
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-brand-300" />
                Suspend guest ordering in one click
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-brand-300" />
                Restore access as soon as payment lands
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-brand-300" />
                One install key per restaurant
              </li>
            </ul>
          </div>

          <div className="p-7 sm:p-10">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 lg:hidden">
              <Cloud className="size-5" />
            </div>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700 lg:mt-0">
              Vendor sign in
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
              Cloud admin
            </h2>
            <p className="mt-1.5 text-sm text-stone-500">
              Sign in with the cloud admin password.
            </p>

            <form onSubmit={signIn} className="mt-7 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                  Admin password
                </span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <input
                    className="field !pl-10"
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="Enter password"
                  />
                </div>
              </label>

              {loginError ? (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loginBusy || !loginPassword}
                className="btn-primary w-full !py-3"
              >
                {loginBusy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4" />
                    Open vendor console
                  </>
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-stone-400">
              Dev default: <code className="text-stone-500">admin123</code> ·
              change with <code className="text-stone-500">ADMIN_PASSWORD</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: "Total clients",
      value: String(summary.totalClients),
      icon: Users,
      tone: "text-stone-700 bg-stone-100",
    },
    {
      label: "Active",
      value: String(summary.activeClients),
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Suspended",
      value: String(summary.suspendedClients),
      icon: Ban,
      tone: "text-rose-700 bg-rose-50",
    },
    {
      label: "Monthly recurring",
      value: formatMoney(summary.mrrPaise),
      icon: IndianRupee,
      tone: "text-brand-700 bg-brand-50",
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <Cloud className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="eyebrow">Restaurant Cloud</p>
              <h1 className="truncate text-base font-semibold text-stone-900">
                Vendor console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                storage === "supabase"
                  ? "bg-emerald-50 text-emerald-700"
                  : storage === "local"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-stone-100 text-stone-600"
              }`}
            >
              {storage === "supabase" ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <Database className="size-3.5" />
              )}
              {storage === "supabase"
                ? "Supabase"
                : storage === "local"
                  ? "Local dev store"
                  : "Not connected"}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="btn-ghost h-9 w-9 !px-0"
              title="Refresh clients"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="btn-secondary !px-3 !py-2 text-xs"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Customers</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
              Restaurant clients
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Add a restaurant, issue its license key, and control access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft());
              setAddOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="size-4" />
            Add client
          </button>
        </div>

        {storage === "local" && !setupError ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            <Database className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Local development store</p>
              <p className="mt-0.5 text-amber-800/85">
                Data is stored in <code>cloud/data/cloud.db</code>. Add{" "}
                <code>SUPABASE_SECRET_KEY</code> to <code>.env.local</code> to
                switch to Supabase.
              </p>
              <p className="mt-1 text-xs text-amber-800/70">
                New clients start empty. Add a restaurant, then enter its key in
                the local POS setup screen.
              </p>
            </div>
          </div>
        ) : null}

        {setupError ? (
          <div className="card mt-5 p-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900">
                  Connect the cloud store
                </h3>
                <p className="mt-1 text-sm text-stone-600">{setupError}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                <p className="eyebrow">Supabase</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm text-stone-600">
                  <li>
                    Run <code>cloud/supabase/schema.sql</code> in the Supabase
                    SQL editor.
                  </li>
                  <li>
                    Copy the service role key into{" "}
                    <code>SUPABASE_SECRET_KEY</code>. Never use a{" "}
                    <code>NEXT_PUBLIC_*</code> variable for it.
                  </li>
                  <li>Restart the cloud app.</li>
                </ol>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                <p className="eyebrow">Local test</p>
                <p className="mt-2 text-sm text-stone-600">
                  Set <code>CLOUD_LOCAL_STORE=1</code> in{" "}
                  <code>cloud/.env.local</code> and restart to use the empty
                  local SQLite store.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="btn-secondary mt-5"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Retry connection
            </button>
          </div>
        ) : (
          <>
            {pageError ? (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="flex-1">{pageError}</div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="font-semibold underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-stone-500">
                      {stat.label}
                    </p>
                    <span
                      className={`flex size-8 items-center justify-center rounded-lg ${stat.tone}`}
                    >
                      <stat.icon className="size-4" />
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="card mt-5 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    All clients
                  </p>
                  <p className="text-xs text-stone-500">
                    {summary.totalClients} restaurant
                    {summary.totalClients === 1 ? "" : "s"} ·{" "}
                    {formatMoney(summary.mrrPaise)} active MRR
                  </p>
                </div>
                {loading ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                    <Loader2 className="size-3.5 animate-spin" />
                    Updating
                  </span>
                ) : null}
              </div>

              {loading && clients.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-stone-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading clients…
                </div>
              ) : clients.length === 0 ? (
                <div className="px-4 py-16 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
                    <Building2 className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-800">
                    No clients yet
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Add the first restaurant to issue a license key.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(emptyDraft());
                      setAddOpen(true);
                    }}
                    className="btn-primary mt-4"
                  >
                    <Plus className="size-4" />
                    Add client
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] border-collapse">
                    <thead className="bg-stone-50/80">
                      <tr>
                        <th className="th">Restaurant</th>
                        <th className="th">Plan</th>
                        <th className="th">Access</th>
                        <th className="th">Due</th>
                        <th className="th">Last paid</th>
                        <th className="th text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((client) => {
                        const plan = getPlan(client.plan);
                        const overdue =
                          client.status === "active" &&
                          daysUntil(client.dueDate) < 0;
                        return (
                          <tr
                            key={client.id}
                            className="transition-colors hover:bg-stone-50/50"
                          >
                            <td className="td">
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                                  <Building2 className="size-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-stone-900">
                                    {client.name}
                                  </p>
                                  <p className="text-xs text-stone-500">
                                    {client.phone || "No phone"}
                                  </p>
                                  <p className="mt-0.5 max-w-[260px] truncate font-mono text-[10px] text-stone-400">
                                    {client.id}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="td">
                              <span className="inline-flex rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                                {plan.label}
                              </span>
                              <p className="mt-1 text-xs text-stone-500">
                                {formatMoney(client.monthlyFeePaise)}/mo
                              </p>
                            </td>
                            <td className="td">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  client.status === "active"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-rose-50 text-rose-700"
                                }`}
                              >
                                <span
                                  className={`size-1.5 rounded-full ${
                                    client.status === "active"
                                      ? "bg-emerald-500"
                                      : "bg-rose-500"
                                  }`}
                                />
                                {client.status === "active"
                                  ? "Active"
                                  : "Suspended"}
                              </span>
                              {client.note ? (
                                <p
                                  className="mt-1 max-w-[190px] truncate text-xs text-stone-500"
                                  title={client.note}
                                >
                                  {client.note}
                                </p>
                              ) : null}
                            </td>
                            <td className="td">
                              <p
                                className={
                                  overdue
                                    ? "font-semibold text-rose-600"
                                    : "font-medium text-stone-800"
                                }
                              >
                                {formatDate(client.dueDate)}
                              </p>
                              <p
                                className={`mt-0.5 text-xs ${
                                  overdue ? "text-rose-500" : "text-stone-500"
                                }`}
                              >
                                {overdue
                                  ? `Overdue by ${Math.abs(
                                      daysUntil(client.dueDate),
                                    )}d`
                                  : client.status === "active"
                                    ? `In ${daysUntil(client.dueDate)}d`
                                    : "Access paused"}
                              </p>
                            </td>
                            <td className="td text-stone-500">
                              {formatDate(client.lastPaidAt)}
                            </td>
                            <td className="td">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPending({
                                      kind: "mark_paid",
                                      client,
                                    })
                                  }
                                  className="btn-primary !px-3 !py-2 text-xs"
                                >
                                  <CreditCard className="size-3.5" />
                                  Mark paid
                                </button>

                                {client.status === "active" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPending({
                                        kind: "suspend",
                                        client,
                                      })
                                    }
                                    className="btn-danger !px-3 !py-2 text-xs"
                                  >
                                    <Ban className="size-3.5" />
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPending({
                                        kind: "restore",
                                        client,
                                      })
                                    }
                                    className="btn-secondary !px-3 !py-2 text-xs"
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                    Restore
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openEdit(client)}
                                  className="btn-ghost h-9 w-9 !px-0"
                                  title="Edit client"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void rotateKey(client)}
                                  disabled={rotatingId === client.id}
                                  className="btn-ghost h-9 w-9 !px-0"
                                  title="Generate a new key"
                                >
                                  {rotatingId === client.id ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <KeyRound className="size-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPending({ kind: "delete", client })
                                  }
                                  className="btn-ghost h-9 w-9 !px-0 text-rose-500 hover:!bg-rose-50 hover:text-rose-700"
                                  title="Delete client"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-stone-400">
              License checks are served from{" "}
              <code className="text-stone-500">GET /api/license</code>. The
              restaurant keeps its last known status when offline.
            </p>
          </>
        )}
      </main>

      {addOpen ? (
        <Modal
          title="Add client"
          subtitle="Create the restaurant and issue its first license key."
          onClose={() => {
            if (!busy) setAddOpen(false);
          }}
        >
          <form onSubmit={addClient} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Restaurant name
              </span>
              <input
                className="field"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="e.g. The Copper Spoon"
                autoFocus
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Phone <span className="font-normal text-stone-400">(optional)</span>
              </span>
              <input
                className="field"
                value={draft.phone}
                onChange={(event) =>
                  setDraft({ ...draft, phone: event.target.value })
                }
                placeholder="+91 98765 43210"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Plan
              </span>
              <select
                className="field"
                value={draft.plan}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    plan: event.target.value as ClientPlan,
                  })
                }
              >
                {PLANS.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label} · {formatMoney(plan.feePaise)}/mo
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-brand-900">
                  {draftPlan.label}
                </p>
                <p className="text-sm font-semibold text-brand-800">
                  {formatMoney(draftPlan.feePaise)}/mo
                </p>
              </div>
              <p className="mt-0.5 text-xs text-brand-800/70">
                {draftPlan.limits}
              </p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Internal note{" "}
                <span className="font-normal text-stone-400">(optional)</span>
              </span>
              <textarea
                className="field min-h-20 resize-y"
                value={draft.note}
                onChange={(event) =>
                  setDraft({ ...draft, note: event.target.value })
                }
                placeholder="Anything the billing popup should show, e.g. Payment overdue."
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={busy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !draft.name.trim()}
                className="btn-primary"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add client
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editTarget ? (
        <Modal
          title="Edit client"
          subtitle={editTarget.name}
          onClose={() => {
            if (!busy) setEditTarget(null);
          }}
        >
          <form onSubmit={saveEdit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Restaurant name
              </span>
              <input
                className="field"
                value={editDraft.name}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, name: event.target.value })
                }
                autoFocus
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Phone
              </span>
              <input
                className="field"
                value={editDraft.phone}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, phone: event.target.value })
                }
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Plan
              </span>
              <select
                className="field"
                value={editDraft.plan}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    plan: event.target.value as ClientPlan,
                  })
                }
              >
                {PLANS.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label} · {formatMoney(plan.feePaise)}/mo
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-stone-800">
                  {editPlan.label}
                </p>
                <p className="text-sm font-semibold text-stone-700">
                  {formatMoney(editPlan.feePaise)}/mo
                </p>
              </div>
              <p className="mt-0.5 text-xs text-stone-500">
                {editPlan.limits}
              </p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600">
                Internal note
              </span>
              <textarea
                className="field min-h-20 resize-y"
                value={editDraft.note}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, note: event.target.value })
                }
                placeholder="Shown in the restaurant billing popup when access is paused."
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={busy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !editDraft.name.trim()}
                className="btn-primary"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {pending ? (
        <Modal
          title={
            pending.kind === "mark_paid"
              ? "Mark as paid"
              : pending.kind === "suspend"
                ? "Suspend access"
                : pending.kind === "restore"
                  ? "Restore access"
                  : "Delete client"
          }
          subtitle={pending.client.name}
          onClose={() => {
            if (!busy) setPending(null);
          }}
        >
          <div className="space-y-4">
            <div
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${
                pending.kind === "suspend" || pending.kind === "delete"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-stone-200 bg-stone-50 text-stone-700"
              }`}
            >
              {pending.kind === "mark_paid" ? (
                <CreditCard className="mt-0.5 size-4 shrink-0" />
              ) : pending.kind === "suspend" ? (
                <Ban className="mt-0.5 size-4 shrink-0" />
              ) : pending.kind === "delete" ? (
                <Trash2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              )}
              <p>
                {pending.kind === "mark_paid"
                  ? "This extends access by 30 days, clears the billing note, and marks the client active. No payment record is stored."
                  : pending.kind === "suspend"
                    ? "The restaurant will see the billing popup and new guest orders will be blocked. Existing data stays intact."
                    : pending.kind === "restore"
                      ? "Access will be restored immediately. The due date will not change."
                      : "This permanently removes the client and its license key. The restaurant will stop getting a valid license immediately. This cannot be undone."}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyPending()}
                disabled={busy}
                className={
                  pending.kind === "suspend" || pending.kind === "delete"
                    ? "btn-danger"
                    : "btn-primary"
                }
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : pending.kind === "mark_paid" ? (
                  <CreditCard className="size-4" />
                ) : pending.kind === "suspend" ? (
                  <Ban className="size-4" />
                ) : pending.kind === "delete" ? (
                  <Trash2 className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {pending.kind === "mark_paid"
                  ? "Mark paid"
                  : pending.kind === "suspend"
                    ? "Suspend"
                    : pending.kind === "restore"
                      ? "Restore"
                      : "Delete client"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {keyInfo ? (
        <Modal
          title="License key"
          subtitle={keyInfo.client.name}
          onClose={() => setKeyInfo(null)}
          wide
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold">
                <KeyRound className="size-4" />
                Copy this key now
              </p>
              <p className="mt-1 text-amber-800/85">
                It is stored only as a hash and will not be shown again. If it
                is lost, generate a new key for this client.
              </p>
            </div>

            <div>
              <p className="eyebrow">Client ID</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
                  {keyInfo.client.id}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(keyInfo.client.id, "Client ID")
                  }
                  className="btn-secondary h-9 w-9 shrink-0 !px-0"
                  title="Copy client ID"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>

            <div>
              <p className="eyebrow">License key</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
                  {keyInfo.clientKey}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(keyInfo.clientKey, "License key")
                  }
                  className="btn-secondary h-9 w-9 shrink-0 !px-0"
                  title="Copy license key"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">Installer config</p>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(licenseConfig, "Installer config")
                  }
                  className="btn-ghost !px-2 !py-1 text-xs"
                >
                  <Copy className="size-3.5" />
                  Copy JSON
                </button>
              </div>
              <pre className="mt-1.5 max-h-56 overflow-auto rounded-xl border border-stone-800 bg-stone-900 p-3 text-xs leading-5 text-stone-100">
                {licenseConfig}
              </pre>
              <p className="mt-1.5 text-xs text-stone-500">
                Enter these values on the restaurant&apos;s local POS setup
                screen. The license URL is this cloud app&apos;s origin.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setKeyInfo(null)}
                className="btn-primary"
              >
                <Check className="size-4" />
                I have saved the key
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {toast ? (
        <div
          className={`fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.kind === "success"
              ? "bg-stone-900 text-white"
              : "bg-rose-600 text-white"
          }`}
          role="status"
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 rounded p-0.5 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
