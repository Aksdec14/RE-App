import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { AppError } from "@/lib/errors";
import { handleError, ok, readJson } from "@/lib/http";
import { adminSnapshot, getStore } from "@/lib/store";
import type { Client } from "@/lib/types";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  action: z.literal("update"),
  name: z.string().trim().min(2, "Enter the restaurant name").max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  plan: z.enum(["basic", "standard", "premium"]).optional(),
  note: z.string().trim().max(500).optional(),
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_paid") }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("rotate_key") }),
  updateSchema,
]);

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const store = getStore();
    await store.deleteClient(id);
    const snapshot = await adminSnapshot(store);
    return ok({ ...snapshot, ok: true, deletedId: id });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = schema.parse(await readJson(request));
    const store = getStore();

    let client: Client;
    let clientKey: string | undefined;

    switch (body.action) {
      case "mark_paid":
        client = await store.markPaid(id);
        break;
      case "suspend":
        client = await store.setStatus(id, "suspended");
        break;
      case "restore":
        client = await store.setStatus(id, "active");
        break;
      case "update":
        if (
          body.name === undefined &&
          body.phone === undefined &&
          body.plan === undefined &&
          body.note === undefined
        ) {
          throw new AppError("No client changes were provided");
        }
        client = await store.updateClient(id, {
          name: body.name,
          phone: body.phone,
          plan: body.plan,
          note: body.note,
        });
        break;
      case "rotate_key": {
        const rotated = await store.rotateKey(id);
        client = rotated.client;
        clientKey = rotated.clientKey;
        break;
      }
    }

    const snapshot = await adminSnapshot(store);
    return ok({ ...snapshot, client, clientKey });
  } catch (error) {
    return handleError(error);
  }
}
