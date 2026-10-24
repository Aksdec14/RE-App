import { handleError } from "@/lib/http";
import { getStore } from "@/lib/store";
import type { LicensePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  try {
    const clientId = request.headers.get("x-client-id")?.trim();
    const clientKey = request.headers.get("x-client-key")?.trim();

    if (!clientId || !clientKey) {
      return Response.json(
        { error: "Missing client credentials" },
        { status: 401, headers: NO_STORE },
      );
    }

    const store = getStore();
    const client = await store.findLicense(clientId, clientKey);
    if (!client) {
      return Response.json(
        { error: "Invalid client credentials" },
        { status: 401, headers: NO_STORE },
      );
    }

    const payload: LicensePayload = {
      active: client.status === "active",
      status: client.status,
      clientId: client.id,
      clientName: client.name,
      plan: client.plan,
      monthlyFeePaise: client.monthlyFeePaise,
      dueDate: client.dueDate,
      lastPaidAt: client.lastPaidAt,
      note: client.note,
      support: {
        phone: process.env.SUPPORT_PHONE ?? "+91 90000 00000",
        email: process.env.SUPPORT_EMAIL ?? "support@restaurantos.local",
      },
    };

    return Response.json(payload, { headers: NO_STORE });
  } catch (error) {
    return handleError(error);
  }
}
