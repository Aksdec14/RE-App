import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { handleError, ok, readJson } from "@/lib/http";
import { adminSnapshot, getStore } from "@/lib/store";
import type { ClientInput } from "@/lib/types";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter the restaurant name").max(80),
  phone: z.string().trim().max(30).optional().default(""),
  plan: z.enum(["basic", "standard", "premium"]),
  note: z.string().trim().max(500).optional().default(""),
});

export async function GET() {
  try {
    await requireAdmin();
    const store = getStore();
    return ok(await adminSnapshot(store));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = createSchema.parse(await readJson(request)) as ClientInput;
    const store = getStore();
    const created = await store.createClient(input);
    const snapshot = await adminSnapshot(store);
    return ok({ ...snapshot, ...created }, 201);
  } catch (error) {
    return handleError(error);
  }
}
