export type ClientPlan = "basic" | "standard" | "premium";
export type ClientStatus = "active" | "suspended";
export type StorageMode = "supabase" | "local";

export interface Client {
  id: string;
  name: string;
  phone: string;
  plan: ClientPlan;
  monthlyFeePaise: number;
  status: ClientStatus;
  dueDate: string;
  lastPaidAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientInput {
  name: string;
  phone?: string;
  plan: ClientPlan;
  note?: string;
}

export interface ClientUpdate {
  name?: string;
  phone?: string;
  plan?: ClientPlan;
  note?: string;
}

export interface AdminSummary {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  mrrPaise: number;
}

export interface LicensePayload {
  active: boolean;
  status: ClientStatus;
  clientId: string;
  clientName: string;
  plan: ClientPlan;
  monthlyFeePaise: number;
  dueDate: string;
  lastPaidAt: string | null;
  note: string;
  support: { phone: string; email: string };
}
