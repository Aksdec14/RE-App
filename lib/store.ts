import { AppError } from "./errors";
import { summarize } from "./clientUtils";
import { getLocalStore } from "./store-local";
import { getSupabaseStore } from "./store-supabase";
import type {
  AdminSummary,
  Client,
  ClientInput,
  ClientStatus,
  ClientUpdate,
  StorageMode,
} from "./types";

export interface CloudStore {
  mode: StorageMode;
  listClients(): Promise<Client[]>;
  createClient(
    input: ClientInput,
  ): Promise<{ client: Client; clientKey: string }>;
  updateClient(id: string, input: ClientUpdate): Promise<Client>;
  markPaid(id: string): Promise<Client>;
  setStatus(id: string, status: ClientStatus): Promise<Client>;
  rotateKey(id: string): Promise<{ client: Client; clientKey: string }>;
  deleteClient(id: string): Promise<void>;
  findLicense(clientId: string, clientKey: string): Promise<Client | null>;
}

export interface AdminSnapshot {
  clients: Client[];
  summary: AdminSummary;
  storage: StorageMode;
}

let cachedStore: CloudStore | null = null;
let cachedMode: StorageMode | null = null;

export function storageMode(): StorageMode | null {
  if (process.env.SUPABASE_SECRET_KEY?.trim()) return "supabase";
  if (process.env.CLOUD_LOCAL_STORE === "1") return "local";
  return null;
}

export function getStore(): CloudStore {
  const mode = storageMode();
  if (!mode) {
    throw new AppError(
      "Cloud storage is not configured. Add SUPABASE_SECRET_KEY to the cloud environment, or set CLOUD_LOCAL_STORE=1 for local development.",
      503,
    );
  }
  if (cachedStore && cachedMode === mode) return cachedStore;
  cachedStore =
    mode === "supabase" ? getSupabaseStore() : getLocalStore();
  cachedMode = mode;
  return cachedStore;
}

export async function adminSnapshot(
  store: CloudStore,
): Promise<AdminSnapshot> {
  const clients = await store.listClients();
  return {
    clients,
    summary: summarize(clients),
    storage: store.mode,
  };
}
